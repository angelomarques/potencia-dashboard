"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type KanbanCardData, type KanbanColumnData, type CardPriority } from "@/types/kanban";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: KanbanColumnData[];
  initialColumnId?: string;
  card?: KanbanCardData | null;
  onSave: (cardData: {
    id?: string;
    title: string;
    description: string;
    priority: CardPriority;
    columnId: string;
  }) => Promise<void>;
}

interface CardFormProps {
  columns: KanbanColumnData[];
  initialColumnId?: string;
  card?: KanbanCardData | null;
  onSave: (cardData: {
    id?: string;
    title: string;
    description: string;
    priority: CardPriority;
    columnId: string;
  }) => Promise<void>;
  onClose: () => void;
}

function CardDialogForm({
  columns,
  initialColumnId,
  card,
  onSave,
  onClose,
}: CardFormProps) {
  const isEditing = Boolean(card);
  const [title, setTitle] = useState(card?.title || "");
  const [description, setDescription] = useState(card?.description || "");
  const [priority, setPriority] = useState<CardPriority>(
    (card?.priority as CardPriority) || "medium",
  );
  const [columnId, setColumnId] = useState(
    card?.column_id || initialColumnId || columns[0]?.id || "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Card title is required.");
      return;
    }
    if (!columnId) {
      toast.error("Please select a target column.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        id: card?.id,
        title: title.trim(),
        description: description.trim(),
        priority,
        columnId,
      });
      onClose();
    } catch {
      // Error is surfaced by onSave toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="card-title">Title</Label>
        <Input
          id="card-title"
          placeholder="e.g. Design onboarding flow"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="card-desc">Description</Label>
        <Textarea
          id="card-desc"
          placeholder="Add extra context, acceptance criteria, or links..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={isSubmitting}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Column</Label>
          <Select
            value={columnId}
            onValueChange={setColumnId}
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: col.color || "#94a3b8" }}
                    />
                    {col.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select
            value={priority}
            onValueChange={(val) => setPriority(val as CardPriority)}
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  Low
                </span>
              </SelectItem>
              <SelectItem value="medium">
                <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Medium
                </span>
              </SelectItem>
              <SelectItem value="high">
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  High
                </span>
              </SelectItem>
              <SelectItem value="urgent">
                <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  Urgent
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter className="pt-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !title.trim()}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Save Changes" : "Create Card"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CardDialog({
  open,
  onOpenChange,
  columns,
  initialColumnId,
  card,
  onSave,
}: CardDialogProps) {
  const isEditing = Boolean(card);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Card" : "Create Card"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update details and status for this task."
              : "Add a new task card to the Lawa kanban board."}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <CardDialogForm
            key={card ? card.id : `new-${initialColumnId || "col"}`}
            columns={columns}
            initialColumnId={initialColumnId}
            card={card}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
