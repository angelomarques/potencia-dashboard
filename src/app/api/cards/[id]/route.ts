import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { d1Query } from "@/lib/db/d1-http";

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

    const existingRes = await d1Query<Record<string, unknown>>(
      "SELECT * FROM cards WHERE id = ? LIMIT 1",
      [id],
    );
    if (!existingRes.results || existingRes.results.length === 0) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, priority, columnId, position } = body || {};

    const updates: string[] = ["updated_at = ?"];
    const values: unknown[] = [Date.now()];

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      }
      updates.push("title = ?");
      values.push(title.trim());
    }

    if (description !== undefined) {
      updates.push("description = ?");
      values.push(typeof description === "string" && description.trim() ? description.trim() : null);
    }

    if (priority !== undefined) {
      const cleanPriority = ["low", "medium", "high", "urgent"].includes(priority)
        ? priority
        : "medium";
      updates.push("priority = ?");
      values.push(cleanPriority);
    }

    if (columnId !== undefined) {
      // Verify column exists
      const colCheck = await d1Query("SELECT id FROM columns WHERE id = ? LIMIT 1", [columnId]);
      if (!colCheck.results || colCheck.results.length === 0) {
        return NextResponse.json({ error: "Column does not exist" }, { status: 400 });
      }
      updates.push("column_id = ?");
      values.push(columnId);
    }

    if (position !== undefined) {
      updates.push("position = ?");
      values.push(Number(position) || 0);
    }

    values.push(id);

    await d1Query(
      `UPDATE cards SET ${updates.join(", ")} WHERE id = ?`,
      values,
    );

    const updatedRes = await d1Query<Record<string, unknown>>(
      "SELECT * FROM cards WHERE id = ? LIMIT 1",
      [id],
    );

    return NextResponse.json({ card: updatedRes.results[0] });
  } catch (error: unknown) {
    console.error("Failed to update card:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
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

    const existingRes = await d1Query<{ id: string; column_id: string; position: number }>(
      "SELECT id, column_id, position FROM cards WHERE id = ? LIMIT 1",
      [id],
    );
    if (!existingRes.results || existingRes.results.length === 0) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const card = existingRes.results[0];

    // Delete card
    await d1Query("DELETE FROM cards WHERE id = ?", [id]);

    // Recompact positions in column
    await d1Query(
      "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
      [card.column_id, card.position],
    );

    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    console.error("Failed to delete card:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
