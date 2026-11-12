#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
rm -rf .next test-results playwright-report artifacts .tmp-scaffold
echo "[cleanup] done"
