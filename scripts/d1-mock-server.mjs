#!/usr/bin/env node
// Strict local mock of the Cloudflare D1 REST /query endpoint (tests + proofs).
// Usage: node scripts/d1-mock-server.mjs <sqlite-file> [port]
//   then D1_HTTP_BASE_URL=http://127.0.0.1:<port>/client/v4
//
// Mirrors D1: body must be ONE object — { sql, params? } or { batch: [...] }.
// An array body gets 400 "Invalid input: Expected object, received array".
// A multi-statement sql string runs as one batch/transaction (all-or-nothing)
// and `result` has one entry per statement. Foreign keys are ON (as on D1).
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { splitSql } from "./d1-migrate-lib.mjs";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

function fail(status, message) {
  return { status, body: { success: false, errors: [{ code: 7500, message }], messages: [], result: [] } };
}

/** Pure handler: (DatabaseSync, parsed JSON body) -> { status, body }. */
export function handleD1Query(db, body) {
  if (Array.isArray(body)) return fail(400, "Invalid input: Expected object, received array");
  if (!body || typeof body !== "object") return fail(400, "Invalid input: Expected object");
  let items;
  if (Array.isArray(body.batch)) items = body.batch;
  else if (typeof body.sql === "string") items = [{ sql: body.sql, params: body.params }];
  else return fail(400, "Invalid input: expected { sql } or { batch }");

  // Expand multi-statement strings; params only apply to single statements.
  const stmts = [];
  for (const it of items) {
    const parts = splitSql(it.sql ?? "");
    if (parts.length > 1 && it.params?.length) return fail(400, "params not allowed with multiple statements");
    for (const p of parts) stmts.push({ sql: p, params: parts.length === 1 ? it.params ?? [] : [] });
  }
  if (stmts.length === 0) return fail(400, "No SQL statements");

  const result = [];
  db.exec("BEGIN");
  try {
    for (const s of stmts) {
      const st = db.prepare(s.sql);
      const t0 = performance.now();
      if (st.columns().length > 0) {
        const rows = st.all(...s.params);
        result.push({ success: true, results: rows, meta: { changes: 0, duration: performance.now() - t0 } });
      } else {
        const r = st.run(...s.params);
        result.push({
          success: true,
          results: [],
          meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid), duration: performance.now() - t0 },
        });
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    return fail(400, `${e.message}: SQLITE_ERROR`);
  }
  return { status: 200, body: { success: true, errors: [], messages: [], result } };
}

export function openMockDb(file) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys=ON");
  return db;
}

export function startMockServer(db, port = 0) {
  const server = createServer((req, res) => {
    const send = ({ status, body }) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST" || !/\/d1\/database\/[^/]+\/query$/.test(req.url ?? "")) {
      return send(fail(404, "not found"));
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return send(fail(400, "Invalid JSON"));
      }
      send(handleD1Query(db, parsed));
    });
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [file, port = "8788"] = process.argv.slice(2);
  if (!file) {
    console.error("usage: d1-mock-server.mjs <sqlite-file> [port]");
    process.exit(2);
  }
  const s = await startMockServer(openMockDb(file), Number(port));
  console.log(`d1 mock on ${s.address().port}`);
}
