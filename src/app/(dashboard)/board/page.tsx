import React from "react";
import { d1Query } from "@/lib/db/d1-http";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import {
  type KanbanBoardData,
  type KanbanColumnData,
  type KanbanCardData,
} from "@/types/kanban";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const [boardRes, colRes, cardRes] = await Promise.all([
    d1Query<KanbanBoardData>("SELECT * FROM boards WHERE id = ? LIMIT 1", [
      "board_lawa",
    ]),
    d1Query<KanbanColumnData>(
      "SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC",
      ["board_lawa"],
    ),
    d1Query<KanbanCardData>(
      "SELECT * FROM cards WHERE board_id = ? ORDER BY position ASC, created_at ASC",
      ["board_lawa"],
    ),
  ]);

  const board = boardRes.results[0] || {
    id: "board_lawa",
    app_id: "app_lawa",
    name: "Lawa Board",
    description: "Default Lawa kanban board",
    created_by: null,
    created_at: 0,
    updated_at: 0,
  };

  const DEFAULT_COLUMNS: KanbanColumnData[] = [
    { id: "col_lawa_backlog", board_id: "board_lawa", name: "Backlog", position: 0, color: "#94a3b8", created_at: 0 },
    { id: "col_lawa_todo", board_id: "board_lawa", name: "To do", position: 1, color: "#6366f1", created_at: 0 },
    { id: "col_lawa_progress", board_id: "board_lawa", name: "In Progress", position: 2, color: "#3b82f6", created_at: 0 },
    { id: "col_lawa_review", board_id: "board_lawa", name: "Review", position: 3, color: "#f59e0b", created_at: 0 },
    { id: "col_lawa_done", board_id: "board_lawa", name: "Done", position: 4, color: "#22c55e", created_at: 0 },
  ];

  const columns = colRes.results && colRes.results.length > 0 ? colRes.results : DEFAULT_COLUMNS;
  const cards = cardRes.results || [];

  return (
    <KanbanBoard
      board={board}
      initialColumns={columns}
      initialCards={cards}
    />
  );
}
