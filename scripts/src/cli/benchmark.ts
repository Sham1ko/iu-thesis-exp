import { resolveBenchmarkTarget, type ResolvedTarget } from "../config/resolve-target.ts";
import {
  getScenarioConfig,
  getScenarioPodStartupResultsFile,
  getScenarioResultsFile,
  isResolveMode,
  isRuntimeName,
  isStrategyName,
  isWorkloadName,
  type ResolveMode,
  type RuntimeName,
  type StrategyName,
  type WorkloadName,
} from "../config/scenario-config.ts";
import { measurePodStartupDuring } from "../metrics/pod-startup-report.ts";
import { runBurst } from "../workloads/burst.ts";
import { runSporadic } from "../workloads/sporadic.ts";
import { runSteady } from "../workloads/steady.ts";
import { runCli } from "./script-entry.ts";

export type BenchmarkCliOptions = {
  runtime: RuntimeName;
  strategy: StrategyName;
  workload: WorkloadName;
  resolveMode: ResolveMode;
  namespace?: string;
  requestCount?: number;
  idleMs?: number;
  intervalMs?: number;
  durationMs?: number;
  path?: string;
  dryRun: boolean;
  help: boolean;
};

type ParsedFlagValue = string | boolean;

type BenchmarkDependencies = {
  resolveTarget?: typeof resolveBenchmarkTarget;
  measurePodStartupDuring?: typeof measurePodStartupDuring;
  runBurst?: typeof runBurst;
  runSporadic?: typeof runSporadic;
  runSteady?: typeof runSteady;
  log?: (message: string) => void;
};

export const BENCHMARK_USAGE = [
  "Usage:",
  "  pnpm run benchmark -- --runtime <go|node> --strategy <min0|min1> --workload <burst|sporadic|steady> [options]",
  "",
  "Options:",
  "  --runtime <go|node>",
  "  --strategy <min0|min1>",
  "  --workload <burst|sporadic|steady>",
  "  --resolve-mode <auto|kubectl|env>   default: auto",
  "  --namespace <name>                  default: scenario namespace",
  "  --requests <n>                      burst/sporadic/steady request bound",
  "  --idle-ms <n>                       sporadic idle gap before requests after the first",
  "  --interval-ms <n>                   steady request cadence",
  "  --duration-ms <n>                   steady duration bound in milliseconds",
  "  --path <request-path>               default: /ping",
  "  --dry-run                           resolve and print target without sending requests",
  "  --help",
  "",
  "Examples:",
  "  pnpm run benchmark -- --runtime go --strategy min0 --workload burst --dry-run",
  "  pnpm run benchmark -- --runtime node --strategy min1 --workload sporadic --requests 5 --idle-ms 30000",
  "  pnpm run benchmark -- --runtime go --strategy min1 --workload steady --interval-ms 1000 --duration-ms 30000",
].join("\n");

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected ${flagName} to be a positive integer, received: ${value}`);
  }

  return parsed;
}

function parseArgsToRecord(args: readonly string[]): Record<string, ParsedFlagValue> {
  const parsed: Record<string, ParsedFlagValue> = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "--") {
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    if (token === "--dry-run" || token === "--help") {
      parsed[token] = true;
      continue;
    }

    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    parsed[token] = value;
    index += 1;
  }

  return parsed;
}

function ensureRequiredString(
  parsed: Record<string, ParsedFlagValue>,
  flagName: string,
): string {
  const value = parsed[flagName];

  if (typeof value !== "string") {
    throw new Error(`Missing required flag ${flagName}`);
  }

  return value;
}

function resolveBenchmarkNamespace(
  options: BenchmarkCliOptions,
  defaultNamespace: string,
): string {
  return options.namespace ?? process.env.BENCHMARK_NAMESPACE ?? defaultNamespace;
}

export function parseBenchmarkArgs(args: readonly string[]): BenchmarkCliOptions {
  const parsed = parseArgsToRecord(args);

  if (parsed["--help"] === true) {
    return {
      runtime: "node",
      strategy: "min0",
      workload: "burst",
      resolveMode: "auto",
      dryRun: false,
      help: true,
    };
  }

  const runtime = ensureRequiredString(parsed, "--runtime");
  const strategy = ensureRequiredString(parsed, "--strategy");
  const workload = ensureRequiredString(parsed, "--workload");
  const resolveModeValue = parsed["--resolve-mode"];

  if (!isRuntimeName(runtime)) {
    throw new Error(`Unsupported runtime: ${runtime}`);
  }

  if (!isStrategyName(strategy)) {
    throw new Error(`Unsupported strategy: ${strategy}`);
  }

  if (!isWorkloadName(workload)) {
    throw new Error(`Unsupported workload: ${workload}`);
  }

  const resolveMode =
    typeof resolveModeValue === "string" ? resolveModeValue : "auto";

  if (!isResolveMode(resolveMode)) {
    throw new Error(`Unsupported resolve mode: ${resolveMode}`);
  }

  const requestCountValue = parsed["--requests"];
  const idleMsValue = parsed["--idle-ms"];
  const intervalMsValue = parsed["--interval-ms"];
  const durationMsValue = parsed["--duration-ms"];

  const options: BenchmarkCliOptions = {
    runtime,
    strategy,
    workload,
    resolveMode,
    namespace: typeof parsed["--namespace"] === "string" ? parsed["--namespace"] : undefined,
    requestCount: typeof requestCountValue === "string" ? parsePositiveInteger(requestCountValue, "--requests") : undefined,
    idleMs: typeof idleMsValue === "string" ? parsePositiveInteger(idleMsValue, "--idle-ms") : undefined,
    intervalMs: typeof intervalMsValue === "string" ? parsePositiveInteger(intervalMsValue, "--interval-ms") : undefined,
    durationMs: typeof durationMsValue === "string" ? parsePositiveInteger(durationMsValue, "--duration-ms") : undefined,
    path: typeof parsed["--path"] === "string" ? parsed["--path"] : undefined,
    dryRun: parsed["--dry-run"] === true,
    help: false,
  };

  if (options.workload !== "sporadic" && options.idleMs !== undefined) {
    throw new Error("--idle-ms is only supported for sporadic workload");
  }

  if (options.workload !== "steady" && (options.intervalMs !== undefined || options.durationMs !== undefined)) {
    throw new Error("--interval-ms and --duration-ms are only supported for steady workload");
  }

  if (options.workload === "steady" && options.requestCount === undefined && options.durationMs === undefined) {
    options.durationMs = 30_000;
  }

  return options;
}

export function formatResolvedTargetLines(
  options: BenchmarkCliOptions,
  resolvedTarget: ResolvedTarget,
  manifestPath: string,
  resultsFile: string,
  platformResultsFile: string,
): string[] {
  return [
    "benchmark:",
    `runtime: ${options.runtime}`,
    `strategy: ${options.strategy}`,
    `workload: ${options.workload}`,
    `resolve_mode: ${resolvedTarget.modeUsed}`,
    `service_name: ${resolvedTarget.serviceName}`,
    `manifest: ${manifestPath}`,
    `request_hostname: ${resolvedTarget.requestTarget.hostname}`,
    `request_port: ${resolvedTarget.requestTarget.port}`,
    `request_path: ${resolvedTarget.requestTarget.path}`,
    `host_header: ${resolvedTarget.requestTarget.hostHeader}`,
    `results_file: ${resultsFile}`,
    `platform_results_file: ${platformResultsFile}`,
    `service_url: ${resolvedTarget.serviceUrl ?? "n/a"}`,
  ];
}

export async function runBenchmark(
  options: BenchmarkCliOptions,
  dependencies: BenchmarkDependencies = {},
) {
  const log = dependencies.log ?? console.log;
  const scenario = getScenarioConfig(options.runtime, options.strategy);
  const namespace = resolveBenchmarkNamespace(options, scenario.namespace);
  const resolvedTarget = await (dependencies.resolveTarget ?? resolveBenchmarkTarget)({
    scenario,
    mode: options.resolveMode,
    namespaceOverride: options.namespace,
    pathOverride: options.path,
  });
  const resultsFile = getScenarioResultsFile(scenario, options.workload);
  const platformResultsFile = getScenarioPodStartupResultsFile(scenario, options.workload);
  const runStartedAt = new Date().toISOString();

  for (const line of formatResolvedTargetLines(
    options,
    resolvedTarget,
    scenario.manifestPath,
    resultsFile,
    platformResultsFile,
  )) {
    log(line);
  }

  if (options.dryRun) {
    return {
      kind: "dry-run" as const,
      scenario,
      resolvedTarget,
      resultsFile,
      platformResultsFile,
    };
  }

  const runWorkload = async () => {
    if (options.workload === "burst") {
      return (dependencies.runBurst ?? runBurst)({
        requestCount: options.requestCount,
        runStartedAt,
        target: resolvedTarget.requestTarget,
        resultsFile,
        log,
      });
    }

    if (options.workload === "sporadic") {
      return (dependencies.runSporadic ?? runSporadic)({
        requestCount: options.requestCount,
        idleMs: options.idleMs,
        runStartedAt,
        target: resolvedTarget.requestTarget,
        resultsFile,
        log,
      });
    }

    return (dependencies.runSteady ?? runSteady)({
      requestCount: options.requestCount,
      intervalMs: options.intervalMs,
      durationMs: options.durationMs,
      runStartedAt,
      target: resolvedTarget.requestTarget,
      resultsFile,
      log,
    });
  };

  const measurement = await (dependencies.measurePodStartupDuring ?? measurePodStartupDuring)(runWorkload, {
    runStartedAt,
    serviceName: resolvedTarget.serviceName,
    namespace,
    resultsFile: platformResultsFile,
  });

  log(`pod_startup_events: ${measurement.summary.totalEvents}`);
  log(`pod_startup_ready_events: ${measurement.summary.readyEvents}`);

  return {
    ...measurement.workloadResult,
    podStartup: {
      csvWritten: measurement.csvWritten,
      summary: measurement.summary,
      entries: measurement.entries,
    },
  };
}

async function main(): Promise<void> {
  const options = parseBenchmarkArgs(process.argv.slice(2));

  if (options.help) {
    console.log(BENCHMARK_USAGE);
    return;
  }

  await runBenchmark(options);
}

runCli(async () => {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(BENCHMARK_USAGE);
    throw new Error(`benchmark failed: ${message}`);
  }
}, import.meta.url);
