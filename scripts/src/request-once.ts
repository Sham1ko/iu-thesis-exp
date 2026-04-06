import { reportRequestOnce } from "./request-once-report.ts";
import { runCli } from "./script-entry.ts";
import { sendOneRequest, type RequestTarget } from "./send-one.ts";

// Run with: `pnpm run request-once`
// Sends one request, measures client-side TTFB, and saves it to `results/ttfb_raw.csv` by default.

export async function runRequestOnce(target?: Partial<RequestTarget>): Promise<void> {
  const result = await sendOneRequest(target);

  await reportRequestOnce(result);

  if (!result.ok) {
    if (result.errorMessage) {
      console.error(`request failed: ${result.errorMessage}`);
    }

    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  await runRequestOnce();
}

runCli(async () => {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`request failed: ${message}`);
  }
}, import.meta.url);
