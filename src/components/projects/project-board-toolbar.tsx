import React from "react";
import Link from "next/link";
import { ChevronLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardProject } from "@/lib/projects/registry";

interface ProjectBoardToolbarProps {
  project: DashboardProject;
}

export function ProjectBoardToolbar({ project }: ProjectBoardToolbarProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-border/60 bg-background px-6 py-2.5"
      data-testid="project-board-toolbar"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Link href="/projects">
            <ChevronLeft className="h-4 w-4" />
            Projects
          </Link>
        </Button>
        <div className="h-4 w-px bg-border/80" aria-hidden />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-tight text-foreground">
            {project.name}
          </h1>
          <p className="text-[11px] text-muted-foreground leading-tight">
            {project.tagline}
          </p>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        asChild
        className="h-8 gap-1.5 text-xs shrink-0"
      >
        <Link href={`/leads?project=${project.slug}`}>
          <Send className="h-3.5 w-3.5 text-emerald-500" />
          <span>Project Leads</span>
        </Link>
      </Button>
    </div>
  );
}
