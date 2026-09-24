export type CardPriority = "low" | "medium" | "high" | "urgent";

export interface KanbanCardData {
  id: string;
  column_id: string;
  board_id: string;
  title: string;
  description: string | null;
  position: number;
  priority: CardPriority | string;
  assignee_id: string | null;
  due_date: number | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface KanbanColumnData {
  id: string;
  board_id: string;
  name: string;
  position: number;
  color: string | null;
  created_at: number;
}

export interface KanbanBoardData {
  id: string;
  app_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface FullBoardData {
  board: KanbanBoardData;
  columns: KanbanColumnData[];
  cards: KanbanCardData[];
}
