import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import {
  deleteOutreachLog,
  leadsStorageConfigured,
} from "@/lib/leads/repo";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; logId: string }>;
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

    const { id, logId } = await context.params;
    const updatedLead = await deleteOutreachLog(id, logId);
    if (!updatedLead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, lead: updatedLead });
  } catch (error: unknown) {
    console.error("Failed to delete outreach log:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
