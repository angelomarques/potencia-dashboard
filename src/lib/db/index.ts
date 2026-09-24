import { drizzle, type AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";
import { d1Query } from "./d1-http";
import * as schema from "./schema";

/**
 * Drizzle over D1 HTTP (sqlite-proxy). Compatible with Vercel Node runtime.
 * Returns rows as values mapped to schema columns.
 */
const proxy: AsyncRemoteCallback = async (sql, params, method) => {
  const { results } = await d1Query<Record<string, unknown>>(sql, params);

  if (method === "run") {
    return { rows: [] };
  }

  const rows = results.map((row) => Object.values(row));

  if (method === "get") {
    return { rows: rows[0] as unknown[] };
  }

  return { rows };
};

export const db = drizzle(proxy, { schema, logger: false });

export { schema };
export { d1Query, d1Batch } from "./d1-http";
