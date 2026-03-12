#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_NAME="${CLUSTER_NAME:-kind}"
KNATIVE_SERVING_VERSION="${KNATIVE_SERVING_VERSION:-knative-v1.21.1}"
IMAGE_NAME="${IMAGE_NAME:-kind.local/node-benchmark:v1}"
SERVICE_NAME="${SERVICE_NAME:-node-benchmark}"
NAMESPACE="${NAMESPACE:-default}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd docker
require_cmd kubectl
require_cmd kind

cluster_exists() {
  kind get clusters | grep -Fxq "$CLUSTER_NAME"
}

wait_for_knative() {
  kubectl wait --for=condition=Ready pod --all -n knative-serving --timeout=300s
  kubectl wait --for=condition=Ready pod --all -n kourier-system --timeout=300s
}

if ! cluster_exists; then
  kind create cluster --name "$CLUSTER_NAME" --config "$ROOT_DIR/infra/kind.yaml"
fi

kubectl apply -f "https://github.com/knative/serving/releases/download/${KNATIVE_SERVING_VERSION}/serving-crds.yaml"
kubectl apply -f "https://github.com/knative/serving/releases/download/${KNATIVE_SERVING_VERSION}/serving-core.yaml"
kubectl apply -f "$ROOT_DIR/infra/kourier.yaml"

kubectl patch configmap/config-network \
  --namespace knative-serving \
  --type merge \
  --patch '{"data":{"ingress-class":"kourier.ingress.networking.knative.dev"}}'

kubectl patch configmap/config-domain \
  --namespace knative-serving \
  --type merge \
  --patch '{"data":{"example.com":""}}'

wait_for_knative

docker build -t "$IMAGE_NAME" "$ROOT_DIR/node-service"
kind load docker-image "$IMAGE_NAME" --name "$CLUSTER_NAME"

kubectl apply -f "$ROOT_DIR/node-service/node-service.yaml"
kubectl wait --for=condition=Ready "ksvc/${SERVICE_NAME}" -n "$NAMESPACE" --timeout=300s

SERVICE_URL="$(kubectl get ksvc "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.status.url}')"
SERVICE_HOST="${SERVICE_URL#http://}"
SERVICE_HOST="${SERVICE_HOST#https://}"

cat <<EOF
Cluster: $CLUSTER_NAME
Image: $IMAGE_NAME
Service URL: $SERVICE_URL

Use the service locally with:
curl -H "Host: ${SERVICE_HOST}" http://127.0.0.1:8080/ping
curl -H "Host: ${SERVICE_HOST}" http://127.0.0.1:8080/healthz
EOF
