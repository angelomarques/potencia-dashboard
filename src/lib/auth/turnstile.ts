export interface VerifyTurnstileOptions {
  action?: string;
}

interface TurnstileSiteverifyResponse {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
  challenge_ts?: string;
  cdata?: string;
}

function getExpectedHostnames(): Set<string> {
  const envHostnames = process.env.TURNSTILE_HOSTNAMES;
  if (envHostnames && envHostnames.trim().length > 0) {
    return new Set(
      envHostnames
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  if (process.env.VERCEL_ENV === "production") {
    return new Set([
      "potencia-dashboard-nu.vercel.app",
      "potencia-dashboard.vercel.app",
      "dashboard.potenciaapps.com.br",
    ]);
  }

  return new Set(["localhost", "127.0.0.1"]);
}

export async function verifyTurnstileToken(
  token: string,
  ip?: string | null,
  opts?: VerifyTurnstileOptions,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error("Missing TURNSTILE_SECRET_KEY");
  }

  if (typeof token !== "string" || !token.trim() || token.length > 2048) {
    return false;
  }

  const expectedHostnames = getExpectedHostnames();
  if (expectedHostnames.size === 0) {
    console.warn("[turnstile] No allowed hostnames configured for verification");
    return false;
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) {
    body.set("remoteip", ip);
  }

  let res: Response;
  try {
    res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10000),
    });
  } catch (err: unknown) {
    console.warn(
      "[turnstile] siteverify network or timeout error:",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }

  if (!res.ok) {
    console.warn(`[turnstile] siteverify HTTP error status: ${res.status}`);
    return false;
  }

  let result: TurnstileSiteverifyResponse;
  try {
    result = (await res.json()) as TurnstileSiteverifyResponse;
  } catch {
    console.warn("[turnstile] Failed to parse siteverify JSON response");
    return false;
  }

  if (result["error-codes"] && result["error-codes"].length > 0) {
    console.warn("[turnstile] Siteverify error-codes:", result["error-codes"]);
  }

  if (result.success !== true) {
    return false;
  }

  if (opts?.action && result.action !== opts.action) {
    console.warn(
      `[turnstile] Action mismatch: expected "${opts.action}", received "${result.action}"`,
    );
    return false;
  }

  if (!result.hostname || !expectedHostnames.has(result.hostname.toLowerCase())) {
    console.warn(`[turnstile] Hostname mismatch: received "${result.hostname}"`);
    return false;
  }

  return true;
}
