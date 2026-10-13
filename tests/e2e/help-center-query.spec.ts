import { expect, test } from "@playwright/test";
import {
  HELP_CENTER_EVENT_SUFFIX,
  buildHelpCenterQueryPlan,
  hogQlQueryPayload,
} from "../../src/lib/posthog/help-center-query";

test("help center HogQL is timestamp-bounded and uses exact event names", () => {
  const plan = buildHelpCenterQueryPlan(["lawa_help_center_submitted"]);

  expect(plan.usedExactEventNames).toBe(true);
  expect(plan.hogql).toContain("PREWHERE timestamp >= now() - INTERVAL 365 DAY");
  expect(plan.hogql).toContain("event IN (");
  expect(plan.hogql).toContain(`lw${HELP_CENTER_EVENT_SUFFIX}`);
  expect(plan.hogql).toContain("lawa_help_center_submitted");
  expect(plan.hogql).not.toMatch(
    /FROM events WHERE endsWith\(event, '_help_center_submitted'\)/
  );

  const payload = hogQlQueryPayload(plan);
  expect(payload.query.kind).toBe("HogQLQuery");
  expect(payload.name).toBe("help center inbox");
});

test("help center HogQL ignores unsanitized discovered names", () => {
  const plan = buildHelpCenterQueryPlan([
    "evil'; DROP TABLE events; --",
    "pageview",
  ]);

  expect(plan.hogql).not.toContain("DROP TABLE");
  expect(plan.hogql).not.toContain("pageview");
  expect(plan.eventNames.every((name) => name.endsWith(HELP_CENTER_EVENT_SUFFIX))).toBe(
    true
  );
});
