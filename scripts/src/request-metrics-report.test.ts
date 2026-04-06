import assert from "node:assert/strict";

import {
  collectSporadicResults,
  summarizeSporadicResults,
} from "./sporadic.ts";
import {
  BURST_CSV_HEADER,
  createBurstMetricReport,
  createRequestOnceMetricReport,
  createSporadicMetricReport,
  REQUEST_ONCE_CSV_HEADER,
  SPORADIC_CSV_HEADER,
  STEADY_CSV_HEADER,
  createSteadyMetricReport,
} from "./request-metrics-report.ts";
import type { SendOneResult } from "./send-one.ts";

function createResult(overrides: Partial<SendOneResult> = {}): SendOneResult {
  return {
    ok: true,
    status: 200,
    ttfbMs: 123,
    elapsedMs: 150,
    sentAt: "2026-04-05T10:00:00.000Z",
    receivedAt: "2026-04-05T10:00:00.150Z",
    bodyRaw: '{"ok":true}',
    bodyJson: { ok: true },
    errorMessage: null,
    ...overrides,
  };
}

async function testCollectSporadicResults(): Promise<void> {
  const waitCalls: number[] = [];
  let callCount = 0;

  const results = await collectSporadicResults(
    3,
    30_000,
    async () => createResult({ ttfbMs: 100 + callCount++ }),
    undefined,
    async (ms) => {
      waitCalls.push(ms);
    },
  );

  assert.deepEqual(waitCalls, [30_000, 30_000]);
  assert.deepEqual(
    results.map(({ requestId, idleBeforeMs, result }) => ({
      requestId,
      idleBeforeMs,
      ttfbMs: result.ttfbMs,
    })),
    [
      { requestId: 1, idleBeforeMs: 0, ttfbMs: 100 },
      { requestId: 2, idleBeforeMs: 30_000, ttfbMs: 101 },
      { requestId: 3, idleBeforeMs: 30_000, ttfbMs: 102 },
    ],
  );
}

function testBuildSporadicRows(): void {
  const report = createSporadicMetricReport("2026-04-05T09:59:00.000Z", [
    { requestId: 1, idleBeforeMs: 0, result: createResult() },
  ]);

  assert.equal(
    SPORADIC_CSV_HEADER,
    "run_started_at,request_id,idle_before_ms,started_at,ttfb_ms,status_code,error",
  );
  assert.equal(report.header, SPORADIC_CSV_HEADER);
  assert.deepEqual(report.rows, ["2026-04-05T09:59:00.000Z,1,0,2026-04-05T10:00:00.000Z,123,200,"]);
}

function testBuildBurstRows(): void {
  const report = createBurstMetricReport("2026-04-05T09:59:00.000Z", [
    { requestId: 7, result: createResult() },
  ]);

  assert.equal(report.header, BURST_CSV_HEADER);
  assert.deepEqual(report.rows, ["2026-04-05T09:59:00.000Z,7,2026-04-05T10:00:00.000Z,123,200,"]);
}

function testBuildRequestOnceRow(): void {
  const report = createRequestOnceMetricReport(createResult());

  assert.equal(report.header, REQUEST_ONCE_CSV_HEADER);
  assert.deepEqual(report.rows, ["1,2026-04-05T10:00:00.000Z,123,200,"]);
}

function testBuildSteadyRows(): void {
  const report = createSteadyMetricReport("2026-04-05T09:59:00.000Z", [
    { requestId: 3, intervalMs: 1000, result: createResult() },
  ]);

  assert.equal(report.header, STEADY_CSV_HEADER);
  assert.deepEqual(report.rows, ["2026-04-05T09:59:00.000Z,3,1000,2026-04-05T10:00:00.000Z,123,200,"]);
}

function testSummarizeSporadicResults(): void {
  const summary = summarizeSporadicResults(4, 30_000, [
    { requestId: 1, idleBeforeMs: 0, result: createResult({ ttfbMs: 100 }) },
    { requestId: 2, idleBeforeMs: 30_000, result: createResult({ ttfbMs: 200 }) },
    { requestId: 3, idleBeforeMs: 30_000, result: createResult({ ttfbMs: 300 }) },
    {
      requestId: 4,
      idleBeforeMs: 30_000,
      result: createResult({
        ok: false,
        status: 503,
        ttfbMs: null,
        errorMessage: "Unexpected status code: 503",
      }),
    },
  ]);

  assert.deepEqual(summary, {
    requestCount: 4,
    idleMs: 30_000,
    successCount: 3,
    failureCount: 1,
    p95TtfbMs: 300,
    p99TtfbMs: 300,
  });
}

async function main(): Promise<void> {
  await testCollectSporadicResults();
  testBuildSporadicRows();
  testBuildBurstRows();
  testBuildRequestOnceRow();
  testBuildSteadyRows();
  testSummarizeSporadicResults();
  console.log("request metrics tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
