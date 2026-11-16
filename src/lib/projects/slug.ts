export const PROJECT_NAME_MAX_LENGTH = 80;
export const PROJECT_SLUG_MAX_LENGTH = 64;
export const PROJECT_TAGLINE_MAX_LENGTH = 200;

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(["new", "create"]);

export function slugifyProjectName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PROJECT_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

export function getProjectSlugError(slug: string): string | null {
  const clean = slug.trim().toLowerCase();
  if (!clean || clean.length > PROJECT_SLUG_MAX_LENGTH || !SLUG_REGEX.test(clean)) {
    return "Slug must be 1–64 characters using lowercase letters, numbers, and hyphens";
  }
  if (RESERVED_SLUGS.has(clean)) {
    return `Slug '${clean}' is reserved`;
  }
  return null;
}
