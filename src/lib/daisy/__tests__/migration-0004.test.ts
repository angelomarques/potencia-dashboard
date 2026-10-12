import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  splitSql,
  hasCompositePk,
  LEFTOVER_CLEANUP,
  toQueryBody,
  assertD1Ok,
} from "../../../../scripts/d1-migrate-lib.mjs";
import { handleD1Query } from "../../../../scripts/d1-mock-server.mjs";

// node:sqlite (Node >= 22.5); typed locally because the installed @types/node predates it.
type Stmt = { run: (...a: unknown[]) => unknown; get: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown[] };
type DatabaseSync = { exec: (sql: string) => void; prepare: (sql: string) => Stmt };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

const root = path.resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

/** Send statements through the strict D1 /query mock as ONE object body. */
function applyBatch(db: DatabaseSync, stmts: string[]) {
  const { status, body } = handleD1Query(db, toQueryBody(stmts));
  const result = assertD1Ok({ ok: status === 200, status }, body, stmts.length);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  return result as { results: Record<string, unknown>[] }[];
}

function seedPre0004(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  applyBatch(db, splitSql(read("migrations/0003_daisy.sql")));
  const now = Date.now();
  db.prepare(
    "INSERT INTO daisy_projects (id, name, created_at, updated_at, last_activity_at) VALUES ('p1','P1',?,?,?)",
  ).run(now, now, now);
  db.prepare(
    "INSERT INTO daisy_sketches (id, project_id, label, created_at) VALUES ('s1','p1','S1',?)",
  ).run(now);
  db.prepare(
    "INSERT INTO daisy_comments (id, project_id, sketch_id, body, created_at) VALUES ('c1','p1','s1','hi',?)",
  ).run(now);
  return db;
}

function migrate(db: DatabaseSync) {
  applyBatch(db, LEFTOVER_CLEANUP);
  const [check] = applyBatch(db, [
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='daisy_sketches' LIMIT 1",
  ]);
  if (hasCompositePk(check.results[0]?.sql)) return "skipped";
  applyBatch(db, splitSql(read("migrations/0004_daisy_sketch_scope.sql")));
  return "applied";
}

function assertMigrated(db: DatabaseSync) {
  const fks = db.prepare("PRAGMA foreign_key_list(daisy_comments)").all() as {
    table: string;
    from: string;
    to: string;
  }[];
  const sk = fks.filter((f) => f.table === "daisy_sketches").map((f) => [f.from, f.to]);
  expect(sk).toEqual([
    ["project_id", "project_id"],
    ["sketch_id", "id"],
  ]);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check).toBe("ok");
  expect(db.prepare("SELECT author FROM daisy_comments WHERE id='c1'").get()).toEqual({ author: "owner" });
  expect(
    db.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE '%\\_new' ESCAPE '\\'").get(),
  ).toEqual({ n: 0 });
  // Same sketch id in another project is now allowed.
  const now = Date.now();
  db.prepare("INSERT INTO daisy_projects (id, name, created_at, updated_at, last_activity_at) VALUES ('p2','P2',?,?,?)").run(now, now, now);
  db.prepare("INSERT INTO daisy_sketches (id, project_id, label, created_at) VALUES ('s1','p2','S1',?)").run(now);
}

describe("migration 0004 (FKs ON, single batch)", () => {
  it("migrates, preserves rows, and points the comment FK at daisy_sketches(project_id, id)", () => {
    const db = seedPre0004();
    expect(migrate(db)).toBe("applied");
    assertMigrated(db);
    expect(migrate(db)).toBe("skipped");
  });

  it("recovers from leftover *_new tables of a partial run", () => {
    const db = seedPre0004();
    db.exec(`CREATE TABLE daisy_sketches_new (id TEXT NOT NULL, project_id TEXT NOT NULL, PRIMARY KEY (project_id, id));
      CREATE TABLE daisy_comments_new (id TEXT PRIMARY KEY, project_id TEXT, sketch_id TEXT,
        FOREIGN KEY (project_id, sketch_id) REFERENCES daisy_sketches(project_id, id));`);
    expect(migrate(db)).toBe("applied");
    assertMigrated(db);
  });
});

describe("strict D1 /query mock", () => {
  it("rejects array bodies like D1 does", () => {
    const db = seedPre0004();
    const r = handleD1Query(db, [{ sql: "SELECT 1;", params: [] }]);
    expect(r.status).toBe(400);
    expect(r.body.errors[0].message).toBe("Invalid input: Expected object, received array");
  });

  it("returns one result per statement for a multi-statement sql string", () => {
    const db = seedPre0004();
    const r = handleD1Query(db, toQueryBody(["SELECT 1 AS a", "SELECT 2 AS b"]));
    expect(r.status).toBe(200);
    expect(r.body.result.map((x: { results: unknown[] }) => x.results)).toEqual([[{ a: 1 }], [{ b: 2 }]]);
  });

  it("rolls back the whole multi-statement request on failure", () => {
    const db = seedPre0004();
    const r = handleD1Query(db, toQueryBody(["CREATE TABLE t_tmp (x)", "SELECT * FROM nope"]));
    expect(r.status).toBe(400);
    expect(() => assertD1Ok({ ok: false, status: 400 }, r.body, 2)).toThrow(/no such table/);
    expect(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='t_tmp'").get()).toEqual({ n: 0 });
  });

  it("accepts the { batch } object form with params", () => {
    const db = seedPre0004();
    const r = handleD1Query(db, { batch: [{ sql: "SELECT ? AS v", params: ["x"] }] });
    expect(r.body.result[0].results).toEqual([{ v: "x" }]);
  });
});
