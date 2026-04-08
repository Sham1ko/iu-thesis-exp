# node-service

Node.js version of the benchmark service from `go-service`.

## What gets deployed

- A Node.js HTTP service with `GET /ping`
- Two Knative Service manifests: `node-min0.yaml` for baseline scale-to-zero and `node-min1.yaml` for the `min-scale: 1` mitigation case

## Prerequisites

- Docker
- `kubectl`
- `kind`

## Manual workflow

This repository now expects a manual deployment workflow:

```bash
docker build -t kind.local/node-benchmark:v1 ./node-service
kind load docker-image kind.local/node-benchmark:v1 --name kind
kubectl apply -f node-service/node-min0.yaml
# or:
# kubectl apply -f node-service/node-min1.yaml
```

Use `node-min0.yaml` for the default scale-to-zero case and `node-min1.yaml` for the mitigation case.

## Example setup commands

```bash
kind create cluster --name kind --config infra/kind.yaml
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-crds.yaml
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-core.yaml
kubectl apply -f infra/kourier.yaml
kubectl patch configmap/config-network --namespace knative-serving --type merge --patch '{"data":{"ingress-class":"kourier.ingress.networking.knative.dev"}}'
kubectl patch configmap/config-domain --namespace knative-serving --type merge --patch '{"data":{"example.com":""}}'
kubectl wait --for=condition=Ready pod --all -n knative-serving --timeout=300s
kubectl wait --for=condition=Ready pod --all -n kourier-system --timeout=300s
docker build -t kind.local/node-benchmark:v1 ./node-service
kind load docker-image kind.local/node-benchmark:v1 --name kind
kubectl apply -f node-service/node-min0.yaml
# or:
# kubectl apply -f node-service/node-min1.yaml
kubectl wait --for=condition=Ready ksvc/node-benchmark-min0 --timeout=300s
# or:
# kubectl wait --for=condition=Ready ksvc/node-benchmark-min1 --timeout=300s
```

After deployment:

```bash
SERVICE_HOST=$(kubectl get ksvc node-benchmark-min0 -o jsonpath='{.status.url}' | sed 's#^http://##')
# or:
# SERVICE_HOST=$(kubectl get ksvc node-benchmark-min1 -o jsonpath='{.status.url}' | sed 's#^http://##')
curl -H "Host: ${SERVICE_HOST}" http://127.0.0.1:8080/ping
```
