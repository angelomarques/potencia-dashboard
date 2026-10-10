#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function requireEnv(name, ...alts) {
  for (const n of [name, ...alts]) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  throw new Error(`Missing env: ${[name, ...alts].join(" / ")}`);
}

function splitSql(raw) {
  const noLineComments = raw
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (t.startsWith("--")) return "";
      return line;
    })
    .join("\n");
  return noLineComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const sqlPath = resolve(root, "migrations/0003_daisy.sql");
  const statements = splitSql(await readFile(sqlPath, "utf8"));
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const dbId = requireEnv("D1_DATABASE_ID", "CLOUDFLARE_D1_DATABASE_ID");
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const baseUrl = (process.env.D1_HTTP_BASE_URL?.trim() || "https://api.cloudflare.com/client/v4").replace(/\/+$/, "");

  console.log(`Applying ${statements.length} statements to D1…`);
  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i] + ";";
    const res = await fetch(
      `${baseUrl}/accounts/${accountId}/d1/database/${dbId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql }),
      },
    );
    const data = await res.json();
    if (!res.ok || !data.success) {
      const msg = data.errors?.[0]?.message ?? `status ${res.status}`;
      console.error(`Statement ${i + 1} FAILED: ${msg}`);
      console.error(sql.slice(0, 240));
      process.exit(1);
    }
    console.log(`OK ${i + 1}/${statements.length}`);
  }
  console.log("PASS migration 0003_daisy applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
