import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import {
  deleteLead,
  getLeadById,
  leadsStorageConfigured,
  listLogsForLead,
  updateLead,
} from "@/lib/leads/repo";
import { isValidLeadStatus } from "@/lib/leads/types";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
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

    const { id } = await context.params;
    const [lead, logs] = await Promise.all([
      getLeadById(id),
      listLogsForLead(id),
    ]);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ lead, logs });
  } catch (error: unknown) {
    console.error("Failed to load lead:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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

    const { id } = await context.params;
    const body = await request.json();

    if (body?.name !== undefined && typeof body.name === "string" && !body.name.trim()) {
      return NextResponse.json(
        { error: "Lead name cannot be empty" },
        { status: 400 },
      );
    }

    const lead = await updateLead(id, {
      projectSlug:
        typeof body?.projectSlug === "string" ? body.projectSlug : undefined,
      name: typeof body?.name === "string" ? body.name : undefined,
      role: body?.role !== undefined ? body.role : undefined,
      email: body?.email !== undefined ? body.email : undefined,
      phone: body?.phone !== undefined ? body.phone : undefined,
      company: body?.company !== undefined ? body.company : undefined,
      website: body?.website !== undefined ? body.website : undefined,
      linkedinUrl: body?.linkedinUrl !== undefined ? body.linkedinUrl : undefined,
      source: body?.source !== undefined ? body.source : undefined,
      status: isValidLeadStatus(body?.status) ? body.status : undefined,
      notes: body?.notes !== undefined ? body.notes : undefined,
      lastContactedAt:
        body?.lastContactedAt !== undefined ? body.lastContactedAt : undefined,
      nextFollowUpAt:
        body?.nextFollowUpAt !== undefined ? body.nextFollowUpAt : undefined,
    });

    return NextResponse.json({ lead });
  } catch (error: unknown) {
    console.error("Failed to update lead:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const status = message === "Lead not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
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

    const { id } = await context.params;
    const deleted = await deleteLead(id);
    if (!deleted) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Failed to delete lead:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
