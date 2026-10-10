// Local D1 HTTP API mock (node:sqlite) for evidence runs. Not committed.
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.env.DB_PATH || "/tmp/daisy-local.db");
function run(sql, params = []) {
  const st = db.prepare(sql);
  const p = params.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v === undefined ? null : v));
  if (st.columns().length > 0) return { results: st.all(...p), success: true, meta: { changes: 0 } };
  const r = st.run(...p);
  return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
}
http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    try {
      const body = JSON.parse(b);
      const list = Array.isArray(body) ? body : [body];
      const result = list.map((s) => run(s.sql, s.params));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ success: true, result }));
    } catch (e) {
      console.error(e.message);
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ success: false, errors: [{ code: 1, message: String(e.message) }] }));
    }
  });
}).listen(8788, () => console.log("d1 mock on 8788"));
