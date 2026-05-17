#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"
docker compose -f docker-compose.yml -f docker-compose.dev.yml build platform-dev
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d \
  router-dev landing-dev auth-dev xmas-dev platform-dev workouts-dev \
  auth-db xmas-db platform-db workouts-db
