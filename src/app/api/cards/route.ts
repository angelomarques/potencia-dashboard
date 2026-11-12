import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { createTask, KanbanServiceError } from "@/lib/kanban/service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      description,
      columnId,
      boardId = "board_lawa",
      priority = "medium",
    } = body || {};

    if (!columnId || typeof columnId !== "string") {
      return NextResponse.json(
        { error: "Column ID is required" },
        { status: 400 },
      );
    }

    const card = await createTask({
      title,
      description,
      columnId,
      boardId,
      priority,
      createdBy: session.user?.id || null,
    });

    return NextResponse.json({ card }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof KanbanServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to create card:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
