# node-service

Node.js version of the benchmark service from `go-service`.

## What gets deployed

- A Node.js HTTP service with `GET /ping` and `GET /healthz`
- A Knative Service manifest in `node-service.yaml`
- A full deployment script for `kind` + Knative in `deploy-kind.sh`

## Prerequisites

- Docker
- `kubectl`
- `kind`

## Full deploy to kind + Knative

Run from the repository root:

```bash
chmod +x node-service/deploy-kind.sh
./node-service/deploy-kind.sh
```

The script will:

- create a `kind` cluster from `infra/kind.yaml` if it does not exist
- install Knative Serving
- install Kourier using `infra/kourier.yaml`
- configure Knative to use Kourier
- set `example.com` as the local no-DNS domain
- build `kind.local/node-benchmark:v1`
- load the image into `kind`
- deploy `node-service/node-service.yaml`
- print the `curl` commands for local access

## Manual commands

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
kubectl apply -f node-service/node-service.yaml
kubectl wait --for=condition=Ready ksvc/node-benchmark --timeout=300s
kubectl get ksvc node-benchmark
```

After deployment:

```bash
SERVICE_HOST=$(kubectl get ksvc node-benchmark -o jsonpath='{.status.url}' | sed 's#^http://##')
curl -H "Host: ${SERVICE_HOST}" http://127.0.0.1:8080/ping
curl -H "Host: ${SERVICE_HOST}" http://127.0.0.1:8080/healthz
```
