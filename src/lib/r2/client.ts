import "server-only";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { readR2Config, type R2Config } from "./config";

let cached: { cfg: R2Config; client: S3Client } | null = null;

export function getR2(): { cfg: R2Config; client: S3Client } {
  if (cached) return cached;
  const cfg = readR2Config();
  const client = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  cached = { cfg, client };
  return cached;
}

export async function putR2Object(opts: {
  key: string;
  body: Buffer | Uint8Array | ReadableStream | Blob;
  contentType: string;
  contentLength?: number;
  bucket?: string;
}): Promise<{ bucket: string; key: string; sizeBytes?: number }> {
  const { cfg, client } = getR2();
  const bucket = opts.bucket ?? cfg.bucket;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.body as never,
      ContentType: opts.contentType,
      ...(opts.contentLength != null
        ? { ContentLength: opts.contentLength }
        : {}),
    }),
  );
  return { bucket, key: opts.key, sizeBytes: opts.contentLength };
}

export async function headR2Object(
  key: string,
  bucket?: string,
): Promise<{ exists: boolean; sizeBytes?: number; contentType?: string }> {
  const { cfg, client } = getR2();
  try {
    const res = await client.send(
      new HeadObjectCommand({
        Bucket: bucket ?? cfg.bucket,
        Key: key,
      }),
    );
    return {
      exists: true,
      sizeBytes: res.ContentLength,
      contentType: res.ContentType,
    };
  } catch (err: unknown) {
    const name = (err as { name?: string; $metadata?: { httpStatusCode?: number } })
      ?.name;
    const code = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    if (name === "NotFound" || code === 404) {
      return { exists: false };
    }
    throw err;
  }
}

export async function getR2ObjectBuffer(
  key: string,
  bucket?: string,
): Promise<Buffer> {
  const { cfg, client } = getR2();
  const res = await client.send(
    new GetObjectCommand({
      Bucket: bucket ?? cfg.bucket,
      Key: key,
    }),
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Empty R2 object: ${key}`);
  return Buffer.from(bytes);
}

export function youtubeMediaKey(parts: {
  channelId: string;
  videoId?: string;
  filename: string;
}): string {
  const safe = parts.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const vid = parts.videoId ?? "new";
  return `potencia-dashboard/youtube/${parts.channelId}/${vid}/${safe}`;
}
