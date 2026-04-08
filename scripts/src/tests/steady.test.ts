import assert from "node:assert/strict";

import { collectSteadyResults } from "../workloads/steady.ts";
import type { SendOneResult } from "../network/send-one.ts";

function createResult(overrides: Partial<SendOneResult> = {}): SendOneResult {
  return {
    ok: true,
    status: 200,
    ttfbMs: 10,
    elapsedMs: 12,
    sentAt: "2026-04-07T10:00:00.000Z",
    receivedAt: "2026-04-07T10:00:00.012Z",
    bodyRaw: '{"ok":true}',
    bodyJson: { ok: true },
    errorMessage: null,
    ...overrides,
  };
}

async function testUsesExclusiveDurationBoundary(): Promise<void> {
  let callCount = 0;

  const results = await collectSteadyResults(
    1_000,
    30_000,
    undefined,
    async () => createResult({ ttfbMs: 10 + callCount++ }),
    undefined,
    async () => {},
    (() => {
      let nowValue = 0;
      return () => {
        const current = nowValue;
        nowValue += 1_000;
        return current;
      };
    })(),
  );

  assert.equal(results.length, 30);
  assert.equal(results[0]?.requestId, 1);
  assert.equal(results[29]?.requestId, 30);
}

async function main(): Promise<void> {
  await testUsesExclusiveDurationBoundary();
  console.log("steady tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
