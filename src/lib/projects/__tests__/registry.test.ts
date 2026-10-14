import { describe, expect, it } from "vitest";
import {
  getDashboardProjectBySlug,
  listDashboardProjects,
} from "@/lib/projects/registry";

describe("dashboard project registry", () => {
  it("lists Lawa as the initial project", () => {
    const projects = listDashboardProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.slug).toBe("lawa");
    expect(projects[0]?.boardId).toBe("board_lawa");
  });

  it("resolves project by slug", () => {
    const lawa = getDashboardProjectBySlug("lawa");
    expect(lawa?.name).toBe("Lawa");
    expect(getDashboardProjectBySlug("unknown")).toBeUndefined();
  });
});
