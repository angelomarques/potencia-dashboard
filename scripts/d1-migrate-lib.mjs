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
 * Build the D1 REST /query body for a list of statements. /query accepts ONE
 * object (never an array): { sql, params? } or { batch: [{ sql, params? }] }.
 * A multi-statement `sql` string (joined by ";") is executed by D1 as a batch,
 * i.e. one SQL transaction: if any statement fails the whole batch rolls back.
 * The response `result` array has one entry per statement, in order.
 */
export function toQueryBody(statements) {
  return { sql: statements.join(";\n") + ";" };
}

/**
 * Validate a parsed /query response and return its per-statement results.
 * Throws on HTTP error, success:false, any per-statement success:false, or a
 * result count that does not match the number of statements sent.
 */
export function assertD1Ok(res, data, expectedCount) {
  const msg =
    data?.errors?.map((e) => e?.message).filter(Boolean).join("; ") ||
    `HTTP ${res.status}`;
  if (!res.ok || !data || data.success !== true) throw new Error(`D1 query failed: ${msg}`);
  if (!Array.isArray(data.result)) throw new Error("D1 query failed: response has no result array");
  const bad = data.result.findIndex((r) => r?.success === false);
  if (bad !== -1) throw new Error(`D1 query failed at statement ${bad + 1}`);
  if (expectedCount != null && data.result.length !== expectedCount) {
    throw new Error(
      `D1 query returned ${data.result.length} results for ${expectedCount} statements`,
    );
  }
  return data.result;
}

/** POST statements to D1 /query as one single-object, multi-statement batch. */
export async function runD1Statements({ baseUrl, accountId, dbId, token }, statements) {
  const res = await fetch(`${baseUrl}/accounts/${accountId}/d1/database/${dbId}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(toQueryBody(statements)),
  });
  const data = await res.json().catch(() => null);
  return assertD1Ok(res, data, statements.length);
}

/** Drops leftovers of a partially applied 0004 (child first). */
export const LEFTOVER_CLEANUP = [
  "DROP TABLE IF EXISTS daisy_comments_new",
  "DROP TABLE IF EXISTS daisy_sketches_new",
];
