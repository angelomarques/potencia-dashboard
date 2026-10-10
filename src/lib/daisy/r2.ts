import "server-only";
import { putR2Object, presignR2GetUrl } from "@/lib/r2/client";
import { r2Configured } from "@/lib/r2/config";
import type { DaisyReference } from "./types";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export async function uploadDaisyReference(input: {
  projectId: string;
  gateId: string;
  file: File;
}): Promise<DaisyReference> {
  const mime = input.file.type.toLowerCase().split(";")[0].trim();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error(
      `Unsupported file type: ${input.file.type}. Allowed types: PNG, JPEG, WEBP, GIF`,
    );
  }

  if (input.file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size (${input.file.size} bytes) exceeds the maximum allowed size of 10MB`,
    );
  }

  const safeFilename =
    input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "_") || "reference";
  const uuid = crypto.randomUUID();
  const key = `potencia-dashboard/daisy/${input.projectId}/${input.gateId}/${uuid}-${safeFilename}`;

  const buffer = Buffer.from(await input.file.arrayBuffer());
  await putR2Object({
    key,
    body: buffer,
    contentType: mime,
    contentLength: input.file.size,
  });

  return {
    key,
    filename: input.file.name,
    contentType: mime,
    sizeBytes: input.file.size,
  };
}

export async function presignDaisyReference(
  key: string,
): Promise<string | null> {
  if (!key || !r2Configured()) {
    return null;
  }
  try {
    const res = await presignR2GetUrl({ key, expiresInSeconds: 600 });
    return res.url;
  } catch (err) {
    console.error("Failed to presign Daisy reference URL:", err);
    return null;
  }
}
