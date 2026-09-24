"use client";

import React, { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { CardDialog } from "./card-dialog";
import {
  type KanbanBoardData,
  type KanbanColumnData,
  type KanbanCardData,
  type CardPriority,
} from "@/types/kanban";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Filter, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface KanbanBoardProps {
  board: KanbanBoardData;
  initialColumns: KanbanColumnData[];
  initialCards: KanbanCardData[];
}

export function KanbanBoard({
  board,
  initialColumns,
  initialCards,
}: KanbanBoardProps) {
  const [columns] = useState<KanbanColumnData[]>(initialColumns);
  const [cards, setCards] = useState<KanbanCardData[]>(initialCards);
  const [activeCard, setActiveCard] = useState<KanbanCardData | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<KanbanCardData | null>(null);
  const [targetColumnId, setTargetColumnId] = useState<string>(
    initialColumns[0]?.id || "",
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Setup sensors with pointer distance constraint to distinguish drag vs click
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Refresh board data from API
  const refreshBoard = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/boards/lawa", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to refresh");
      const data = await res.json();
      if (data.cards) {
        setCards(data.cards);
        toast.success("Board synced with Cloudflare D1");
      }
    } catch {
      toast.error("Could not sync board data");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Helper: map of column ID -> list of cards in that column
  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const matchesSearch =
        searchQuery === "" ||
        card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (card.description &&
          card.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesPriority =
        priorityFilter === "all" ||
        card.priority?.toLowerCase() === priorityFilter.toLowerCase();

      return matchesSearch && matchesPriority;
    });
  }, [cards, searchQuery, priorityFilter]);

  const cardsByColumn = useMemo(() => {
    const map: Record<string, KanbanCardData[]> = {};
    columns.forEach((col) => {
      map[col.id] = [];
    });
    filteredCards.forEach((card) => {
      if (!map[card.column_id]) {
        map[card.column_id] = [];
      }
      map[card.column_id].push(card);
    });
    // Ensure cards are sorted by position
    Object.keys(map).forEach((colId) => {
      map[colId].sort((a, b) => a.position - b.position);
    });
    return map;
  }, [columns, filteredCards]);

  // Find which column a card or droppable ID belongs to
  const findColumnId = (id: string | null): string | null => {
    if (!id) return null;
    // Check if id is a column id
    if (columns.some((c) => c.id === id)) return id;
    // Check if id is a card id
    const foundCard = cards.find((c) => c.id === id);
    return foundCard ? foundCard.column_id : null;
  };

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const card = cards.find((c) => c.id === active.id);
    if (card) {
      setActiveCard(card);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeColumnId = findColumnId(activeId);
    const overColumnId = findColumnId(overId);

    if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) {
      return;
    }

    // Move card across columns optimistically during drag over
    setCards((prevCards) => {
      const activeCardIndex = prevCards.findIndex((c) => c.id === activeId);
      if (activeCardIndex === -1) return prevCards;

      const updated = [...prevCards];
      const activeItem = { ...updated[activeCardIndex], column_id: overColumnId };

      // Determine insert index in target column
      const overCards = updated.filter((c) => c.column_id === overColumnId && c.id !== activeId);
      const overIndex = overCards.findIndex((c) => c.id === overId);

      let newPosition: number;
      if (overIndex !== -1) {
        newPosition = overIndex;
      } else {
        newPosition = overCards.length;
      }

      activeItem.position = newPosition;
      updated[activeCardIndex] = activeItem;

      // Re-index target column
      let pos = 0;
      return updated.map((c) => {
        if (c.column_id === overColumnId) {
          return { ...c, position: pos++ };
        }
        return c;
      });
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const targetColumn = findColumnId(overId);
    if (!targetColumn) return;

    // Find the target card index
    const columnCards = cards
      .filter((c) => c.column_id === targetColumn)
      .sort((a, b) => a.position - b.position);

    const activeIndex = columnCards.findIndex((c) => c.id === activeId);
    let overIndex = columnCards.findIndex((c) => c.id === overId);

    if (overIndex === -1) {
      // Dropped on empty column container
      overIndex = columnCards.length > 0 ? columnCards.length - 1 : 0;
    }

    const previousCards = [...cards];

    let reorderedColumnCards: KanbanCardData[];
    if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
      reorderedColumnCards = arrayMove(columnCards, activeIndex, overIndex);
    } else {
      reorderedColumnCards = columnCards;
    }

    // Re-assign sequential positions
    const finalCards = cards.map((c) => {
      if (c.column_id === targetColumn) {
        const idx = reorderedColumnCards.findIndex((item) => item.id === c.id);
        if (idx !== -1) {
          return { ...c, position: idx };
        }
      }
      return c;
    });

    setCards(finalCards);

    // Call API to persist card move
    try {
      const res = await fetch("/api/cards/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: activeId,
          toColumnId: targetColumn,
          toPosition: Math.max(0, overIndex),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save move");
      }
    } catch {
      toast.error("Failed to move card. Reverting changes.");
      setCards(previousCards);
    }
  };

  // Card Operations: Create / Edit / Delete
  const handleOpenCreateDialog = (columnId?: string) => {
    setEditingCard(null);
    setTargetColumnId(columnId || columns[0]?.id || "");
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (card: KanbanCardData) => {
    setEditingCard(card);
    setTargetColumnId(card.column_id);
    setDialogOpen(true);
  };

  const handleSaveCard = async (cardData: {
    id?: string;
    title: string;
    description: string;
    priority: CardPriority;
    columnId: string;
  }) => {
    if (cardData.id) {
      // Edit mode
      const res = await fetch(`/api/cards/${cardData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cardData.title,
          description: cardData.description,
          priority: cardData.priority,
          columnId: cardData.columnId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to update card");
      }

      const { card: updatedCard } = await res.json();
      setCards((prev) =>
        prev.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
      );
      toast.success("Card updated successfully");
    } else {
      // Create mode
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cardData.title,
          description: cardData.description,
          priority: cardData.priority,
          columnId: cardData.columnId,
          boardId: board.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to create card");
      }

      const { card: createdCard } = await res.json();
      setCards((prev) => [...prev, createdCard]);
      toast.success("Card created successfully");
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    const previousCards = [...cards];
    setCards((prev) => prev.filter((c) => c.id !== cardId));

    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Card deleted");
    } catch {
      toast.error("Failed to delete card");
      setCards(previousCards);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-[calc(100vh-4rem)] overflow-hidden">
      {/* Board Controls Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-6 py-3 border-b border-border/60 bg-background/60 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search cards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>

          {/* Priority filter */}
          <div className="w-36">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-9 text-xs">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs h-7 px-2.5 text-muted-foreground font-normal">
            {cards.length} {cards.length === 1 ? "task" : "tasks"}
          </Badge>

          <Button
            variant="outline"
            size="sm"
            onClick={refreshBoard}
            disabled={isRefreshing}
            className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            title="Sync with D1 database"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            <span className="sr-only sm:not-sr-only sm:ml-1.5">Sync</span>
          </Button>

          <Button
            size="sm"
            onClick={() => handleOpenCreateDialog()}
            className="h-9 text-xs shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Card
          </Button>
        </div>
      </div>

      {/* Horizontal Scroll Columns Area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-muted/10">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex items-start gap-5 h-full min-w-max pb-2">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={cardsByColumn[column.id] || []}
                onAddCard={handleOpenCreateDialog}
                onEditCard={handleOpenEditDialog}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </div>

          {/* Floating Drag Overlay */}
          <DragOverlay>
            {activeCard ? (
              <KanbanCard
                card={activeCard}
                isOverlay
                onEdit={() => {}}
                onDelete={() => {}}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Card Create / Edit Modal Dialog */}
      <CardDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        columns={columns}
        initialColumnId={targetColumnId}
        card={editingCard}
        onSave={handleSaveCard}
      />
    </div>
  );
}
