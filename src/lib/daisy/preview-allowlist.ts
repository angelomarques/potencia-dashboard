/**
 * Daisy preview iframe allowlist validator.
 * Pure utility (no server-only) safe for client components and server code.
 */

function matchHost(hostname: string, pattern: string): boolean {
  const h = hostname.trim().toLowerCase();
  const p = pattern.trim().toLowerCase();
  if (!p) return false;
  if (p === "*" || p === "*.*") return false; // never allow wildcard-all
  if (p.startsWith("*.")) {
    const suffix = p.slice(1); // e.g. ".vercel.app"
    return h.endsWith(suffix) && h.length > suffix.length;
  }
  return h === p;
}

export function isAllowedPreviewUrl(
  url: string | null | undefined,
  extraOrigins?: string | string[] | null,
): boolean {
  if (!url || typeof url !== "string") return false;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }

  // Must be HTTPS only
  if (parsed.protocol !== "https:") return false;

  // Rejects credentials in URL
  if (parsed.username || parsed.password) return false;

  const hostname = parsed.hostname.toLowerCase();

  // Default allowlisted hosts:
  // *.vercel.app, potenciaapps.com.br, *.potenciaapps.com.br
  const defaultPatterns = [
    "*.vercel.app",
    "potenciaapps.com.br",
    "*.potenciaapps.com.br",
  ];

  for (const pattern of defaultPatterns) {
    if (matchHost(hostname, pattern)) {
      return true;
    }
  }

  // Extra origins from optional param or env DAISY_PREVIEW_ALLOWED_ORIGINS
  const rawExtras =
    extraOrigins ??
    (typeof process !== "undefined"
      ? process.env?.DAISY_PREVIEW_ALLOWED_ORIGINS
      : undefined);

  if (rawExtras) {
    const items = Array.isArray(rawExtras)
      ? rawExtras
      : rawExtras.split(",");

    for (let item of items) {
      item = item.trim();
      if (!item) continue;

      // Strip scheme if present (e.g. https://*.example.com -> *.example.com)
      item = item.replace(/^https?:\/\//i, "");
      // Strip path/hash/query if present
      item = item.split("/")[0].split("?")[0].split("#")[0].trim();

      const colonIdx = item.indexOf(":");
      let patHost = item;
      let patPort: string | undefined;

      if (colonIdx !== -1) {
        patHost = item.slice(0, colonIdx);
        patPort = item.slice(colonIdx + 1);
      }

      if (matchHost(hostname, patHost)) {
        if (!patPort) return true;
        const urlPort = parsed.port || "443";
        if (urlPort === patPort) return true;
      }
    }
  }

  return false;
}
