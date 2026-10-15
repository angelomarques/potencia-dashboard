import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "docs/pr-evidence/youtube-video-delete";
const e2eCookie = process.env.E2E_COOKIE_HEADER?.trim();
const e2eVideoId = process.env.E2E_VIDEO_ID?.trim();

test.describe("yt-delete-video", () => {
  test("unauthenticated DELETE is rejected", async ({ request }) => {
    const res = await request.delete("/api/youtube/videos/ytvid_does_not_exist");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("channel page without a session redirects to sign-in", async ({
    page,
  }) => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.goto("/youtube/ytch_empire_oddities");
    await expect(page).toHaveURL(/\/sign-in/);
    await page.screenshot({
      path: `${EVIDENCE_DIR}/signed-out-redirect.png`,
      fullPage: true,
    });
  });

  test.describe("signed-in", () => {
    test.skip(
      !e2eCookie || !e2eVideoId,
      "E2E_COOKIE_HEADER / E2E_VIDEO_ID not set",
    );
    test.use({
      extraHTTPHeaders: e2eCookie ? { Cookie: e2eCookie } : {},
    });

    test("each video row has a delete button that removes the row", async ({
      page,
      request,
    }) => {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      await page.goto("/youtube/ytch_empire_oddities");
      const deleteBtn = page.locator(
        `[data-feature="yt-delete-video"][data-video-id="${e2eVideoId}"]`,
      );
      await expect(deleteBtn).toBeVisible({ timeout: 20_000 });
      await expect(deleteBtn).toContainText("Delete");
      await page.screenshot({
        path: `${EVIDENCE_DIR}/channel-with-delete.png`,
        fullPage: true,
      });

      page.once("dialog", (dialog) => {
        void dialog.accept();
      });
      await deleteBtn.click();
      await expect(deleteBtn).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByText("E2E delete target (safe)")).toHaveCount(0);

      const after = await request.delete(
        `/api/youtube/videos/${e2eVideoId}`,
        { headers: e2eCookie ? { Cookie: e2eCookie } : {} },
      );
      expect(after.status()).toBe(404);

      await page.screenshot({
        path: `${EVIDENCE_DIR}/after-delete.png`,
        fullPage: true,
      });
    });
  });
});
