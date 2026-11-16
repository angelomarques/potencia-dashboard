import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import {
  createLead,
  leadsStorageConfigured,
  listAllOutreachLogs,
  listAvailableLeadProjects,
  listLeads,
} from "@/lib/leads/repo";
import { computeLeadsReport } from "@/lib/leads/report";
import {
  isValidLeadStatus,
  isValidOutreachChannel,
  isValidOutreachDirection,
  isValidOutreachOutcome,
} from "@/lib/leads/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projects = await listAvailableLeadProjects();
    if (!leadsStorageConfigured()) {
      return NextResponse.json({
        storageConfigured: false,
        projects,
        leads: [],
        logs: [],
        report: computeLeadsReport([], []),
      });
    }

    const { searchParams } = request.nextUrl;
    const projectSlug = searchParams.get("project") ?? undefined;
    const statusParam = searchParams.get("status") ?? undefined;
    const search = searchParams.get("q") ?? undefined;

    const status = isValidLeadStatus(statusParam) ? statusParam : undefined;

    const [leads, logs] = await Promise.all([
      listLeads({ projectSlug, status, search }),
      listAllOutreachLogs({ projectSlug }),
    ]);

    const report = computeLeadsReport(leads, logs);

    return NextResponse.json({
      storageConfigured: true,
      projects,
      leads,
      logs,
      report,
    });
  } catch (error: unknown) {
    console.error("Failed to list leads:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!leadsStorageConfigured()) {
      return NextResponse.json(
        { error: "Database storage is not configured" },
        { status: 503 },
      );
    }

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Lead name is required" },
        { status: 400 },
      );
    }

    const projectSlug =
      typeof body?.projectSlug === "string" && body.projectSlug.trim()
        ? body.projectSlug.trim()
        : "lawa";

    let initialApproach = null;
    if (body?.initialApproach && typeof body.initialApproach === "object") {
      const ia = body.initialApproach;
      initialApproach = {
        channel: isValidOutreachChannel(ia.channel) ? ia.channel : "email",
        direction: isValidOutreachDirection(ia.direction)
          ? ia.direction
          : "outbound",
        outcome: isValidOutreachOutcome(ia.outcome) ? ia.outcome : "sent",
        subject: typeof ia.subject === "string" ? ia.subject : null,
        message: typeof ia.message === "string" ? ia.message : null,
        approachedAt:
          typeof ia.approachedAt === "number" ? ia.approachedAt : Date.now(),
      };
    }

    const result = await createLead({
      projectSlug,
      name,
      role: body?.role,
      email: body?.email,
      phone: body?.phone,
      company: body?.company,
      website: body?.website,
      linkedinUrl: body?.linkedinUrl,
      source: body?.source,
      status: isValidLeadStatus(body?.status) ? body.status : "new",
      notes: body?.notes,
      nextFollowUpAt:
        typeof body?.nextFollowUpAt === "number" ? body.nextFollowUpAt : null,
      createdBy: session.user.id,
      initialApproach,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to create lead:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
