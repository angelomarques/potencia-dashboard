export type DashboardProject = {
  slug: string;
  name: string;
  tagline: string;
  boardId: string;
  appId: string;
};

const PROJECTS: readonly DashboardProject[] = [
  {
    slug: "lawa",
    name: "Lawa",
    tagline: "Lawyer's platform",
    boardId: "board_lawa",
    appId: "app_lawa",
  },
];

const bySlug = new Map(PROJECTS.map((p) => [p.slug, p]));

export function listDashboardProjects(): DashboardProject[] {
  return [...PROJECTS];
}

export function getDashboardProjectBySlug(
  slug: string,
): DashboardProject | undefined {
  return bySlug.get(slug);
}

export function isDashboardProjectSlug(slug: string): boolean {
  return bySlug.has(slug);
}
