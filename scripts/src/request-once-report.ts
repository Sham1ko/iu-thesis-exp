import { saveRequestOnceMetric } from "./request-metrics-report.ts";
import type { SendOneResult } from "./send-one.ts";

export async function reportRequestOnce(result: SendOneResult): Promise<void> {
  const csvWritten = await saveRequestOnceMetric(result);

  console.log(`status: ${result.status ?? "n/a"}`);
  console.log(`ttfb_ms: ${result.ttfbMs ?? "n/a"}`);
  console.log(`elapsed_ms: ${result.elapsedMs}`);
  console.log("body:");
  console.log(result.bodyRaw);
  console.log(`csv_written: ${csvWritten}`);
}
