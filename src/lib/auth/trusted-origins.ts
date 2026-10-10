export function getTrustedOrigins(
  env: Record<string, string | undefined>,
): string[] {
  const candidates: string[] = [];

  // (1) env.BETTER_AUTH_URL
  if (env.BETTER_AUTH_URL) {
    candidates.push(env.BETTER_AUTH_URL);
  }

  // (2) comma-separated env.BETTER_AUTH_TRUSTED_ORIGINS
  if (env.BETTER_AUTH_TRUSTED_ORIGINS) {
    for (const origin of env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")) {
      const trimmed = origin.trim();
      if (trimmed) {
        candidates.push(trimmed);
      }
    }
  }

  // (3) defaults
  candidates.push(
    "https://dashboard.potenciaapps.com.br",
    "https://potencia-dashboard.vercel.app",
    "https://potencia-dashboard-nu.vercel.app",
  );

  // (4) 'https://'+env.VERCEL_URL, 'https://'+env.VERCEL_BRANCH_URL, 'https://'+env.VERCEL_PROJECT_PRODUCTION_URL when set
  const addVercelOrigin = (val: string | undefined) => {
    if (!val) return;
    const trimmed = val.trim();
    if (!trimmed) return;
    const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
    if (withoutProtocol) {
      candidates.push(`https://${withoutProtocol}`);
    }
  };

  addVercelOrigin(env.VERCEL_URL);
  addVercelOrigin(env.VERCEL_BRANCH_URL);
  addVercelOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);

  // (5) 'http://localhost:3000' only when env.NODE_ENV !== 'production'
  if (env.NODE_ENV !== "production") {
    candidates.push("http://localhost:3000");
  }

  const origins: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    // No wildcards
    if (!trimmed || trimmed.includes("*")) {
      continue;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        continue;
      }
      const origin = parsed.origin;
      if (
        origin &&
        origin !== "null" &&
        !origin.includes("*") &&
        !seen.has(origin)
      ) {
        seen.add(origin);
        origins.push(origin);
      }
    } catch {
      // ignore invalid entries
    }
  }

  return origins;
}
