# Benchmark Runner

The primary interface for benchmark execution is now the `benchmark` runner in `scripts/`.

It lets you choose the full thesis scenario shape directly:

- runtime: `go` or `node`
- strategy: `min0` or `min1`
- workload: `burst`, `sporadic`, or `steady`

Each benchmark run now emits two raw artefacts:

- request-level latency CSV for TTFB/P95/P99 inputs
- platform-side pod startup CSV for pod creation-to-readiness observations

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

For non-dry-run benchmark execution, `kubectl` access is effectively required because the runner also captures platform-side pod lifecycle metrics.

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

For `steady`, `--duration-ms` is treated as an exclusive upper bound. Example: `--interval-ms 1000 --duration-ms 30000` produces 30 requests, not 31.

## Direct Utilities

Only the one-off request helper remains as a direct utility:

```bash
pnpm run request-once
```

For normal workload execution, use `pnpm run benchmark -- ...`.

## Notes

- The benchmark runner targets already-deployed Knative services. It does not own deployment/bootstrap.
- The expected deployment workflow is manual: build the image, load it into `kind`, apply the matching Knative Service manifest, wait for readiness, then run `pnpm run benchmark -- ...`.
- For verification, use `pnpm run check:modules` for a quick module/import smoke check and `pnpm test` for parser, mapping, and metrics regression tests.

## Manual Deployment Workflow

The documented workflow for this repository is:

```bash
docker build -t kind.local/node-benchmark:v1 ./node-service
kind load docker-image kind.local/node-benchmark:v1 --name kind
kubectl apply -f node-service/node-min0.yaml
# or:
# kubectl apply -f node-service/node-min1.yaml
kubectl wait --for=condition=Ready ksvc/node-benchmark-min0 --timeout=300s
# or:
# kubectl wait --for=condition=Ready ksvc/node-benchmark-min1 --timeout=300s
pnpm run benchmark -- --runtime node --strategy min0 --workload burst
```

Apply the same pattern for Go with `go-service/go-min0.yaml` or `go-service/go-min1.yaml`.
