#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSql, runD1Statements } from "./d1-migrate-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function requireEnv(name, ...alts) {
  for (const n of [name, ...alts]) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  throw new Error(`Missing env: ${[name, ...alts].join(" / ")}`);
}

async function main() {
  const rel = "migrations/0005_leads_outbound.sql";
  const conn = {
    accountId: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
    dbId: requireEnv("D1_DATABASE_ID", "CLOUDFLARE_D1_DATABASE_ID"),
    token: requireEnv("CLOUDFLARE_API_TOKEN"),
    baseUrl: (
      process.env.D1_HTTP_BASE_URL?.trim() ||
      "https://api.cloudflare.com/client/v4"
    ).replace(/\/+$/, ""),
  };

  const statements = splitSql(await readFile(resolve(root, rel), "utf8"));
  console.log(
    `Applying ${statements.length} statements from ${rel} to D1 as one request…`,
  );
  try {
    await runD1Statements(conn, statements);
  } catch (err) {
    console.error(
      `Batch FAILED for ${rel} (rolled back by D1): ${err.message}`,
    );
    process.exit(1);
  }
  console.log(`PASS migration ${rel} applied`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
