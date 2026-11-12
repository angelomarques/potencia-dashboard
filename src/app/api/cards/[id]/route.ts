import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import {
  deleteTask,
  KanbanServiceError,
  updateTask,
} from "@/lib/kanban/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Card ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const { title, description, priority, columnId, position } = body || {};

    const card = await updateTask({
      cardId: id,
      title,
      description,
      priority,
      columnId,
      position: position !== undefined ? Number(position) || 0 : undefined,
    });

    return NextResponse.json({ card });
  } catch (error: unknown) {
    if (error instanceof KanbanServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to update card:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Card ID is required" }, { status: 400 });
    }

    const deleted = await deleteTask(id);
    return NextResponse.json({ success: true, id: deleted.id });
  } catch (error: unknown) {
    if (error instanceof KanbanServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to delete card:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
