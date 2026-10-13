import { describe, expect, it } from "vitest";
import {
  HELP_CENTER_EVENT_SUFFIX,
  HELP_CENTER_LOOKBACK_DAYS,
  HELP_CENTER_ROW_LIMIT,
  buildHelpCenterQueryPlan,
  hogQlQueryPayload,
  sanitizeHelpCenterEventName,
} from "../help-center-query";

describe("help-center HogQL plan", () => {
  it("always bounds the events scan with PREWHERE timestamp and exact event names", () => {
    const plan = buildHelpCenterQueryPlan([]);

    expect(plan.usedExactEventNames).toBe(true);
    expect(plan.lookbackIntervalDays).toBe(HELP_CENTER_LOOKBACK_DAYS);
    expect(plan.hogql).toContain("PREWHERE timestamp >= now() - INTERVAL 365 DAY");
    expect(plan.hogql).toContain("event IN (");
    expect(plan.hogql).toContain(`lw${HELP_CENTER_EVENT_SUFFIX}`);
    expect(plan.hogql).toContain(`pf${HELP_CENTER_EVENT_SUFFIX}`);
    expect(plan.hogql).toContain(`app${HELP_CENTER_EVENT_SUFFIX}`);
    expect(plan.hogql).toContain(`LIMIT ${HELP_CENTER_ROW_LIMIT}`);
    expect(plan.hogql).not.toMatch(
      /FROM events WHERE endsWith\(event, '_help_center_submitted'\)/
    );
  });

  it("merges discovered event names and drops SQL injection / non-suffix values", () => {
    const plan = buildHelpCenterQueryPlan([
      "lawa_help_center_submitted",
      "DROP TABLE events",
      "not_help_center",
      "pf_help_center_submitted'; DELETE FROM events; --",
      42,
      null,
    ]);

    expect(plan.usedExactEventNames).toBe(true);
    expect(plan.eventNames).toContain("lawa_help_center_submitted");
    expect(plan.eventNames).toContain("lw_help_center_submitted");
    expect(plan.hogql).toContain("'lawa_help_center_submitted'");
    expect(plan.hogql).not.toContain("DROP TABLE");
    expect(plan.hogql).not.toContain("DELETE FROM");
  });

  it("rejects unsanitized names", () => {
    expect(sanitizeHelpCenterEventName("lw_help_center_submitted")).toBe(
      "lw_help_center_submitted"
    );
    expect(sanitizeHelpCenterEventName("lw_help_center_submitted'; --")).toBe(
      null
    );
    expect(sanitizeHelpCenterEventName("pageview")).toBe(null);
  });

  it("builds a HogQLQuery payload from the plan", () => {
    const plan = buildHelpCenterQueryPlan(["lw_help_center_submitted"]);
    const payload = hogQlQueryPayload(plan);

    expect(payload.query.kind).toBe("HogQLQuery");
    expect(payload.query.query).toBe(plan.hogql);
    expect(payload.name).toBe("help center inbox");
  });
});
