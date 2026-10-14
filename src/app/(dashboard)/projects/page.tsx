import React from "react";
import { listDashboardProjects } from "@/lib/projects/registry";
import { ProjectList } from "@/components/projects/project-list";

export const dynamic = "force-dynamic";

export default function ProjectsHomePage() {
  const projects = listDashboardProjects();

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="border-b border-border/60 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Projects
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Select a workspace to open its kanban board.
        </p>
      </div>
      <div className="flex-1 px-6 py-5" data-testid="projects-home">
        <ProjectList projects={projects} />
      </div>
    </div>
  );
}
