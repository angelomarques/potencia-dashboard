import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { d1Query } from "@/lib/db/d1-http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, columnId, boardId = "board_lawa", priority = "medium" } = body || {};

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!columnId || typeof columnId !== "string") {
      return NextResponse.json({ error: "Column ID is required" }, { status: 400 });
    }

    // Verify column exists
    const colRes = await d1Query("SELECT id FROM columns WHERE id = ? LIMIT 1", [columnId]);
    if (!colRes.results || colRes.results.length === 0) {
      return NextResponse.json({ error: "Target column does not exist" }, { status: 400 });
    }

    // Get next position in column
    const posRes = await d1Query<{ next_pos: number }>(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM cards WHERE column_id = ?",
      [columnId],
    );
    const position = posRes.results[0]?.next_pos ?? 0;

    const id = `card_${crypto.randomUUID()}`;
    const now = Date.now();
    const cleanPriority = ["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium";
    const cleanDesc = description && typeof description === "string" ? description.trim() : null;
    const userId = session.user?.id || null;

    await d1Query(
      `INSERT INTO cards (
        id, column_id, board_id, title, description, position, priority, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        columnId,
        boardId,
        title.trim(),
        cleanDesc,
        position,
        cleanPriority,
        userId,
        now,
        now,
      ],
    );

    const createdCardRes = await d1Query<Record<string, unknown>>(
      "SELECT * FROM cards WHERE id = ? LIMIT 1",
      [id],
    );

    return NextResponse.json({ card: createdCardRes.results[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to create card:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
