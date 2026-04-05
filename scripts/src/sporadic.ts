import { setTimeout as delay } from "node:timers/promises";

import { saveSporadicMetrics } from "./request-metrics-report";
import { sendOneRequest, type SendOneResult } from "./send-one";

const DEFAULT_REQUEST_COUNT = 5;
const DEFAULT_IDLE_MS = 30_000;

type WaitFn = (ms: number) => Promise<unknown>;

export type SporadicResult = {
  requestId: number;
  idleBeforeMs: number;
  result: SendOneResult;
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

export async function collectSporadicResults(
  requestCount: number,
  idleMs: number,
  requestOne: () => Promise<SendOneResult> = sendOneRequest,
  wait: WaitFn = delay,
): Promise<SporadicResult[]> {
  const results: SporadicResult[] = [];

  for (let index = 0; index < requestCount; index += 1) {
    const idleBeforeMs = index === 0 ? 0 : idleMs;

    if (idleBeforeMs > 0) {
      await wait(idleBeforeMs);
    }

    results.push({
      requestId: index + 1,
      idleBeforeMs,
      result: await requestOne(),
    });
  }

  return results;
}

export function summarizeSporadicResults(requestCount: number, idleMs: number, results: readonly SporadicResult[]) {
  const ttfbValues = results
    .map(({ result }) => result.ttfbMs)
    .filter((value): value is number => value !== null);

  const successCount = results.filter(({ result }) => result.ok).length;
  const failureCount = results.length - successCount;

  return {
    requestCount,
    idleMs,
    successCount,
    failureCount,
    p95TtfbMs: percentile(ttfbValues, 0.95),
    p99TtfbMs: percentile(ttfbValues, 0.99),
  };
}

async function main(): Promise<void> {
  const requestCount = parsePositiveInteger(process.env.SPORADIC_REQUESTS, DEFAULT_REQUEST_COUNT);
  const idleMs = parsePositiveInteger(process.env.SPORADIC_IDLE_MS, DEFAULT_IDLE_MS);
  const runStartedAt = new Date().toISOString();
  const results = await collectSporadicResults(requestCount, idleMs);
  const csvWritten = await saveSporadicMetrics(runStartedAt, results);
  const summary = summarizeSporadicResults(requestCount, idleMs, results);

  console.log("scenario: sporadic");
  console.log(`requests: ${summary.requestCount}`);
  console.log(`idle_ms_between_requests: ${summary.idleMs}`);
  console.log(`successful_requests: ${summary.successCount}`);
  console.log(`failed_requests: ${summary.failureCount}`);
  console.log(`p95_ttfb_ms: ${summary.p95TtfbMs ?? "n/a"}`);
  console.log(`p99_ttfb_ms: ${summary.p99TtfbMs ?? "n/a"}`);
  console.log(`csv_written: ${csvWritten}`);

  if (summary.failureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sporadic scenario failed: ${message}`);
  process.exitCode = 1;
});
