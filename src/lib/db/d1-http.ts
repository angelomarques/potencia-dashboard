/**
 * Cloudflare D1 via REST/HTTP API — works on Vercel (no Workers binding).
 */
type D1Result = {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: Array<{
    results: Record<string, unknown>[];
    success: boolean;
    meta?: { changes?: number; last_row_id?: number; rows_read?: number; rows_written?: number };
  }>;
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getBaseUrl(): string {
  const custom = process.env.D1_HTTP_BASE_URL?.trim();
  if (custom) return custom.replace(/\/+$/, "");
  return "https://api.cloudflare.com/client/v4";
}

export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<{ results: T[]; meta?: Record<string, unknown> }> {
  const accountId = env("CLOUDFLARE_ACCOUNT_ID");
  const dbId = env("D1_DATABASE_ID");
  const token = env("CLOUDFLARE_API_TOKEN");

  const res = await fetch(
    `${getBaseUrl()}/accounts/${accountId}/d1/database/${dbId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
      cache: "no-store",
    },
  );

  const data = (await res.json()) as D1Result;
  if (!res.ok || !data.success) {
    const msg = data.errors?.[0]?.message ?? `D1 query failed (${res.status})`;
    throw new Error(msg);
  }
  const batch = data.result?.[0];
  return {
    results: (batch?.results ?? []) as T[],
    meta: batch?.meta as Record<string, unknown> | undefined,
  };
}

export async function d1Batch(
  statements: { sql: string; params?: unknown[] }[],
): Promise<void> {
  const accountId = env("CLOUDFLARE_ACCOUNT_ID");
  const dbId = env("D1_DATABASE_ID");
  const token = env("CLOUDFLARE_API_TOKEN");

  const res = await fetch(
    `${getBaseUrl()}/accounts/${accountId}/d1/database/${dbId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })),
      ),
      cache: "no-store",
    },
  );
  const data = (await res.json()) as D1Result;
  if (!res.ok || !data.success) {
    const msg = data.errors?.[0]?.message ?? `D1 batch failed (${res.status})`;
    throw new Error(msg);
  }
}
