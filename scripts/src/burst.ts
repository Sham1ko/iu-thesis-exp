import path from "node:path";

import { appendCsvRows, csvEscape } from "./csv-report";
import { sendOneRequest } from "./send-one";

const DEFAULT_REQUEST_COUNT = 500;
const RESULTS_FILE = process.env.RESULTS_FILE ?? path.join("results", "burst_raw.csv");

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

async function main(): Promise<void> {
  const requestCount = parsePositiveInteger(process.env.BURST_REQUESTS, DEFAULT_REQUEST_COUNT);
  const runStartedAt = new Date().toISOString();

  const results = await Promise.all(
    Array.from({ length: requestCount }, async (_, index) => ({
      requestId: index + 1,
      result: await sendOneRequest(),
    })),
  );

  const rows = results.map(({ requestId, result }) =>
    [
      csvEscape(runStartedAt),
      csvEscape(requestId),
      csvEscape(result.sentAt),
      csvEscape(result.ttfbMs),
      csvEscape(result.status),
      csvEscape(result.errorMessage),
    ].join(","),
  );

  const csvWritten = await appendCsvRows(
    RESULTS_FILE,
    "run_started_at,request_id,started_at,ttfb_ms,status_code,error",
    rows,
  );

  const ttfbValues = results
    .map(({ result }) => result.ttfbMs)
    .filter((value): value is number => value !== null);

  const successCount = results.filter(({ result }) => result.ok).length;
  const failureCount = results.length - successCount;

  console.log("scenario: burst");
  console.log(`requests: ${requestCount}`);
  console.log(`successful_requests: ${successCount}`);
  console.log(`failed_requests: ${failureCount}`);
  console.log(`p95_ttfb_ms: ${percentile(ttfbValues, 0.95) ?? "n/a"}`);
  console.log(`p99_ttfb_ms: ${percentile(ttfbValues, 0.99) ?? "n/a"}`);
  console.log(`csv_written: ${csvWritten}`);

  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`burst scenario failed: ${message}`);
  process.exitCode = 1;
});
