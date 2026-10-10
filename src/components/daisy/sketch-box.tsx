"use client";

import React, { useState } from "react";
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
  ExternalLink,
  ImageIcon,
  MessageSquare,
  Send,
  XCircle,
} from "lucide-react";
import { orpc } from "@/lib/daisy/orpc/client";
import type { DaisyComment, DaisySketch } from "@/lib/daisy/types";

interface SketchBoxProps {
  sketch: DaisySketch;
  comments?: DaisyComment[];
  groupInfo?: {
    index: number;
    total: number;
  } | null;
}

export function SketchBox({ sketch, comments = [], groupInfo }: SketchBoxProps) {
  const router = useRouter();
  const [isChoosing, setIsChoosing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const handleChoose = async () => {
    if (sketch.status !== "proposed") return;
    try {
      setIsChoosing(true);
      await orpc.daisy.chooseSketch({ sketchId: sketch.id });
      toast.success(`Chosen sketch: ${sketch.label}`);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to choose sketch";
      toast.error(message);
    } finally {
      setIsChoosing(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;

    try {
      setIsSubmittingComment(true);
      await orpc.daisy.addComment({
        sketchId: sketch.id,
        body: text,
      });
      setCommentText("");
      toast.success("Comment added");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add comment";
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
    <Card
      data-testid="sketch-box"
      className={`my-3.5 border transition-all ${
        sketch.status === "chosen"
          ? "border-emerald-500/40 bg-emerald-500/[0.02] shadow-sm"
          : sketch.status === "rejected"
          ? "border-border/60 opacity-80 bg-muted/20"
          : "border-pink-500/30 bg-card hover:border-pink-500/50"
      }`}
    >
      <CardHeader className="p-3.5 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs uppercase font-semibold">
              {sketch.kind}
            </Badge>
            {groupInfo && groupInfo.total > 1 && (
              <span className="text-xs font-medium text-muted-foreground">
                Option {groupInfo.index} of {groupInfo.total}
              </span>
            )}
            <span className="font-semibold text-sm text-foreground">
              {sketch.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
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

      <CardContent className="p-3.5 pt-1 space-y-3">
        {/* Sketch visual content: plain <img> or link */}
        {isHttpsImage ? (
          <div className="overflow-hidden rounded-md border border-border/70 bg-muted/40">
            {/* Plain <img> as specified in requirements */}
            <img
              src={sketch.imageUrl!}
              alt={sketch.label}
              className="max-h-80 w-full object-contain"
              loading="lazy"
            />
          </div>
        ) : isHttpsUrl ? (
          <div className="rounded-md border border-border p-3 bg-muted/30">
            <a
              href={sketch.url!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View sketch design: {sketch.label}
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-xs text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span>Sketch details: {sketch.label}</span>
          </div>
        )}

        {/* Pinned Comments List */}
        {comments.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border/60">
            <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              <span>Comments ({comments.length})</span>
            </div>
            <div className="space-y-1.5">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  data-testid="sketch-comment"
                  className="rounded bg-muted/60 px-2.5 py-1.5 text-xs text-foreground border border-border/40"
                >
                  <p className="whitespace-pre-wrap">{comment.body}</p>
                  <span className="text-[10px] text-muted-foreground">
                    {comment.createdAt
                      ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Small comment form */}
      <CardFooter className="p-3.5 pt-0">
        <form onSubmit={handleAddComment} className="flex w-full items-center gap-2">
          <Input
            data-testid="comment-input"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={`Comment on "${sketch.label}"...`}
            className="h-8 text-xs"
            disabled={isSubmittingComment}
          />
          <Button
            data-testid="comment-submit"
            type="submit"
            size="sm"
            disabled={isSubmittingComment || !commentText.trim()}
            className="h-8 px-2.5 text-xs shrink-0"
          >
            <Send className="h-3 w-3 mr-1" />
            {isSubmittingComment ? "..." : "Send"}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
