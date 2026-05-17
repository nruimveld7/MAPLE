#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

ROUTER_HOST_PORT="$(awk '
  /^services:/ {in_services=1}
  in_services && /^  router:/ {in_router=1; next}
  in_router && /^  [a-zA-Z0-9_-]+:/ {exit}
  in_router && /- "[0-9]+:80"/ {
    gsub(/[^0-9:]/, "", $0)
    split($0, parts, ":")
    print parts[1]
    exit
  }
' docker-compose.yml)"

if [[ -z "${ROUTER_HOST_PORT}" ]]; then
  ROUTER_HOST_PORT=8080
fi

if [[ "${ROUTER_HOST_PORT}" == "80" ]]; then
  ROUTER_DEV_PORT=81
else
  ROUTER_DEV_PORT=8081
fi

export ROUTER_DEV_PORT

docker compose -f docker-compose.yml -f docker-compose.dev.yml build platform-dev

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d \
  auth-db xmas-db platform-db workouts-db mailer \
  landing-dev auth-dev xmas-dev platform-dev workouts-dev router-dev

echo "Dev router is up on host port ${ROUTER_DEV_PORT}."
