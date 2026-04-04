import path from "node:path";

import { appendCsvRows, csvEscape } from "./csv-report";
import type { SendOneResult } from "./send-one";

type SavedMetric = {
  requestId: number;
  startedAt: string;
  ttfbMs: number | null;
  statusCode: number | null;
  error: string | null;
};

const RESULTS_FILE = process.env.RESULTS_FILE ?? path.join("results", "ttfb_raw.csv");

async function saveMetric(metric: SavedMetric): Promise<string> {
  const row = [
    csvEscape(metric.requestId),
    csvEscape(metric.startedAt),
    csvEscape(metric.ttfbMs),
    csvEscape(metric.statusCode),
    csvEscape(metric.error),
  ].join(",");

  return appendCsvRows(RESULTS_FILE, "request_id,started_at,ttfb_ms,status_code,error", [row]);
}

export async function reportRequestOnce(result: SendOneResult): Promise<void> {
  const csvWritten = await saveMetric({
    requestId: 1,
    startedAt: result.sentAt,
    ttfbMs: result.ttfbMs,
    statusCode: result.status,
    error: result.errorMessage,
  });

  console.log(`status: ${result.status ?? "n/a"}`);
  console.log(`ttfb_ms: ${result.ttfbMs ?? "n/a"}`);
  console.log(`elapsed_ms: ${result.elapsedMs}`);
  console.log("body:");
  console.log(result.bodyRaw);
  console.log(`csv_written: ${csvWritten}`);
}
