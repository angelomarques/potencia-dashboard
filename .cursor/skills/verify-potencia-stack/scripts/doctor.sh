#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
echo "[doctor] root=$ROOT"

fail=0
check() {
  local id="$1"; shift
  if "$@"; then echo "PASS $id"; else echo "FAIL $id"; fail=1; fi
}

check env-module test -f src/env.ts
check env-createEnv grep -q 'createEnv' src/env.ts
check env-path test "$(basename src/env.ts)" = "env.ts"
check pnpm-packageManager grep -q '"packageManager": "pnpm@' package.json
check pnpm-lock test -f pnpm-lock.yaml
check no-npm-lock test ! -f package-lock.json
check no-yarn-lock test ! -f yarn.lock
check scaffold test -f scripts/scaffold.mjs
check packs-defaults test -f packs/defaults.json
check skill-new test -f .cursor/skills/new-potencia-stack/SKILL.md
check skill-verify test -f .cursor/skills/verify-potencia-stack/SKILL.md
check health-source test -f src/app/api/health/route.ts

# Turnstile QA bypass (opt-in)
check qa-bypass-skill test -f .cursor/skills/qa-bypass/SKILL.md
check qa-bypass-env grep -q 'QA_BYPASS_SECRET' src/env.ts
check qa-bypass-mint test -f scripts/qa-bypass-token.mjs
check qa-bypass-helper grep -q 'verifyTurnstileOrQaBypass' src/lib/auth/turnstile.ts

# Forms: rule + components + RHF sign-in
check forms-rule test -f .cursor/rules/forms.mdc
check forms-ui-form test -f src/components/ui/form.tsx
check forms-ui-input test -f src/components/ui/input.tsx
check forms-ui-label test -f src/components/ui/label.tsx
check forms-dep-rhf grep -q '"react-hook-form"' package.json
check forms-dep-resolvers grep -q '"@hookform/resolvers"' package.json
check forms-signin-rhf grep -q 'useForm' "src/app/(auth)/sign-in/page.tsx"
check forms-signin-zodresolver grep -q 'zodResolver' "src/app/(auth)/sign-in/page.tsx"
check forms-signin-formfield grep -q 'FormField' "src/app/(auth)/sign-in/page.tsx"

# Analytics + unique EVENT_PREFIX (must not hardcode lw)
check analytics-module test -f src/lib/analytics.ts
check analytics-server-only grep -q 'server-only' src/lib/analytics.ts
check analytics-track grep -q 'static async track' src/lib/analytics.ts
check analytics-identify grep -q 'static async identify' src/lib/analytics.ts
check analytics-shutdown grep -q 'static async shutdown' src/lib/analytics.ts
check analytics-isInitialized grep -q 'isInitialized' src/lib/analytics.ts
if grep -qE 'EVENT_PREFIX[[:space:]]*=[[:space:]]*"lw"' src/lib/analytics.ts; then
  echo "FAIL analytics-no-lw"
  fail=1
else
  echo "PASS analytics-no-lw"
fi
check event-prefix-env grep -q 'NEXT_PUBLIC_EVENT_PREFIX' src/env.ts
check event-prefix-example grep -q 'NEXT_PUBLIC_EVENT_PREFIX' .env.example
check scaffold-event-prefix grep -q 'deriveEventPrefix' scripts/scaffold.mjs

# Help center (potencia-dashboard contract)
check help-center-skill test -f .cursor/skills/help-form/SKILL.md
check help-center-rule test -f .cursor/rules/help-form.mdc
check help-center-schema test -f src/lib/validation/help-center.ts
check help-center-dialog grep -q 'helpCenterSubmit' src/components/help-center-dialog.tsx
check help-center-event grep -q '"help_center_submitted"' src/lib/orpc/router.ts
check help-center-accountEmail grep -q 'accountEmail' src/lib/orpc/router.ts

# HTTP: axios only (shared clients in src/lib/http, no raw fetch outside it)
check http-rule test -f .cursor/rules/http-axios.mdc
check http-dep-axios grep -q '"axios"' package.json
check http-external test -f src/lib/http/external.ts
check http-internal test -f src/lib/http/internal.ts
check http-eslint grep -q 'no-restricted-globals' eslint.config.mjs
if grep -RnE '(^|[^.A-Za-z_])fetch\(|(window|globalThis|self)\.fetch' --include='*.ts' --include='*.tsx' src packs 2>/dev/null | grep -v '/lib/http/' | grep -v 'eslint-disable-next-line no-restricted-globals'; then
  echo "FAIL http-no-raw-fetch"
  fail=1
else
  echo "PASS http-no-raw-fetch"
fi

if grep -R --include='*.md' --include='*.mjs' --include='*.json' -n 'potencia-web' . 2>/dev/null | grep -v node_modules | grep -v '.git' | head -5; then
  echo "FAIL name-potencia-web-references"
  fail=1
else
  echo "PASS name-potencia-stack-only"
fi

exit $fail
