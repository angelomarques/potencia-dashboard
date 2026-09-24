import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { d1Query } from "@/lib/db/d1-http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [boardRes, colRes, cardRes] = await Promise.all([
      d1Query<Record<string, unknown>>("SELECT * FROM boards WHERE id = ? LIMIT 1", [
        "board_lawa",
      ]),
      d1Query<Record<string, unknown>>(
        "SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC",
        ["board_lawa"],
      ),
      d1Query<Record<string, unknown>>(
        "SELECT * FROM cards WHERE board_id = ? ORDER BY position ASC, created_at ASC",
        ["board_lawa"],
      ),
    ]);

    const board = boardRes.results[0];
    if (!board) {
      return NextResponse.json({ error: "Board 'board_lawa' not found" }, { status: 404 });
    }

    return NextResponse.json({
      board,
      columns: colRes.results,
      cards: cardRes.results,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch board data:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
