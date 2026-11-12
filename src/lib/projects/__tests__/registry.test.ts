import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { splitSql } from "../../../../scripts/d1-migrate-lib.mjs";
import {
  createDashboardProject,
  getDashboardProjectBySlug,
  isDashboardProjectSlug,
  listDashboardProjects,
  ProjectServiceError,
  slugifyProjectName,
  type ProjectDbDeps,
} from "@/lib/projects/registry";
import { createTask, listTasks } from "@/lib/kanban/service";
import type { KanbanBoardData, KanbanCardData, KanbanColumnData } from "@/types/kanban";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

function readMigration(rel: string): string[] {
  const full = path.resolve(process.cwd(), rel);
  return splitSql(readFileSync(full, "utf8"));
}

function createSqliteTestDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  const migrations = [
    ...readMigration("migrations/0001_init.sql"),
    ...readMigration("migrations/0002_add_todo_column.sql"),
  ];
  for (const stmt of migrations) {
    db.exec(stmt);
  }

  db.prepare(
    `INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at)
     VALUES (?, ?, ?, 1, NULL, ?, ?)`,
  ).run("user_alice", "Alice", "alice@potencia.test", 1000, 1000);

  const query = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ results: T[]; meta?: Record<string, unknown> }> => {
    const st = db.prepare(sql);
    if (st.columns().length > 0) {
      return { results: st.all(...params) as T[] };
    }
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes) } };
  };

  const batch = async (
    statements: { sql: string; params?: unknown[] }[],
  ): Promise<void> => {
    db.exec("BEGIN");
    try {
      for (const s of statements) {
        const st = db.prepare(s.sql);
        const params = s.params ?? [];
        if (st.columns().length > 0) {
          st.all(...params);
        } else {
          st.run(...params);
        }
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };

  return { db, query, batch };
}

describe("dashboard project registry", () => {
  let testDb: ReturnType<typeof createSqliteTestDb>;
  let clock = 9_000_000_000_000;
  let deps: Partial<ProjectDbDeps>;

  beforeEach(() => {
    testDb = createSqliteTestDb();
    clock = 9_000_000_000_000;
    deps = {
      query: testDb.query,
      batch: testDb.batch,
      now: () => ++clock,
    };
  });

  afterEach(() => {
    testDb.db.close();
  });

  it("lists Lawa as the initial seeded project", async () => {
    const projects = await listDashboardProjects(deps);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.slug).toBe("lawa");
    expect(projects[0]?.boardId).toBe("board_lawa");
    expect(projects[0]?.appId).toBe("app_lawa");
  });

  it("resolves project by slug", async () => {
    const lawa = await getDashboardProjectBySlug("lawa", deps);
    expect(lawa?.name).toBe("Lawa");
    expect(await isDashboardProjectSlug("lawa", deps)).toBe(true);
    expect(await getDashboardProjectBySlug("unknown", deps)).toBeUndefined();
    expect(await isDashboardProjectSlug("unknown", deps)).toBe(false);
  });

  it("slugifies project names cleanly", () => {
    expect(slugifyProjectName("Acme Studio")).toBe("acme-studio");
    expect(slugifyProjectName("  Café & Co. 2026! ")).toBe("cafe-co-2026");
    expect(slugifyProjectName("---Hello___World---")).toBe("hello-world");
  });

  it("creates a project with app, board, and 5 default columns", async () => {
    const created = await createDashboardProject(
      {
        name: "Potencia CRM",
        tagline: "Internal sales pipeline",
        createdBy: "user_alice",
      },
      deps,
    );

    expect(created).toEqual({
      slug: "potencia-crm",
      name: "Potencia CRM",
      tagline: "Internal sales pipeline",
      boardId: "board_potencia-crm",
      appId: "app_potencia-crm",
    });

    const projects = await listDashboardProjects(deps);
    expect(projects.map((p) => p.slug)).toEqual(["lawa", "potencia-crm"]);

    const fetched = await getDashboardProjectBySlug("potencia-crm", deps);
    expect(fetched).toEqual(created);

    const cols = testDb.db
      .prepare("SELECT name, position FROM columns WHERE board_id = ? ORDER BY position ASC")
      .all(created.boardId) as { name: string; position: number }[];
    expect(cols).toEqual([
      { name: "Backlog", position: 0 },
      { name: "To do", position: 1 },
      { name: "In Progress", position: 2 },
      { name: "Review", position: 3 },
      { name: "Done", position: 4 },
    ]);

    // Verify kanban service works seamlessly on the newly created project
    const task = await createTask(
      {
        projectSlug: created.slug,
        title: "First task",
        createdBy: "user_alice",
      },
      {
        query: testDb.query,
        batch: testDb.batch,
        now: () => ++clock,
        newId: () => "1",
        loadBoardForProject: async (project) => {
          const [b, c, k] = await Promise.all([
            testDb.query<KanbanBoardData>("SELECT * FROM boards WHERE id = ? LIMIT 1", [project.boardId]),
            testDb.query<KanbanColumnData>("SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC", [project.boardId]),
            testDb.query<KanbanCardData>("SELECT * FROM cards WHERE board_id = ? ORDER BY position ASC", [project.boardId]),
          ]);
          return { board: b.results[0], columns: c.results, cards: k.results };
        },
      },
    );
    expect(task.project_slug).toBe("potencia-crm");
    expect(task.status_name).toBe("To do");

    const listed = await listTasks(
      { projectSlug: "potencia-crm" },
      {
        query: testDb.query,
        batch: testDb.batch,
        loadBoardForProject: async (project) => {
          const [b, c, k] = await Promise.all([
            testDb.query<KanbanBoardData>("SELECT * FROM boards WHERE id = ? LIMIT 1", [project.boardId]),
            testDb.query<KanbanColumnData>("SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC", [project.boardId]),
            testDb.query<KanbanCardData>("SELECT * FROM cards WHERE board_id = ? ORDER BY position ASC", [project.boardId]),
          ]);
          return { board: b.results[0], columns: c.results, cards: k.results };
        },
      },
    );
    expect(listed.tasks).toHaveLength(1);
    expect(listed.tasks[0]?.title).toBe("First task");
  });

  it("rejects empty names, invalid/reserved slugs, and duplicate slugs", async () => {
    await expect(
      createDashboardProject({ name: "   " }, deps),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createDashboardProject({ name: "Test", slug: "Bad Slug!" }, deps),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createDashboardProject({ name: "New", slug: "new" }, deps),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createDashboardProject({ name: "Lawa Duplicate", slug: "lawa" }, deps),
    ).rejects.toBeInstanceOf(ProjectServiceError);

    await expect(
      createDashboardProject({ name: "Lawa Duplicate", slug: "lawa" }, deps),
    ).rejects.toMatchObject({ status: 409 });
  });
});
