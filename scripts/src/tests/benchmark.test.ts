import assert from "node:assert/strict";
import path from "node:path";

import { parseBenchmarkArgs, runBenchmark } from "../cli/benchmark.ts";
import { getScenarioConfig } from "../config/scenario-config.ts";
import { deriveServiceHost, resolveBenchmarkTarget } from "../config/resolve-target.ts";

async function testParseBenchmarkArgs(): Promise<void> {
  const options = parseBenchmarkArgs([
    "--runtime",
    "go",
    "--strategy",
    "min1",
    "--workload",
    "steady",
    "--interval-ms",
    "1000",
    "--duration-ms",
    "5000",
    "--dry-run",
  ]);

  assert.deepEqual(options, {
    runtime: "go",
    strategy: "min1",
    workload: "steady",
    resolveMode: "auto",
    namespace: undefined,
    requestCount: undefined,
    idleMs: undefined,
    intervalMs: 1000,
    durationMs: 5000,
    path: undefined,
    dryRun: true,
    help: false,
  });
}

async function testParseBenchmarkArgsRejectsInvalidValues(): Promise<void> {
  assert.throws(
    () =>
      parseBenchmarkArgs([
        "--runtime",
        "python",
        "--strategy",
        "min0",
        "--workload",
        "burst",
      ]),
    /Unsupported runtime/,
  );

  assert.throws(
    () =>
      parseBenchmarkArgs([
        "--runtime",
        "go",
        "--strategy",
        "min0",
        "--workload",
        "burst",
        "--idle-ms",
        "1000",
      ]),
    /only supported for sporadic/,
  );
}

async function testResolveTargetFromEnvForAllScenarioPairs(): Promise<void> {
  const env = {
    BENCHMARK_DOMAIN: "example.com",
    REQUEST_HOSTNAME: "127.0.0.1",
    REQUEST_PORT: "8080",
    REQUEST_PATH: "/ping",
  };

  for (const [runtime, strategy, serviceName] of [
    ["go", "min0", "go-benchmark"],
    ["go", "min1", "go-min-1"],
    ["node", "min0", "node-benchmark-min0"],
    ["node", "min1", "node-benchmark-min1"],
  ] as const) {
    const resolved = await resolveBenchmarkTarget({
      scenario: getScenarioConfig(runtime, strategy),
      mode: "env",
      env,
    });

    assert.equal(resolved.requestTarget.hostHeader, deriveServiceHost(serviceName, "default", "example.com"));
  }
}

async function testResolveTargetViaKubectl(): Promise<void> {
  const resolved = await resolveBenchmarkTarget({
    scenario: getScenarioConfig("node", "min1"),
    mode: "kubectl",
    execFileLike: async () => ({
      stdout: "http://node-benchmark-min1.default.example.com",
      stderr: "",
    }),
  });

  assert.equal(resolved.modeUsed, "kubectl");
  assert.equal(resolved.requestTarget.hostHeader, "node-benchmark-min1.default.example.com");
}

async function testRunBenchmarkDispatchAndDryRun(): Promise<void> {
  const logs: string[] = [];
  let burstCalled = false;

  const dryRunResult = await runBenchmark(
    parseBenchmarkArgs([
      "--runtime",
      "go",
      "--strategy",
      "min0",
      "--workload",
      "burst",
      "--dry-run",
    ]),
    {
      log: (message) => logs.push(message),
      resolveTarget: async () => ({
        modeUsed: "env",
        serviceName: "go-benchmark",
        serviceUrl: null,
        requestTarget: {
          hostname: "127.0.0.1",
          port: 8080,
          path: "/ping",
          hostHeader: "go-benchmark.default.example.com",
          timeoutMs: 10000,
        },
      }),
      runBurst: async () => {
        burstCalled = true;
        return { csvWritten: "x", summary: { requestCount: 1 } };
      },
    },
  );

  assert.equal(dryRunResult.kind, "dry-run");
  assert.equal(burstCalled, false);
  assert.ok(logs.some((line) => line === "service_name: go-benchmark"));

  let steadyCalled = false;

  await runBenchmark(
    parseBenchmarkArgs([
      "--runtime",
      "node",
      "--strategy",
      "min1",
      "--workload",
      "steady",
      "--interval-ms",
      "500",
      "--requests",
      "5",
    ]),
    {
      log: () => {},
      resolveTarget: async () => ({
        modeUsed: "env",
        serviceName: "node-benchmark-min1",
        serviceUrl: null,
        requestTarget: {
          hostname: "127.0.0.1",
          port: 8080,
          path: "/ping",
          hostHeader: "node-benchmark-min1.default.example.com",
          timeoutMs: 10000,
        },
      }),
      runBurst: async () => {
        throw new Error("burst runner should not be called");
      },
      runSporadic: async () => {
        throw new Error("sporadic runner should not be called");
      },
      runSteady: async (options) => {
        steadyCalled = true;
        assert.equal(options.requestCount, 5);
        assert.equal(options.intervalMs, 500);
        assert.equal(options.resultsFile, path.join("results", "node-min1-steady_raw.csv"));
        return { csvWritten: "steady.csv", summary: { requestCount: 5 } };
      },
    },
  );

  assert.equal(steadyCalled, true);
}

async function main(): Promise<void> {
  await testParseBenchmarkArgs();
  await testParseBenchmarkArgsRejectsInvalidValues();
  await testResolveTargetFromEnvForAllScenarioPairs();
  await testResolveTargetViaKubectl();
  await testRunBenchmarkDispatchAndDryRun();
  console.log("benchmark tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
