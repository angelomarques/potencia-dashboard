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
    const { cardId, toColumnId, toPosition } = body || {};

    if (!cardId || typeof cardId !== "string") {
      return NextResponse.json({ error: "Card ID is required" }, { status: 400 });
    }

    if (!toColumnId || typeof toColumnId !== "string") {
      return NextResponse.json({ error: "Destination column ID is required" }, { status: 400 });
    }

    if (toPosition === undefined || typeof toPosition !== "number" || toPosition < 0) {
      return NextResponse.json({ error: "Valid destination position is required" }, { status: 400 });
    }

    // Check card
    const cardRes = await d1Query<{ id: string; column_id: string; position: number }>(
      "SELECT id, column_id, position FROM cards WHERE id = ? LIMIT 1",
      [cardId],
    );
    if (!cardRes.results || cardRes.results.length === 0) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    const card = cardRes.results[0];
    const fromColumnId = card.column_id;
    const fromPosition = card.position;

    // Check destination column
    const colRes = await d1Query("SELECT id FROM columns WHERE id = ? LIMIT 1", [toColumnId]);
    if (!colRes.results || colRes.results.length === 0) {
      return NextResponse.json({ error: "Destination column not found" }, { status: 404 });
    }

    const now = Date.now();

    if (fromColumnId === toColumnId) {
      // Reordering within the same column
      if (fromPosition !== toPosition) {
        if (fromPosition < toPosition) {
          // Card moved downward: shift items in between up
          await d1Query(
            `UPDATE cards
             SET position = position - 1
             WHERE column_id = ? AND position > ? AND position <= ? AND id != ?`,
            [toColumnId, fromPosition, toPosition, cardId],
          );
        } else {
          // Card moved upward: shift items in between down
          await d1Query(
            `UPDATE cards
             SET position = position + 1
             WHERE column_id = ? AND position >= ? AND position < ? AND id != ?`,
            [toColumnId, toPosition, fromPosition, cardId],
          );
        }

        await d1Query(
          "UPDATE cards SET position = ?, updated_at = ? WHERE id = ?",
          [toPosition, now, cardId],
        );
      }
    } else {
      // Moving across different columns
      // 1. Shift remaining cards in source column
      await d1Query(
        "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
        [fromColumnId, fromPosition],
      );

      // 2. Open up slot in target column
      await d1Query(
        "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ?",
        [toColumnId, toPosition],
      );

      // 3. Move the card to new column & position
      await d1Query(
        "UPDATE cards SET column_id = ?, position = ?, updated_at = ? WHERE id = ?",
        [toColumnId, toPosition, now, cardId],
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to move card:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
