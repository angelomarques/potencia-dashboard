import crypto from "node:crypto";
import {
  DAISY_EVENT_ID_HEADER,
  DAISY_MAX_SKEW_SECONDS,
  DAISY_SIGNATURE_HEADER,
  DAISY_TIMESTAMP_HEADER,
} from "./types";

export function signDaisyPayload(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${timestamp}.${rawBody}`);
  return `v1=${hmac.digest("hex")}`;
}

export type VerifyDaisySignatureInput = {
  secret: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  rawBody: string;
  now?: number;
};

export type VerifyDaisySignatureResult =
  | { ok: true }
  | {
      ok: false;
      code: "missing_signature" | "stale_timestamp" | "bad_signature";
    };

export function verifyDaisySignature(
  input: VerifyDaisySignatureInput
): VerifyDaisySignatureResult {
  if (!input.signature || !input.timestamp) {
    return { ok: false, code: "missing_signature" };
  }

  const ts = Number(input.timestamp);
  if (Number.isNaN(ts) || !Number.isFinite(ts)) {
    return { ok: false, code: "stale_timestamp" };
  }

  const nowSec =
    input.now !== undefined
      ? input.now > 1e11
        ? Math.floor(input.now / 1000)
        : input.now
      : Math.floor(Date.now() / 1000);

  if (Math.abs(nowSec - ts) > DAISY_MAX_SKEW_SECONDS) {
    return { ok: false, code: "stale_timestamp" };
  }

  const expected = signDaisyPayload(input.secret, input.timestamp, input.rawBody);
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(input.signature, "utf8");

  if (expectedBuf.length !== actualBuf.length) {
    return { ok: false, code: "bad_signature" };
  }

  if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { ok: false, code: "bad_signature" };
  }

  return { ok: true };
}

export function buildSignedHeaders(
  secret: string,
  rawBody: string,
  eventId: string,
  now?: number
): Record<string, string> {
  const nowSec =
    now !== undefined
      ? now > 1e11
        ? Math.floor(now / 1000)
        : now
      : Math.floor(Date.now() / 1000);
  const timestamp = String(nowSec);
  const signature = signDaisyPayload(secret, timestamp, rawBody);

  return {
    [DAISY_SIGNATURE_HEADER]: signature,
    [DAISY_TIMESTAMP_HEADER]: timestamp,
    [DAISY_EVENT_ID_HEADER]: eventId,
  };
}
