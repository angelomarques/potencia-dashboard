#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
RUN="$ROOT/.cursor/skills/verify-youtube-manager/.run"
if [[ -f "$RUN/state.env" ]]; then
  # shellcheck disable=SC1091
  source "$RUN/state.env"
  if [[ -n "${VERIFY_LAUNCH_PID:-}" ]]; then
    kill "$VERIFY_LAUNCH_PID" 2>/dev/null || true
  fi
  rm -f "$RUN/state.env"
fi
echo "cleaned"
