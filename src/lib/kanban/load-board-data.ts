import { d1Query } from "@/lib/db/d1-http";
import type {
  KanbanBoardData,
  KanbanCardData,
  KanbanColumnData,
} from "@/types/kanban";
import type { DashboardProject } from "@/lib/projects/registry";

function defaultColumnsForBoard(boardId: string): KanbanColumnData[] {
  const prefix = boardId.replace(/^board_/, "");
  return [
    {
      id: `col_${prefix}_backlog`,
      board_id: boardId,
      name: "Backlog",
      position: 0,
      color: "#94a3b8",
      created_at: 0,
    },
    {
      id: `col_${prefix}_todo`,
      board_id: boardId,
      name: "To do",
      position: 1,
      color: "#6366f1",
      created_at: 0,
    },
    {
      id: `col_${prefix}_progress`,
      board_id: boardId,
      name: "In Progress",
      position: 2,
      color: "#3b82f6",
      created_at: 0,
    },
    {
      id: `col_${prefix}_review`,
      board_id: boardId,
      name: "Review",
      position: 3,
      color: "#f59e0b",
      created_at: 0,
    },
    {
      id: `col_${prefix}_done`,
      board_id: boardId,
      name: "Done",
      position: 4,
      color: "#22c55e",
      created_at: 0,
    },
  ];
}

export type LoadedKanbanBoard = {
  board: KanbanBoardData;
  columns: KanbanColumnData[];
  cards: KanbanCardData[];
};

export async function loadKanbanBoardForProject(
  project: DashboardProject,
): Promise<LoadedKanbanBoard> {
  const boardId = project.boardId;

  const [boardRes, colRes, cardRes] = await Promise.all([
    d1Query<KanbanBoardData>("SELECT * FROM boards WHERE id = ? LIMIT 1", [
      boardId,
    ]),
    d1Query<KanbanColumnData>(
      "SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC",
      [boardId],
    ),
    d1Query<KanbanCardData>(
      "SELECT * FROM cards WHERE board_id = ? ORDER BY position ASC, created_at ASC",
      [boardId],
    ),
  ]);

  const board = boardRes.results[0] || {
    id: boardId,
    app_id: project.appId,
    name: `${project.name} Board`,
    description: `${project.name} kanban board`,
    created_by: null,
    created_at: 0,
    updated_at: 0,
  };

  const columns =
    colRes.results && colRes.results.length > 0
      ? colRes.results
      : defaultColumnsForBoard(boardId);

  const cards = cardRes.results || [];

  return { board, columns, cards };
}
