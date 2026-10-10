// Playwright API check: better-auth origin/CSRF behaviour on sign-in.
// Usage: BASE_URL=http://localhost:3000 node tests/e2e/auth-origin.mjs
import { request } from "playwright-core";

const base = process.env.BASE_URL || "http://localhost:3000";
const trusted = (process.env.TRUSTED_ORIGINS || "https://dashboard.potenciaapps.com.br").split(",");
const untrusted = (process.env.UNTRUSTED_ORIGINS || "https://evil.example.com").split(",");
const extraHTTPHeaders = process.env.VERCEL_BYPASS
  ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS }
  : {};

const ctx = await request.newContext({ extraHTTPHeaders });
let fail = 0;
async function check(origin, expectTrusted) {
  const res = await ctx.post(`${base}/api/auth/sign-in/email`, {
    headers: { Origin: origin, "Content-Type": "application/json" },
    data: { email: "nobody@example.com", password: "not-a-real-password" },
  });
  const body = await res.text();
  const invalidOrigin = body.includes("INVALID_ORIGIN");
  const ok = expectTrusted
    ? !invalidOrigin && res.status() === 401 && body.includes("INVALID_EMAIL_OR_PASSWORD")
    : invalidOrigin && res.status() === 403;
  console.log(`${ok ? "PASS" : "FAIL"} ${origin} expect=${expectTrusted ? "trusted" : "rejected"} -> ${res.status()} ${body}`);
  if (!ok) fail++;
}
for (const o of trusted) await check(o.trim(), true);
for (const o of untrusted) await check(o.trim(), false);
await ctx.dispose();
console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exit(fail ? 1 : 0);
