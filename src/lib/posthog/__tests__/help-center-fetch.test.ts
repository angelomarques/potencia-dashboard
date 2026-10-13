import { afterEach, describe, expect, it, vi } from "vitest";

const originalKey = process.env.POSTHOG_PERSONAL_API_KEY;
const originalProject = process.env.POSTHOG_PROJECT_ID;
const originalUiHost = process.env.NEXT_PUBLIC_POSTHOG_UI_HOST;

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.POSTHOG_PERSONAL_API_KEY;
  } else {
    process.env.POSTHOG_PERSONAL_API_KEY = originalKey;
  }
  if (originalProject === undefined) {
    delete process.env.POSTHOG_PROJECT_ID;
  } else {
    process.env.POSTHOG_PROJECT_ID = originalProject;
  }
  if (originalUiHost === undefined) {
    delete process.env.NEXT_PUBLIC_POSTHOG_UI_HOST;
  } else {
    process.env.NEXT_PUBLIC_POSTHOG_UI_HOST = originalUiHost;
  }
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("fetchHelpCenterMessages", () => {
  it("returns missing_credentials without querying PostHog", async () => {
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    delete process.env.POSTHOG_PROJECT_ID;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchHelpCenterMessages } = await import("../help-center");
    const result = await fetchHelpCenterMessages();

    expect(result.status).toBe("missing_credentials");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts timestamp-bounded HogQL with exact event names and groups rows", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test_secret";
    process.env.POSTHOG_PROJECT_ID = "12345";
    process.env.NEXT_PUBLIC_POSTHOG_UI_HOST = "https://us.posthog.com";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/event_definitions/")) {
        return new Response(
          JSON.stringify({
            results: [{ name: "lawa_help_center_submitted" }],
            next: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query?: { query?: string };
      };
      expect(body.query?.query).toContain("PREWHERE timestamp >= now() - INTERVAL 365 DAY");
      expect(body.query?.query).toContain("event IN (");
      expect(body.query?.query).toContain("lawa_help_center_submitted");
      expect(body.query?.query).not.toMatch(
        /FROM events WHERE endsWith\(event, '_help_center_submitted'\)/
      );

      return new Response(
        JSON.stringify({
          columns: [
            "event",
            "distinct_id",
            "timestamp",
            "email",
            "message",
            "accountEmail",
          ],
          results: [
            [
              "lw_help_center_submitted",
              "user-1",
              "2026-10-01T12:00:00.000Z",
              "a@example.com",
              "Need help with Lawa",
              "acct@example.com",
            ],
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchHelpCenterMessages } = await import("../help-center");
    const result = await fetchHelpCenterMessages();

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.totalCount).toBe(1);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.project).toBe("lw");
    expect(result.groups[0]?.messages[0]?.message).toBe("Need help with Lawa");
    expect(fetchMock).toHaveBeenCalled();
  });
});
