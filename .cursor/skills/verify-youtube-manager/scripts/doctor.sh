#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
PORT="${VERIFY_PORT:-43210}"
URL="${VERIFY_URL:-http://localhost:$PORT}"
echo "doctor: GET $URL/youtube (expect redirect or 200)"
code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/youtube" || true)
echo "HTTP $code"
if [[ "$code" != "200" && "$code" != "307" && "$code" != "302" ]]; then
  echo "FAIL doctor"
  exit 1
fi
echo "PASS doctor"
