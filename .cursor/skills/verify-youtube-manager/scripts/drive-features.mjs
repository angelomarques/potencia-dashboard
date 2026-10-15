#!/usr/bin/env node
/** Minimal driver — UI needs auth; prefer prove-youtube-manager for CI. */
const feature = process.argv[2] || "yt-channels-shell";
const url = process.env.VERIFY_URL || "http://localhost:43210";
console.log(`drive-features: ${feature} against ${url}`);

const known = new Set([
  "yt-channels-shell",
  "yt-channel-detail",
  "yt-upload-pending",
  "yt-dry-run-publish",
  "yt-preview-video",
  "yt-delete-video",
]);
if (!known.has(feature)) {
  console.error(`Unknown feature id: ${feature}`);
  process.exit(1);
}
if (feature === "yt-delete-video") {
  console.log(
    "yt-delete-video: UI button data-feature=yt-delete-video; headless DB+R2 via prove-youtube-manager (r2_delete + d1_delete).",
  );
}
console.log(
  "NOTE: Browser login required for UI. Use prove-youtube-manager for headless R2/D1 gates (including delete).",
);
process.exit(0);
