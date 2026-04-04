import { sendOneRequest } from "./send-one";
import { reportRequestOnce } from "./request-once-report";

// Run with: `pnpm run request-once`
// Sends one request, measures client-side TTFB, and saves it to `results/ttfb_raw.csv` by default.

async function main(): Promise<void> {
  const result = await sendOneRequest();

  await reportRequestOnce(result);

  if (!result.ok) {
    if (result.errorMessage) {
      console.error(`request failed: ${result.errorMessage}`);
    }

    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`request failed: ${message}`);
  process.exitCode = 1;
});
