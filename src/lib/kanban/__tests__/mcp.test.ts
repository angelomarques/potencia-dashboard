import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { splitSql } from "../../../../scripts/d1-migrate-lib.mjs";
import type { DashboardProject } from "@/lib/projects/registry";
import type { KanbanBoardData, KanbanCardData, KanbanColumnData } from "@/types/kanban";
import {
  authenticateKanbanMcpRequest,
  createUserMcpToken,
  hashMcpToken,
  listUserMcpTokens,
  revokeUserMcpToken,
  type KanbanTokenDeps,
} from "../mcp/tokens";
import { createKanbanMcpServer } from "../mcp/server";
import {
  defaultKanbanDbDeps,
  deleteTask,
  type KanbanDbDeps,
} from "../service";

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
    ...readMigration("migrations/0005_kanban_mcp_tokens.sql"),
  ];
  for (const stmt of migrations) {
    db.exec(stmt);
  }

  db.prepare(
    `INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at)
     VALUES (?, ?, ?, 1, NULL, ?, ?)`,
  ).run("user_alice", "Alice", "alice@potencia.test", 1000, 1000);

  db.prepare(
    `INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at)
     VALUES (?, ?, ?, 1, NULL, ?, ?)`,
  ).run("user_bob", "Bob", "bob@potencia.test", 1000, 1000);

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

describe("Kanban MCP per-user D1 tokens", () => {
  let testDb: ReturnType<typeof createSqliteTestDb>;
  let clock = 10_000;
  let seq = 0;
  let tokenDeps: Partial<KanbanTokenDeps>;

  beforeEach(() => {
    testDb = createSqliteTestDb();
    clock = 10_000;
    seq = 0;
    tokenDeps = {
      query: testDb.query,
      now: () => ++clock,
      newId: () => `id_${++seq}`,
    };
  });

  afterEach(() => {
    testDb.db.close();
  });

  it("creates, hashes, authenticates, lists, and revokes tokens per user", async () => {
    const aliceCreated = await createUserMcpToken(
      "user_alice",
      "Antigravity",
      tokenDeps,
    );
    expect(aliceCreated.token.startsWith("kbn_")).toBe(true);
    expect(aliceCreated.record.userId).toBe("user_alice");
    expect(aliceCreated.record.name).toBe("Antigravity");
    expect(aliceCreated.record.tokenPrefix).toBe(
      aliceCreated.token.slice(0, 12),
    );

    // Raw token is never stored in D1; only SHA-256 hash is stored
    const storedRow = testDb.db
      .prepare("SELECT token_hash FROM kanban_mcp_tokens WHERE id = ?")
      .get(aliceCreated.record.id) as { token_hash: string };
    expect(storedRow.token_hash).toBe(hashMcpToken(aliceCreated.token));
    expect(storedRow.token_hash).not.toBe(aliceCreated.token);

    // Authenticates Alice and updates last_used_at
    const authRes = await authenticateKanbanMcpRequest(
      `Bearer ${aliceCreated.token}`,
      tokenDeps,
    );
    expect(authRes).toEqual({
      ok: true,
      actor: {
        userId: "user_alice",
        userName: "Alice",
        userEmail: "alice@potencia.test",
        tokenId: aliceCreated.record.id,
        tokenName: "Antigravity",
      },
    });

    const aliceTokens = await listUserMcpTokens("user_alice", tokenDeps);
    expect(aliceTokens).toHaveLength(1);
    expect(aliceTokens[0]?.lastUsedAt).toBeGreaterThan(0);

    // Bob cannot see or revoke Alice's token
    expect(await listUserMcpTokens("user_bob", tokenDeps)).toHaveLength(0);
    expect(
      await revokeUserMcpToken("user_bob", aliceCreated.record.id, tokenDeps),
    ).toBe(false);

    // Alice revokes her token; subsequent auth fails
    expect(
      await revokeUserMcpToken(
        "user_alice",
        aliceCreated.record.id,
        tokenDeps,
      ),
    ).toBe(true);
    expect(
      await authenticateKanbanMcpRequest(
        `Bearer ${aliceCreated.token}`,
        tokenDeps,
      ),
    ).toEqual({ ok: false, status: 401, code: "unauthorized" });
  });

  it("rejects missing, short, and unknown bearer headers", async () => {
    expect(await authenticateKanbanMcpRequest(null, tokenDeps)).toEqual({
      ok: false,
      status: 401,
      code: "missing_authorization",
    });
    expect(
      await authenticateKanbanMcpRequest("Bearer too_short", tokenDeps),
    ).toEqual({
      ok: false,
      status: 401,
      code: "unauthorized",
    });
    expect(
      await authenticateKanbanMcpRequest(
        `Bearer kbn_${"z".repeat(40)}`,
        tokenDeps,
      ),
    ).toEqual({
      ok: false,
      status: 401,
      code: "unauthorized",
    });
  });
});

describe("Kanban MCP server (in-memory transport + real SQLite migrations)", () => {
  let testDb: ReturnType<typeof createSqliteTestDb>;
  let client: Client;
  let clock = 50_000;
  let seq = 0;
  let dbDeps: Partial<KanbanDbDeps>;

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const content = "content" in res && Array.isArray(res.content) ? res.content : [];
    const first = content[0] as { type?: string; text?: string } | undefined;
    const textContent = typeof first?.text === "string" ? first.text : "";
    const isError = "isError" in res ? Boolean(res.isError) : false;
    return {
      isError,
      text: textContent,
      json: isError || !textContent ? null : JSON.parse(textContent),
    };
  };

  beforeEach(async () => {
    testDb = createSqliteTestDb();
    clock = 50_000;
    seq = 0;

    dbDeps = {
      ...defaultKanbanDbDeps,
      query: testDb.query,
      batch: testDb.batch,
      now: () => ++clock,
      newId: () => `test_${++seq}`,
      loadBoardForProject: async (project: DashboardProject) => {
        const [b, c, k] = await Promise.all([
          testDb.query<KanbanBoardData>(
            "SELECT * FROM boards WHERE id = ? LIMIT 1",
            [project.boardId],
          ),
          testDb.query<KanbanColumnData>(
            "SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC",
            [project.boardId],
          ),
          testDb.query<KanbanCardData>(
            "SELECT * FROM cards WHERE board_id = ? ORDER BY position ASC, created_at ASC",
            [project.boardId],
          ),
        ]);
        return {
          board: b.results[0],
          columns: c.results,
          cards: k.results,
        };
      },
    };

    const server = createKanbanMcpServer(
      {
        userId: "user_alice",
        userName: "Alice",
        userEmail: "alice@potencia.test",
        tokenId: "kmcp_1",
        tokenName: "Antigravity",
      },
      dbDeps,
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-agent", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    testDb.db.close();
  });

  it("lists expected kanban tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "change_task_status",
      "create_task",
      "get_task",
      "list_projects",
      "list_tasks",
      "update_task",
    ]);
  });

  it("list_projects returns lawa with its 5 columns", async () => {
    const res = await call("list_projects");
    expect(res.isError).toBeFalsy();
    expect(res.json.projects).toHaveLength(1);
    expect(res.json.projects[0].slug).toBe("lawa");
    expect(res.json.projects[0].columns.map((c: { name: string }) => c.name)).toEqual([
      "Backlog",
      "To do",
      "In Progress",
      "Review",
      "Done",
    ]);
  });

  it("retrieves seeded tasks and filters by status, priority, and search", async () => {
    const all = await call("list_tasks", { projectSlug: "lawa" });
    expect(all.isError).toBeFalsy();
    expect(all.json.totalMatched).toBe(2);

    const backlog = await call("list_tasks", { status: "Backlog" });
    expect(backlog.json.tasks).toHaveLength(1);
    expect(backlog.json.tasks[0].id).toBe("card_welcome");
    expect(backlog.json.tasks[0].status).toBe("Backlog");

    const searched = await call("list_tasks", { search: "turnstile" });
    expect(searched.json.tasks).toHaveLength(1);
    expect(searched.json.tasks[0].id).toBe("card_auth");

    const single = await call("get_task", { cardId: "card_welcome" });
    expect(single.json.task.title).toBe("Welcome to Potencia Dashboard");
  });

  it("creates a task attributed to the token owner and changes its status atomically", async () => {
    const created1 = await call("create_task", {
      title: "Implement webhook retries",
      description: "Retry 3 times with backoff",
      priority: "high",
    });
    expect(created1.isError).toBeFalsy();
    expect(created1.json.task.status).toBe("To do");
    expect(created1.json.task.columnId).toBe("col_lawa_todo");
    expect(created1.json.task.createdBy).toBe("user_alice");
    expect(created1.json.task.position).toBe(0);

    const created2 = await call("create_task", {
      title: "Urgent hotfix",
      status: "todo",
      priority: "urgent",
      position: "top",
    });
    expect(created2.isError).toBeFalsy();
    expect(created2.json.task.position).toBe(0);

    // First task should now be shifted to position 1 in To do
    const todoList = await call("list_tasks", { status: "To do" });
    expect(todoList.json.tasks.map((t: { id: string; position: number }) => [t.id, t.position])).toEqual([
      [created2.json.task.id, 0],
      [created1.json.task.id, 1],
    ]);

    // Move urgent hotfix to In Progress
    const moved = await call("change_task_status", {
      cardId: created2.json.task.id,
      status: "in_progress",
    });
    expect(moved.isError).toBeFalsy();
    expect(moved.json.task.columnId).toBe("col_lawa_progress");
    expect(moved.json.task.status).toBe("In Progress");
    expect(moved.json.task.position).toBe(0);

    // Remaining task in To do should be recompacted back to position 0
    const todoAfter = await call("list_tasks", { status: "To do" });
    expect(todoAfter.json.tasks.map((t: { id: string; position: number }) => [t.id, t.position])).toEqual([
      [created1.json.task.id, 0],
    ]);
  });

  it("update_task updates metadata without losing position, and moves when status changes", async () => {
    const t1 = await call("create_task", { title: "Task 1", status: "To do" });
    const t2 = await call("create_task", { title: "Task 2", status: "To do" });

    // Metadata-only update keeps Task 1 at position 0
    const updatedMeta = await call("update_task", {
      cardId: t1.json.task.id,
      title: "Task 1 updated",
      priority: "urgent",
      status: "To do",
    });
    expect(updatedMeta.isError).toBeFalsy();
    expect(updatedMeta.json.task.title).toBe("Task 1 updated");
    expect(updatedMeta.json.task.position).toBe(0);

    // Status change moves Task 1 to Done and recompacts Task 2 to position 0
    const movedViaUpdate = await call("update_task", {
      cardId: t1.json.task.id,
      status: "Done",
    });
    expect(movedViaUpdate.json.task.status).toBe("Done");
    expect(movedViaUpdate.json.task.position).toBe(1); // card_auth is at 0 in Done

    const t2After = await call("get_task", { cardId: t2.json.task.id });
    expect(t2After.json.task.position).toBe(0);

    // Also verify deleteTask helper compacts remaining cards cleanly
    await deleteTask("card_auth", dbDeps);
    const t1AfterDelete = await call("get_task", { cardId: t1.json.task.id });
    expect(t1AfterDelete.json.task.position).toBe(0);
  });

  it("returns clear errors for unknown project, status, or cardId", async () => {
    const badProj = await call("list_tasks", { projectSlug: "nope" });
    expect(badProj.isError).toBe(true);
    expect(badProj.text).toContain("not found");

    const badStatus = await call("change_task_status", {
      cardId: "card_welcome",
      status: "Shipped",
    });
    expect(badStatus.isError).toBe(true);
    expect(badStatus.text).toContain("Valid statuses");

    const badCard = await call("get_task", { cardId: "card_missing" });
    expect(badCard.isError).toBe(true);
  });
});
