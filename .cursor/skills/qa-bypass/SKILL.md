---
name: qa-bypass
description: Opt-in, short-lived bypass of Cloudflare Turnstile so automated QA bots and test suites can run production tests through Turnstile-protected forms. Use when wiring a new Turnstile-protected route, minting a QA token, or auditing bypass use.
---

# QA bypass (Turnstile)

Lets an automated tester submit a Turnstile-protected form in production **without** solving the widget.
It skips **only** the Turnstile siteverify call. Validation, normal rate limits, auth and email sending all still run.

## How it works
- Env `QA_BYPASS_SECRET` (server, optional, ≥32 bytes, validated in `src/env.ts`). **Unset = bypass fully disabled.**
- Tokens are minted on demand, never stored or pre-generated:
  `v1.<issuedAtUnixSeconds>.<nonce>.<hex hmacSha256(secret, "v1."+issuedAt+"."+nonce+"."+scope)>`
  - `scope` = route name (`sign-up`, `password-reset`, `contact`, …). A token for one route does not work on another.
  - Valid 6h from `issuedAt`; rejected if `issuedAt` is >2 min in the future. Signature compared with `timingSafeEqual`.
- Header: `x-potencia-qa-bypass: <token>`. Only read on Turnstile-protected routes.
- Each use logs `[qa-bypass] used route=<scope> ip=<ip> issuedAt=<n>` (never the token). Rejections log `reason=`.
- Own rate limit: 20 bypasses / hour / IP (`QA_BYPASS_RATE_LIMIT`). Over the limit → falls back to normal Turnstile (fails).

Code: `src/lib/auth/qa-bypass-token.ts` (pure mint/verify), `src/lib/auth/qa-bypass.ts` (env + limiter + log),
`verifyTurnstileOrQaBypass()` in `src/lib/auth/turnstile.ts`. All ship with the `turnstile` pack.

## Wiring a protected route
```ts
const ok = await verifyTurnstileOrQaBypass({
  headers: request.headers,
  scope: "sign-up",          // stable route name
  token: body.turnstileToken ?? "",
  ip: clientIp,
});
if (!ok) return 403;
// …validation, rate limits, auth, email: unchanged
```
Never call `checkQaBypass` outside Turnstile-protected handlers and never use it to skip anything but siteverify.
With the redis pack, pass `rateLimit` in deps to share the bypass limit across instances.

## Minting a token
```bash
QA_BYPASS_SECRET=... node scripts/qa-bypass-token.mjs sign-up   # prints the token only
curl -H "x-potencia-qa-bypass: $TOKEN" ...
```
Keep the secret out of chat, commits, PRs and logs. Rotate by changing `QA_BYPASS_SECRET` (invalidates all tokens).

## Verify
`pnpm test:qa-bypass` — valid, expired, future, wrong scope, tampered, disabled-when-unset, Turnstile enforced without header, bypass rate limit, mint-script round trip.
