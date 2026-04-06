import { runCli } from "../cli/script-entry.ts";
import { saveBurstMetrics } from "../metrics/request-metrics-report.ts";
import { sendOneRequest, type RequestTarget, type SendOneResult } from "../network/send-one.ts";

const DEFAULT_REQUEST_COUNT = 500;

export type BurstResult = {
  requestId: number;
  result: SendOneResult;
};

export type RunBurstOptions = {
  requestCount?: number;
  runStartedAt?: string;
  target?: Partial<RequestTarget>;
  resultsFile?: string;
  log?: (message: string) => void;
  requestOne?: (target?: Partial<RequestTarget>) => Promise<SendOneResult>;
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

export function summarizeBurstResults(requestCount: number, results: readonly BurstResult[]) {
  const ttfbValues = results
    .map(({ result }) => result.ttfbMs)
    .filter((value): value is number => value !== null);

  const successCount = results.filter(({ result }) => result.ok).length;
  const failureCount = results.length - successCount;

  return {
    requestCount,
    successCount,
    failureCount,
    p95TtfbMs: percentile(ttfbValues, 0.95),
    p99TtfbMs: percentile(ttfbValues, 0.99),
  };
}

export async function runBurst(options: RunBurstOptions = {}) {
  const log = options.log ?? console.log;
  const requestCount = options.requestCount ?? DEFAULT_REQUEST_COUNT;
  const runStartedAt = options.runStartedAt ?? new Date().toISOString();

  const results = await Promise.all(
    Array.from({ length: requestCount }, async (_, index) => ({
      requestId: index + 1,
      result: await (options.requestOne ?? sendOneRequest)(options.target),
    })),
  );
  const csvWritten = await saveBurstMetrics(runStartedAt, results, { resultsFile: options.resultsFile });
  const summary = summarizeBurstResults(requestCount, results);

  log("scenario: burst");
  log(`requests: ${summary.requestCount}`);
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
  await runBurst({
    requestCount: parsePositiveInteger(process.env.BURST_REQUESTS, DEFAULT_REQUEST_COUNT),
  });
}

runCli(async () => {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`burst scenario failed: ${message}`);
  }
}, import.meta.url);
