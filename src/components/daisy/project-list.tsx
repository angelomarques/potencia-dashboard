import React from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Clock, Layers, Palette, Sparkles } from "lucide-react";
import type { DaisyProject } from "@/lib/daisy/types";

interface ProjectListProps {
  projects: DaisyProject[];
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <Card className="border-dashed p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-500/10 text-pink-500 mb-4">
          <Palette className="h-6 w-6" />
        </div>
        <CardTitle className="text-lg">No Daisy Projects Yet</CardTitle>
        <CardDescription className="mt-1 max-w-md mx-auto">
          Daisy hasn&apos;t started any design projects yet. When Daisy receives a prompt or sends an inbound project event, it will appear here.
        </CardDescription>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
        const isActive = project.status === "active";
        const relativeActivity = project.lastActivityAt
          ? formatDistanceToNow(new Date(project.lastActivityAt), { addSuffix: true })
          : "recently";

        return (
          <Card
            key={project.id}
            data-testid="daisy-project-card"
            className="flex flex-col justify-between transition-all hover:border-pink-500/40 hover:shadow-sm"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="text-base font-semibold leading-tight line-clamp-1">
                    {project.name}
                  </CardTitle>
                  {project.summary ? (
                    <CardDescription className="line-clamp-2 text-xs">
                      {project.summary}
                    </CardDescription>
                  ) : (
                    <CardDescription className="text-xs text-muted-foreground/70">
                      ID: {project.id}
                    </CardDescription>
                  )}
                </div>
                <Badge
                  variant={isActive ? "outline" : "secondary"}
                  className={
                    isActive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs shrink-0"
                      : "text-muted-foreground text-xs shrink-0"
                  }
                >
                  {project.status}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-0 space-y-4">
              <div className="flex flex-col gap-1.5 text-xs text-muted-foreground border-t border-border/50 pt-3">
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                  <span className="font-medium text-foreground">Current Section:</span>
                  <span className="truncate">
                    {project.currentSection || "Overview"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                  <span>Last active: {relativeActivity}</span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                asChild
                className="w-full justify-between hover:bg-pink-500/10 hover:text-pink-600 hover:border-pink-500/30 text-xs font-medium"
              >
                <Link href={`/daisy/${project.id}`}>
                  <span>Open Studio</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
