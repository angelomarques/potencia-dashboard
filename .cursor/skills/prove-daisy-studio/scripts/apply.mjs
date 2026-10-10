import { readFileSync } from "node:fs";
for (const f of process.argv.slice(2)) {
  const raw = readFileSync(f, "utf8").split("\n").map(l => l.trim().startsWith("--") ? "" : l).join("\n");
  for (const sql of raw.split(";").map(s => s.trim()).filter(Boolean)) {
    const r = await fetch("http://127.0.0.1:8788/accounts/x/d1/database/y/query", { method: "POST", body: JSON.stringify({ sql }) });
    const j = await r.json(); if (!j.success) { console.error(f, j.errors, sql.slice(0, 80)); }
  }
  console.log("applied", f);
}
