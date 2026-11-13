import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import {
  addOutreachLog,
  leadsStorageConfigured,
  listLogsForLead,
} from "@/lib/leads/repo";
import {
  isValidLeadStatus,
  isValidOutreachChannel,
  isValidOutreachDirection,
  isValidOutreachOutcome,
} from "@/lib/leads/types";

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
    const logs = await listLogsForLead(id);
    return NextResponse.json({ logs });
  } catch (error: unknown) {
    console.error("Failed to list lead outreach logs:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
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

    const channel = isValidOutreachChannel(body?.channel)
      ? body.channel
      : "email";
    const direction = isValidOutreachDirection(body?.direction)
      ? body.direction
      : "outbound";
    const outcome = isValidOutreachOutcome(body?.outcome)
      ? body.outcome
      : "sent";

    const approachedAt =
      typeof body?.approachedAt === "number" && !Number.isNaN(body.approachedAt)
        ? body.approachedAt
        : Date.now();

    const result = await addOutreachLog({
      leadId: id,
      channel,
      direction,
      outcome,
      subject: typeof body?.subject === "string" ? body.subject : null,
      message: typeof body?.message === "string" ? body.message : null,
      approachedAt,
      nextFollowUpAt:
        body?.nextFollowUpAt !== undefined ? body.nextFollowUpAt : undefined,
      autoUpdateStatus: body?.autoUpdateStatus !== false,
      explicitStatus: isValidLeadStatus(body?.explicitStatus)
        ? body.explicitStatus
        : undefined,
      createdBy: session.user.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to add outreach log:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const status = message === "Lead not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
