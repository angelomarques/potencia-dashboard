import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  splitSql,
  hasCompositePk,
  LEFTOVER_CLEANUP,
} from "../../../../scripts/d1-migrate-lib.mjs";

// node:sqlite (Node >= 22.5); typed locally because the installed @types/node predates it.
type Stmt = { run: (...a: unknown[]) => unknown; get: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown[] };
type DatabaseSync = { exec: (sql: string) => void; prepare: (sql: string) => Stmt };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

const root = path.resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

/** Apply statements as ONE transaction with FKs ON, mirroring a D1 batch. */
function applyBatch(db: DatabaseSync, stmts: string[]) {
  db.exec("BEGIN");
  try {
    for (const s of stmts) db.prepare(s + ";").run();
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
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
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='daisy_sketches'")
    .get() as { sql: string } | undefined;
  if (hasCompositePk(row?.sql)) return "skipped";
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
