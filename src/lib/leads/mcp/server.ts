import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KanbanMcpActor } from "@/lib/kanban/mcp/tokens";
import {
  addOutreachLog,
  createLead,
  deleteLead,
  deleteOutreachLog,
  findLeadByEmail,
  getLeadById,
  leadsStorageConfigured,
  listAllOutreachLogs,
  listLeads,
  listLogsForLead,
  updateLead,
} from "@/lib/leads/repo";
import { computeLeadsReport } from "@/lib/leads/report";
import {
  LEAD_STATUSES,
  OUTREACH_CHANNELS,
  OUTREACH_DIRECTIONS,
  OUTREACH_OUTCOMES,
  type Lead,
  type LeadOutreachLog,
  type LeadWithStats,
} from "@/lib/leads/types";
import {
  createDashboardProject,
  isDashboardProjectSlug,
  listDashboardProjects,
  ProjectServiceError,
} from "@/lib/projects/registry";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

const ok = (data: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
});

const fail = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

function handleProjectError(err: unknown): ToolResult {
  if (err instanceof ProjectServiceError) {
    return fail(`${err.message} (status ${err.status})`);
  }
  return fail(err instanceof Error ? err.message : String(err));
}

function parseTimestampInput(
  val: string | number | null | undefined,
  fieldName: string,
): { ok: true; value: number | null | undefined } | { ok: false; error: string } {
  if (val === undefined) return { ok: true, value: undefined };
  if (val === null) return { ok: true, value: null };
  if (typeof val === "number") {
    if (!Number.isFinite(val) || Number.isNaN(val)) {
      return { ok: false, error: `Invalid timestamp for ${fieldName}: NaN or infinite` };
    }
    return { ok: true, value: Math.round(val) };
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return { ok: true, value: null };
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (Number.isFinite(num)) {
        return { ok: true, value: Math.round(num) };
      }
    }
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) {
      return { ok: false, error: `Invalid ISO 8601 timestamp for ${fieldName}: "${val}"` };
    }
    return { ok: true, value: parsed };
  }
  return { ok: false, error: `Invalid timestamp format for ${fieldName}` };
}

function formatLead(lead: LeadWithStats | Lead) {
  return {
    id: lead.id,
    projectSlug: lead.projectSlug,
    name: lead.name,
    role: lead.role,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    website: lead.website,
    linkedinUrl: lead.linkedinUrl,
    source: lead.source,
    status: lead.status,
    notes: lead.notes,
    createdBy: lead.createdBy,
    lastContactedAt:
      lead.lastContactedAt != null
        ? new Date(lead.lastContactedAt).toISOString()
        : null,
    lastContactedAtMs: lead.lastContactedAt != null ? lead.lastContactedAt : null,
    nextFollowUpAt:
      lead.nextFollowUpAt != null
        ? new Date(lead.nextFollowUpAt).toISOString()
        : null,
    nextFollowUpAtMs: lead.nextFollowUpAt != null ? lead.nextFollowUpAt : null,
    createdAt: new Date(lead.createdAt).toISOString(),
    createdAtMs: lead.createdAt,
    updatedAt: new Date(lead.updatedAt).toISOString(),
    updatedAtMs: lead.updatedAt,
    ...("outreachCount" in lead
      ? {
          outreachCount: lead.outreachCount,
          lastChannel: lead.lastChannel,
          lastOutcome: lead.lastOutcome,
          lastLogMessage: lead.lastLogMessage,
        }
      : {}),
  };
}

function formatLog(log: LeadOutreachLog) {
  return {
    id: log.id,
    leadId: log.leadId,
    channel: log.channel,
    direction: log.direction,
    outcome: log.outcome,
    subject: log.subject,
    message: log.message,
    createdBy: log.createdBy,
    approachedAt: new Date(log.approachedAt).toISOString(),
    approachedAtMs: log.approachedAt,
    createdAt: new Date(log.createdAt).toISOString(),
    createdAtMs: log.createdAt,
  };
}

export function createLeadsMcpServer(actor: KanbanMcpActor): McpServer {
  const server = new McpServer(
    { name: "potencia-leads", version: "1.0.0" },
    {
      instructions:
        "Potencia Dashboard Leads MCP. Call list_projects or create_project to manage workspaces. " +
        "Use list_leads, get_lead, find_lead_by_email, create_lead, update_lead, or delete_lead to track leads. " +
        "Use log_approach, list_lead_logs, and delete_lead_log to manage outreach interactions. " +
        "Use leads_report to compute outbound conversion and pipeline analytics.",
    },
  );

  server.registerTool(
    "list_projects",
    {
      description:
        "List all registered dashboard projects with their slugs, names, taglines, and board IDs.",
      inputSchema: {},
    },
    async () => {
      try {
        const projects = await listDashboardProjects();
        return ok({
          projects: projects.map((p) => ({
            slug: p.slug,
            name: p.name,
            tagline: p.tagline,
            boardId: p.boardId,
          })),
        });
      } catch (err) {
        return handleProjectError(err);
      }
    },
  );

  server.registerTool(
    "create_project",
    {
      description:
        "Create a new dashboard project workspace with an automatic default Kanban board.",
      inputSchema: {
        name: z.string().min(1).max(300).describe("Project display name."),
        slug: z
          .string()
          .min(1)
          .max(64)
          .optional()
          .describe("Optional unique project slug. Defaults to slugified name."),
        tagline: z
          .string()
          .max(500)
          .optional()
          .describe("Optional project tagline / description."),
      },
    },
    async ({ name, slug, tagline }) => {
      try {
        const project = await createDashboardProject({
          name,
          slug,
          tagline,
          createdBy: actor.userId,
        });
        return ok({ project });
      } catch (err) {
        return handleProjectError(err);
      }
    },
  );

  server.registerTool(
    "list_leads",
    {
      description:
        "List outbound leads with optional filtering by project slug, status, text search, and limit.",
      inputSchema: {
        projectSlug: z
          .string()
          .min(1)
          .max(64)
          .optional()
          .describe("Filter by project slug (e.g. 'lawa')."),
        status: z
          .enum(LEAD_STATUSES)
          .optional()
          .describe("Filter by lead status."),
        search: z
          .string()
          .max(200)
          .optional()
          .describe("Case-insensitive text search in name, company, email, website, or role."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .optional()
          .describe("Maximum number of leads to return (1..500, default 100)."),
      },
    },
    async ({ projectSlug, status, search, limit }) => {
      if (!leadsStorageConfigured()) {
        return fail("Database storage is not configured");
      }
      try {
        const leads = await listLeads({
          projectSlug,
          status,
          search,
          limit: limit ?? 100,
        });
        return ok({
          totalMatched: leads.length,
          leads: leads.map(formatLead),
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "get_lead",
    {
      description:
        "Retrieve full details of a single lead by its ID, including its chronological outreach logs.",
      inputSchema: {
        leadId: z.string().min(1).max(128).describe("Lead ID (e.g. 'lead_...')"),
      },
    },
    async ({ leadId }) => {
      if (!leadsStorageConfigured()) {
        return fail("Database storage is not configured");
      }
      try {
        const lead = await getLeadById(leadId);
        if (!lead) {
          return fail(`Lead '${leadId}' not found`);
        }
        const logs = await listLogsForLead(leadId);
        return ok({
          lead: formatLead(lead),
          logs: logs.map(formatLog),
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "find_lead_by_email",
    {
      description:
        "Find leads matching an email address (case-insensitive, trimmed). Optionally scoped to a single project.",
      inputSchema: {
        email: z.string().min(1).max(256).describe("Email address to search for."),
        projectSlug: z
          .string()
          .min(1)
          .max(64)
          .optional()
          .describe("Optional project slug to restrict match to a single project."),
      },
    },
    async ({ email, projectSlug }) => {
      if (!leadsStorageConfigured()) {
        return fail("Database storage is not configured");
      }
      try {
        const leads = await findLeadByEmail(email, projectSlug);
        return ok({
          found: leads.length > 0,
          leads: leads.map(formatLead),
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "create_lead",
    {
      description:
        "Add a new outbound lead to a project board. Supports email deduplication and optional initial outreach approach.",
      inputSchema: {
        projectSlug: z
          .string()
          .min(1)
          .max(64)
          .describe("Project slug (required, must exist in registry)."),
        name: z.string().min(1).max(200).describe("Lead full name or contact name."),
        role: z.string().max(150).optional().describe("Job title or role."),
        email: z.string().max(256).optional().describe("Contact email."),
        phone: z.string().max(64).optional().describe("Phone number or WhatsApp."),
        company: z.string().max(200).optional().describe("Company or firm name."),
        website: z.string().max(500).optional().describe("Website URL."),
        linkedinUrl: z.string().max(500).optional().describe("LinkedIn profile URL."),
        source: z.string().max(100).optional().describe("Lead origin or referral source."),
        status: z
          .enum(LEAD_STATUSES)
          .optional()
          .describe("Initial lead status. Defaults to 'new' (or derived if initialApproach provided)."),
        notes: z.string().max(5000).optional().describe("Freeform notes or summary."),
        nextFollowUpAt: z
          .union([z.string(), z.number()])
          .optional()
          .describe("Next follow-up timestamp (ISO 8601 string or epoch ms)."),
        initialApproach: z
          .object({
            channel: z.enum(OUTREACH_CHANNELS).describe("Outreach channel used."),
            direction: z.enum(OUTREACH_DIRECTIONS).optional().describe("Direction (defaults to 'outbound')."),
            outcome: z.enum(OUTREACH_OUTCOMES).optional().describe("Outcome (defaults to 'sent')."),
            subject: z.string().max(300).optional().describe("Subject line or message headline."),
            message: z.string().max(10000).optional().describe("Sent message or pitch summary."),
            approachedAt: z
              .union([z.string(), z.number()])
              .optional()
              .describe("Timestamp of initial contact (ISO string or ms, defaults to now)."),
          })
          .optional()
          .describe("Optional initial outreach touch logged immediately upon creation."),
        onDuplicate: z
          .enum(["return_existing", "error"])
          .default("return_existing")
          .optional()
          .describe("Behavior if a lead with the same email already exists in the project: 'return_existing' or 'error'."),
      },
    },
    async (args) => {
      if (!leadsStorageConfigured()) {
        return fail("Database storage is not configured");
      }
      try {
        const projectExists = await isDashboardProjectSlug(args.projectSlug);
        if (!projectExists) {
          return fail(`Project '${args.projectSlug}' not found`);
        }

        const parsedFollowUp = parseTimestampInput(
          args.nextFollowUpAt,
          "nextFollowUpAt",
        );
        if (!parsedFollowUp.ok) {
          return fail(parsedFollowUp.error);
        }

        let initialApproach = null;
        if (args.initialApproach) {
          const parsedApproachedAt = parseTimestampInput(
            args.initialApproach.approachedAt,
            "initialApproach.approachedAt",
          );
          if (!parsedApproachedAt.ok) {
            return fail(parsedApproachedAt.error);
          }
          initialApproach = {
            channel: args.initialApproach.channel,
            direction: args.initialApproach.direction ?? "outbound",
            outcome: args.initialApproach.outcome ?? "sent",
            subject: args.initialApproach.subject ?? null,
            message: args.initialApproach.message ?? null,
            approachedAt: parsedApproachedAt.value ?? Date.now(),
          };
        }

        const cleanEmail = args.email?.trim();
        if (cleanEmail) {
          const existingMatches = await findLeadByEmail(cleanEmail, args.projectSlug);
          if (existingMatches.length > 0) {
            const existing = existingMatches[0];
            if (args.onDuplicate === "error") {
              return fail(
                `Lead with email '${cleanEmail}' already exists in project '${args.projectSlug}' (lead id: ${existing.id})`,
              );
            }
            return ok({
              created: false,
              duplicate: true,
              lead: formatLead(existing),
            });
          }
        }

        const result = await createLead({
          projectSlug: args.projectSlug,
          name: args.name,
          role: args.role,
          email: cleanEmail || null,
          phone: args.phone,
          company: args.company,
          website: args.website,
          linkedinUrl: args.linkedinUrl,
          source: args.source,
          status: args.status,
          notes: args.notes,
          nextFollowUpAt: parsedFollowUp.value ?? null,
          createdBy: actor.userId,
          initialApproach,
        });

        return ok({
          created: true,
          duplicate: false,
          lead: formatLead(result.lead),
          initialLog: result.initialLog ? formatLog(result.initialLog) : null,
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "update_lead",
    {
      description:
        "Update metadata, status, or timestamps of an existing lead. Unspecified fields remain unchanged.",
      inputSchema: {
        leadId: z.string().min(1).max(128).describe("ID of the lead to update."),
        name: z.string().min(1).max(200).optional(),
        projectSlug: z.string().min(1).max(64).optional(),
        role: z.string().max(150).nullable().optional(),
        email: z.string().max(256).nullable().optional(),
        phone: z.string().max(64).nullable().optional(),
        company: z.string().max(200).nullable().optional(),
        website: z.string().max(500).nullable().optional(),
        linkedinUrl: z.string().max(500).nullable().optional(),
        source: z.string().max(100).nullable().optional(),
        status: z.enum(LEAD_STATUSES).optional(),
        notes: z.string().max(5000).nullable().optional(),
        nextFollowUpAt: z
          .union([z.string(), z.number()])
          .nullable()
          .optional()
          .describe("Next follow-up timestamp (ISO string, epoch ms, or null to clear)."),
        lastContactedAt: z
          .union([z.string(), z.number()])
          .nullable()
          .optional()
          .describe("Last contacted timestamp (ISO string, epoch ms, or null to clear)."),
      },
    },
    async (args) => {
      if (!leadsStorageConfigured()) {
        return fail("Database storage is not configured");
      }
      try {
        const existing = await getLeadById(args.leadId);
        if (!existing) {
          return fail(`Lead '${args.leadId}' not found`);
        }

        if (args.projectSlug !== undefined && args.projectSlug !== existing.projectSlug) {
          const projectExists = await isDashboardProjectSlug(args.projectSlug);
          if (!projectExists) {
            return fail(`Project '${args.projectSlug}' not found`);
          }
        }

        let parsedFollowUp: number | null | undefined = undefined;
        if (args.nextFollowUpAt !== undefined) {
          const parsed = parseTimestampInput(args.nextFollowUpAt, "nextFollowUpAt");
          if (!parsed.ok) return fail(parsed.error);
          parsedFollowUp = parsed.value;
        }

        let parsedLastContacted: number | null | undefined = undefined;
        if (args.lastContactedAt !== undefined) {
          const parsed = parseTimestampInput(args.lastContactedAt, "lastContactedAt");
          if (!parsed.ok) return fail(parsed.error);
          parsedLastContacted = parsed.value;
        }

        const updated = await updateLead(args.leadId, {
          name: args.name,
          projectSlug: args.projectSlug,
          role: args.role,
          email: args.email,
          phone: args.phone,
          company: args.company,
          website: args.website,
          linkedinUrl: args.linkedinUrl,
          source: args.source,
          status: args.status,
          notes: args.notes,
          nextFollowUpAt: parsedFollowUp,
          lastContactedAt: parsedLastContacted,
        });

        return ok({ lead: formatLead(updated) });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "delete_lead",
    {
      description:
        "Delete a lead and all associated outreach logs.",
      inputSchema: {
        leadId: z.string().min(1).max(128).describe("ID of the lead to delete."),
      },
    },
    async ({ leadId }) => {
      if (!leadsStorageConfigured()) {
        return fail("Database storage is not configured");
      }
      try {
        const deleted = await deleteLead(leadId);
        if (!deleted) {
          return fail(`Lead '${leadId}' not found`);
        }
        return ok({ success: true, leadId });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "log_approach",
    {
      description:
        "Record an outreach touch (email, LinkedIn, cold call, WhatsApp, etc.) with automatic status progression.",
      inputSchema: {
        leadId: z.string().min(1).max(128).describe("Target lead ID."),
        channel: z
          .enum(OUTREACH_CHANNELS)
          .default("email")
          .optional()
          .describe("Communication channel used (default 'email')."),
        direction: z
          .enum(OUTREACH_DIRECTIONS)
          .default("outbound")
          .optional()
          .describe("Direction: 'outbound' or 'inbound' (default 'outbound')."),
        outcome: z
          .enum(OUTREACH_OUTCOMES)
          .default("sent")
          .optional()
          .describe("Interaction outcome (default 'sent')."),
        subject: z.string().max(300).nullable().optional().describe("Subject line or headline."),
        message: z.string().max(10000).nullable().optional().describe("Notes or message body."),
        approachedAt: z
          .union([z.string(), z.number()])
          .optional()
          .describe("Timestamp of outreach touch (ISO string or epoch ms, defaults to now)."),
        nextFollowUpAt: z
          .union([z.string(), z.number()])
          .nullable()
          .optional()
          .describe("Optional scheduled next follow-up timestamp (ISO string or ms)."),
        autoUpdateStatus: z
          .boolean()
          .default(true)
          .optional()
          .describe("Whether to derive and advance lead status from outcome (default true)."),
        explicitStatus: z
          .enum(LEAD_STATUSES)
          .optional()
          .describe("Explicitly override lead status regardless of derived outcome."),
      },
    },
    async (args) => {
      if (!leadsStorageConfigured()) {
        return fail("Database storage is not configured");
      }
      try {
        const existingLead = await getLeadById(args.leadId);
        if (!existingLead) {
          return fail(`Lead '${args.leadId}' not found`);
        }
        const previousStatus = existingLead.status;

        let parsedApproachedAt = Date.now();
        if (args.approachedAt !== undefined) {
          const parsed = parseTimestampInput(args.approachedAt, "approachedAt");
          if (!parsed.ok) return fail(parsed.error);
          if (parsed.value != null) {
            parsedApproachedAt = parsed.value;
          }
        }

        let parsedFollowUp: number | null | undefined = undefined;
        if (args.nextFollowUpAt !== undefined) {
          const parsed = parseTimestampInput(args.nextFollowUpAt, "nextFollowUpAt");
          if (!parsed.ok) return fail(parsed.error);
          parsedFollowUp = parsed.value;
        }

        const result = await addOutreachLog({
          leadId: args.leadId,
          channel: args.channel ?? "email",
          direction: args.direction ?? "outbound",
          outcome: args.outcome ?? "sent",
          subject: args.subject ?? null,
          message: args.message ?? null,
          approachedAt: parsedApproachedAt,
          nextFollowUpAt: parsedFollowUp,
          autoUpdateStatus: args.autoUpdateStatus !== false,
          explicitStatus: args.explicitStatus,
          createdBy: actor.userId,
        });

        return ok({
          log: formatLog(result.log),
          lead: formatLead(result.lead),
          previousStatus,
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "list_lead_logs",
    {
      description:
        "Retrieve the complete outreach interaction log history for a specific lead in reverse chronological order.",
      inputSchema: {
        leadId: z.string().min(1).max(128).describe("Target lead ID."),
      },
    },
    async ({ leadId }) => {
      if (!leadsStorageConfigured()) {
        return fail("Database storage is not configured");
      }
      try {
        const existing = await getLeadById(leadId);
        if (!existing) {
          return fail(`Lead '${leadId}' not found`);
        }
        const logs = await listLogsForLead(leadId);
        return ok({
          leadId,
          total: logs.length,
          logs: logs.map(formatLog),
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "delete_lead_log",
    {
      description:
        "Delete an outreach log entry from a lead and recalculate the lead's last_contacted_at timestamp.",
      inputSchema: {
        leadId: z.string().min(1).max(128).describe("Target lead ID."),
        logId: z.string().min(1).max(128).describe("ID of the outreach log entry to remove."),
      },
    },
    async ({ leadId, logId }) => {
      if (!leadsStorageConfigured()) {
        return fail("Database storage is not configured");
      }
      try {
        const updatedLead = await deleteOutreachLog(leadId, logId);
        if (!updatedLead) {
          return fail(`Lead '${leadId}' not found`);
        }
        return ok({
          success: true,
          leadId,
          logId,
          lead: formatLead(updatedLead),
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "leads_report",
    {
      description:
        "Compute real-time outbound funnel metrics, stage counts, reply/conversion rates, and follow-up queues.",
      inputSchema: {
        projectSlug: z
          .string()
          .min(1)
          .max(64)
          .optional()
          .describe("Filter report to a specific project slug (omit for all projects)."),
      },
    },
    async ({ projectSlug }) => {
      if (!leadsStorageConfigured()) {
        return fail("Database storage is not configured");
      }
      try {
        const [leads, logs] = await Promise.all([
          listLeads({ projectSlug }),
          listAllOutreachLogs({ projectSlug }),
        ]);
        const report = computeLeadsReport(leads, logs);
        return ok({ report });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  return server;
}
