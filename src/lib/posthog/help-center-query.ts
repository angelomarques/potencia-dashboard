export const HELP_CENTER_EVENT_SUFFIX = "_help_center_submitted";

/** Inbox lookback bound so events scans cannot run unbounded. */
export const HELP_CENTER_LOOKBACK_DAYS = 365;

export const HELP_CENTER_ROW_LIMIT = 200;

/** Project prefixes called out in the Help Center UI copy. */
export const KNOWN_HELP_CENTER_PROJECT_PREFIXES = ["lw", "pf", "app"] as const;

const EVENT_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

export type HelpCenterQueryKind = "HogQLQuery";

export type HelpCenterQueryPlan =
  | {
      queryKind: HelpCenterQueryKind;
      usedExactEventNames: true;
      lookbackIntervalDays: number;
      eventNames: [string, ...string[]];
      hogql: string;
    }
  | {
      queryKind: HelpCenterQueryKind;
      usedExactEventNames: false;
      lookbackIntervalDays: number;
      eventNames: [];
      hogql: string;
    };

export function isHelpCenterEventName(value: string): boolean {
  return (
    EVENT_NAME_PATTERN.test(value) && value.endsWith(HELP_CENTER_EVENT_SUFFIX)
  );
}

export function sanitizeHelpCenterEventName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (!isHelpCenterEventName(name)) return null;
  return name;
}

export function helpCenterEventNameFromPrefix(prefix: string): string {
  return `${prefix}${HELP_CENTER_EVENT_SUFFIX}`;
}

function quoteHogQlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function uniqueSanitizedEventNames(candidates: unknown[]): string[] {
  const names = new Set<string>();

  for (const prefix of KNOWN_HELP_CENTER_PROJECT_PREFIXES) {
    const seeded = sanitizeHelpCenterEventName(
      helpCenterEventNameFromPrefix(prefix)
    );
    if (seeded) names.add(seeded);
  }

  for (const candidate of candidates) {
    const sanitized = sanitizeHelpCenterEventName(candidate);
    if (sanitized) names.add(sanitized);
  }

  return [...names].sort();
}

function selectClause(): string {
  return "SELECT event, distinct_id, timestamp, properties.email AS email, properties.message AS message, properties.accountEmail AS accountEmail";
}

function buildExactEventNamesHogQl(eventNames: [string, ...string[]]): string {
  const inList = eventNames.map(quoteHogQlString).join(", ");
  return [
    selectClause(),
    "FROM events",
    `PREWHERE timestamp >= now() - INTERVAL ${HELP_CENTER_LOOKBACK_DAYS} DAY AND event IN (${inList})`,
    "ORDER BY timestamp DESC",
    `LIMIT ${HELP_CENTER_ROW_LIMIT}`,
  ].join(" ");
}

function buildFallbackHogQl(): string {
  return [
    selectClause(),
    "FROM events",
    `PREWHERE timestamp >= now() - INTERVAL ${HELP_CENTER_LOOKBACK_DAYS} DAY`,
    `WHERE endsWith(event, ${quoteHogQlString(HELP_CENTER_EVENT_SUFFIX)})`,
    "ORDER BY timestamp DESC",
    `LIMIT ${HELP_CENTER_ROW_LIMIT}`,
  ].join(" ");
}

/**
 * Builds a timestamp-bounded HogQL plan. Prefer exact `event IN (...)` so
 * ClickHouse can use the events sort key instead of scanning every event
 * with `endsWith`.
 */
export function buildHelpCenterQueryPlan(
  discoveredNames: unknown[] = []
): HelpCenterQueryPlan {
  const eventNames = uniqueSanitizedEventNames(discoveredNames);
  const first = eventNames[0];

  if (first === undefined) {
    return {
      queryKind: "HogQLQuery",
      usedExactEventNames: false,
      lookbackIntervalDays: HELP_CENTER_LOOKBACK_DAYS,
      eventNames: [],
      hogql: buildFallbackHogQl(),
    };
  }

  const names: [string, ...string[]] = [first, ...eventNames.slice(1)];
  return {
    queryKind: "HogQLQuery",
    usedExactEventNames: true,
    lookbackIntervalDays: HELP_CENTER_LOOKBACK_DAYS,
    eventNames: names,
    hogql: buildExactEventNamesHogQl(names),
  };
}

export function hogQlQueryPayload(plan: HelpCenterQueryPlan): {
  query: { kind: HelpCenterQueryKind; query: string };
  name: string;
} {
  switch (plan.usedExactEventNames) {
    case true:
      return {
        query: { kind: plan.queryKind, query: plan.hogql },
        name: "help center inbox",
      };
    case false:
      return {
        query: { kind: plan.queryKind, query: plan.hogql },
        name: "help center inbox fallback",
      };
    default: {
      const _exhaustive: never = plan;
      return _exhaustive;
    }
  }
}
