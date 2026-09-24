"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KanbanCard } from "./kanban-card";
import { type KanbanCardData, type KanbanColumnData } from "@/types/kanban";
import { Plus } from "lucide-react";

interface KanbanColumnProps {
  column: KanbanColumnData;
  cards: KanbanCardData[];
  onAddCard: (columnId: string) => void;
  onEditCard: (card: KanbanCardData) => void;
  onDeleteCard: (cardId: string) => void;
}

export function KanbanColumn({
  column,
  cards,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: "Column",
      column,
    },
  });

  const cardIds = cards.map((c) => c.id);

  return (
    <div className="flex flex-col flex-shrink-0 w-80 max-h-full rounded-xl bg-muted/40 border border-border/70 shadow-sm overflow-hidden">
      {/* Column Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-border/50 bg-background/50">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full ring-2 ring-background"
            style={{ backgroundColor: column.color || "#94a3b8" }}
          />
          <h3 className="font-semibold text-sm tracking-tight text-foreground">
            {column.name}
          </h3>
          <Badge
            variant="secondary"
            className="h-5 px-1.5 text-[11px] font-medium rounded-full bg-background/80"
          >
            {cards.length}
          </Badge>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => onAddCard(column.id)}
          title={`Add card to ${column.name}`}
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">Add card</span>
        </Button>
      </div>

      {/* Droppable Card Container */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-2.5 space-y-2.5 overflow-y-auto min-h-[160px] transition-colors ${
          isOver ? "bg-primary/5 ring-1 ring-primary/30" : ""
        }`}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onEdit={onEditCard}
              onDelete={onDeleteCard}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div
            onClick={() => onAddCard(column.id)}
            className="flex flex-col items-center justify-center p-6 border border-dashed border-border/70 rounded-lg text-center cursor-pointer hover:border-primary/40 hover:bg-background/40 transition-colors group"
          >
            <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              No tasks here yet
            </p>
            <span className="text-[11px] text-primary/80 mt-1 flex items-center gap-1 font-medium">
              <Plus className="h-3 w-3" /> Add a card
            </span>
          </div>
        )}
      </div>

      {/* Column Footer Quick Add */}
      <div className="p-2 border-t border-border/40 bg-background/30">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs text-muted-foreground hover:text-foreground h-8"
          onClick={() => onAddCard(column.id)}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add card
        </Button>
      </div>
    </div>
  );
}
