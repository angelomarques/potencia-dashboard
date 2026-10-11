// Usage: node .cursor/skills/prove-daisy-studio/scripts/apply.mjs migrations/0001_init.sql migrations/0003_daisy.sql migrations/0004_daisy_sketch_scope.sql
import { readFileSync } from "node:fs";

const defaultMigrations = [
  "migrations/0001_init.sql",
  "migrations/0003_daisy.sql",
  "migrations/0004_daisy_sketch_scope.sql",
];

const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultMigrations;

if (process.argv.slice(2).length === 0) {
  console.log("Usage: node apply.mjs migrations/0001_init.sql migrations/0003_daisy.sql migrations/0004_daisy_sketch_scope.sql");
  console.log(`Applying default migrations: ${defaultMigrations.join(" ")}`);
}

for (const f of files) {
  if (f.includes("0004")) {
    try {
      const check = await fetch("http://127.0.0.1:8788/accounts/x/d1/database/y/query", {
        method: "POST",
        body: JSON.stringify({ sql: "SELECT sql FROM sqlite_master WHERE type='table' AND name='daisy_sketches' LIMIT 1" }),
      });
      const checkJson = await check.json();
      const tableSql = checkJson.result?.[0]?.results?.[0]?.sql || "";
      if (
        /PRIMARY\s+KEY\s*\([^)]*project_id[^)]*id/i.test(tableSql) ||
        /PRIMARY\s+KEY\s*\([^)]*id[^)]*project_id/i.test(tableSql)
      ) {
        console.log("skipping 0004, already applied");
        continue;
      }
    } catch (e) {
      console.warn("Could not check 0004 status:", e);
    }
  }
  const raw = readFileSync(f, "utf8").split("\n").map(l => l.trim().startsWith("--") ? "" : l).join("\n");
  for (const sql of raw.split(";").map(s => s.trim()).filter(Boolean)) {
    const r = await fetch("http://127.0.0.1:8788/accounts/x/d1/database/y/query", { method: "POST", body: JSON.stringify({ sql }) });
    const j = await r.json(); if (!j.success) { console.error(f, j.errors, sql.slice(0, 80)); }
  }
  console.log("applied", f);
}
