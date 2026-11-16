import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { KanbanServiceError, moveTask } from "@/lib/kanban/service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { cardId, toColumnId, toPosition } = body || {};

    if (!cardId || typeof cardId !== "string") {
      return NextResponse.json({ error: "Card ID is required" }, { status: 400 });
    }

    if (!toColumnId || typeof toColumnId !== "string") {
      return NextResponse.json(
        { error: "Destination column ID is required" },
        { status: 400 },
      );
    }

    if (
      toPosition === undefined ||
      typeof toPosition !== "number" ||
      toPosition < 0
    ) {
      return NextResponse.json(
        { error: "Valid destination position is required" },
        { status: 400 },
      );
    }

    await moveTask({ cardId, toColumnId, toPosition });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof KanbanServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to move card:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
