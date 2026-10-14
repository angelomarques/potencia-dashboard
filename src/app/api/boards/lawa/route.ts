import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { getDashboardProjectBySlug } from "@/lib/projects/registry";
import { loadKanbanBoardForProject } from "@/lib/kanban/load-board-data";

export const dynamic = "force-dynamic";

/** @deprecated Prefer GET /api/boards/lawa via [projectSlug] route */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const project = getDashboardProjectBySlug("lawa");
    if (!project) {
      return NextResponse.json({ error: "Project 'lawa' not found" }, { status: 404 });
    }

    const { board, columns, cards } = await loadKanbanBoardForProject(project);

    return NextResponse.json({
      board,
      columns,
      cards,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch board data:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
