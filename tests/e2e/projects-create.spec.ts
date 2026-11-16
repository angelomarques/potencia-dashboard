import { expect, test } from "@playwright/test";

const e2eCookie = process.env.E2E_COOKIE_HEADER?.trim();

test.describe("projects creation", () => {
  test("unauthenticated /api/projects GET and POST are rejected", async ({
    request,
  }) => {
    const getRes = await request.get("/api/projects");
    expect(getRes.status()).toBe(401);
    expect(await getRes.json()).toEqual({ error: "Unauthorized" });

    const postRes = await request.post("/api/projects", {
      data: { name: "Unauthorized Project" },
    });
    expect(postRes.status()).toBe(401);
    expect(await postRes.json()).toEqual({ error: "Unauthorized" });
  });

  test("unauthenticated /projects redirects to sign-in", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test.describe("signed-in", () => {
    test.skip(!e2eCookie, "E2E_COOKIE_HEADER not set");
    test.use({
      extraHTTPHeaders: e2eCookie ? { Cookie: e2eCookie } : {},
    });

    test("creates a new project from /projects and opens its kanban board", async ({
      page,
    }) => {
      const uniqueSuffix = Date.now().toString().slice(-6);
      const projectName = `Demo Studio ${uniqueSuffix}`;
      const expectedSlug = `demo-studio-${uniqueSuffix}`;
      const tagline = "End-to-end test workspace";

      await page.goto("/projects");
      await expect(page.getByTestId("projects-home")).toBeVisible();
      await expect(
        page.locator('[data-testid="project-card"][data-project-slug="lawa"]'),
      ).toBeVisible();

      await page.getByTestId("create-project-button").click();
      await page.getByTestId("project-name-input").fill(projectName);
      await expect(page.getByTestId("project-slug-input")).toHaveValue(
        expectedSlug,
      );
      await page.getByTestId("project-tagline-input").fill(tagline);
      await page.getByTestId("create-project-submit").click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });

      const newCard = page.locator(
        `[data-testid="project-card"][data-project-slug="${expectedSlug}"]`,
      );
      await expect(newCard).toBeVisible({ timeout: 15_000 });
      await expect(newCard).toContainText(projectName);
      await expect(newCard).toContainText(tagline);

      // Duplicate slug should show a validation error inside the dialog
      await page.getByTestId("create-project-button").click();
      await page.getByTestId("project-name-input").fill(projectName);
      await page.getByTestId("create-project-submit").click();
      await expect(page.getByTestId("create-project-error")).toContainText(
        "already exists",
      );
      await page.getByRole("button", { name: "Cancel" }).click();

      // Open the new project's kanban board and verify its default columns
      await newCard.getByRole("link", { name: /Open board/i }).click();
      await expect(page).toHaveURL(new RegExp(`/projects/${expectedSlug}$`));
      await expect(page.getByTestId("project-kanban")).toBeVisible();
      await expect(page.getByTestId("project-board-toolbar")).toContainText(
        projectName,
      );
      for (const col of ["Backlog", "To do", "In Progress", "Review", "Done"]) {
        await expect(page.getByText(col, { exact: true }).first()).toBeVisible();
      }
    });
  });
});
