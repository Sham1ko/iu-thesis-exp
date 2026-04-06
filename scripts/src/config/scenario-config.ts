import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIMES = ["go", "node"] as const;
export const STRATEGIES = ["min0", "min1"] as const;
export const WORKLOADS = ["burst", "sporadic", "steady"] as const;
export const RESOLVE_MODES = ["auto", "kubectl", "env"] as const;

export type RuntimeName = (typeof RUNTIMES)[number];
export type StrategyName = (typeof STRATEGIES)[number];
export type WorkloadName = (typeof WORKLOADS)[number];
export type ResolveMode = (typeof RESOLVE_MODES)[number];

export type ScenarioConfig = {
  runtime: RuntimeName;
  strategy: StrategyName;
  serviceName: string;
  manifestPath: string;
  namespace: string;
  resultsFilePrefix: string;
};

const DEFAULT_NAMESPACE = "default";
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const SCENARIO_CATALOG: Record<RuntimeName, Record<StrategyName, ScenarioConfig>> = {
  go: {
    min0: {
      runtime: "go",
      strategy: "min0",
      serviceName: "go-benchmark",
      manifestPath: path.resolve(REPO_ROOT, "go-service", "go-min0.yaml"),
      namespace: DEFAULT_NAMESPACE,
      resultsFilePrefix: "go-min0",
    },
    min1: {
      runtime: "go",
      strategy: "min1",
      serviceName: "go-min-1",
      manifestPath: path.resolve(REPO_ROOT, "go-service", "go-min1.yaml"),
      namespace: DEFAULT_NAMESPACE,
      resultsFilePrefix: "go-min1",
    },
  },
  node: {
    min0: {
      runtime: "node",
      strategy: "min0",
      serviceName: "node-benchmark-min0",
      manifestPath: path.resolve(REPO_ROOT, "node-service", "node-min0.yaml"),
      namespace: DEFAULT_NAMESPACE,
      resultsFilePrefix: "node-min0",
    },
    min1: {
      runtime: "node",
      strategy: "min1",
      serviceName: "node-benchmark-min1",
      manifestPath: path.resolve(REPO_ROOT, "node-service", "node-min1.yaml"),
      namespace: DEFAULT_NAMESPACE,
      resultsFilePrefix: "node-min1",
    },
  },
};

export function isRuntimeName(value: string): value is RuntimeName {
  return RUNTIMES.includes(value as RuntimeName);
}

export function isStrategyName(value: string): value is StrategyName {
  return STRATEGIES.includes(value as StrategyName);
}

export function isWorkloadName(value: string): value is WorkloadName {
  return WORKLOADS.includes(value as WorkloadName);
}

export function isResolveMode(value: string): value is ResolveMode {
  return RESOLVE_MODES.includes(value as ResolveMode);
}

export function getScenarioConfig(runtime: RuntimeName, strategy: StrategyName): ScenarioConfig {
  return SCENARIO_CATALOG[runtime][strategy];
}

export function getScenarioResultsFile(scenario: ScenarioConfig, workload: WorkloadName): string {
  return path.join("results", `${scenario.resultsFilePrefix}-${workload}_raw.csv`);
}

export function getScenarioPodStartupResultsFile(
  scenario: ScenarioConfig,
  workload: WorkloadName,
): string {
  return path.join("results", `${scenario.resultsFilePrefix}-${workload}_pod-startup.csv`);
}
