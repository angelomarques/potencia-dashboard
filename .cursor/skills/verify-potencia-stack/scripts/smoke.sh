#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
echo "[smoke] install + build"
pnpm install --frozen-lockfile=false
SKIP_ENV_VALIDATION=true pnpm build
echo "[smoke] doctor"
bash .cursor/skills/verify-potencia-stack/scripts/doctor.sh
echo "PASS smoke"
