import { sendOneRequest } from "./send-one";

async function main(): Promise<void> {
  const result = await sendOneRequest();

  console.log(`status: ${result.status ?? "n/a"}`);
  console.log(`elapsed_ms: ${result.elapsedMs}`);
  console.log("body:");
  console.log(result.bodyRaw);

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
