import "server-only";
import { d1Query } from "@/lib/db/d1-http";
import { deleteR2Object } from "@/lib/r2/client";
import { r2Configured } from "@/lib/r2/config";

export type YoutubeVideoR2Delete = "removed" | "already_absent" | "no_object";

export type YoutubeVideoDeleteResult =
  | { status: "not_found"; videoId: string }
  | {
      status: "deleted";
      videoId: string;
      r2Key: string | null;
      r2: YoutubeVideoR2Delete;
    };

type YoutubeVideoRow = {
  id: string;
  r2_key: string | null;
  r2_bucket: string | null;
};

export async function deleteYoutubeVideo(
  videoId: string,
): Promise<YoutubeVideoDeleteResult> {
  const res = await d1Query<YoutubeVideoRow>(
    "SELECT id, r2_key, r2_bucket FROM youtube_videos WHERE id = ? LIMIT 1",
    [videoId],
  );
  const row = res.results[0];
  if (!row) {
    return { status: "not_found", videoId };
  }

  const r2Key = row.r2_key?.trim() ? row.r2_key : null;
  let r2: YoutubeVideoR2Delete = "no_object";

  if (r2Key) {
    if (!r2Configured()) {
      throw new Error("R2 is not configured (CLOUDFLARE_R2_* / R2_* env)");
    }
    const deleted = await deleteR2Object(r2Key, row.r2_bucket ?? undefined);
    r2 = deleted.existed ? "removed" : "already_absent";
  }

  await d1Query("DELETE FROM youtube_upload_jobs WHERE video_id = ?", [
    videoId,
  ]);
  await d1Query("DELETE FROM youtube_videos WHERE id = ?", [videoId]);

  return { status: "deleted", videoId, r2Key, r2 };
}
