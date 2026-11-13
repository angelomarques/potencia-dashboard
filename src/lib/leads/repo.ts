import "server-only";
import { d1Batch, d1Query } from "@/lib/db/d1-http";
import { listDashboardProjects } from "@/lib/projects/registry";
import {
  deriveLeadStatusFromOutcome,
  isValidLeadStatus,
  isValidOutreachChannel,
  isValidOutreachDirection,
  isValidOutreachOutcome,
  type CreateLeadInput,
  type CreateOutreachLogInput,
  type Lead,
  type LeadOutreachLog,
  type LeadStatus,
  type LeadWithStats,
  type OutreachChannel,
  type OutreachDirection,
  type OutreachOutcome,
  type UpdateLeadInput,
} from "./types";

type LeadDbRow = {
  id: string;
  project_slug: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  website: string | null;
  linkedin_url: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  last_contacted_at: number | null;
  next_follow_up_at: number | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  outreach_count?: number;
  last_channel?: string | null;
  last_outcome?: string | null;
  last_log_message?: string | null;
};

type LogDbRow = {
  id: string;
  lead_id: string;
  channel: string;
  direction: string;
  outcome: string;
  subject: string | null;
  message: string | null;
  approached_at: number;
  created_by: string | null;
  created_at: number;
};

export interface LeadProjectOption {
  slug: string;
  name: string;
  tagline?: string;
}

export function leadsStorageConfigured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
      process.env.D1_DATABASE_ID?.trim() &&
      process.env.CLOUDFLARE_API_TOKEN?.trim(),
  );
}

let schemaBootstrapped = false;

export async function ensureLeadsSchema(): Promise<void> {
  if (schemaBootstrapped || !leadsStorageConfigured()) return;

  await d1Batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY NOT NULL,
        project_slug TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT,
        email TEXT,
        phone TEXT,
        company TEXT,
        website TEXT,
        linkedin_url TEXT,
        source TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        notes TEXT,
        last_contacted_at INTEGER,
        next_follow_up_at INTEGER,
        created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS lead_outreach_logs (
        id TEXT PRIMARY KEY NOT NULL,
        lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        channel TEXT NOT NULL DEFAULT 'email',
        direction TEXT NOT NULL DEFAULT 'outbound',
        outcome TEXT NOT NULL DEFAULT 'sent',
        subject TEXT,
        message TEXT,
        approached_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_leads_project_slug ON leads(project_slug)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at DESC)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads(next_follow_up_at ASC)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_lead_logs_lead_id ON lead_outreach_logs(lead_id, approached_at DESC)`,
    },
  ]);

  schemaBootstrapped = true;
}

function cleanOptionalText(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUrl(val: unknown): string | null {
  const cleaned = cleanOptionalText(val);
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return `https://${cleaned}`;
}

export function mapLeadRow(row: LeadDbRow): LeadWithStats {
  const status: LeadStatus = isValidLeadStatus(row.status) ? row.status : "new";
  const lastChannel: OutreachChannel | null = isValidOutreachChannel(
    row.last_channel,
  )
    ? row.last_channel
    : null;
  const lastOutcome: OutreachOutcome | null = isValidOutreachOutcome(
    row.last_outcome,
  )
    ? row.last_outcome
    : null;

  return {
    id: row.id,
    projectSlug: row.project_slug,
    name: row.name,
    role: row.role ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    company: row.company ?? null,
    website: row.website ?? null,
    linkedinUrl: row.linkedin_url ?? null,
    source: row.source ?? null,
    status,
    notes: row.notes ?? null,
    lastContactedAt:
      row.last_contacted_at != null ? Number(row.last_contacted_at) : null,
    nextFollowUpAt:
      row.next_follow_up_at != null ? Number(row.next_follow_up_at) : null,
    createdBy: row.created_by ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    outreachCount: Number(row.outreach_count ?? 0),
    lastChannel,
    lastOutcome,
    lastLogMessage: row.last_log_message ?? null,
  };
}

export function mapLogRow(row: LogDbRow): LeadOutreachLog {
  const channel: OutreachChannel = isValidOutreachChannel(row.channel)
    ? row.channel
    : "other";
  const direction: OutreachDirection = isValidOutreachDirection(row.direction)
    ? row.direction
    : "outbound";
  const outcome: OutreachOutcome = isValidOutreachOutcome(row.outcome)
    ? row.outcome
    : "sent";

  return {
    id: row.id,
    leadId: row.lead_id,
    channel,
    direction,
    outcome,
    subject: row.subject ?? null,
    message: row.message ?? null,
    approachedAt: Number(row.approached_at),
    createdBy: row.created_by ?? null,
    createdAt: Number(row.created_at),
  };
}

export async function listAvailableLeadProjects(): Promise<
  LeadProjectOption[]
> {
  const registryProjects = listDashboardProjects();
  const bySlug = new Map<string, LeadProjectOption>();

  for (const p of registryProjects) {
    bySlug.set(p.slug, {
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
    });
  }

  if (leadsStorageConfigured()) {
    try {
      const { results } = await d1Query<{
        slug: string;
        name: string;
        description: string | null;
      }>(`SELECT slug, name, description FROM apps ORDER BY created_at ASC`);
      for (const row of results) {
        if (row.slug && !bySlug.has(row.slug)) {
          bySlug.set(row.slug, {
            slug: row.slug,
            name: row.name || row.slug,
            tagline: row.description ?? undefined,
          });
        }
      }
    } catch {
      // Fall back to static registry if apps table query fails
    }
  }

  return Array.from(bySlug.values());
}

export async function listLeads(filters?: {
  projectSlug?: string;
  status?: LeadStatus;
  search?: string;
}): Promise<LeadWithStats[]> {
  await ensureLeadsSchema();

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (filters?.projectSlug && filters.projectSlug !== "all") {
    whereClauses.push("l.project_slug = ?");
    params.push(filters.projectSlug);
  }

  if (filters?.status && isValidLeadStatus(filters.status)) {
    whereClauses.push("l.status = ?");
    params.push(filters.status);
  }

  if (filters?.search && filters.search.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    whereClauses.push(
      `(LOWER(l.name) LIKE ? OR LOWER(COALESCE(l.email, '')) LIKE ? OR LOWER(COALESCE(l.company, '')) LIKE ? OR LOWER(COALESCE(l.website, '')) LIKE ? OR LOWER(COALESCE(l.role, '')) LIKE ?)`,
    );
    params.push(q, q, q, q, q);
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const sql = `
    SELECT
      l.*,
      (SELECT COUNT(*) FROM lead_outreach_logs lg WHERE lg.lead_id = l.id) AS outreach_count,
      (SELECT lg.channel FROM lead_outreach_logs lg WHERE lg.lead_id = l.id ORDER BY lg.approached_at DESC, lg.created_at DESC LIMIT 1) AS last_channel,
      (SELECT lg.outcome FROM lead_outreach_logs lg WHERE lg.lead_id = l.id ORDER BY lg.approached_at DESC, lg.created_at DESC LIMIT 1) AS last_outcome,
      (SELECT lg.message FROM lead_outreach_logs lg WHERE lg.lead_id = l.id ORDER BY lg.approached_at DESC, lg.created_at DESC LIMIT 1) AS last_log_message
    FROM leads l
    ${whereSql}
    ORDER BY COALESCE(l.last_contacted_at, l.created_at) DESC, l.created_at DESC
  `;

  const { results } = await d1Query<LeadDbRow>(sql, params);
  return results.map(mapLeadRow);
}

export async function getLeadById(id: string): Promise<LeadWithStats | null> {
  await ensureLeadsSchema();

  const sql = `
    SELECT
      l.*,
      (SELECT COUNT(*) FROM lead_outreach_logs lg WHERE lg.lead_id = l.id) AS outreach_count,
      (SELECT lg.channel FROM lead_outreach_logs lg WHERE lg.lead_id = l.id ORDER BY lg.approached_at DESC, lg.created_at DESC LIMIT 1) AS last_channel,
      (SELECT lg.outcome FROM lead_outreach_logs lg WHERE lg.lead_id = l.id ORDER BY lg.approached_at DESC, lg.created_at DESC LIMIT 1) AS last_outcome,
      (SELECT lg.message FROM lead_outreach_logs lg WHERE lg.lead_id = l.id ORDER BY lg.approached_at DESC, lg.created_at DESC LIMIT 1) AS last_log_message
    FROM leads l
    WHERE l.id = ?
    LIMIT 1
  `;

  const { results } = await d1Query<LeadDbRow>(sql, [id]);
  return results[0] ? mapLeadRow(results[0]) : null;
}

export async function listLogsForLead(
  leadId: string,
): Promise<LeadOutreachLog[]> {
  await ensureLeadsSchema();

  const { results } = await d1Query<LogDbRow>(
    `SELECT * FROM lead_outreach_logs
     WHERE lead_id = ?
     ORDER BY approached_at DESC, created_at DESC`,
    [leadId],
  );
  return results.map(mapLogRow);
}

export async function listAllOutreachLogs(filters?: {
  projectSlug?: string;
  limit?: number;
}): Promise<LeadOutreachLog[]> {
  await ensureLeadsSchema();

  const params: unknown[] = [];
  let whereSql = "";

  if (filters?.projectSlug && filters.projectSlug !== "all") {
    whereSql = `WHERE lg.lead_id IN (SELECT id FROM leads WHERE project_slug = ?)`;
    params.push(filters.projectSlug);
  }

  const limitClause =
    filters?.limit && filters.limit > 0 ? `LIMIT ${Number(filters.limit)}` : "";

  const { results } = await d1Query<LogDbRow>(
    `SELECT lg.* FROM lead_outreach_logs lg
     ${whereSql}
     ORDER BY lg.approached_at DESC, lg.created_at DESC
     ${limitClause}`,
    params,
  );
  return results.map(mapLogRow);
}

export async function createLead(
  input: CreateLeadInput,
): Promise<{ lead: LeadWithStats; initialLog: LeadOutreachLog | null }> {
  await ensureLeadsSchema();

  const name = input.name?.trim();
  if (!name) {
    throw new Error("Lead name is required");
  }
  const projectSlug = input.projectSlug?.trim() || "lawa";

  const id = `lead_${crypto.randomUUID()}`;
  const now = Date.now();

  let status: LeadStatus = isValidLeadStatus(input.status)
    ? input.status
    : "new";
  let lastContactedAt: number | null = null;

  if (input.initialApproach) {
    const approachedAt =
      typeof input.initialApproach.approachedAt === "number" &&
      !Number.isNaN(input.initialApproach.approachedAt)
        ? input.initialApproach.approachedAt
        : now;
    lastContactedAt = approachedAt;
    const outcome = isValidOutreachOutcome(input.initialApproach.outcome)
      ? input.initialApproach.outcome
      : "sent";
    status = deriveLeadStatusFromOutcome(status, outcome);
  }

  await d1Query(
    `INSERT INTO leads (
      id, project_slug, name, role, email, phone, company, website, linkedin_url,
      source, status, notes, last_contacted_at, next_follow_up_at, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      projectSlug,
      name,
      cleanOptionalText(input.role),
      cleanOptionalText(input.email),
      cleanOptionalText(input.phone),
      cleanOptionalText(input.company),
      normalizeUrl(input.website),
      normalizeUrl(input.linkedinUrl),
      cleanOptionalText(input.source),
      status,
      cleanOptionalText(input.notes),
      lastContactedAt,
      input.nextFollowUpAt ?? null,
      input.createdBy ?? null,
      now,
      now,
    ],
  );

  let initialLog: LeadOutreachLog | null = null;
  if (input.initialApproach) {
    const logRes = await addOutreachLog({
      leadId: id,
      channel: input.initialApproach.channel,
      direction: input.initialApproach.direction ?? "outbound",
      outcome: input.initialApproach.outcome ?? "sent",
      subject: input.initialApproach.subject ?? null,
      message: input.initialApproach.message ?? null,
      approachedAt: lastContactedAt ?? now,
      autoUpdateStatus: true,
      createdBy: input.createdBy ?? null,
    });
    initialLog = logRes.log;
    return { lead: logRes.lead, initialLog };
  }

  const created = await getLeadById(id);
  if (!created) {
    throw new Error("Failed to load newly created lead");
  }
  return { lead: created, initialLog: null };
}

export async function updateLead(
  id: string,
  input: UpdateLeadInput,
): Promise<LeadWithStats> {
  await ensureLeadsSchema();

  const existing = await getLeadById(id);
  if (!existing) {
    throw new Error("Lead not found");
  }

  const nextName =
    input.name !== undefined ? input.name.trim() : existing.name;
  if (!nextName) {
    throw new Error("Lead name cannot be empty");
  }

  const nextProjectSlug =
    input.projectSlug !== undefined
      ? input.projectSlug.trim() || existing.projectSlug
      : existing.projectSlug;

  const nextStatus: LeadStatus =
    input.status !== undefined && isValidLeadStatus(input.status)
      ? input.status
      : existing.status;

  const nextRole =
    input.role !== undefined ? cleanOptionalText(input.role) : existing.role;
  const nextEmail =
    input.email !== undefined ? cleanOptionalText(input.email) : existing.email;
  const nextPhone =
    input.phone !== undefined ? cleanOptionalText(input.phone) : existing.phone;
  const nextCompany =
    input.company !== undefined
      ? cleanOptionalText(input.company)
      : existing.company;
  const nextWebsite =
    input.website !== undefined
      ? normalizeUrl(input.website)
      : existing.website;
  const nextLinkedin =
    input.linkedinUrl !== undefined
      ? normalizeUrl(input.linkedinUrl)
      : existing.linkedinUrl;
  const nextSource =
    input.source !== undefined
      ? cleanOptionalText(input.source)
      : existing.source;
  const nextNotes =
    input.notes !== undefined ? cleanOptionalText(input.notes) : existing.notes;
  const nextLastContactedAt =
    input.lastContactedAt !== undefined
      ? input.lastContactedAt
      : existing.lastContactedAt;
  const nextFollowUpAt =
    input.nextFollowUpAt !== undefined
      ? input.nextFollowUpAt
      : existing.nextFollowUpAt;

  const now = Date.now();

  await d1Query(
    `UPDATE leads
     SET project_slug = ?,
         name = ?,
         role = ?,
         email = ?,
         phone = ?,
         company = ?,
         website = ?,
         linkedin_url = ?,
         source = ?,
         status = ?,
         notes = ?,
         last_contacted_at = ?,
         next_follow_up_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      nextProjectSlug,
      nextName,
      nextRole,
      nextEmail,
      nextPhone,
      nextCompany,
      nextWebsite,
      nextLinkedin,
      nextSource,
      nextStatus,
      nextNotes,
      nextLastContactedAt,
      nextFollowUpAt,
      now,
      id,
    ],
  );

  const updated = await getLeadById(id);
  if (!updated) {
    throw new Error("Failed to load updated lead");
  }
  return updated;
}

export async function deleteLead(id: string): Promise<boolean> {
  await ensureLeadsSchema();
  const existing = await getLeadById(id);
  if (!existing) return false;

  await d1Batch([
    {
      sql: `DELETE FROM lead_outreach_logs WHERE lead_id = ?`,
      params: [id],
    },
    {
      sql: `DELETE FROM leads WHERE id = ?`,
      params: [id],
    },
  ]);

  return true;
}

export async function addOutreachLog(
  input: CreateOutreachLogInput,
): Promise<{ log: LeadOutreachLog; lead: LeadWithStats }> {
  await ensureLeadsSchema();

  const existingLead = await getLeadById(input.leadId);
  if (!existingLead) {
    throw new Error("Lead not found");
  }

  const id = `log_${crypto.randomUUID()}`;
  const now = Date.now();
  const approachedAt =
    typeof input.approachedAt === "number" && !Number.isNaN(input.approachedAt)
      ? input.approachedAt
      : now;

  const channel: OutreachChannel = isValidOutreachChannel(input.channel)
    ? input.channel
    : "email";
  const direction: OutreachDirection = isValidOutreachDirection(input.direction)
    ? input.direction
    : "outbound";
  const outcome: OutreachOutcome = isValidOutreachOutcome(input.outcome)
    ? input.outcome
    : "sent";

  await d1Query(
    `INSERT INTO lead_outreach_logs (
      id, lead_id, channel, direction, outcome, subject, message, approached_at, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.leadId,
      channel,
      direction,
      outcome,
      cleanOptionalText(input.subject),
      cleanOptionalText(input.message),
      approachedAt,
      input.createdBy ?? null,
      now,
    ],
  );

  const nextLastContactedAt = Math.max(
    existingLead.lastContactedAt ?? 0,
    approachedAt,
  );

  let nextStatus: LeadStatus = existingLead.status;
  if (input.explicitStatus && isValidLeadStatus(input.explicitStatus)) {
    nextStatus = input.explicitStatus;
  } else if (input.autoUpdateStatus !== false) {
    nextStatus = deriveLeadStatusFromOutcome(existingLead.status, outcome);
  }

  const nextFollowUpAt =
    input.nextFollowUpAt !== undefined
      ? input.nextFollowUpAt
      : existingLead.nextFollowUpAt;

  await d1Query(
    `UPDATE leads
     SET last_contacted_at = ?,
         status = ?,
         next_follow_up_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [nextLastContactedAt, nextStatus, nextFollowUpAt, now, input.leadId],
  );

  const { results: logRows } = await d1Query<LogDbRow>(
    `SELECT * FROM lead_outreach_logs WHERE id = ? LIMIT 1`,
    [id],
  );
  const updatedLead = await getLeadById(input.leadId);
  if (!logRows[0] || !updatedLead) {
    throw new Error("Failed to fetch created outreach log");
  }

  return {
    log: mapLogRow(logRows[0]),
    lead: updatedLead,
  };
}

export async function deleteOutreachLog(
  leadId: string,
  logId: string,
): Promise<LeadWithStats | null> {
  await ensureLeadsSchema();

  await d1Query(
    `DELETE FROM lead_outreach_logs WHERE id = ? AND lead_id = ?`,
    [logId, leadId],
  );

  const { results } = await d1Query<{ max_approached: number | null }>(
    `SELECT MAX(approached_at) AS max_approached FROM lead_outreach_logs WHERE lead_id = ?`,
    [leadId],
  );
  const maxApproached =
    results[0]?.max_approached != null
      ? Number(results[0].max_approached)
      : null;

  await d1Query(
    `UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ?`,
    [maxApproached, Date.now(), leadId],
  );

  return getLeadById(leadId);
}

export type { Lead };
