import { setTimeout as delay } from "node:timers/promises";

import { runCli } from "../cli/script-entry.ts";
import { saveSteadyMetrics } from "../metrics/request-metrics-report.ts";
import { sendOneRequest, type RequestTarget, type SendOneResult } from "../network/send-one.ts";

const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_DURATION_MS = 30_000;

type WaitFn = (ms: number) => Promise<unknown>;

export type SteadyResult = {
  requestId: number;
  intervalMs: number;
  result: SendOneResult;
};

export type RunSteadyOptions = {
  intervalMs?: number;
  durationMs?: number;
  requestCount?: number;
  runStartedAt?: string;
  target?: Partial<RequestTarget>;
  resultsFile?: string;
  log?: (message: string) => void;
  requestOne?: (target?: Partial<RequestTarget>) => Promise<SendOneResult>;
  wait?: WaitFn;
  now?: () => number;
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }

  return parsed;
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

export async function collectSteadyResults(
  intervalMs: number,
  durationMs: number | undefined,
  requestCount: number | undefined,
  requestOne: (target?: Partial<RequestTarget>) => Promise<SendOneResult> = sendOneRequest,
  target: Partial<RequestTarget> | undefined = undefined,
  wait: WaitFn = delay,
  now: () => number = Date.now,
): Promise<SteadyResult[]> {
  const results: SteadyResult[] = [];
  const startedAtMs = now();

  for (let index = 0; ; index += 1) {
    if (requestCount !== undefined && index >= requestCount) {
      break;
    }

    const scheduledOffsetMs = index * intervalMs;

    if (durationMs !== undefined && scheduledOffsetMs > durationMs) {
      break;
    }

    const scheduledAtMs = startedAtMs + scheduledOffsetMs;
    const waitMs = Math.max(0, scheduledAtMs - now());

    if (waitMs > 0) {
      await wait(waitMs);
    }

    results.push({
      requestId: index + 1,
      intervalMs,
      result: await requestOne(target),
    });
  }

  return results;
}

export function summarizeSteadyResults(
  intervalMs: number,
  durationMs: number | undefined,
  results: readonly SteadyResult[],
) {
  const ttfbValues = results
    .map(({ result }) => result.ttfbMs)
    .filter((value): value is number => value !== null);

  const successCount = results.filter(({ result }) => result.ok).length;
  const failureCount = results.length - successCount;

  return {
    requestCount: results.length,
    intervalMs,
    durationMs,
    successCount,
    failureCount,
    p95TtfbMs: percentile(ttfbValues, 0.95),
    p99TtfbMs: percentile(ttfbValues, 0.99),
  };
}

export async function runSteady(options: RunSteadyOptions = {}) {
  const log = options.log ?? console.log;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const durationMs = options.requestCount === undefined ? (options.durationMs ?? DEFAULT_DURATION_MS) : options.durationMs;
  const runStartedAt = options.runStartedAt ?? new Date().toISOString();
  const results = await collectSteadyResults(
    intervalMs,
    durationMs,
    options.requestCount,
    options.requestOne ?? sendOneRequest,
    options.target,
    options.wait ?? delay,
    options.now ?? Date.now,
  );
  const csvWritten = await saveSteadyMetrics(runStartedAt, results, { resultsFile: options.resultsFile });
  const summary = summarizeSteadyResults(intervalMs, durationMs, results);

  log("scenario: steady");
  log(`requests: ${summary.requestCount}`);
  log(`interval_ms: ${summary.intervalMs}`);
  log(`duration_ms: ${summary.durationMs ?? "n/a"}`);
  log(`successful_requests: ${summary.successCount}`);
  log(`failed_requests: ${summary.failureCount}`);
  log(`p95_ttfb_ms: ${summary.p95TtfbMs ?? "n/a"}`);
  log(`p99_ttfb_ms: ${summary.p99TtfbMs ?? "n/a"}`);
  log(`csv_written: ${csvWritten}`);

  if (summary.failureCount > 0) {
    process.exitCode = 1;
  }

  return { csvWritten, summary };
}

async function main(): Promise<void> {
  await runSteady({
    intervalMs: parsePositiveInteger(process.env.STEADY_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    durationMs: parsePositiveInteger(process.env.STEADY_DURATION_MS, DEFAULT_DURATION_MS),
    requestCount: process.env.STEADY_REQUESTS ? parsePositiveInteger(process.env.STEADY_REQUESTS, 1) : undefined,
  });
}

runCli(async () => {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`steady scenario failed: ${message}`);
  }
}, import.meta.url);
