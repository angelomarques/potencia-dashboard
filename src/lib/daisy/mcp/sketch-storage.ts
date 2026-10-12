import { putR2Object } from "@/lib/r2/client";
import { r2Configured } from "@/lib/r2/config";

export const DEFAULT_SKETCH_BUCKET = "daisy-sketches";
export const DEFAULT_SKETCH_PUBLIC_BASE = "https://pub-e166bf4d036c4ac2b730b8ad9f9deb02.r2.dev";
export const MAX_SKETCH_BYTES = 10 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export function sketchStorageConfig() {
  return {
    bucket: process.env.DAISY_SKETCH_R2_BUCKET?.trim() || DEFAULT_SKETCH_BUCKET,
    publicBase: (process.env.DAISY_SKETCH_PUBLIC_BASE_URL?.trim() || DEFAULT_SKETCH_PUBLIC_BASE).replace(/\/$/, ""),
    /** Cloudflare API token with R2 write on the sketch bucket (preferred; S3 keys are the fallback). */
    cfApiToken: process.env.DAISY_SKETCH_CF_API_TOKEN?.trim() || undefined,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || process.env.R2_ACCOUNT_ID?.trim() || undefined,
    get configured() {
      return Boolean(this.cfApiToken && this.accountId) || r2Configured();
    },
  };
}

const segment = (s: string, fallback: string) =>
  s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 120) || fallback;

/** Key pattern: <project>/<round>/<file> */
export function sketchKey(input: { projectId: string; round: string; filename: string }): string {
  return `${segment(input.projectId, "project")}/${segment(input.round, "round")}/${segment(input.filename, "sketch")}`;
}

export function decodeBase64Image(data: string, mimeHint?: string): { bytes: Buffer; mime: string } {
  let b64 = data.trim();
  let mime = mimeHint?.toLowerCase();
  const m = b64.match(/^data:([^;,]+);base64,([\s\S]*)$/);
  if (m) {
    mime = m[1].toLowerCase();
    b64 = m[2];
  }
  if (!mime || !EXT_BY_MIME[mime]) throw new Error(`unsupported_content_type: ${mime ?? "unknown"} (png, jpeg, webp, gif, svg)`);
  if (!/^[A-Za-z0-9+/=\s_-]+$/.test(b64)) throw new Error("invalid_base64");
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length === 0) throw new Error("empty_image");
  if (bytes.length > MAX_SKETCH_BYTES) throw new Error(`image_too_large: ${bytes.length} bytes > 10MB`);
  return { bytes, mime };
}

export function withExtension(filename: string, mime: string): string {
  const ext = EXT_BY_MIME[mime];
  return /\.[a-z0-9]{2,5}$/i.test(filename) ? filename : `${filename}.${ext}`;
}

export type UploadSketchImage = (input: {
  projectId: string;
  round: string;
  filename: string;
  bytes: Buffer;
  mime: string;
}) => Promise<{ key: string; url: string }>;

export const uploadSketchImage: UploadSketchImage = async (input) => {
  const cfg = sketchStorageConfig();
  if (!cfg.configured) throw new Error("r2_not_configured");
  const key = sketchKey({ ...input, filename: withExtension(input.filename, input.mime) });
  if (cfg.cfApiToken && cfg.accountId) {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/r2/buckets/${encodeURIComponent(cfg.bucket)}/objects/${key.split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${cfg.cfApiToken}`, "Content-Type": input.mime },
        body: new Uint8Array(input.bytes),
      }
    );
    if (!res.ok) throw new Error(`r2_put_failed: ${res.status}`);
  } else await putR2Object({
    bucket: cfg.bucket,
    key,
    body: input.bytes,
    contentType: input.mime,
    contentLength: input.bytes.length,
  });
  return { key, url: `${cfg.publicBase}/${key.split("/").map(encodeURIComponent).join("/")}` };
};
