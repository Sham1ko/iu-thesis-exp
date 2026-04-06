import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { appendCsvRows, csvEscape } from "./csv-report.ts";

type ExecFileLike = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

type WaitFn = (ms: number) => Promise<unknown>;

type PodCondition = {
  type?: string;
  status?: string;
  lastTransitionTime?: string;
};

type PodSnapshotItem = {
  metadata?: {
    uid?: string;
    name?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
  };
  status?: {
    phase?: string;
    conditions?: PodCondition[];
  };
};

type PodListResponse = {
  items?: PodSnapshotItem[];
};

type CsvMetricReport = {
  resultsFile: string;
  header: string;
  rows: string[];
};

export type ObservedPod = {
  podUid: string;
  podName: string;
  revisionName: string;
  createdAt: string;
  readyAt: string | null;
  terminal: boolean;
};

export type PodStartupRow = {
  runStartedAt: string;
  serviceName: string;
  namespace: string;
  revisionName: string;
  podName: string;
  podUid: string;
  createdAt: string;
  readyAt: string | null;
  startupTimeMs: number | null;
  status: "ready" | "not_ready";
};

export type PodStartupSummary = {
  totalEvents: number;
  readyEvents: number;
  notReadyEvents: number;
};

export type PodStartupMetricReport = CsvMetricReport & {
  entries: PodStartupRow[];
  summary: PodStartupSummary;
};

export type MeasurePodStartupOptions = {
  runStartedAt: string;
  serviceName: string;
  namespace: string;
  resultsFile: string;
  pollIntervalMs?: number;
  settleTimeoutMs?: number;
  execFileLike?: ExecFileLike;
  wait?: WaitFn;
  now?: () => number;
};

export type PodStartupMeasurement<T extends object> = {
  workloadResult: T;
  csvWritten: string;
  entries: PodStartupRow[];
  summary: PodStartupSummary;
};

const execFileAsync = promisify(execFile);

export const POD_STARTUP_CSV_HEADER =
  "run_started_at,service_name,namespace,revision_name,pod_name,pod_uid,created_at,ready_at,startup_time_ms,status";
export const DEFAULT_POLL_INTERVAL_MS = 500;
export const DEFAULT_SETTLE_TIMEOUT_MS = 60_000;

function toCsvRow(values: Array<string | number | null>): string {
  return values.map(csvEscape).join(",");
}

function extractReadyCondition(pod: PodSnapshotItem): PodCondition | undefined {
  return pod.status?.conditions?.find((condition) => condition.type === "Ready");
}

function isTerminalPod(pod: PodSnapshotItem): boolean {
  const phase = pod.status?.phase;
  return phase === "Failed" || phase === "Succeeded";
}

function toObservedPod(pod: PodSnapshotItem): ObservedPod | null {
  const podUid = pod.metadata?.uid;
  const podName = pod.metadata?.name;
  const createdAt = pod.metadata?.creationTimestamp;

  if (!podUid || !podName || !createdAt) {
    return null;
  }

  const readyCondition = extractReadyCondition(pod);
  const readyAt =
    readyCondition?.status === "True" && readyCondition.lastTransitionTime
      ? readyCondition.lastTransitionTime
      : null;

  return {
    podUid,
    podName,
    revisionName: pod.metadata?.labels?.["serving.knative.dev/revision"] ?? "",
    createdAt,
    readyAt,
    terminal: isTerminalPod(pod),
  };
}

function parseKubectlError(error: unknown): string {
  if (error instanceof Error) {
    const execError = error as Error & { stderr?: string };
    const stderr = typeof execError.stderr === "string" ? execError.stderr.trim() : "";
    return stderr ? `${error.message}: ${stderr}` : error.message;
  }

  return String(error);
}

export function createPodStartupMetricReport(
  runStartedAt: string,
  serviceName: string,
  namespace: string,
  resultsFile: string,
  entries: readonly PodStartupRow[],
): PodStartupMetricReport {
  const readyEvents = entries.filter((entry) => entry.status === "ready").length;

  return {
    resultsFile,
    header: POD_STARTUP_CSV_HEADER,
    rows: entries.map((entry) =>
      toCsvRow([
        entry.runStartedAt,
        entry.serviceName,
        entry.namespace,
        entry.revisionName,
        entry.podName,
        entry.podUid,
        entry.createdAt,
        entry.readyAt,
        entry.startupTimeMs,
        entry.status,
      ]),
    ),
    entries: [...entries],
    summary: {
      totalEvents: entries.length,
      readyEvents,
      notReadyEvents: entries.length - readyEvents,
    },
  };
}

async function savePodStartupMetricReport(report: PodStartupMetricReport): Promise<string> {
  return appendCsvRows(report.resultsFile, report.header, report.rows);
}

async function listServicePods(
  serviceName: string,
  namespace: string,
  execFileLike?: ExecFileLike,
): Promise<ObservedPod[]> {
  const run = execFileLike ?? ((file, args) => execFileAsync(file, [...args]));

  try {
    const { stdout } = await run("kubectl", [
      "get",
      "pods",
      "-n",
      namespace,
      "-l",
      `serving.knative.dev/service=${serviceName}`,
      "-o",
      "json",
    ]);
    const parsed = JSON.parse(stdout || "{\"items\":[]}") as PodListResponse;
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items.map(toObservedPod).filter((pod): pod is ObservedPod => pod !== null);
  } catch (error: unknown) {
    throw new Error(
      `Unable to collect pod startup metrics for service ${serviceName} in namespace ${namespace}: ${parseKubectlError(error)}`,
    );
  }
}

function mergeObservedPods(
  observedPods: Map<string, ObservedPod>,
  baselinePodUids: ReadonlySet<string>,
  snapshot: readonly ObservedPod[],
): void {
  for (const pod of snapshot) {
    if (baselinePodUids.has(pod.podUid)) {
      continue;
    }

    const existing = observedPods.get(pod.podUid);

    if (!existing) {
      observedPods.set(pod.podUid, { ...pod });
      continue;
    }

    existing.revisionName = pod.revisionName || existing.revisionName;
    existing.readyAt = existing.readyAt ?? pod.readyAt;
    existing.terminal = existing.terminal || pod.terminal;
  }
}

function isSettled(pod: ObservedPod): boolean {
  return pod.readyAt !== null || pod.terminal;
}

function computeStartupTimeMs(createdAt: string, readyAt: string | null): number | null {
  if (!readyAt) {
    return null;
  }

  const createdAtMs = Date.parse(createdAt);
  const readyAtMs = Date.parse(readyAt);

  if (!Number.isFinite(createdAtMs) || !Number.isFinite(readyAtMs)) {
    return null;
  }

  return Math.max(0, readyAtMs - createdAtMs);
}

function finalizeEntries(
  runStartedAt: string,
  serviceName: string,
  namespace: string,
  observedPods: ReadonlyMap<string, ObservedPod>,
): PodStartupRow[] {
  return [...observedPods.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.podName.localeCompare(right.podName))
    .map((pod) => ({
      runStartedAt,
      serviceName,
      namespace,
      revisionName: pod.revisionName,
      podName: pod.podName,
      podUid: pod.podUid,
      createdAt: pod.createdAt,
      readyAt: pod.readyAt,
      startupTimeMs: computeStartupTimeMs(pod.createdAt, pod.readyAt),
      status: pod.readyAt ? "ready" : "not_ready",
    }));
}

export async function measurePodStartupDuring<T extends object>(
  workload: () => Promise<T>,
  options: MeasurePodStartupOptions,
): Promise<PodStartupMeasurement<T>> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const settleTimeoutMs = options.settleTimeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS;
  const wait = options.wait ?? delay;
  const now = options.now ?? Date.now;
  const observedPods = new Map<string, ObservedPod>();
  const baselinePods = await listServicePods(options.serviceName, options.namespace, options.execFileLike);
  const baselinePodUids = new Set(baselinePods.map((pod) => pod.podUid));

  const collectSnapshot = async () => {
    const snapshot = await listServicePods(options.serviceName, options.namespace, options.execFileLike);
    mergeObservedPods(observedPods, baselinePodUids, snapshot);
  };

  let stopRequested = false;
  const pollingLoop = (async () => {
    while (!stopRequested) {
      await collectSnapshot();

      if (stopRequested) {
        break;
      }

      await wait(pollIntervalMs);
    }
  })();

  let workloadResult: T | undefined;
  let workloadError: unknown;

  try {
    workloadResult = await workload();
  } catch (error: unknown) {
    workloadError = error;
  } finally {
    stopRequested = true;
    await pollingLoop;
  }

  const settleDeadline = now() + settleTimeoutMs;

  while (true) {
    await collectSnapshot();

    if ([...observedPods.values()].every(isSettled) || now() >= settleDeadline) {
      break;
    }

    await wait(pollIntervalMs);
  }

  const entries = finalizeEntries(
    options.runStartedAt,
    options.serviceName,
    options.namespace,
    observedPods,
  );
  const report = createPodStartupMetricReport(
    options.runStartedAt,
    options.serviceName,
    options.namespace,
    options.resultsFile,
    entries,
  );
  const csvWritten = await savePodStartupMetricReport(report);

  if (workloadError !== undefined) {
    throw workloadError;
  }

  return {
    workloadResult: workloadResult as T,
    csvWritten,
    entries: report.entries,
    summary: report.summary,
  };
}
