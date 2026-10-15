import React from "react";
import { notFound } from "next/navigation";
import { getDashboardProjectBySlug } from "@/lib/projects/registry";
import { loadKanbanBoardForProject } from "@/lib/kanban/load-board-data";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { ProjectBoardToolbar } from "@/components/projects/project-board-toolbar";

export const dynamic = "force-dynamic";

interface ProjectKanbanPageProps {
  params: Promise<{ projectSlug: string }>;
}

export default async function ProjectKanbanPage({ params }: ProjectKanbanPageProps) {
  const { projectSlug } = await params;
  const project = getDashboardProjectBySlug(projectSlug);

  if (!project) {
    notFound();
  }

  const { board, columns, cards } = await loadKanbanBoardForProject(project);

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      data-testid="project-kanban"
      data-project-slug={project.slug}
    >
      <ProjectBoardToolbar project={project} />
      <KanbanBoard
        board={board}
        initialColumns={columns}
        initialCards={cards}
        boardApiPath={`/api/boards/${project.slug}`}
      />
    </div>
  );
}
