#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSql, hasCompositePk, runD1Statements, LEFTOVER_CLEANUP } from "./d1-migrate-lib.mjs";

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
  const conn = {
    accountId: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
    dbId: requireEnv("D1_DATABASE_ID", "CLOUDFLARE_D1_DATABASE_ID"),
    token: requireEnv("CLOUDFLARE_API_TOKEN"),
    baseUrl: (process.env.D1_HTTP_BASE_URL?.trim() || "https://api.cloudflare.com/client/v4").replace(/\/+$/, ""),
  };

  // Every request is ONE JSON object { sql: "s1;\ns2;..." } — D1 /query
  // rejects array bodies. D1 runs a multi-statement sql string as a batch
  // (one transaction; a failing statement rolls the whole request back) and
  // returns one result per statement.

  // Rerun safety: a previous partial run may have left *_new tables behind.
  // A leftover daisy_comments_new whose FK points at the old daisy_sketches
  // makes SQLite raise "foreign key mismatch" on ANY later write touching
  // daisy_sketches (even 0003), so drop leftovers in their own request first.
  try {
    await runD1Statements(conn, LEFTOVER_CLEANUP);
  } catch (err) {
    console.error(`Leftover *_new cleanup FAILED: ${err.message}`);
    process.exit(1);
  }
  console.log("OK leftover *_new tables dropped (if any)");

  for (const rel of migrationFiles) {
    if (rel.includes("0004")) {
      let tableSql;
      try {
        const [check] = await runD1Statements(conn, [
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'daisy_sketches' LIMIT 1",
        ]);
        tableSql = check?.results?.[0]?.sql;
      } catch (err) {
        console.error(`Schema check FAILED for ${rel}: ${err.message}`);
        process.exit(1);
      }
      if (typeof tableSql !== "string") {
        console.error(`Schema check FAILED for ${rel}: daisy_sketches not found`);
        process.exit(1);
      }
      if (hasCompositePk(tableSql)) {
        console.log(`SKIP migration ${rel}: already applied (composite PRIMARY KEY present)`);
        continue;
      }
    }

    const statements = splitSql(await readFile(resolve(root, rel), "utf8"));
    console.log(`Applying ${statements.length} statements from ${rel} to D1 as one request…`);
    try {
      await runD1Statements(conn, statements);
    } catch (err) {
      console.error(`Batch FAILED for ${rel} (rolled back by D1): ${err.message}`);
      process.exit(1);
    }
    console.log(`PASS migration ${rel} applied`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
