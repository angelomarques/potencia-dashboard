import React from "react";
import Link from "next/link";
import { ArrowRight, Kanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import type { DashboardProject } from "@/lib/projects/registry";

interface ProjectListProps {
  projects: DashboardProject[];
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border/80 px-6 py-12 text-center"
        data-testid="projects-empty"
      >
        <p className="text-sm font-medium text-foreground">No projects yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Create your first workspace to start organizing tasks on a kanban board.
        </p>
        <div className="mt-4 flex justify-center">
          <CreateProjectDialog />
        </div>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
      {projects.map((project) => (
        <li key={project.slug}>
          <Card
            data-testid="project-card"
            data-project-slug={project.slug}
            className="flex h-full flex-col justify-between border-border/70 transition-colors hover:border-primary/35"
          >
            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
                  aria-hidden
                >
                  <Kanban className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base font-semibold leading-tight">
                    {project.name}
                  </CardTitle>
                  {project.tagline ? (
                    <CardDescription className="mt-0.5 text-xs">
                      {project.tagline}
                    </CardDescription>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                variant="outline"
                size="sm"
                asChild
                className="h-8 w-full justify-between text-xs font-medium"
              >
                <Link href={`/projects/${project.slug}`}>
                  <span>Open board</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
