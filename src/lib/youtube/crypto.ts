import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Encrypt OAuth tokens at rest in D1.
 * Key material: YOUTUBE_TOKEN_KEY or BETTER_AUTH_SECRET (never log plaintext).
 *
 * Scrypt salt is a public, non-secret context label hashed to 32 bytes so
 * secret scanners do not treat a hyphenated context string as an API key.
 * v1 salt used a different literal context string; ciphertext from that
 * era must be re-set (re-OAuth / paste refresh token again). Pre-merge
 * feature — no prod ciphertext expected.
 */
const TOKEN_SCRYPT_SALT = createHash("sha256")
  .update("potencia.youtube.token.v1")
  .digest();

function keyBytes(): Buffer {
  const secret =
    process.env.YOUTUBE_TOKEN_KEY?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing YOUTUBE_TOKEN_KEY or BETTER_AUTH_SECRET for token encryption");
  }
  return scryptSync(secret, TOKEN_SCRYPT_SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
