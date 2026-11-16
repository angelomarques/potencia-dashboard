import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CARD_PRIORITIES,
  createTask,
  defaultKanbanDbDeps,
  getTask,
  KanbanServiceError,
  listProjectsWithColumns,
  listTasks,
  moveTask,
  updateTask,
  type EnrichedKanbanCard,
  type KanbanDbDeps,
} from "@/lib/kanban/service";
import type { KanbanMcpActor } from "./tokens";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

const ok = (data: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
});

const fail = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

function formatTask(card: EnrichedKanbanCard) {
  return {
    id: card.id,
    projectSlug: card.project_slug,
    boardId: card.board_id,
    columnId: card.column_id,
    status: card.status_name,
    title: card.title,
    description: card.description,
    priority: card.priority,
    position: card.position,
    createdBy: card.created_by,
    createdAt: new Date(card.created_at).toISOString(),
    updatedAt: new Date(card.updated_at).toISOString(),
  };
}

function handleError(err: unknown): ToolResult {
  if (err instanceof KanbanServiceError) {
    return fail(`${err.message} (status ${err.status})`);
  }
  return fail(err instanceof Error ? err.message : String(err));
}

export function createKanbanMcpServer(
  actor: KanbanMcpActor,
  overrides: Partial<KanbanDbDeps> = {},
): McpServer {
  const deps: KanbanDbDeps = { ...defaultKanbanDbDeps, ...overrides };

  const server = new McpServer(
    { name: "potencia-kanban", version: "1.0.0" },
    {
      instructions:
        "Potencia Dashboard Kanban MCP. Call list_projects to see available project slugs and status columns " +
        "(e.g. 'Backlog', 'To do', 'In Progress', 'Review', 'Done'). Use list_tasks or get_task to retrieve tasks, " +
        "create_task to add new tasks, and change_task_status (or update_task) to move tasks between columns.",
    },
  );

  server.registerTool(
    "list_projects",
    {
      description:
        "List available Kanban projects (by projectSlug) along with their status columns.",
      inputSchema: {},
    },
    async () => {
      try {
        const projects = await listProjectsWithColumns(deps);
        return ok({
          projects: projects.map((p) => ({
            slug: p.slug,
            name: p.name,
            tagline: p.tagline,
            boardId: p.boardId,
            columns: p.columns.map((c) => ({
              id: c.id,
              name: c.name,
              position: c.position,
            })),
          })),
        });
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    "list_tasks",
    {
      description:
        "Retrieve Kanban tasks for a project. Supports filtering by status (column name like 'To do' / 'In Progress' or columnId), priority, and text search.",
      inputSchema: {
        projectSlug: z
          .string()
          .min(1)
          .max(64)
          .optional()
          .describe("Project slug (e.g. 'lawa'). Defaults to 'lawa'."),
        status: z
          .string()
          .min(1)
          .max(128)
          .optional()
          .describe(
            "Filter by status column name (e.g. 'Backlog', 'To do', 'In Progress', 'Review', 'Done') or columnId.",
          ),
        priority: z.enum(CARD_PRIORITIES).optional(),
        search: z
          .string()
          .max(200)
          .optional()
          .describe("Case-insensitive substring match against title or description."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Optional maximum number of tasks to return."),
      },
    },
    async (args) => {
      try {
        const result = await listTasks(args, deps);
        return ok({
          project: {
            slug: result.project.slug,
            name: result.project.name,
            boardId: result.project.boardId,
          },
          columns: result.columns.map((c) => ({
            id: c.id,
            name: c.name,
            position: c.position,
          })),
          totalMatched: result.totalMatched,
          tasks: result.tasks.map(formatTask),
        });
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    "get_task",
    {
      description: "Retrieve full details of a single Kanban task by its cardId.",
      inputSchema: {
        cardId: z.string().min(1).max(128).describe("Task / card ID (e.g. 'card_...')"),
      },
    },
    async ({ cardId }) => {
      try {
        const card = await getTask(cardId, deps);
        return ok({ task: formatTask(card) });
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    "create_task",
    {
      description:
        "Create a new Kanban task card on a project board. Defaults to the 'To do' column and 'medium' priority.",
      inputSchema: {
        projectSlug: z
          .string()
          .min(1)
          .max(64)
          .optional()
          .describe("Project slug (e.g. 'lawa'). Defaults to 'lawa'."),
        title: z.string().min(1).max(300).describe("Task title."),
        description: z.string().max(10000).optional().describe("Optional task description."),
        status: z
          .string()
          .min(1)
          .max(128)
          .optional()
          .describe(
            "Target status column name (e.g. 'Backlog', 'To do', 'In Progress', 'Review', 'Done') or columnId. Defaults to 'To do'.",
          ),
        priority: z.enum(CARD_PRIORITIES).optional().describe("Task priority. Defaults to 'medium'."),
        position: z
          .enum(["top", "bottom"])
          .optional()
          .describe("Insert at 'top' or 'bottom' of the target column. Defaults to 'bottom'."),
      },
    },
    async (args) => {
      try {
        const card = await createTask(
          {
            projectSlug: args.projectSlug ?? "lawa",
            title: args.title,
            description: args.description,
            status: args.status,
            priority: args.priority,
            position: args.position,
            createdBy: actor.userId,
            strictPriority: true,
          },
          deps,
        );
        return ok({ task: formatTask(card) });
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    "change_task_status",
    {
      description:
        "Move a Kanban task to a different status column (e.g. 'Backlog', 'To do', 'In Progress', 'Review', 'Done') and optionally position it.",
      inputSchema: {
        cardId: z.string().min(1).max(128).describe("Task / card ID to move."),
        status: z
          .string()
          .min(1)
          .max(128)
          .describe("Destination status column name (e.g. 'In Progress', 'Done') or columnId."),
        position: z
          .union([z.enum(["top", "bottom"]), z.number().int().min(0)])
          .optional()
          .describe("Optional destination position ('top', 'bottom', or 0-based index). Defaults to 'bottom'."),
      },
    },
    async ({ cardId, status, position }) => {
      try {
        const card = await moveTask(
          {
            cardId,
            status,
            toPosition: position,
          },
          deps,
        );
        return ok({ task: formatTask(card) });
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    "update_task",
    {
      description:
        "Update a Kanban task's title, description, priority, and/or status column. Unspecified fields remain unchanged.",
      inputSchema: {
        cardId: z.string().min(1).max(128).describe("Task / card ID to update."),
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(10000).nullable().optional(),
        priority: z.enum(CARD_PRIORITIES).optional(),
        status: z
          .string()
          .min(1)
          .max(128)
          .optional()
          .describe("New status column name or columnId."),
      },
    },
    async ({ cardId, title, description, priority, status }) => {
      try {
        const card = await updateTask(
          {
            cardId,
            title,
            description,
            priority,
            status,
            strictPriority: true,
          },
          deps,
        );
        return ok({ task: formatTask(card) });
      } catch (err) {
        return handleError(err);
      }
    },
  );

  return server;
}
