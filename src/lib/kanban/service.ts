import { d1Batch, d1Query } from "@/lib/db/d1-http";
import {
  getDashboardProjectBySlug,
  listDashboardProjects,
  type DashboardProject,
  type ProjectDbDeps,
} from "@/lib/projects/registry";
import {
  defaultColumnsForBoard,
  loadKanbanBoardForProject,
} from "@/lib/kanban/load-board-data";
import type {
  CardPriority,
  KanbanBoardData,
  KanbanCardData,
  KanbanColumnData,
} from "@/types/kanban";

export const CARD_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export class KanbanServiceError extends Error {
  status: 400 | 404;

  constructor(status: 400 | 404, message: string) {
    super(message);
    this.name = "KanbanServiceError";
    this.status = status;
  }
}

export type KanbanDbDeps = {
  query: typeof d1Query;
  batch: typeof d1Batch;
  now: () => number;
  newId: () => string;
  listProjects: (
    projectDeps?: Partial<ProjectDbDeps>,
  ) => Promise<DashboardProject[]> | DashboardProject[];
  getProjectBySlug: (
    slug: string,
    projectDeps?: Partial<ProjectDbDeps>,
  ) => Promise<DashboardProject | undefined> | DashboardProject | undefined;
  loadBoardForProject: (project: DashboardProject) => Promise<{
    board: KanbanBoardData;
    columns: KanbanColumnData[];
    cards: KanbanCardData[];
  }>;
};

function projectDepsFromKanban(deps: KanbanDbDeps): Partial<ProjectDbDeps> {
  return {
    query: deps.query,
    batch: deps.batch,
    now: deps.now,
  };
}

export const defaultKanbanDbDeps: KanbanDbDeps = {
  query: d1Query,
  batch: d1Batch,
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
  listProjects: listDashboardProjects,
  getProjectBySlug: getDashboardProjectBySlug,
  loadBoardForProject: loadKanbanBoardForProject,
};

export type EnrichedKanbanCard = KanbanCardData & {
  status_name: string;
  project_slug: string | null;
};

export type ProjectWithColumns = DashboardProject & {
  columns: KanbanColumnData[];
};

function normalizeStatusKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function projectSlugForBoard(
  boardId: string,
  projects: DashboardProject[],
): string | null {
  return projects.find((p) => p.boardId === boardId)?.slug ?? null;
}

async function getColumnsForBoard(
  boardId: string,
  deps: KanbanDbDeps,
): Promise<KanbanColumnData[]> {
  const res = await deps.query<KanbanColumnData>(
    "SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC",
    [boardId],
  );
  return res.results && res.results.length > 0
    ? res.results
    : defaultColumnsForBoard(boardId);
}

function matchColumn(
  columns: KanbanColumnData[],
  statusOrId: string,
): KanbanColumnData | undefined {
  const trimmed = statusOrId.trim();
  if (!trimmed) return undefined;

  const byId = columns.find((c) => c.id === trimmed);
  if (byId) return byId;

  const lower = trimmed.toLowerCase();
  const byExactName = columns.find((c) => c.name.trim().toLowerCase() === lower);
  if (byExactName) return byExactName;

  const normalized = normalizeStatusKey(trimmed);
  if (!normalized) return undefined;
  return columns.find((c) => normalizeStatusKey(c.name) === normalized);
}

export async function listProjectsWithColumns(
  overrides: Partial<KanbanDbDeps> = {},
): Promise<ProjectWithColumns[]> {
  const deps: KanbanDbDeps = { ...defaultKanbanDbDeps, ...overrides };
  const projects = await deps.listProjects(projectDepsFromKanban(deps));
  return Promise.all(
    projects.map(async (project) => ({
      ...project,
      columns: await getColumnsForBoard(project.boardId, deps),
    })),
  );
}

export type ListTasksInput = {
  projectSlug?: string;
  status?: string;
  priority?: CardPriority;
  search?: string;
  limit?: number;
};

export async function listTasks(
  input: ListTasksInput = {},
  overrides: Partial<KanbanDbDeps> = {},
): Promise<{
  project: DashboardProject;
  columns: KanbanColumnData[];
  tasks: EnrichedKanbanCard[];
  totalMatched: number;
}> {
  const deps: KanbanDbDeps = { ...defaultKanbanDbDeps, ...overrides };
  const slug = input.projectSlug?.trim() || "lawa";
  const project = await deps.getProjectBySlug(slug, projectDepsFromKanban(deps));
  if (!project) {
    throw new KanbanServiceError(404, `Project '${slug}' not found`);
  }

  const { columns, cards } = await deps.loadBoardForProject(project);
  const colById = new Map(columns.map((c) => [c.id, c]));

  let targetColumnId: string | undefined;
  if (input.status !== undefined && input.status.trim() !== "") {
    const matched = matchColumn(columns, input.status);
    if (!matched) {
      const valid = columns.map((c) => `'${c.name}' (${c.id})`).join(", ");
      throw new KanbanServiceError(
        400,
        `Status '${input.status}' not found on project '${project.slug}'. Valid statuses: ${valid}`,
      );
    }
    targetColumnId = matched.id;
  }

  const searchLower = input.search?.trim().toLowerCase() ?? "";
  const priorityLower = input.priority?.toLowerCase();

  const filtered = cards.filter((card) => {
    if (targetColumnId && card.column_id !== targetColumnId) return false;
    if (priorityLower && card.priority?.toLowerCase() !== priorityLower) {
      return false;
    }
    if (searchLower) {
      const inTitle = card.title.toLowerCase().includes(searchLower);
      const inDesc = card.description?.toLowerCase().includes(searchLower) ?? false;
      if (!inTitle && !inDesc) return false;
    }
    return true;
  });

  // Sort by column position, then card position, then created_at
  const sorted = [...filtered].sort((a, b) => {
    const colA = colById.get(a.column_id)?.position ?? Number.MAX_SAFE_INTEGER;
    const colB = colById.get(b.column_id)?.position ?? Number.MAX_SAFE_INTEGER;
    if (colA !== colB) return colA - colB;
    if (a.position !== b.position) return a.position - b.position;
    return a.created_at - b.created_at;
  });

  const limited =
    input.limit !== undefined && input.limit > 0
      ? sorted.slice(0, input.limit)
      : sorted;

  const tasks: EnrichedKanbanCard[] = limited.map((card) => ({
    ...card,
    status_name: colById.get(card.column_id)?.name ?? card.column_id,
    project_slug: project.slug,
  }));

  return {
    project,
    columns,
    tasks,
    totalMatched: sorted.length,
  };
}

export async function getTask(
  cardId: string,
  overrides: Partial<KanbanDbDeps> = {},
): Promise<EnrichedKanbanCard> {
  const deps: KanbanDbDeps = { ...defaultKanbanDbDeps, ...overrides };
  const trimmedId = cardId.trim();
  if (!trimmedId) {
    throw new KanbanServiceError(400, "Card ID is required");
  }

  const res = await deps.query<KanbanCardData>(
    "SELECT * FROM cards WHERE id = ? LIMIT 1",
    [trimmedId],
  );
  const card = res.results?.[0];
  if (!card) {
    throw new KanbanServiceError(404, `Card '${trimmedId}' not found`);
  }

  const columns = await getColumnsForBoard(card.board_id, deps);
  const col = columns.find((c) => c.id === card.column_id);

  return {
    ...card,
    status_name: col?.name ?? card.column_id,
    project_slug: projectSlugForBoard(
      card.board_id,
      await deps.listProjects(projectDepsFromKanban(deps)),
    ),
  };
}

export type CreateTaskInput = {
  projectSlug?: string;
  boardId?: string;
  title: string;
  description?: string | null;
  columnId?: string;
  status?: string;
  priority?: string;
  position?: "top" | "bottom";
  createdBy?: string | null;
  strictPriority?: boolean;
};

export async function createTask(
  input: CreateTaskInput,
  overrides: Partial<KanbanDbDeps> = {},
): Promise<EnrichedKanbanCard> {
  const deps: KanbanDbDeps = { ...defaultKanbanDbDeps, ...overrides };

  if (!input.title || typeof input.title !== "string" || !input.title.trim()) {
    throw new KanbanServiceError(400, "Title is required");
  }

  let boardId: string | undefined = input.boardId?.trim() || undefined;
  let projectSlug: string | null = null;

  if (input.projectSlug) {
    const project = await deps.getProjectBySlug(
      input.projectSlug.trim(),
      projectDepsFromKanban(deps),
    );
    if (!project) {
      throw new KanbanServiceError(404, `Project '${input.projectSlug}' not found`);
    }
    boardId = project.boardId;
    projectSlug = project.slug;
  }

  let targetColumn: KanbanColumnData | undefined;

  if (input.columnId) {
    const colRes = await deps.query<KanbanColumnData>(
      "SELECT * FROM columns WHERE id = ? LIMIT 1",
      [input.columnId.trim()],
    );
    const col = colRes.results?.[0];
    if (!col) {
      throw new KanbanServiceError(400, "Target column does not exist");
    }
    if (boardId && col.board_id !== boardId) {
      throw new KanbanServiceError(
        400,
        `Column '${col.id}' does not belong to board '${boardId}'`,
      );
    }
    targetColumn = col;
    boardId = col.board_id;
  } else {
    const resolvedBoardId = boardId ?? "board_lawa";
    const colRes = await deps.query<KanbanColumnData>(
      "SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC",
      [resolvedBoardId],
    );
    const columns = colRes.results || [];
    if (columns.length === 0) {
      throw new KanbanServiceError(
        400,
        `No columns found in database for board '${resolvedBoardId}'`,
      );
    }

    if (input.status && input.status.trim() !== "") {
      targetColumn = matchColumn(columns, input.status);
      if (!targetColumn) {
        const valid = columns.map((c) => `'${c.name}' (${c.id})`).join(", ");
        throw new KanbanServiceError(
          400,
          `Status '${input.status}' not found on board '${resolvedBoardId}'. Valid statuses: ${valid}`,
        );
      }
    } else {
      targetColumn =
        matchColumn(columns, "To do") ??
        matchColumn(columns, "Backlog") ??
        columns[0];
    }
    boardId = resolvedBoardId;
  }

  if (!projectSlug) {
    projectSlug = projectSlugForBoard(
      boardId,
      await deps.listProjects(projectDepsFromKanban(deps)),
    );
  }

  const rawPriority = input.priority ?? "medium";
  const isValidPriority = (CARD_PRIORITIES as readonly string[]).includes(
    rawPriority,
  );
  if (input.strictPriority && !isValidPriority) {
    throw new KanbanServiceError(
      400,
      `Invalid priority '${rawPriority}'. Expected one of: ${CARD_PRIORITIES.join(", ")}`,
    );
  }
  const cleanPriority = isValidPriority ? rawPriority : "medium";
  const cleanDesc =
    typeof input.description === "string" && input.description.trim()
      ? input.description.trim()
      : null;

  const id = `card_${deps.newId()}`;
  const now = deps.now();

  let insertPos = 0;
  if (input.position === "top") {
    insertPos = 0;
    await deps.batch([
      {
        sql: "UPDATE cards SET position = position + 1 WHERE column_id = ?",
        params: [targetColumn.id],
      },
      {
        sql: `INSERT INTO cards (
          id, column_id, board_id, title, description, position, priority, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id,
          targetColumn.id,
          boardId,
          input.title.trim(),
          cleanDesc,
          insertPos,
          cleanPriority,
          input.createdBy ?? null,
          now,
          now,
        ],
      },
    ]);
  } else {
    const posRes = await deps.query<{ next_pos: number }>(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM cards WHERE column_id = ?",
      [targetColumn.id],
    );
    insertPos = Number(posRes.results?.[0]?.next_pos ?? 0);

    await deps.query(
      `INSERT INTO cards (
        id, column_id, board_id, title, description, position, priority, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        targetColumn.id,
        boardId,
        input.title.trim(),
        cleanDesc,
        insertPos,
        cleanPriority,
        input.createdBy ?? null,
        now,
        now,
      ],
    );
  }

  const createdRes = await deps.query<KanbanCardData>(
    "SELECT * FROM cards WHERE id = ? LIMIT 1",
    [id],
  );
  const created = createdRes.results?.[0];
  if (!created) {
    throw new Error("Failed to read created card");
  }

  return {
    ...created,
    status_name: targetColumn.name,
    project_slug: projectSlug,
  };
}

export type MoveTaskInput = {
  cardId: string;
  toColumnId?: string;
  status?: string;
  toPosition?: number | "top" | "bottom";
};

export async function moveTask(
  input: MoveTaskInput,
  overrides: Partial<KanbanDbDeps> = {},
): Promise<EnrichedKanbanCard> {
  const deps: KanbanDbDeps = { ...defaultKanbanDbDeps, ...overrides };

  if (!input.cardId || typeof input.cardId !== "string" || !input.cardId.trim()) {
    throw new KanbanServiceError(400, "Card ID is required");
  }

  const cardRes = await deps.query<KanbanCardData>(
    "SELECT * FROM cards WHERE id = ? LIMIT 1",
    [input.cardId.trim()],
  );
  const card = cardRes.results?.[0];
  if (!card) {
    throw new KanbanServiceError(404, "Card not found");
  }

  const colRes = await deps.query<KanbanColumnData>(
    "SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC",
    [card.board_id],
  );
  const boardColumns = colRes.results || [];

  let destColumn: KanbanColumnData | undefined;
  if (input.toColumnId) {
    destColumn = boardColumns.find((c) => c.id === input.toColumnId!.trim());
    if (!destColumn) {
      throw new KanbanServiceError(404, "Destination column not found");
    }
  } else if (input.status) {
    destColumn = matchColumn(boardColumns, input.status);
    if (!destColumn) {
      const valid = boardColumns.map((c) => `'${c.name}' (${c.id})`).join(", ");
      throw new KanbanServiceError(
        400,
        `Status '${input.status}' not found on board '${card.board_id}'. Valid statuses: ${valid}`,
      );
    }
  } else {
    throw new KanbanServiceError(
      400,
      "Destination column ID or status name is required",
    );
  }

  const fromColumnId = card.column_id;
  const fromPosition = Number(card.position);
  const toColumnId = destColumn.id;
  const isSameColumn = fromColumnId === toColumnId;

  const countRes = await deps.query<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM cards WHERE column_id = ?",
    [toColumnId],
  );
  const destCount = Number(countRes.results?.[0]?.cnt ?? 0);

  let targetPosition: number;
  if (input.toPosition === "top") {
    targetPosition = 0;
  } else if (input.toPosition === "bottom" || input.toPosition === undefined) {
    targetPosition = isSameColumn ? Math.max(0, destCount - 1) : destCount;
  } else {
    if (typeof input.toPosition !== "number" || Number.isNaN(input.toPosition) || input.toPosition < 0) {
      throw new KanbanServiceError(400, "Valid destination position is required");
    }
    const maxAllowed = isSameColumn ? Math.max(0, destCount - 1) : destCount;
    targetPosition = Math.min(Math.floor(input.toPosition), maxAllowed);
  }

  const now = deps.now();
  const statements: { sql: string; params: unknown[] }[] = [];

  if (isSameColumn) {
    if (fromPosition !== targetPosition) {
      if (fromPosition < targetPosition) {
        statements.push({
          sql: `UPDATE cards
                SET position = position - 1
                WHERE column_id = ? AND position > ? AND position <= ? AND id != ?`,
          params: [toColumnId, fromPosition, targetPosition, card.id],
        });
      } else {
        statements.push({
          sql: `UPDATE cards
                SET position = position + 1
                WHERE column_id = ? AND position >= ? AND position < ? AND id != ?`,
          params: [toColumnId, targetPosition, fromPosition, card.id],
        });
      }
      statements.push({
        sql: "UPDATE cards SET position = ?, updated_at = ? WHERE id = ?",
        params: [targetPosition, now, card.id],
      });
    } else {
      statements.push({
        sql: "UPDATE cards SET updated_at = ? WHERE id = ?",
        params: [now, card.id],
      });
    }
  } else {
    statements.push(
      {
        sql: "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
        params: [fromColumnId, fromPosition],
      },
      {
        sql: "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ?",
        params: [toColumnId, targetPosition],
      },
      {
        sql: "UPDATE cards SET column_id = ?, position = ?, updated_at = ? WHERE id = ?",
        params: [toColumnId, targetPosition, now, card.id],
      },
    );
  }

  if (statements.length > 0) {
    await deps.batch(statements);
  }

  const updatedRes = await deps.query<KanbanCardData>(
    "SELECT * FROM cards WHERE id = ? LIMIT 1",
    [card.id],
  );
  const updated = updatedRes.results?.[0];
  if (!updated) {
    throw new Error("Failed to read moved card");
  }

  return {
    ...updated,
    status_name: destColumn.name,
    project_slug: projectSlugForBoard(
      card.board_id,
      await deps.listProjects(projectDepsFromKanban(deps)),
    ),
  };
}

export type UpdateTaskInput = {
  cardId: string;
  title?: string;
  description?: string | null;
  priority?: string;
  columnId?: string;
  status?: string;
  position?: number | "top" | "bottom";
  strictPriority?: boolean;
};

export async function updateTask(
  input: UpdateTaskInput,
  overrides: Partial<KanbanDbDeps> = {},
): Promise<EnrichedKanbanCard> {
  const deps: KanbanDbDeps = { ...defaultKanbanDbDeps, ...overrides };

  if (!input.cardId || !input.cardId.trim()) {
    throw new KanbanServiceError(400, "Card ID is required");
  }

  const existingRes = await deps.query<KanbanCardData>(
    "SELECT * FROM cards WHERE id = ? LIMIT 1",
    [input.cardId.trim()],
  );
  const existing = existingRes.results?.[0];
  if (!existing) {
    throw new KanbanServiceError(404, "Card not found");
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim()) {
      throw new KanbanServiceError(400, "Title cannot be empty");
    }
    updates.push("title = ?");
    values.push(input.title.trim());
  }

  if (input.description !== undefined) {
    updates.push("description = ?");
    values.push(
      typeof input.description === "string" && input.description.trim()
        ? input.description.trim()
        : null,
    );
  }

  if (input.priority !== undefined) {
    const isValid = (CARD_PRIORITIES as readonly string[]).includes(
      input.priority,
    );
    if (input.strictPriority && !isValid) {
      throw new KanbanServiceError(
        400,
        `Invalid priority '${input.priority}'. Expected one of: ${CARD_PRIORITIES.join(", ")}`,
      );
    }
    const cleanPriority = isValid ? input.priority : "medium";
    updates.push("priority = ?");
    values.push(cleanPriority);
  }

  if (updates.length > 0) {
    updates.push("updated_at = ?");
    values.push(deps.now(), existing.id);
    await deps.query(
      `UPDATE cards SET ${updates.join(", ")} WHERE id = ?`,
      values,
    );
  }

  const wantsMove =
    input.position !== undefined ||
    (input.columnId !== undefined &&
      input.columnId.trim() !== existing.column_id) ||
    input.status !== undefined;

  if (wantsMove) {
    let shouldMove = input.position !== undefined;
    if (!shouldMove && input.columnId && input.columnId.trim() !== existing.column_id) {
      shouldMove = true;
    }
    if (!shouldMove && input.status) {
      const boardCols = await getColumnsForBoard(existing.board_id, deps);
      const targetCol = matchColumn(boardCols, input.status);
      if (!targetCol) {
        const valid = boardCols.map((c) => `'${c.name}' (${c.id})`).join(", ");
        throw new KanbanServiceError(
          400,
          `Status '${input.status}' not found on board '${existing.board_id}'. Valid statuses: ${valid}`,
        );
      }
      if (targetCol.id !== existing.column_id) {
        shouldMove = true;
      }
    }

    if (shouldMove) {
      return moveTask(
        {
          cardId: existing.id,
          toColumnId: input.columnId ?? (input.status ? undefined : existing.column_id),
          status: input.status,
          toPosition: input.position,
        },
        deps,
      );
    }
  }

  return getTask(existing.id, deps);
}

export async function deleteTask(
  cardId: string,
  overrides: Partial<KanbanDbDeps> = {},
): Promise<{ id: string }> {
  const deps: KanbanDbDeps = { ...defaultKanbanDbDeps, ...overrides };

  if (!cardId || !cardId.trim()) {
    throw new KanbanServiceError(400, "Card ID is required");
  }

  const existingRes = await deps.query<{
    id: string;
    column_id: string;
    position: number;
  }>("SELECT id, column_id, position FROM cards WHERE id = ? LIMIT 1", [
    cardId.trim(),
  ]);
  const card = existingRes.results?.[0];
  if (!card) {
    throw new KanbanServiceError(404, "Card not found");
  }

  await deps.batch([
    { sql: "DELETE FROM cards WHERE id = ?", params: [card.id] },
    {
      sql: "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
      params: [card.column_id, card.position],
    },
  ]);

  return { id: card.id };
}
