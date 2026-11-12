import { d1Batch, d1Query } from "@/lib/db/d1-http";
import { defaultColumnsForBoard } from "@/lib/kanban/load-board-data";
import {
  getProjectSlugError,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_TAGLINE_MAX_LENGTH,
  slugifyProjectName,
} from "./slug";

export { slugifyProjectName };

export type DashboardProject = {
  slug: string;
  name: string;
  tagline: string;
  boardId: string;
  appId: string;
};

export class ProjectServiceError extends Error {
  status: 400 | 409;

  constructor(status: 400 | 409, message: string) {
    super(message);
    this.name = "ProjectServiceError";
    this.status = status;
  }
}

export type ProjectDbDeps = {
  query: typeof d1Query;
  batch: typeof d1Batch;
  now: () => number;
};

export const defaultProjectDbDeps: ProjectDbDeps = {
  query: d1Query,
  batch: d1Batch,
  now: () => Date.now(),
};

type ProjectRow = {
  app_id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: number;
  board_id: string | null;
};

const SELECT_PROJECT_COLUMNS = `
  a.id AS app_id,
  a.slug AS slug,
  a.name AS name,
  a.description AS description,
  a.created_at AS created_at,
  (
    SELECT b.id
    FROM boards b
    WHERE b.app_id = a.id
    ORDER BY b.created_at ASC
    LIMIT 1
  ) AS board_id
`;

function mapRowToProject(row: ProjectRow): DashboardProject {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.description?.trim() ?? "",
    boardId: row.board_id || `board_${row.slug}`,
    appId: row.app_id,
  };
}

export function validateProjectSlug(slug: string): string {
  const clean = slug.trim().toLowerCase();
  const error = getProjectSlugError(clean);
  if (error) {
    throw new ProjectServiceError(400, error);
  }
  return clean;
}

export async function listDashboardProjects(
  overrides: Partial<ProjectDbDeps> = {},
): Promise<DashboardProject[]> {
  const deps: ProjectDbDeps = { ...defaultProjectDbDeps, ...overrides };
  const res = await deps.query<ProjectRow>(
    `SELECT ${SELECT_PROJECT_COLUMNS}
     FROM apps a
     ORDER BY a.created_at ASC, a.name ASC`,
  );
  return (res.results ?? []).map(mapRowToProject);
}

export async function getDashboardProjectBySlug(
  slug: string,
  overrides: Partial<ProjectDbDeps> = {},
): Promise<DashboardProject | undefined> {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return undefined;

  const deps: ProjectDbDeps = { ...defaultProjectDbDeps, ...overrides };
  const res = await deps.query<ProjectRow>(
    `SELECT ${SELECT_PROJECT_COLUMNS}
     FROM apps a
     WHERE a.slug = ?
     LIMIT 1`,
    [cleanSlug],
  );
  const row = res.results?.[0];
  return row ? mapRowToProject(row) : undefined;
}

export async function isDashboardProjectSlug(
  slug: string,
  overrides: Partial<ProjectDbDeps> = {},
): Promise<boolean> {
  return Boolean(await getDashboardProjectBySlug(slug, overrides));
}

export type CreateProjectInput = {
  name: string;
  slug?: string;
  tagline?: string | null;
  createdBy?: string | null;
};

export async function createDashboardProject(
  input: CreateProjectInput,
  overrides: Partial<ProjectDbDeps> = {},
): Promise<DashboardProject> {
  const deps: ProjectDbDeps = { ...defaultProjectDbDeps, ...overrides };

  const cleanName = typeof input.name === "string" ? input.name.trim() : "";
  if (!cleanName) {
    throw new ProjectServiceError(400, "Project name is required");
  }
  if (cleanName.length > PROJECT_NAME_MAX_LENGTH) {
    throw new ProjectServiceError(
      400,
      `Project name must be ${PROJECT_NAME_MAX_LENGTH} characters or fewer`,
    );
  }

  const rawSlug =
    typeof input.slug === "string" && input.slug.trim() !== ""
      ? input.slug
      : slugifyProjectName(cleanName);
  const cleanSlug = validateProjectSlug(rawSlug);

  const cleanTagline =
    typeof input.tagline === "string" ? input.tagline.trim() : "";
  if (cleanTagline.length > PROJECT_TAGLINE_MAX_LENGTH) {
    throw new ProjectServiceError(
      400,
      `Tagline must be ${PROJECT_TAGLINE_MAX_LENGTH} characters or fewer`,
    );
  }

  const existing = await deps.query<{ id: string }>(
    "SELECT id FROM apps WHERE slug = ? LIMIT 1",
    [cleanSlug],
  );
  if ((existing.results?.length ?? 0) > 0) {
    throw new ProjectServiceError(
      409,
      `A project with slug '${cleanSlug}' already exists`,
    );
  }

  const appId = `app_${cleanSlug}`;
  const boardId = `board_${cleanSlug}`;
  const now = deps.now();
  const columns = defaultColumnsForBoard(boardId);

  const statements: { sql: string; params: unknown[] }[] = [
    {
      sql: `INSERT INTO apps (id, slug, name, description, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      params: [appId, cleanSlug, cleanName, cleanTagline || null, now],
    },
    {
      sql: `INSERT INTO boards (id, app_id, name, description, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        boardId,
        appId,
        `${cleanName} Board`,
        cleanTagline || `${cleanName} kanban board`,
        input.createdBy ?? null,
        now,
        now,
      ],
    },
    ...columns.map((col) => ({
      sql: `INSERT INTO columns (id, board_id, name, position, color, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [col.id, col.board_id, col.name, col.position, col.color, now],
    })),
  ];

  try {
    await deps.batch(statements);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes("unique")) {
      throw new ProjectServiceError(
        409,
        `A project with slug '${cleanSlug}' already exists`,
      );
    }
    throw error;
  }

  return {
    slug: cleanSlug,
    name: cleanName,
    tagline: cleanTagline,
    boardId,
    appId,
  };
}
