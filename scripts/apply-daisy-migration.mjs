#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSql, hasCompositePk, toBatchBody, LEFTOVER_CLEANUP } from "./d1-migrate-lib.mjs";

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
  const migrationFiles = [
    "migrations/0003_daisy.sql",
    "migrations/0004_daisy_sketch_scope.sql",
  ];
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const dbId = requireEnv("D1_DATABASE_ID", "CLOUDFLARE_D1_DATABASE_ID");
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const baseUrl = (process.env.D1_HTTP_BASE_URL?.trim() || "https://api.cloudflare.com/client/v4").replace(/\/+$/, "");

  // Rerun safety: a previous partial run may have left *_new tables behind.
  // A leftover daisy_comments_new whose FK points at the old daisy_sketches
  // makes SQLite raise "foreign key mismatch" on ANY later write touching
  // daisy_sketches (even 0003), so drop leftovers in their own batch first.
  {
    const res = await fetch(
      `${baseUrl}/accounts/${accountId}/d1/database/${dbId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toBatchBody(LEFTOVER_CLEANUP)),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      const msg = data.errors?.[0]?.message ?? `status ${res.status}`;
      console.error(`Leftover *_new cleanup FAILED: ${msg}`);
      process.exit(1);
    }
    console.log("OK leftover *_new tables dropped (if any)");
  }

  for (const rel of migrationFiles) {
    if (rel.includes("0004")) {
      try {
        const checkRes = await fetch(
          `${baseUrl}/accounts/${accountId}/d1/database/${dbId}/query`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'daisy_sketches' LIMIT 1;",
            }),
          },
        );
        const checkData = await checkRes.json();
        const tableSql =
          checkData.result?.[0]?.results?.[0]?.sql ??
          checkData.results?.[0]?.sql;
        if (hasCompositePk(tableSql)) {
          console.log(`SKIP migration ${rel}: already applied (composite PRIMARY KEY present)`);
          continue;
        }
      } catch (err) {
        console.warn(`Could not verify existing schema for ${rel}:`, err);
      }
    }

    const sqlPath = resolve(root, rel);
    const statements = splitSql(await readFile(sqlPath, "utf8"));
    // One request per file: D1 runs the batch atomically (all-or-nothing),
    // so no statement depends on PRAGMA state carried across requests.
    console.log(`Applying ${statements.length} statements from ${rel} to D1 as one batch…`);
    const res = await fetch(
      `${baseUrl}/accounts/${accountId}/d1/database/${dbId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toBatchBody(statements)),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      const msg = data.errors?.[0]?.message ?? `status ${res.status}`;
      console.error(`Batch FAILED for ${rel} (rolled back): ${msg}`);
      process.exit(1);
    }
    console.log(`PASS migration ${rel} applied`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
