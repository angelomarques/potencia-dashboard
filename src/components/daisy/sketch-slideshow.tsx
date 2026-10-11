"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageIcon,
  MapPin,
  MessageSquare,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { orpc } from "@/lib/daisy/orpc/client";
import type { DaisyComment, DaisySketch } from "@/lib/daisy/types";

export interface SketchSlideItem {
  sketch: DaisySketch;
  comments: DaisyComment[];
}

interface SketchSlideshowProps {
  projectId: string;
  items: SketchSlideItem[];
}

export function SketchSlideshow({ projectId, items }: SketchSlideshowProps) {
  const router = useRouter();

  // Group items by groupId (null / empty -> "ungrouped")
  const groupsMap = new Map<string, SketchSlideItem[]>();
  for (const item of items) {
    const gid = item.sketch.groupId?.trim() || "default";
    const list = groupsMap.get(gid) ?? [];
    list.push(item);
    groupsMap.set(gid, list);
  }

  const groupKeys = Array.from(groupsMap.keys());
  const [activeGroupId, setActiveGroupId] = useState<string>(
    groupKeys[0] || "default"
  );

  // Fallback to first available group if activeGroupId doesn't exist
  const effectiveGroupId = groupsMap.has(activeGroupId)
    ? activeGroupId
    : groupKeys[0] || "default";
  const currentGroupItems = groupsMap.get(effectiveGroupId) ?? [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [activePin, setActivePin] = useState<{ x: number; y: number } | null>(
    null
  );
  const [isChoosing, setIsChoosing] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const imageRef = useRef<HTMLImageElement | null>(null);

  // Clamp current index when group items change
  useEffect(() => {
    if (currentIndex >= currentGroupItems.length) {
      setCurrentIndex(Math.max(0, currentGroupItems.length - 1));
    }
  }, [currentGroupItems.length, currentIndex]);

  // Reset comment input & pin on slide change
  useEffect(() => {
    setActivePin(null);
    setCommentText("");
  }, [currentIndex, effectiveGroupId]);

  // Keyboard navigation: left/right arrows
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((prev) =>
          Math.min(currentGroupItems.length - 1, prev + 1)
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentGroupItems.length]);

  // Touch swipe handling for mobile
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        // swipe left -> next slide
        setCurrentIndex((prev) =>
          Math.min(currentGroupItems.length - 1, prev + 1)
        );
      } else {
        // swipe right -> prev slide
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      }
    }
    setTouchStartX(null);
    setTouchStartY(null);
  };

  if (items.length === 0 || currentGroupItems.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed bg-muted/20">
        <ImageIcon className="h-8 w-8 text-pink-500/50 mb-2" />
        <p className="text-sm font-medium text-foreground">No Sketches Yet</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Daisy has not uploaded design sketches for this section yet. Use the chat thread to discuss design concepts.
        </p>
      </Card>
    );
  }

  const currentItem = currentGroupItems[currentIndex] || currentGroupItems[0];
  const { sketch, comments } = currentItem;

  const handleChoose = async () => {
    if (sketch.status !== "proposed") return;
    try {
      setIsChoosing(true);
      await orpc.daisy.chooseSketch({
        sketchId: sketch.id,
        projectId: sketch.projectId || projectId,
      });
      toast.success(`Chosen sketch: ${sketch.label}`);
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to choose sketch";
      toast.error(message);
    } finally {
      setIsChoosing(false);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    // Round to 3 decimal places
    setActivePin({
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
    });
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;

    try {
      setIsSubmittingComment(true);
      await orpc.daisy.addComment({
        sketchId: sketch.id,
        projectId: sketch.projectId || projectId,
        body: text,
        x: null,
        y: null,
      });
      setCommentText("");
      setActivePin(null);
      toast.success("Comment added");
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to add comment";
      toast.error(message);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const isHttpsImage =
    sketch.imageUrl && sketch.imageUrl.startsWith("https://");
  const isHttpsUrl = sketch.url && sketch.url.startsWith("https://");

  const getStatusBadge = () => {
    switch (sketch.status) {
      case "chosen":
        return (
          <Badge
            data-testid="sketch-status"
            className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1"
          >
            <CheckCircle2 className="h-3 w-3" />
            Chosen
          </Badge>
        );
      case "rejected":
        return (
          <Badge
            data-testid="sketch-status"
            variant="outline"
            className="text-muted-foreground border-border gap-1"
          >
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      case "proposed":
      default:
        return (
          <Badge
            data-testid="sketch-status"
            variant="outline"
            className="border-pink-500/30 text-pink-600 dark:text-pink-400"
          >
            Proposed
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-3 w-full">
      {/* Group Tabs/Switcher */}
      {groupKeys.length >= 1 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-2">
          <span className="text-xs font-semibold text-muted-foreground mr-1">
            Group:
          </span>
          {groupKeys.map((gk) => {
            const count = groupsMap.get(gk)?.length || 0;
            const isSelected = gk === effectiveGroupId;
            const label = gk === "default" ? "General" : gk;
            return (
              <Button
                key={gk}
                data-testid="group-tab"
                type="button"
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setActiveGroupId(gk);
                  setCurrentIndex(0);
                }}
                className={`h-7 px-2.5 text-xs rounded-full ${
                  isSelected
                    ? "bg-pink-600 hover:bg-pink-700 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label} ({count})
              </Button>
            );
          })}
        </div>
      )}

      {/* Main Slideshow Container */}
      <Card
        data-testid="daisy-slideshow"
        className={`w-full border transition-all ${
          sketch.status === "chosen"
            ? "border-emerald-500/40 bg-card shadow-xs"
            : sketch.status === "rejected"
            ? "border-border/60 bg-card opacity-90"
            : "border-pink-500/30 bg-card hover:border-pink-500/50"
        }`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Slideshow Top Bar: Label, Counter & Prev/Next Controls */}
        <CardHeader className="p-3.5 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: Kind, Label, Group Info */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs uppercase font-semibold">
                {sketch.kind}
              </Badge>
              <span className="font-semibold text-sm text-foreground">
                {sketch.label}
              </span>
            </div>

            {/* Right: Counter, Nav Arrows, Status Badge & Choose This */}
            <div className="flex items-center gap-2">
              {/* "n / total" counter */}
              <div
                data-testid="slide-counter"
                className="text-xs font-medium text-muted-foreground px-2 py-0.5 rounded bg-muted/60"
              >
                {currentIndex + 1} / {currentGroupItems.length}
              </div>

              {/* Prev / Next Buttons */}
              <div className="flex items-center gap-0.5">
                <Button
                  data-testid="slide-prev"
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  aria-label="Previous slide"
                  className="h-7 w-7"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  data-testid="slide-next"
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setCurrentIndex((prev) =>
                      Math.min(currentGroupItems.length - 1, prev + 1)
                    )
                  }
                  disabled={currentIndex === currentGroupItems.length - 1}
                  aria-label="Next slide"
                  className="h-7 w-7"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {getStatusBadge()}

              {sketch.status === "proposed" && (
                <Button
                  data-testid="choose-sketch"
                  size="sm"
                  onClick={handleChoose}
                  disabled={isChoosing}
                  className="h-7 px-2.5 text-xs bg-pink-600 hover:bg-pink-700 text-white font-medium"
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  {isChoosing ? "Choosing..." : "Choose this"}
                </Button>
              )}
              {sketch.status === "chosen" && (
                <Button
                  data-testid="choose-sketch"
                  size="sm"
                  disabled
                  className="h-7 px-2.5 text-xs bg-emerald-600 text-white font-medium cursor-default opacity-90"
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Chosen
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Slide Visual Content */}
        <CardContent className="p-3.5 pt-1 space-y-3">
          {isHttpsImage ? (
            <div className="relative overflow-hidden rounded-md border border-border/70 bg-muted/30">
              <img
                ref={imageRef}
                src={sketch.imageUrl!}
                alt={sketch.label}
                onClick={handleImageClick}
                className="w-full max-h-[460px] object-contain cursor-crosshair select-none"
                loading="lazy"
              />

              {/* Render existing pinned comment markers */}
              {comments
                .filter((c) => c.x !== null && c.y !== null)
                .map((c, i) => (
                  <div
                    key={c.id || i}
                    style={{
                      left: `${(c.x ?? 0) * 100}%`,
                      top: `${(c.y ?? 0) * 100}%`,
                    }}
                    title={`${c.author || "Owner"}: ${c.body}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full bg-pink-600 text-white text-[10px] font-bold shadow-md ring-2 ring-white dark:ring-zinc-900 pointer-events-none"
                  >
                    {i + 1}
                  </div>
                ))}

              {/* Render active temporary pin if user clicked image */}
              {activePin && (
                <div
                  style={{
                    left: `${activePin.x * 100}%`,
                    top: `${activePin.y * 100}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white shadow-lg ring-2 ring-white animate-pulse"
                >
                  <MapPin className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ) : isHttpsUrl ? (
            <div className="rounded-md border border-border p-4 bg-muted/30 flex items-center justify-between">
              <a
                href={sketch.url!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
              >
                <ExternalLink className="h-4 w-4" />
                Open external sketch prototype: {sketch.label}
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-dashed p-6 text-xs text-muted-foreground justify-center">
              <ImageIcon className="h-5 w-5" />
              <span>Sketch visual: {sketch.label}</span>
            </div>
          )}

          {/* Active Pin Info banner if set */}
          {activePin && (
            <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded px-2.5 py-1 text-xs text-amber-700 dark:text-amber-400">
              <span className="flex items-center gap-1 font-medium">
                <MapPin className="h-3.5 w-3.5" />
                Pinned to ({Math.round(activePin.x * 100)}%,{" "}
                {Math.round(activePin.y * 100)}%)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setActivePin(null)}
                className="h-5 px-1.5 text-[11px] text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
              >
                <X className="h-3 w-3 mr-1" />
                Clear pin
              </Button>
            </div>
          )}

          {/* Dots Indicator */}
          {currentGroupItems.length > 1 && (
            <div
              data-testid="slideshow-dots"
              className="flex items-center justify-center gap-1.5 pt-1"
            >
              {currentGroupItems.map((item, idx) => (
                <button
                  key={item.sketch.id || idx}
                  type="button"
                  data-testid={`slideshow-dot-${idx}`}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentIndex
                      ? "w-6 bg-pink-600 dark:bg-pink-500"
                      : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          )}

          {/* Thumbnails Row (if > 1 slide) */}
          {currentGroupItems.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto py-1 px-0.5">
              {currentGroupItems.map((item, idx) => {
                const isSelected = idx === currentIndex;
                return (
                  <button
                    key={item.sketch.id || idx}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-left text-xs shrink-0 transition-all ${
                      isSelected
                        ? "border-pink-500 bg-pink-500/10 ring-1 ring-pink-500 text-foreground font-medium"
                        : "border-border/70 bg-card hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">
                      #{idx + 1}
                    </span>
                    <span className="max-w-[120px] truncate">
                      {item.sketch.label}
                    </span>
                    {item.sketch.status === "chosen" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    )}
                    {item.sketch.status === "rejected" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Comments Section Under Slide */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <MessageSquare className="h-3.5 w-3.5 text-pink-500" />
                <span>Comments on this slide ({comments.length})</span>
              </div>
              {isHttpsImage && (
                <span className="text-[11px] text-muted-foreground">
                  Tip: click image to pin comment at exact position
                </span>
              )}
            </div>

            {/* Thread of existing comments with author + relative time */}
            <div
              data-testid="sketch-comment-thread"
              className="space-y-1.5 max-h-56 overflow-y-auto pr-1"
            >
              {comments.length > 0 ? (
                comments.map((comment, i) => (
                  <div
                    key={comment.id || i}
                    data-testid="sketch-comment"
                    className="rounded-lg bg-muted/60 p-2.5 text-xs text-foreground border border-border/40 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        {comment.author || "Owner"}
                        {comment.x !== null && comment.y !== null && (
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1 font-normal text-pink-600 dark:text-pink-400 border-pink-500/30"
                          >
                            pinned #{i + 1}
                          </Badge>
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {comment.createdAt
                          ? formatDistanceToNow(new Date(comment.createdAt), {
                              addSuffix: true,
                            })
                          : ""}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">
                      {comment.body}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic py-1">
                  No comments on this slide yet. Add feedback below!
                </p>
              )}
            </div>
          </div>
        </CardContent>

        {/* Comment input form under slide */}
        <CardFooter className="p-3.5 pt-0 border-t border-border/40 mt-1">
          <form
            onSubmit={handleAddComment}
            className="flex w-full items-center gap-2 pt-2"
          >
            <Input
              data-testid="sketch-comment-input"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={`Comment on "${sketch.label}"...`}
              className="h-8 text-xs flex-1"
              disabled={isSubmittingComment}
            />
            <Button
              data-testid="comment-submit"
              type="submit"
              size="sm"
              disabled={isSubmittingComment || !commentText.trim()}
              className="h-8 px-3 text-xs shrink-0 bg-pink-600 hover:bg-pink-700 text-white font-medium"
            >
              <Send className="h-3 w-3 mr-1" />
              {isSubmittingComment ? "..." : "Send"}
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
