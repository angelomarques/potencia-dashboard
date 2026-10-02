/**
 * Cloudflare R2 (S3-compatible) config.
 * Accepts GeoRealty-style CLOUDFLARE_R2_* or shorthand R2_* names.
 */
export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  publicBase?: string;
};

function pick(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return undefined;
}

export function missingR2Vars(): string[] {
  const required: [string, string[]][] = [
    ["accessKeyId", ["CLOUDFLARE_R2_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"]],
    ["secretAccessKey", ["CLOUDFLARE_R2_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY"]],
    ["bucket", ["CLOUDFLARE_R2_BUCKET", "R2_BUCKET_NAME"]],
    ["endpoint", ["CLOUDFLARE_R2_ENDPOINT", "R2_ENDPOINT"]],
  ];
  const missing: string[] = [];
  for (const [, aliases] of required) {
    if (!pick(...aliases)) missing.push(aliases[0]);
  }
  // endpoint can be derived from account id
  if (missing.includes("CLOUDFLARE_R2_ENDPOINT")) {
    const accountId = pick("CLOUDFLARE_ACCOUNT_ID", "R2_ACCOUNT_ID");
    if (accountId) {
      const i = missing.indexOf("CLOUDFLARE_R2_ENDPOINT");
      if (i >= 0) missing.splice(i, 1);
    }
  }
  return missing;
}

export function r2Configured(): boolean {
  return missingR2Vars().length === 0;
}

export function readR2Config(): R2Config {
  const missing = missingR2Vars();
  if (missing.length) {
    throw new Error(`Missing R2 env: ${missing.join(", ")}`);
  }
  const accountId = pick("CLOUDFLARE_ACCOUNT_ID", "R2_ACCOUNT_ID") ?? "";
  const endpoint =
    pick("CLOUDFLARE_R2_ENDPOINT", "R2_ENDPOINT") ??
    `https://${accountId}.r2.cloudflarestorage.com`;
  return {
    accountId,
    accessKeyId: pick("CLOUDFLARE_R2_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID")!,
    secretAccessKey: pick(
      "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
      "R2_SECRET_ACCESS_KEY",
    )!,
    bucket: pick("CLOUDFLARE_R2_BUCKET", "R2_BUCKET_NAME")!,
    endpoint: endpoint.replace(/\/$/, ""),
    publicBase: pick("CLOUDFLARE_R2_PUBLIC_BASE_URL", "R2_PUBLIC_BASE_URL"),
  };
}
