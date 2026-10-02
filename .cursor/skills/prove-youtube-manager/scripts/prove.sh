#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
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
elif [[ -f /home/box/agent-data/secrets/r2.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /home/box/agent-data/secrets/r2.env
  set +a
fi

SLUG="${PROVE_SLUG:-yt-$(date +%Y%m%d-%H%M%S)}"
ART="$ROOT/.cursor/skills/prove-youtube-manager/artifacts/$SLUG"
mkdir -p "$ART"

echo "prove-youtube-manager slug=$SLUG"
node "$ROOT/.cursor/skills/prove-youtube-manager/scripts/prove.mjs" --artifacts "$ART"
