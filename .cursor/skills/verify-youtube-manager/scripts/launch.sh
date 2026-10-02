#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
PORT="${VERIFY_PORT:-43210}"
RUN="$ROOT/.cursor/skills/verify-youtube-manager/.run"
mkdir -p "$RUN"
if [[ -f "$RUN/state.env" ]]; then
  # shellcheck disable=SC1091
  source "$RUN/state.env" || true
  if [[ -n "${VERIFY_LAUNCH_PID:-}" ]] && kill -0 "$VERIFY_LAUNCH_PID" 2>/dev/null; then
    echo "Already running pid=$VERIFY_LAUNCH_PID url=$VERIFY_URL"
    exit 0
  fi
fi
cd "$ROOT"
if [[ -f /home/box/agent-data/secrets/potencia-dashboard.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /home/box/agent-data/secrets/potencia-dashboard.env
  set +a
fi
if [[ -f /home/box/agent-data/secrets/georealty-prove-r2.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /home/box/agent-data/secrets/georealty-prove-r2.env
  set +a
fi
pnpm exec next dev --port "$PORT" >"$RUN/next.log" 2>&1 &
PID=$!
echo "VERIFY_LAUNCH_PID=$PID" >"$RUN/state.env"
echo "VERIFY_PORT=$PORT" >>"$RUN/state.env"
echo "VERIFY_URL=http://localhost:$PORT" >>"$RUN/state.env"
for i in $(seq 1 60); do
  if curl -sf -o /dev/null "http://localhost:$PORT/" || curl -sf -o /dev/null "http://localhost:$PORT/sign-in"; then
    echo "Ready http://localhost:$PORT"
    exit 0
  fi
  sleep 1
done
echo "FAIL launch timeout"; exit 1
