import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { getDashboardProjectBySlug } from "@/lib/projects/registry";
import { loadKanbanBoardForProject } from "@/lib/kanban/load-board-data";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectSlug: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectSlug } = await context.params;
    const project = getDashboardProjectBySlug(projectSlug);

    if (!project) {
      return NextResponse.json(
        { error: `Project '${projectSlug}' not found` },
        { status: 404 },
      );
    }

    const { board, columns, cards } = await loadKanbanBoardForProject(project);

    if (!board) {
      return NextResponse.json(
        { error: `Board '${project.boardId}' not found` },
        { status: 404 },
      );
    }

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
