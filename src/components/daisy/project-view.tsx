"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Layers, MessageSquare, Monitor, Palette } from "lucide-react";
import { ThreadMessage } from "./thread-message";
import { GateBox } from "./gate-box";
import { ThreadComposer } from "./thread-composer";
import { PreviewPanel } from "./preview-panel";
import { SketchSlideshow, type SketchSlideItem } from "./sketch-slideshow";
import type { DaisyGate, DaisyProject, DaisyThreadItem } from "@/lib/daisy/types";

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
  // Toggle between "slideshow" and "preview" for the main display
  const [activeView, setActiveView] = useState<"slideshow" | "preview">("slideshow");

  // Extract sketch items with their comments
  const sketchItems: SketchSlideItem[] = thread
    .filter((item): item is DaisyThreadItem & { type: "sketch" } => item.type === "sketch")
    .map((item) => ({
      sketch: item.sketch,
      comments: item.comments,
    }));

  // Extract chat items (messages & gates)
  const chatItems = thread.filter(
    (item) => item.type === "message" || item.type === "gate"
  );

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

        {/* View Switcher: Slideshow vs Live Preview */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <Button
            data-testid="tab-slideshow"
            variant={activeView === "slideshow" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveView("slideshow")}
            className={`h-7 text-xs gap-1.5 ${
              activeView === "slideshow"
                ? "bg-background text-foreground shadow-xs hover:bg-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Palette className="h-3.5 w-3.5 text-pink-500" />
            <span>Slideshow</span>
            {sketchItems.length > 0 && (
              <span className="ml-0.5 rounded-full bg-pink-500/15 px-1.5 py-0.2 text-[10px] font-semibold text-pink-600 dark:text-pink-400">
                {sketchItems.length}
              </span>
            )}
          </Button>
          <Button
            data-testid="preview-toggle"
            variant={activeView === "preview" ? "default" : "ghost"}
            size="sm"
            onClick={() =>
              setActiveView((prev) => (prev === "preview" ? "slideshow" : "preview"))
            }
            className={`h-7 text-xs gap-1.5 ${
              activeView === "preview"
                ? "bg-background text-foreground shadow-xs hover:bg-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Monitor className="h-3.5 w-3.5 text-sky-500" />
            <span>Live Preview</span>
          </Button>
        </div>
      </div>

      {/* Main Layout: Slideshow/Preview on left (or top on mobile), Chat beside on lg+ (or below on mobile) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Sketch Slideshow or Live Preview */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div className={activeView === "slideshow" ? "block" : "hidden"}>
            <SketchSlideshow
              projectId={project.id}
              items={sketchItems}
            />
          </div>

          <div className={activeView === "preview" ? "block" : "hidden"}>
            <PreviewPanel
              previewUrl={project.previewUrl}
              isAllowed={isAllowedPreview}
            />
          </div>
        </div>

        {/* Right Column: Chat (Messages & Gates) beside slideshow on lg+, below on mobile */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
          {/* Chat Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-muted/20">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-pink-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Design Chat
              </h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {chatItems.length} item{chatItems.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Chat Content Area */}
          <div className="flex-1 p-4 md:p-5 overflow-y-auto min-h-[380px] max-h-[calc(100vh-280px)] space-y-2.5">
            {chatItems.length === 0 && !openGate ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <MessageSquare className="h-7 w-7 text-pink-500/50 mb-2" />
                <p className="text-sm font-medium text-foreground">Studio Thread</p>
                <p className="text-xs max-w-xs mt-1">
                  Send a message below to coordinate design work with Daisy!
                </p>
              </div>
            ) : (
              <>
                {chatItems.map((item, idx) => {
                  if (item.type === "message") {
                    return (
                      <ThreadMessage key={item.message.id || idx} message={item.message} />
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
      </div>
    </div>
  );
}
