#!/usr/bin/env bash
# Redeploy on the server: pull the latest main, rebuild the image, restart the stack.
# Run from anywhere on the VM:  ~/tilemma/deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
export SITE_ADDRESS="${SITE_ADDRESS:-tilemma.indonesiacentral.cloudapp.azure.com}"

git pull --ff-only
docker build -f docker/Dockerfile -t tilemma .
docker compose -f deploy/docker-compose.yml up -d --remove-orphans
docker image prune -f >/dev/null

echo "Waiting for the app to become healthy..."
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose -f deploy/docker-compose.yml ps -q app)" 2>/dev/null || true)"
  [ "$status" = "healthy" ] && { echo "healthy: https://${SITE_ADDRESS}"; exit 0; }
  sleep 5
done
echo "app did not become healthy; check: docker compose -f deploy/docker-compose.yml logs app" >&2
exit 1
