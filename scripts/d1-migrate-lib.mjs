// Shared helpers for D1 migration scripts (also used by tests).

/** Split a migration file into statements (strips full-line `--` comments). */
export function splitSql(raw) {
  const noLineComments = raw
    .split("\n")
    .map((line) => (line.trim().startsWith("--") ? "" : line))
    .join("\n");
  return noLineComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** True if a CREATE TABLE statement declares PRIMARY KEY (project_id, id). */
export function hasCompositePk(tableSql) {
  return (
    typeof tableSql === "string" &&
    (/PRIMARY\s+KEY\s*\([^)]*project_id[^)]*id/i.test(tableSql) ||
      /PRIMARY\s+KEY\s*\([^)]*id[^)]*project_id/i.test(tableSql))
  );
}

/**
 * Build the D1 HTTP batch body: an array of { sql, params } sent in ONE
 * request to /query. D1 executes a batch as a single transaction, so a
 * failure rolls back every statement in it.
 */
export function toBatchBody(statements) {
  return statements.map((s) => ({ sql: s + ";", params: [] }));
}

/** Drops leftovers of a partially applied 0004 (child first). */
export const LEFTOVER_CLEANUP = [
  "DROP TABLE IF EXISTS daisy_comments_new",
  "DROP TABLE IF EXISTS daisy_sketches_new",
];
