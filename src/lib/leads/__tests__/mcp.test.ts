import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { splitSql } from "../../../../scripts/d1-migrate-lib.mjs";
import {
  authenticateKanbanMcpRequest,
  createUserMcpToken,
  revokeUserMcpToken,
} from "@/lib/kanban/mcp/tokens";
import { createLeadsMcpServer } from "../mcp/server";
import { POST, GET, DELETE } from "@/app/api/leads/mcp/route";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

type SqliteDbInstance = {
  db: InstanceType<typeof DatabaseSync>;
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ results: T[]; meta?: Record<string, unknown> }>;
  batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>;
};

const { getTestDb, setTestDb } = vi.hoisted(() => {
  let dbInstance: SqliteDbInstance | null = null;
  return {
    getTestDb: () => dbInstance,
    setTestDb: (inst: SqliteDbInstance | null) => {
      dbInstance = inst;
    },
  };
});

vi.mock("@/lib/db/d1-http", () => ({
  d1Query: async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ) => {
    const inst = getTestDb();
    if (!inst) throw new Error("Test DB not initialized");
    return inst.query<T>(sql, params);
  },
  d1Batch: async (statements: { sql: string; params?: unknown[] }[]) => {
    const inst = getTestDb();
    if (!inst) throw new Error("Test DB not initialized");
    return inst.batch(statements);
  },
}));

function readMigration(rel: string): string[] {
  const full = path.resolve(process.cwd(), rel);
  return splitSql(readFileSync(full, "utf8"));
}

function createSqliteTestDb(): SqliteDbInstance {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  const migrations = [
    ...readMigration("migrations/0001_init.sql"),
    ...readMigration("migrations/0002_add_todo_column.sql"),
    ...readMigration("migrations/0005_kanban_mcp_tokens.sql"),
    ...readMigration("migrations/0006_leads_outbound.sql"),
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

describe("Leads MCP server (in-memory node:sqlite + InMemoryTransport)", () => {
  let testDb: SqliteDbInstance;
  let client: Client;

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const content =
      "content" in res && Array.isArray(res.content) ? res.content : [];
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
    process.env.CLOUDFLARE_ACCOUNT_ID = "dummy-account-id";
    process.env.D1_DATABASE_ID = "dummy-database-id";
    process.env.CLOUDFLARE_API_TOKEN = "dummy-api-token";

    testDb = createSqliteTestDb();
    setTestDb(testDb);

    const server = createLeadsMcpServer({
      userId: "user_alice",
      userName: "Alice",
      userEmail: "alice@potencia.test",
      tokenId: "kmcp_alice",
      tokenName: "Antigravity",
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-leads-agent", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    setTestDb(null);
    testDb.db.close();
  });

  it("tools/list contains all expected leads tools", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual([
      "create_lead",
      "create_project",
      "delete_lead",
      "delete_lead_log",
      "find_lead_by_email",
      "get_lead",
      "leads_report",
      "list_lead_logs",
      "list_leads",
      "list_projects",
      "log_approach",
      "update_lead",
    ]);
  });

  it("list_projects returns existing projects from registry", async () => {
    const res = await call("list_projects");
    expect(res.isError).toBe(false);
    expect(res.json.projects).toBeDefined();
    expect(res.json.projects.length).toBeGreaterThanOrEqual(1);

    const lawa = res.json.projects.find((p: { slug: string }) => p.slug === "lawa");
    expect(lawa).toBeDefined();
    expect(lawa.name).toBe("Lawa");
    expect(lawa.boardId).toBe("board_lawa");
  });

  it("create_project success, duplicate (409), and bad slug (400)", async () => {
    // 1. Success
    const success = await call("create_project", {
      name: "Outreach Ops",
      slug: "outreach-ops",
      tagline: "Outbound sales workspace",
    });
    expect(success.isError).toBe(false);
    expect(success.json.project.slug).toBe("outreach-ops");
    expect(success.json.project.name).toBe("Outreach Ops");
    expect(success.json.project.tagline).toBe("Outbound sales workspace");
    expect(success.json.project.boardId).toBe("board_outreach-ops");
    expect(success.json.project.appId).toBe("app_outreach-ops");

    // Board columns should be verified in SQLite
    const appRow = testDb.db
      .prepare("SELECT * FROM apps WHERE slug = ?")
      .get("outreach-ops");
    expect(appRow).toBeDefined();

    // 2. Duplicate (409)
    const duplicate = await call("create_project", {
      name: "Outreach Ops",
      slug: "outreach-ops",
    });
    expect(duplicate.isError).toBe(true);
    expect(duplicate.text).toContain("409");
    expect(duplicate.text).toContain("already exists");

    // 3. Bad slug (400)
    const badSlug = await call("create_project", {
      name: "Bad Slug Project",
      slug: "-bad_slug-",
    });
    expect(badSlug.isError).toBe(true);
    expect(badSlug.text).toContain("400");
  });

  it("create_lead succeeds, attributes to token owner, and handles unknown project", async () => {
    // Unknown project error
    const unknownProj = await call("create_lead", {
      projectSlug: "non-existent-proj",
      name: "John Doe",
    });
    expect(unknownProj.isError).toBe(true);
    expect(unknownProj.text).toContain("Project 'non-existent-proj' not found");

    // Success creation with ISO timestamp
    const nowIso = "2026-11-20T14:30:00.000Z";
    const res = await call("create_lead", {
      projectSlug: "lawa",
      name: "Dr. Carlos Mendes",
      role: "Partner",
      email: "carlos@mendes.test",
      phone: "+55 11 98888-0000",
      company: "Mendes Law",
      website: "mendeslaw.com.br",
      linkedinUrl: "linkedin.com/in/carlosmendes",
      source: "LinkedIn Outbound",
      notes: "Corporate litigation expert",
      nextFollowUpAt: nowIso,
      initialApproach: {
        channel: "email",
        direction: "outbound",
        outcome: "sent",
        subject: "Introductory Note",
        message: "Cold email sent via Lemlist",
      },
    });

    expect(res.isError).toBe(false);
    expect(res.json.created).toBe(true);
    expect(res.json.duplicate).toBe(false);

    const lead = res.json.lead;
    expect(lead.id).toMatch(/^lead_/);
    expect(lead.projectSlug).toBe("lawa");
    expect(lead.name).toBe("Dr. Carlos Mendes");
    expect(lead.createdBy).toBe("user_alice"); // Attributed to token owner!
    expect(lead.status).toBe("contacted"); // Derived from sent outcome
    expect(lead.website).toBe("https://mendeslaw.com.br");

    // Check dual timestamp outputs (ISO + ms)
    expect(lead.createdAt).toBeDefined();
    expect(typeof lead.createdAt).toBe("string");
    expect(typeof lead.createdAtMs).toBe("number");
    expect(lead.updatedAt).toBeDefined();
    expect(typeof lead.updatedAt).toBe("string");
    expect(typeof lead.updatedAtMs).toBe("number");
    expect(lead.nextFollowUpAt).toBe(nowIso);
    expect(lead.nextFollowUpAtMs).toBe(new Date(nowIso).getTime());
    expect(lead.lastContactedAt).toBeDefined();
    expect(typeof lead.lastContactedAt).toBe("string");
    expect(typeof lead.lastContactedAtMs).toBe("number");

    // Initial log created
    expect(res.json.initialLog).toBeDefined();
    expect(res.json.initialLog.channel).toBe("email");
    expect(res.json.initialLog.createdBy).toBe("user_alice");
    expect(typeof res.json.initialLog.approachedAt).toBe("string");
    expect(typeof res.json.initialLog.approachedAtMs).toBe("number");
  });

  it("handles duplicate email (case-insensitive) returning existing and error mode", async () => {
    // Seed initial lead
    const first = await call("create_lead", {
      projectSlug: "lawa",
      name: "Beatriz Ramos",
      email: "beatriz@ramos.test",
    });
    expect(first.isError).toBe(false);
    const existingId = first.json.lead.id;

    // Duplicate in return_existing mode (default)
    const dupReturn = await call("create_lead", {
      projectSlug: "lawa",
      name: "Beatriz Duplicate",
      email: "  BEATRIZ@RAMOS.TEST  ",
      onDuplicate: "return_existing",
    });
    expect(dupReturn.isError).toBe(false);
    expect(dupReturn.json.created).toBe(false);
    expect(dupReturn.json.duplicate).toBe(true);
    expect(dupReturn.json.lead.id).toBe(existingId);
    expect(dupReturn.json.lead.name).toBe("Beatriz Ramos");

    // Duplicate in error mode
    const dupError = await call("create_lead", {
      projectSlug: "lawa",
      name: "Beatriz Duplicate Error",
      email: "beatriz@ramos.test",
      onDuplicate: "error",
    });
    expect(dupError.isError).toBe(true);
    expect(dupError.text).toContain("already exists");
    expect(dupError.text).toContain(existingId);
  });

  it("find_lead_by_email matches by project and across all projects", async () => {
    await call("create_lead", {
      projectSlug: "lawa",
      name: "Eduardo Lima",
      email: "eduardo@lima.test",
    });

    // 1. With projectSlug
    const foundProj = await call("find_lead_by_email", {
      email: "  EDUARDO@LIMA.TEST ",
      projectSlug: "lawa",
    });
    expect(foundProj.isError).toBe(false);
    expect(foundProj.json.found).toBe(true);
    expect(foundProj.json.leads).toHaveLength(1);
    expect(foundProj.json.leads[0].name).toBe("Eduardo Lima");

    // 2. Without projectSlug (across all projects)
    const foundAll = await call("find_lead_by_email", {
      email: "eduardo@lima.test",
    });
    expect(foundAll.isError).toBe(false);
    expect(foundAll.json.found).toBe(true);
    expect(foundAll.json.leads).toHaveLength(1);

    // 3. Not found
    const notFound = await call("find_lead_by_email", {
      email: "nobody@example.com",
    });
    expect(notFound.isError).toBe(false);
    expect(notFound.json.found).toBe(false);
    expect(notFound.json.leads).toEqual([]);
  });

  it("list_leads filters by status, search, and applies limit", async () => {
    await call("create_lead", {
      projectSlug: "lawa",
      name: "Alpha Lead",
      company: "Acme Legal",
      status: "new",
    });
    await call("create_lead", {
      projectSlug: "lawa",
      name: "Beta Lead",
      company: "Beta Tech",
      status: "new",
    });
    await call("create_lead", {
      projectSlug: "lawa",
      name: "Gamma Lead",
      company: "Gamma Corp",
      status: "won",
    });

    // Filter status = new
    const newOnly = await call("list_leads", { status: "new" });
    expect(newOnly.isError).toBe(false);
    expect(newOnly.json.totalMatched).toBe(2);

    // Search query
    const searched = await call("list_leads", { search: "acme" });
    expect(searched.isError).toBe(false);
    expect(searched.json.totalMatched).toBe(1);
    expect(searched.json.leads[0].name).toBe("Alpha Lead");

    // Limit applied
    const limited = await call("list_leads", { status: "new", limit: 1 });
    expect(limited.isError).toBe(false);
    expect(limited.json.leads).toHaveLength(1);
  });

  it("get_lead retrieves lead with outreach logs or returns error", async () => {
    const created = await call("create_lead", {
      projectSlug: "lawa",
      name: "Sofia Ferreira",
    });
    const leadId = created.json.lead.id;

    await call("log_approach", {
      leadId,
      channel: "email",
      subject: "First Touch",
      outcome: "sent",
    });

    const res = await call("get_lead", { leadId });
    expect(res.isError).toBe(false);
    expect(res.json.lead.id).toBe(leadId);
    expect(res.json.lead.name).toBe("Sofia Ferreira");
    expect(res.json.logs).toHaveLength(1);
    expect(res.json.logs[0].subject).toBe("First Touch");
    expect(typeof res.json.logs[0].approachedAt).toBe("string");
    expect(typeof res.json.logs[0].approachedAtMs).toBe("number");

    // Not found
    const missing = await call("get_lead", { leadId: "lead_missing_404" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("not found");
  });

  it("update_lead updates status and nextFollowUpAt (ISO string -> ISO+ms outputs)", async () => {
    const created = await call("create_lead", {
      projectSlug: "lawa",
      name: "Initial Name",
      status: "new",
    });
    const leadId = created.json.lead.id;

    const followUpIso = "2026-12-01T15:00:00.000Z";
    const updateRes = await call("update_lead", {
      leadId,
      name: "Updated Name",
      status: "contacted",
      nextFollowUpAt: followUpIso,
    });

    expect(updateRes.isError).toBe(false);
    expect(updateRes.json.lead.name).toBe("Updated Name");
    expect(updateRes.json.lead.status).toBe("contacted");
    expect(updateRes.json.lead.nextFollowUpAt).toBe(followUpIso);
    expect(updateRes.json.lead.nextFollowUpAtMs).toBe(
      new Date(followUpIso).getTime(),
    );

    // Invalid timestamp format returns clear error
    const badTs = await call("update_lead", {
      leadId,
      nextFollowUpAt: "not-a-valid-date-string",
    });
    expect(badTs.isError).toBe(true);
    expect(badTs.text).toContain("Invalid ISO 8601 timestamp");

    // Not found returns clear error
    const notFound = await call("update_lead", { leadId: "lead_does_not_exist" });
    expect(notFound.isError).toBe(true);
  });

  it("log_approach derives status correctly, updates last_contacted_at, and defaults approachedAt to now", async () => {
    const created = await call("create_lead", {
      projectSlug: "lawa",
      name: "Pipeline Lead",
      status: "new",
    });
    const leadId = created.json.lead.id;

    // 1. new + sent -> contacted
    const beforeContact = Date.now();
    const touch1 = await call("log_approach", {
      leadId,
      channel: "email",
      direction: "outbound",
      outcome: "sent",
      subject: "Outbound Pitch",
    });
    expect(touch1.isError).toBe(false);
    expect(touch1.json.previousStatus).toBe("new");
    expect(touch1.json.lead.status).toBe("contacted");
    expect(touch1.json.log.channel).toBe("email");
    expect(touch1.json.log.createdBy).toBe("user_alice");
    expect(touch1.json.log.approachedAtMs).toBeGreaterThanOrEqual(beforeContact - 1000);
    expect(touch1.json.lead.lastContactedAtMs).toBe(touch1.json.log.approachedAtMs);

    // 2. contacted + replied -> replied
    const touch2 = await call("log_approach", {
      leadId,
      channel: "email",
      direction: "inbound",
      outcome: "replied",
      message: "I am interested, send pricing",
    });
    expect(touch2.isError).toBe(false);
    expect(touch2.json.previousStatus).toBe("contacted");
    expect(touch2.json.lead.status).toBe("replied");

    // 3. replied + meeting_booked -> meeting_booked
    const touch3 = await call("log_approach", {
      leadId,
      channel: "cold_call",
      outcome: "meeting_booked",
      subject: "Demo scheduled",
    });
    expect(touch3.isError).toBe(false);
    expect(touch3.json.previousStatus).toBe("replied");
    expect(touch3.json.lead.status).toBe("meeting_booked");

    // 4. Lost status test: set status to lost, then sent outcome keeps it lost
    await call("update_lead", { leadId, status: "lost" });
    const touch4 = await call("log_approach", {
      leadId,
      channel: "email",
      outcome: "sent",
      message: "Follow-up ping",
    });
    expect(touch4.isError).toBe(false);
    expect(touch4.json.previousStatus).toBe("lost");
    expect(touch4.json.lead.status).toBe("lost"); // Lost stays lost on sent!
  });

  it("list_lead_logs and delete_lead_log", async () => {
    const created = await call("create_lead", {
      projectSlug: "lawa",
      name: "Log Test Lead",
    });
    const leadId = created.json.lead.id;

    const t1 = await call("log_approach", {
      leadId,
      channel: "email",
      subject: "Touch 1",
      approachedAt: 1700001000000,
    });
    const t2 = await call("log_approach", {
      leadId,
      channel: "linkedin",
      subject: "Touch 2",
      approachedAt: 1700002000000,
    });

    const logsRes = await call("list_lead_logs", { leadId });
    expect(logsRes.isError).toBe(false);
    expect(logsRes.json.total).toBe(2);
    expect(logsRes.json.logs[0].id).toBe(t2.json.log.id); // Reverse chronological

    // Delete Touch 2; lead's last_contacted_at should recalculate to Touch 1
    const delRes = await call("delete_lead_log", {
      leadId,
      logId: t2.json.log.id,
    });
    expect(delRes.isError).toBe(false);
    expect(delRes.json.success).toBe(true);
    expect(delRes.json.lead.lastContactedAtMs).toBe(1700001000000);

    const logsAfter = await call("list_lead_logs", { leadId });
    expect(logsAfter.json.total).toBe(1);
    expect(logsAfter.json.logs[0].id).toBe(t1.json.log.id);
  });

  it("delete_lead deletes lead and cascades to logs", async () => {
    const created = await call("create_lead", {
      projectSlug: "lawa",
      name: "To Delete",
    });
    const leadId = created.json.lead.id;
    await call("log_approach", { leadId, subject: "Hello" });

    const del = await call("delete_lead", { leadId });
    expect(del.isError).toBe(false);
    expect(del.json.success).toBe(true);

    const checkLead = await call("get_lead", { leadId });
    expect(checkLead.isError).toBe(true);

    // Delete non-existent lead
    const delMissing = await call("delete_lead", { leadId: "lead_gone" });
    expect(delMissing.isError).toBe(true);
  });

  it("leads_report computes accurate conversion counts and breakdowns", async () => {
    // Add 1 won lead and 1 new lead
    await call("create_lead", {
      projectSlug: "lawa",
      name: "Won Client",
      status: "won",
    });
    await call("create_lead", {
      projectSlug: "lawa",
      name: "New Prospect",
      status: "new",
    });

    const reportRes = await call("leads_report", { projectSlug: "lawa" });
    expect(reportRes.isError).toBe(false);
    const rep = reportRes.json.report;
    expect(rep.totalLeads).toBe(2);
    expect(rep.wonLeads).toBe(1);
    expect(rep.byStatus.won).toBe(1);
    expect(rep.byStatus.new).toBe(1);
    expect(rep.byProject).toHaveLength(1);
    expect(rep.byProject[0].projectSlug).toBe("lawa");
  });

  it("handles unconfigured leads database storage cleanly", async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    const res = await call("list_leads");
    expect(res.isError).toBe(true);
    expect(res.text).toBe("Database storage is not configured");
  });
});

describe("Leads MCP authentication & HTTP Route handling", () => {
  let testDb: SqliteDbInstance;

  beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "dummy-account-id";
    process.env.D1_DATABASE_ID = "dummy-database-id";
    process.env.CLOUDFLARE_API_TOKEN = "dummy-api-token";

    testDb = createSqliteTestDb();
    setTestDb(testDb);
  });

  afterEach(() => {
    setTestDb(null);
    testDb.db.close();
  });

  it("authenticates valid bearer token and rejects missing, invalid, or revoked tokens", async () => {
    // Create token for Alice
    const created = await createUserMcpToken("user_alice", "Antigravity Agent");
    expect(created.token).toMatch(/^kbn_/);

    // Missing header
    const missing = await authenticateKanbanMcpRequest(null);
    expect(missing).toEqual({
      ok: false,
      status: 401,
      code: "missing_authorization",
    });

    // Invalid token
    const invalid = await authenticateKanbanMcpRequest("Bearer kbn_invalid_unknown_token_12345");
    expect(invalid).toEqual({
      ok: false,
      status: 401,
      code: "unauthorized",
    });

    // Valid token
    const valid = await authenticateKanbanMcpRequest(`Bearer ${created.token}`);
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.actor.userId).toBe("user_alice");
      expect(valid.actor.userName).toBe("Alice");
      expect(valid.actor.tokenName).toBe("Antigravity Agent");
    }

    // Revoke token
    const revoked = await revokeUserMcpToken("user_alice", created.record.id);
    expect(revoked).toBe(true);

    // Auth after revoke fails
    const afterRevoke = await authenticateKanbanMcpRequest(`Bearer ${created.token}`);
    expect(afterRevoke).toEqual({
      ok: false,
      status: 401,
      code: "unauthorized",
    });
  });

  it("route handler POST without auth returns 401 with realm leads-mcp", async () => {
    const req = new Request("http://localhost:3000/api/leads/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Bearer realm="leads-mcp"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const json = await res.json();
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toBe("missing_authorization");
  });

  it("route handler rejects GET and DELETE with 405 Method Not Allowed", async () => {
    const created = await createUserMcpToken("user_alice", "Route Test Token");

    const getReq = new Request("http://localhost:3000/api/leads/mcp", {
      method: "GET",
      headers: { Authorization: `Bearer ${created.token}` },
    });
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(405);
    expect(getRes.headers.get("Allow")).toBe("POST");

    const delReq = new Request("http://localhost:3000/api/leads/mcp", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${created.token}` },
    });
    const delRes = await DELETE(delReq);
    expect(delRes.status).toBe(405);
  });
});
