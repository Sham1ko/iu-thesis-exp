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

type PodContainerState = {
  startedAt?: string;
};

type PodContainerStatus = {
  name?: string;
  state?: {
    running?: PodContainerState;
    terminated?: PodContainerState;
  };
  lastState?: {
    running?: PodContainerState;
    terminated?: PodContainerState;
  };
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
    containerStatuses?: PodContainerStatus[];
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
  firstObservedAt: string;
  podScheduledAt: string | null;
  podReadyToStartContainersAt: string | null;
  userContainerStartedAt: string | null;
  queueProxyStartedAt: string | null;
  containersReadyAt: string | null;
  podReadyAt: string | null;
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
  podCreatedAt: string;
  podFirstObservedAt: string;
  podScheduledAt: string | null;
  podReadyToStartContainersAt: string | null;
  userContainerStartedAt: string | null;
  queueProxyStartedAt: string | null;
  containersReadyAt: string | null;
  podReadyAt: string | null;
  observedLagMs: number | null;
  createdToUserStartedMs: number | null;
  createdToQueueProxyStartedMs: number | null;
  createdToReadyMs: number | null;
  userStartedToReadyMs: number | null;
  queueProxyStartedToReadyMs: number | null;
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
  "run_started_at,service_name,namespace,revision_name,pod_name,pod_uid,created_at,ready_at,startup_time_ms,status,pod_created_at,pod_first_observed_at,pod_scheduled_at,pod_ready_to_start_containers_at,user_container_started_at,queue_proxy_started_at,containers_ready_at,pod_ready_at,observed_lag_ms,created_to_user_started_ms,created_to_queue_proxy_started_ms,created_to_ready_ms,user_started_to_ready_ms,queue_proxy_started_to_ready_ms";
export const DEFAULT_POLL_INTERVAL_MS = 500;
export const DEFAULT_SETTLE_TIMEOUT_MS = 60_000;
const USER_CONTAINER_NAME = "user-container";
const QUEUE_PROXY_CONTAINER_NAME = "queue-proxy";

function toCsvRow(values: Array<string | number | null>): string {
  return values.map(csvEscape).join(",");
}

function extractCondition(pod: PodSnapshotItem, type: string): PodCondition | undefined {
  return pod.status?.conditions?.find((condition) => condition.type === type);
}

function isTerminalPod(pod: PodSnapshotItem): boolean {
  const phase = pod.status?.phase;
  return phase === "Failed" || phase === "Succeeded";
}

function extractConditionTime(pod: PodSnapshotItem, type: string): string | null {
  const condition = extractCondition(pod, type);

  return condition?.status === "True" && condition.lastTransitionTime
    ? condition.lastTransitionTime
    : null;
}

function extractContainerStatus(
  pod: PodSnapshotItem,
  containerName: string,
): PodContainerStatus | undefined {
  return pod.status?.containerStatuses?.find((status) => status.name === containerName);
}

function pickEarlierTimestamp(
  ...timestamps: Array<string | null | undefined>
): string | null {
  let earliest: string | null = null;
  let earliestMs = Number.POSITIVE_INFINITY;

  for (const timestamp of timestamps) {
    if (typeof timestamp !== "string" || timestamp.length === 0) {
      continue;
    }

    const parsed = Date.parse(timestamp);

    if (!Number.isFinite(parsed)) {
      continue;
    }

    if (parsed < earliestMs) {
      earliest = timestamp;
      earliestMs = parsed;
    }
  }

  return earliest;
}

function extractContainerStartedAt(
  pod: PodSnapshotItem,
  containerName: string,
): string | null {
  const containerStatus = extractContainerStatus(pod, containerName);

  if (!containerStatus) {
    return null;
  }

  return pickEarlierTimestamp(
    containerStatus.state?.running?.startedAt,
    containerStatus.state?.terminated?.startedAt,
    containerStatus.lastState?.running?.startedAt,
    containerStatus.lastState?.terminated?.startedAt,
  );
}

type ObservedPodSnapshot = Omit<ObservedPod, "firstObservedAt">;

function toObservedPod(pod: PodSnapshotItem): ObservedPodSnapshot | null {
  const podUid = pod.metadata?.uid;
  const podName = pod.metadata?.name;
  const createdAt = pod.metadata?.creationTimestamp;

  if (!podUid || !podName || !createdAt) {
    return null;
  }

  return {
    podUid,
    podName,
    revisionName: pod.metadata?.labels?.["serving.knative.dev/revision"] ?? "",
    createdAt,
    podScheduledAt: extractConditionTime(pod, "PodScheduled"),
    podReadyToStartContainersAt: extractConditionTime(pod, "PodReadyToStartContainers"),
    userContainerStartedAt: extractContainerStartedAt(pod, USER_CONTAINER_NAME),
    queueProxyStartedAt: extractContainerStartedAt(pod, QUEUE_PROXY_CONTAINER_NAME),
    containersReadyAt: extractConditionTime(pod, "ContainersReady"),
    podReadyAt: extractConditionTime(pod, "Ready"),
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
        entry.podCreatedAt,
        entry.podFirstObservedAt,
        entry.podScheduledAt,
        entry.podReadyToStartContainersAt,
        entry.userContainerStartedAt,
        entry.queueProxyStartedAt,
        entry.containersReadyAt,
        entry.podReadyAt,
        entry.observedLagMs,
        entry.createdToUserStartedMs,
        entry.createdToQueueProxyStartedMs,
        entry.createdToReadyMs,
        entry.userStartedToReadyMs,
        entry.queueProxyStartedToReadyMs,
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
): Promise<ObservedPodSnapshot[]> {
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
    return items.map(toObservedPod).filter((pod): pod is ObservedPodSnapshot => pod !== null);
  } catch (error: unknown) {
    throw new Error(
      `Unable to collect pod startup metrics for service ${serviceName} in namespace ${namespace}: ${parseKubectlError(error)}`,
    );
  }
}

function mergeObservedPods(
  observedPods: Map<string, ObservedPod>,
  baselinePodUids: ReadonlySet<string>,
  snapshot: readonly ObservedPodSnapshot[],
  now: () => number,
): void {
  let observedAt: string | null = null;

  for (const pod of snapshot) {
    if (baselinePodUids.has(pod.podUid)) {
      continue;
    }

    const existing = observedPods.get(pod.podUid);

    if (!existing) {
      observedAt ??= new Date(now()).toISOString();
      observedPods.set(pod.podUid, { ...pod, firstObservedAt: observedAt });
      continue;
    }

    existing.revisionName = pod.revisionName || existing.revisionName;
    existing.podScheduledAt = pickEarlierTimestamp(existing.podScheduledAt, pod.podScheduledAt);
    existing.podReadyToStartContainersAt = pickEarlierTimestamp(
      existing.podReadyToStartContainersAt,
      pod.podReadyToStartContainersAt,
    );
    existing.userContainerStartedAt = pickEarlierTimestamp(
      existing.userContainerStartedAt,
      pod.userContainerStartedAt,
    );
    existing.queueProxyStartedAt = pickEarlierTimestamp(
      existing.queueProxyStartedAt,
      pod.queueProxyStartedAt,
    );
    existing.containersReadyAt = pickEarlierTimestamp(
      existing.containersReadyAt,
      pod.containersReadyAt,
    );
    existing.podReadyAt = pickEarlierTimestamp(existing.podReadyAt, pod.podReadyAt);
    existing.terminal = existing.terminal || pod.terminal;
  }
}

function isSettled(pod: ObservedPod): boolean {
  return pod.podReadyAt !== null || pod.terminal;
}

function computeDurationMs(startAt: string | null, endAt: string | null): number | null {
  if (!startAt || !endAt) {
    return null;
  }

  const startAtMs = Date.parse(startAt);
  const endAtMs = Date.parse(endAt);

  if (!Number.isFinite(startAtMs) || !Number.isFinite(endAtMs)) {
    return null;
  }

  return Math.max(0, endAtMs - startAtMs);
}

function finalizeEntries(
  runStartedAt: string,
  serviceName: string,
  namespace: string,
  observedPods: ReadonlyMap<string, ObservedPod>,
): PodStartupRow[] {
  return [...observedPods.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.podName.localeCompare(right.podName))
    .map((pod) => {
      const createdToReadyMs = computeDurationMs(pod.createdAt, pod.podReadyAt);

      return {
        runStartedAt,
        serviceName,
        namespace,
        revisionName: pod.revisionName,
        podName: pod.podName,
        podUid: pod.podUid,
        createdAt: pod.createdAt,
        readyAt: pod.podReadyAt,
        podCreatedAt: pod.createdAt,
        podFirstObservedAt: pod.firstObservedAt,
        podScheduledAt: pod.podScheduledAt,
        podReadyToStartContainersAt: pod.podReadyToStartContainersAt,
        userContainerStartedAt: pod.userContainerStartedAt,
        queueProxyStartedAt: pod.queueProxyStartedAt,
        containersReadyAt: pod.containersReadyAt,
        podReadyAt: pod.podReadyAt,
        observedLagMs: computeDurationMs(pod.createdAt, pod.firstObservedAt),
        createdToUserStartedMs: computeDurationMs(pod.createdAt, pod.userContainerStartedAt),
        createdToQueueProxyStartedMs: computeDurationMs(pod.createdAt, pod.queueProxyStartedAt),
        createdToReadyMs,
        userStartedToReadyMs: computeDurationMs(pod.userContainerStartedAt, pod.podReadyAt),
        queueProxyStartedToReadyMs: computeDurationMs(pod.queueProxyStartedAt, pod.podReadyAt),
        startupTimeMs: createdToReadyMs,
        status: pod.podReadyAt ? "ready" : "not_ready",
      };
    });
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
    mergeObservedPods(observedPods, baselinePodUids, snapshot, now);
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
