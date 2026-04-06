# Benchmark Runner

The primary interface for benchmark execution is now the `benchmark` runner in `scripts/`.

It lets you choose the full thesis scenario shape directly:

- runtime: `go` or `node`
- strategy: `min0` or `min1`
- workload: `burst`, `sporadic`, or `steady`

Run commands from `scripts/package.json`:

```bash
pnpm run check:modules
pnpm run benchmark -- --runtime go --strategy min0 --workload burst --dry-run
pnpm run benchmark -- --runtime node --strategy min1 --workload sporadic --requests 5 --idle-ms 30000
pnpm run benchmark -- --runtime go --strategy min1 --workload steady --interval-ms 1000 --duration-ms 30000
```

`pnpm run check:modules` is not a real build. It is a fast module-load smoke check that imports the key TypeScript entrypoints and catches broken imports or structural mistakes after refactors.

## Target Resolution

The runner supports:

- `--resolve-mode auto`: try `kubectl get ksvc ...` first, then fall back to env-based host derivation
- `--resolve-mode kubectl`: require live Knative service resolution
- `--resolve-mode env`: derive the host from env/config only

Useful env vars:

```bash
BENCHMARK_DOMAIN=example.com
BENCHMARK_NAMESPACE=default
REQUEST_HOSTNAME=127.0.0.1
REQUEST_PORT=8080
REQUEST_PATH=/ping
REQUEST_TIMEOUT_MS=10000
```

When `REQUEST_HOST` is not set, env mode derives the host header as:

```text
<service-name>.<namespace>.<BENCHMARK_DOMAIN>
```

## Workloads

- `burst`: high-intensity request phase, bounded by `--requests`
- `sporadic`: idle gap before requests after the first, controlled by `--idle-ms`
- `steady`: sustained cadence without long idle gaps, controlled by `--interval-ms` and bounded by `--duration-ms` or `--requests`

## Advanced Direct Entrypoints

The old direct scripts remain available as advanced entrypoints:

```bash
pnpm run request-once
pnpm run burst
pnpm run sporadic
pnpm run steady
```

Use them when you already want to work at the workload-module level. For normal scenario execution, prefer `pnpm run benchmark -- ...`.

## Notes

- The benchmark runner targets already-deployed Knative services. It does not own deployment/bootstrap.
- `node-service/deploy-kind.sh` is still a separate Node-focused bootstrap path, not the generic benchmark orchestrator.
- For verification, use:
  - `pnpm run check:modules` for a quick module/import smoke check
  - `pnpm test` for parser, mapping, and metrics regression tests
