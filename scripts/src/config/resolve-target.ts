import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { RequestTarget } from "../network/send-one.ts";
import type { ResolveMode, ScenarioConfig } from "./scenario-config.ts";

type ExecFileLike = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

export type ResolvedTarget = {
  modeUsed: "kubectl" | "env";
  requestTarget: RequestTarget;
  serviceName: string;
  serviceUrl: string | null;
};

export type ResolveTargetOptions = {
  scenario: ScenarioConfig;
  mode: ResolveMode;
  env?: NodeJS.ProcessEnv;
  execFileLike?: ExecFileLike;
  pathOverride?: string;
  namespaceOverride?: string;
};

const execFileAsync = promisify(execFile);

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function deriveServiceHost(serviceName: string, namespace: string, domain: string): string {
  return `${serviceName}.${namespace}.${domain}`;
}

function buildEnvTarget(options: ResolveTargetOptions): ResolvedTarget {
  const env = options.env ?? process.env;
  const namespace = options.namespaceOverride ?? env.BENCHMARK_NAMESPACE ?? options.scenario.namespace;
  const domain = env.BENCHMARK_DOMAIN ?? "127.0.0.1.sslip.io";

  return {
    modeUsed: "env",
    serviceName: options.scenario.serviceName,
    serviceUrl: null,
    requestTarget: {
      hostname: env.REQUEST_HOSTNAME ?? "127.0.0.1",
      port: parsePositiveInteger(env.REQUEST_PORT, 8080),
      path: options.pathOverride ?? env.REQUEST_PATH ?? "/ping",
      hostHeader: env.REQUEST_HOST ?? deriveServiceHost(options.scenario.serviceName, namespace, domain),
      timeoutMs: parsePositiveInteger(env.REQUEST_TIMEOUT_MS, 10_000),
    },
  };
}

async function resolveWithKubectl(options: ResolveTargetOptions): Promise<ResolvedTarget> {
  const run = options.execFileLike ?? ((file, args) => execFileAsync(file, [...args]));
  const namespace = options.namespaceOverride ?? options.env?.BENCHMARK_NAMESPACE ?? options.scenario.namespace;
  const { stdout } = await run("kubectl", [
    "get",
    "ksvc",
    options.scenario.serviceName,
    "-n",
    namespace,
    "-o",
    "jsonpath={.status.url}",
  ]);

  const serviceUrl = stdout.trim();

  if (!serviceUrl) {
    throw new Error(`Unable to resolve Knative URL for service ${options.scenario.serviceName}`);
  }

  const parsedUrl = new URL(serviceUrl.startsWith("http") ? serviceUrl : `http://${serviceUrl}`);
  const env = options.env ?? process.env;

  return {
    modeUsed: "kubectl",
    serviceName: options.scenario.serviceName,
    serviceUrl,
    requestTarget: {
      hostname: env.REQUEST_HOSTNAME ?? "127.0.0.1",
      port: parsePositiveInteger(env.REQUEST_PORT, 8080),
      path: options.pathOverride ?? env.REQUEST_PATH ?? "/ping",
      hostHeader: parsedUrl.host,
      timeoutMs: parsePositiveInteger(env.REQUEST_TIMEOUT_MS, 10_000),
    },
  };
}

export async function resolveBenchmarkTarget(options: ResolveTargetOptions): Promise<ResolvedTarget> {
  if (options.mode === "env") {
    return buildEnvTarget(options);
  }

  if (options.mode === "kubectl") {
    return resolveWithKubectl(options);
  }

  try {
    return await resolveWithKubectl(options);
  } catch {
    return buildEnvTarget(options);
  }
}
