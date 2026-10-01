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

    const DEFAULT_COLUMNS = [
      { id: "col_lawa_backlog", board_id: "board_lawa", name: "Backlog", position: 0, color: "#94a3b8", created_at: 0 },
      { id: "col_lawa_todo", board_id: "board_lawa", name: "To do", position: 1, color: "#6366f1", created_at: 0 },
      { id: "col_lawa_progress", board_id: "board_lawa", name: "In Progress", position: 2, color: "#3b82f6", created_at: 0 },
      { id: "col_lawa_review", board_id: "board_lawa", name: "Review", position: 3, color: "#f59e0b", created_at: 0 },
      { id: "col_lawa_done", board_id: "board_lawa", name: "Done", position: 4, color: "#22c55e", created_at: 0 },
    ];

    return NextResponse.json({
      board,
      columns: colRes.results && colRes.results.length > 0 ? colRes.results : DEFAULT_COLUMNS,
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
