import { runCli } from "../cli/script-entry.ts";
import { reportRequestOnce } from "../metrics/request-once-report.ts";
import { sendOneRequest, type RequestTarget } from "../network/send-one.ts";

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
