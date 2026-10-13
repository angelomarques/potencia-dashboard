import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "docs/pr-evidence/youtube-video-delete";

const fixtureVideo = {
  id: "ytvid_e2e_delete_fixture",
  title: "Delete-button fixture",
  episode: "e2e",
  status: "pending",
  privacy_status: "private",
  r2_key: "potencia-dashboard/youtube/ytch_empire_oddities/_prove/e2e.mp4",
  r2_size_bytes: 2048,
  youtube_video_id: null,
  publish_error: null,
  created_at: Date.now(),
};

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

  test("each video row shows a delete button and removing it calls DELETE", async ({
    page,
  }) => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.context().addCookies([
      {
        name: "better-auth.session_token",
        value: "e2e-middleware-only",
        domain: "localhost",
        path: "/",
      },
    ]);

    const videos = [fixtureVideo];
    let deletedId: string | null = null;

    await page.route("**/api/youtube/channels/ytch_empire_oddities", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          channel: {
            id: "ytch_empire_oddities",
            name: "Empire Oddities",
            handle: "@empire",
            token_status: "missing",
            notes: "e2e fixture",
          },
          videos,
        }),
      });
    });

    await page.route("**/api/youtube/videos/ytvid_e2e_delete_fixture", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      deletedId = "ytvid_e2e_delete_fixture";
      const idx = videos.findIndex((v) => v.id === deletedId);
      if (idx >= 0) videos.splice(idx, 1);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          videoId: "ytvid_e2e_delete_fixture",
          r2: "removed",
          r2Key: fixtureVideo.r2_key,
        }),
      });
    });

    page.on("dialog", (dialog) => {
      void dialog.accept();
    });

    await page.goto("/youtube/ytch_empire_oddities");
    const deleteBtn = page.locator('[data-feature="yt-delete-video"]').first();
    await expect(deleteBtn).toBeVisible({ timeout: 20_000 });
    await expect(deleteBtn).toContainText("Delete");
    await expect(deleteBtn).toHaveAttribute(
      "data-video-id",
      "ytvid_e2e_delete_fixture",
    );
    await page.screenshot({
      path: `${EVIDENCE_DIR}/channel-with-delete.png`,
      fullPage: true,
    });

    await deleteBtn.click();
    await expect(page.getByText("Delete-button fixture")).toHaveCount(0, {
      timeout: 10_000,
    });
    expect(deletedId).toBe("ytvid_e2e_delete_fixture");
    await page.screenshot({
      path: `${EVIDENCE_DIR}/after-delete.png`,
      fullPage: true,
    });
  });
});
