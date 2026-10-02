#!/usr/bin/env node
/** Minimal driver — UI needs auth; prefer prove-youtube-manager for CI. */
const feature = process.argv[2] || "yt-channels-shell";
const url = process.env.VERIFY_URL || "http://localhost:43210";
console.log(`drive-features: ${feature} against ${url}`);
console.log(
  "NOTE: Browser login required. Use prove-youtube-manager for headless R2/D1 gates.",
);
process.exit(0);
