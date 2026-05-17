#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/MigrateAuthDB.sh"
"$SCRIPT_DIR/MigratePlatformDB.sh"
"$SCRIPT_DIR/MigrateXmasDB.sh"
"$SCRIPT_DIR/MigrateWorkoutsDB.sh"
