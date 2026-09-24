"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { type KanbanCardData } from "@/types/kanban";
import { MoreHorizontal, Pencil, Trash2, GripVertical, Clock } from "lucide-react";

interface KanbanCardProps {
  card: KanbanCardData;
  onEdit: (card: KanbanCardData) => void;
  onDelete: (cardId: string) => void;
  isOverlay?: boolean;
}

const PRIORITY_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  low: {
    label: "Low",
    className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  },
  medium: {
    label: "Medium",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  high: {
    label: "High",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  urgent: {
    label: "Urgent",
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 font-medium",
  },
};

export function KanbanCard({
  card,
  onEdit,
  onDelete,
  isOverlay = false,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    disabled: isOverlay,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityInfo =
    PRIORITY_CONFIG[card.priority?.toLowerCase() || "medium"] ||
    PRIORITY_CONFIG.medium;

  const dateStr = card.created_at
    ? new Date(card.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${isDragging ? "opacity-30" : "opacity-100"}`}
    >
      <Card
        className={`p-3.5 bg-card/95 hover:bg-card border-border/80 hover:border-primary/40 transition-all shadow-sm hover:shadow-md rounded-lg ${
          isOverlay ? "rotate-2 shadow-2xl ring-2 ring-primary/40 border-primary" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          {/* Card Title & Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="flex-1 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors" />
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 h-4 border ${priorityInfo.className}`}
              >
                {priorityInfo.label}
              </Badge>
              {dateStr && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70 ml-auto">
                  <Clock className="h-2.5 w-2.5" />
                  {dateStr}
                </span>
              )}
            </div>

            <h4 className="text-sm font-medium leading-snug text-foreground text-left">
              {card.title}
            </h4>

            {card.description && (
              <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed text-left">
                {card.description}
              </p>
            )}
          </div>

          {/* Action Menu */}
          {!isOverlay && (
            <div className="flex items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    <span className="sr-only">Card actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(card);
                    }}
                    className="cursor-pointer"
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(card.id);
                    }}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
