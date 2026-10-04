import "server-only";

export const HELP_CENTER_EVENT_SUFFIX = "_help_center_submitted";

export interface HelpCenterMessage {
  event: string;
  distinctId: string;
  timestamp: string;
  email: string | null;
  message: string | null;
  accountEmail: string | null;
  project: string;
}

export interface HelpCenterGroup {
  project: string;
  messages: HelpCenterMessage[];
}

export type HelpCenterInboxResult =
  | {
      status: "missing_credentials";
      missingEnvVars: string[];
      groups: HelpCenterGroup[];
      totalCount: 0;
    }
  | {
      status: "error";
      error: string;
      groups: HelpCenterGroup[];
      totalCount: 0;
    }
  | {
      status: "success";
      groups: HelpCenterGroup[];
      totalCount: number;
    };

/**
 * Extracts the project prefix from a help center event name.
 * Rule: Substring before suffix `_help_center_submitted`.
 * E.g., `lw_help_center_submitted` -> `lw`
 */
export function extractProjectPrefix(eventName: string): string {
  if (eventName.endsWith(HELP_CENTER_EVENT_SUFFIX)) {
    return eventName.slice(0, -HELP_CENTER_EVENT_SUFFIX.length);
  }
  return eventName;
}

/**
 * Normalizes host URL by ensuring https:// protocol and stripping trailing slashes.
 */
function normalizeHostUrl(url: string): string {
  let cleaned = url.trim();
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }
  return cleaned.replace(/\/+$/, "");
}

/**
 * Resolves the PostHog API host to query:
 * - NEXT_PUBLIC_POSTHOG_UI_HOST is the preferred API host (e.g. https://us.posthog.com)
 * - NEXT_PUBLIC_POSTHOG_HOST is the ingest host; if UI host is unset, map:
 *     us.i.posthog.com -> https://us.posthog.com
 *     eu.i.posthog.com -> https://eu.posthog.com
 *   otherwise use this host
 * - If neither is set, fallback to default https://us.posthog.com
 */
export function resolvePostHogApiHost(): string {
  const uiHost = process.env.NEXT_PUBLIC_POSTHOG_UI_HOST?.trim();
  if (uiHost) {
    return normalizeHostUrl(uiHost);
  }

  const ingestHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  if (ingestHost) {
    if (ingestHost.includes("us.i.posthog.com")) {
      return "https://us.posthog.com";
    }
    if (ingestHost.includes("eu.i.posthog.com")) {
      return "https://eu.posthog.com";
    }
    return normalizeHostUrl(ingestHost);
  }

  return "https://us.posthog.com";
}

/**
 * Parses a single row from PostHog's HogQL response into a HelpCenterMessage.
 * Supports both tuple arrays (standard HogQL API format) and objects.
 */
export function parseHelpCenterRow(
  row: unknown,
  columns?: string[]
): HelpCenterMessage | null {
  if (!row) return null;

  let event = "";
  let distinctId = "";
  let timestamp = "";
  let email: string | null = null;
  let message: string | null = null;
  let accountEmail: string | null = null;

  if (Array.isArray(row)) {
    let eventIdx = 0;
    let distinctIdIdx = 1;
    let timestampIdx = 2;
    let emailIdx = 3;
    let messageIdx = 4;
    let accountEmailIdx = 5;

    if (columns && Array.isArray(columns)) {
      const eIdx = columns.indexOf("event");
      const dIdx = columns.indexOf("distinct_id");
      const tIdx = columns.indexOf("timestamp");
      const emIdx = columns.indexOf("email");
      const mIdx = columns.indexOf("message");
      const aIdx = columns.indexOf("accountEmail");

      if (eIdx !== -1) eventIdx = eIdx;
      if (dIdx !== -1) distinctIdIdx = dIdx;
      if (tIdx !== -1) timestampIdx = tIdx;
      if (emIdx !== -1) emailIdx = emIdx;
      if (mIdx !== -1) messageIdx = mIdx;
      if (aIdx !== -1) accountEmailIdx = aIdx;
    }

    event = row[eventIdx] != null ? String(row[eventIdx]) : "";
    distinctId = row[distinctIdIdx] != null ? String(row[distinctIdIdx]) : "";
    timestamp = row[timestampIdx] != null ? String(row[timestampIdx]) : "";
    email = row[emailIdx] != null ? String(row[emailIdx]) : null;
    message = row[messageIdx] != null ? String(row[messageIdx]) : null;
    accountEmail = row[accountEmailIdx] != null ? String(row[accountEmailIdx]) : null;
  } else if (typeof row === "object") {
    const r = row as Record<string, unknown>;
    event = r.event != null ? String(r.event) : "";
    distinctId =
      r.distinct_id != null
        ? String(r.distinct_id)
        : r.distinctId != null
        ? String(r.distinctId)
        : "";
    timestamp = r.timestamp != null ? String(r.timestamp) : "";
    email = r.email != null ? String(r.email) : null;
    message = r.message != null ? String(r.message) : null;
    accountEmail =
      r.accountEmail != null
        ? String(r.accountEmail)
        : r.account_email != null
        ? String(r.account_email)
        : null;
  } else {
    return null;
  }

  const project = extractProjectPrefix(event);

  return {
    event,
    distinctId,
    timestamp,
    email,
    message,
    accountEmail,
    project,
  };
}

/**
 * Pure function that maps rows returned by PostHog to groups by project prefix.
 * Sorts groups by prefix ascending.
 * Sorts messages inside each group newest first.
 */
export function mapRowsToGroups(
  rows: unknown[],
  columns?: string[]
): HelpCenterGroup[] {
  if (!Array.isArray(rows)) return [];

  const groupsMap = new Map<string, HelpCenterMessage[]>();

  for (const row of rows) {
    const parsed = parseHelpCenterRow(row, columns);
    if (!parsed) continue;

    const group = groupsMap.get(parsed.project);
    if (group) {
      group.push(parsed);
    } else {
      groupsMap.set(parsed.project, [parsed]);
    }
  }

  const result: HelpCenterGroup[] = [];

  for (const [project, messages] of groupsMap.entries()) {
    messages.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) {
        return timeB - timeA;
      }
      return b.timestamp.localeCompare(a.timestamp);
    });

    result.push({
      project,
      messages,
    });
  }

  result.sort((a, b) => a.project.localeCompare(b.project));

  return result;
}

/**
 * Sanitizes error messages so secret values are never printed.
 */
function sanitizeError(msg: string, secret?: string): string {
  if (!secret) return msg;
  return msg.split(secret).join("[REDACTED]");
}

/**
 * Fetches help-center messages from PostHog query endpoint (server-only).
 * Returns missing credentials state if personal key or project id is missing.
 */
export async function fetchHelpCenterMessages(): Promise<HelpCenterInboxResult> {
  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim();

  const missingEnvVars: string[] = [];
  if (!personalApiKey) missingEnvVars.push("POSTHOG_PERSONAL_API_KEY");
  if (!projectId) missingEnvVars.push("POSTHOG_PROJECT_ID");

  if (missingEnvVars.length > 0) {
    return {
      status: "missing_credentials",
      missingEnvVars,
      groups: [],
      totalCount: 0,
    };
  }

  const apiHost = resolvePostHogApiHost();
  const url = `${apiHost}/api/projects/${encodeURIComponent(projectId!)}/query/`;

  const queryPayload = {
    query: {
      kind: "HogQLQuery",
      query:
        "SELECT event, distinct_id, timestamp, properties.email AS email, properties.message AS message, properties.accountEmail AS accountEmail FROM events WHERE endsWith(event, '_help_center_submitted') ORDER BY timestamp DESC LIMIT 200",
    },
    name: "help center inbox",
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${personalApiKey}`,
      },
      body: JSON.stringify(queryPayload),
      cache: "no-store",
    });

    if (!response.ok) {
      let detail = `PostHog API returned status ${response.status} (${response.statusText})`;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson === "object") {
          if (typeof errorJson.detail === "string") {
            detail = errorJson.detail;
          } else if (typeof errorJson.error === "string") {
            detail = errorJson.error;
          } else if (typeof errorJson.message === "string") {
            detail = errorJson.message;
          }
        }
      } catch {
        // Body was not JSON
      }

      return {
        status: "error",
        error: sanitizeError(detail, personalApiKey),
        groups: [],
        totalCount: 0,
      };
    }

    const data = await response.json();
    const rows = Array.isArray(data?.results) ? data.results : [];
    const columns = Array.isArray(data?.columns) ? data.columns : undefined;
    const groups = mapRowsToGroups(rows, columns);
    const totalCount = groups.reduce((acc, g) => acc + g.messages.length, 0);

    return {
      status: "success",
      groups,
      totalCount,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to query PostHog API";
    return {
      status: "error",
      error: sanitizeError(message, personalApiKey),
      groups: [],
      totalCount: 0,
    };
  }
}
