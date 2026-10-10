"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Layers, MessageSquare, Monitor, Palette } from "lucide-react";
import { ThreadMessage } from "./thread-message";
import { SketchBox } from "./sketch-box";
import { GateBox } from "./gate-box";
import { ThreadComposer } from "./thread-composer";
import { PreviewPanel } from "./preview-panel";
import type { DaisyGate, DaisyProject, DaisySketch, DaisyThreadItem } from "@/lib/daisy/types";

interface ProjectViewProps {
  project: DaisyProject;
  thread: DaisyThreadItem[];
  openGate: DaisyGate | null;
  isAllowedPreview?: boolean;
}

export function ProjectView({
  project,
  thread,
  openGate,
  isAllowedPreview,
}: ProjectViewProps) {
  // Mobile tab state: "thread" or "preview"
  const [activeTab, setActiveTab] = useState<"thread" | "preview">("thread");

  // Pre-calculate group counts and indices for sketches to display "Option N of M"
  const sketchesByGroup = new Map<string, DaisySketch[]>();
  thread.forEach((item) => {
    if (item.type === "sketch" && item.sketch.groupId) {
      const list = sketchesByGroup.get(item.sketch.groupId) || [];
      list.push(item.sketch);
      sketchesByGroup.set(item.sketch.groupId, list);
    }
  });

  const getGroupInfo = (sketch: DaisySketch) => {
    if (!sketch.groupId) return null;
    const group = sketchesByGroup.get(sketch.groupId);
    if (!group || group.length <= 1) return null;
    const index = group.findIndex((s) => s.id === sketch.id);
    return {
      index: index >= 0 ? index + 1 : 1,
      total: group.length,
    };
  };

  const hasOpenGateInThread = openGate
    ? thread.some((item) => item.type === "gate" && item.gate.id === openGate.id)
    : false;

  const isActive = project.status === "active";

  return (
    <div className="space-y-4">
      {/* Top Header & Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-muted-foreground">
            <Link href="/daisy">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Projects
            </Link>
          </Button>

          <div className="h-4 w-[1px] bg-border" />

          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-1.5">
                <Palette className="h-4 w-4 text-pink-500" />
                {project.name}
              </h1>
              <Badge
                variant={isActive ? "outline" : "secondary"}
                className={
                  isActive
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs"
                    : "text-muted-foreground text-xs"
                }
              >
                {project.status}
              </Badge>
            </div>
            {project.currentSection && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Layers className="h-3 w-3" />
                Section: <span className="font-medium text-foreground">{project.currentSection}</span>
              </p>
            )}
          </div>
        </div>

        {/* Mobile Tab Toggle buttons */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 lg:hidden">
          <Button
            variant={activeTab === "thread" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("thread")}
            className="h-7 text-xs flex-1 gap-1.5"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Thread ({thread.length})
          </Button>
          <Button
            variant={activeTab === "preview" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("preview")}
            className="h-7 text-xs flex-1 gap-1.5"
          >
            <Monitor className="h-3.5 w-3.5" />
            Preview
          </Button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Thread (Messages, Sketches, Gates) & Composer */}
        <div
          className={`lg:col-span-7 flex flex-col rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden ${
            activeTab === "thread" ? "block" : "hidden lg:flex"
          }`}
        >
          {/* Thread Content Area */}
          <div className="flex-1 p-4 md:p-5 overflow-y-auto min-h-[500px] max-h-[calc(100vh-280px)] space-y-2">
            {thread.length === 0 && !openGate ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <Palette className="h-8 w-8 text-pink-500/50 mb-2" />
                <p className="text-sm font-medium text-foreground">Studio Thread Started</p>
                <p className="text-xs max-w-sm mt-1">
                  No messages or sketches yet. Send a message below to kick off design ideas with Daisy!
                </p>
              </div>
            ) : (
              <>
                {thread.map((item, idx) => {
                  if (item.type === "message") {
                    return (
                      <ThreadMessage key={item.message.id || idx} message={item.message} />
                    );
                  }
                  if (item.type === "sketch") {
                    return (
                      <SketchBox
                        key={item.sketch.id || idx}
                        sketch={item.sketch}
                        comments={item.comments}
                        groupInfo={getGroupInfo(item.sketch)}
                      />
                    );
                  }
                  if (item.type === "gate") {
                    return (
                      <GateBox
                        key={item.gate.id || idx}
                        gate={item.gate}
                        projectId={project.id}
                      />
                    );
                  }
                  return null;
                })}

                {/* If open gate exists and not rendered within thread, render it at thread end */}
                {openGate && !hasOpenGateInThread && (
                  <GateBox gate={openGate} projectId={project.id} />
                )}
              </>
            )}
          </div>

          {/* Composer at bottom */}
          <ThreadComposer projectId={project.id} />
        </div>

        {/* Right Column: Preview Panel */}
        <div
          className={`lg:col-span-5 ${
            activeTab === "preview" ? "block" : "hidden lg:block"
          }`}
        >
          <div className="sticky top-20">
            <PreviewPanel
              previewUrl={project.previewUrl}
              isAllowed={isAllowedPreview}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
