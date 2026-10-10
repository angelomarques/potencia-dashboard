import { describe, expect, it } from "vitest";
import {
  buildSignedHeaders,
  signDaisyPayload,
  verifyDaisySignature,
} from "../signing";
import {
  DAISY_EVENT_ID_HEADER,
  DAISY_MAX_SKEW_SECONDS,
  DAISY_SIGNATURE_HEADER,
  DAISY_TIMESTAMP_HEADER,
} from "../types";

describe("Daisy Signing", () => {
  const secret = "test-webhook-secret-12345";
  const rawBody = JSON.stringify({ hello: "world" });
  const eventId = "evt-test-12345678";

  it("signDaisyPayload produces v1=<hex hmac>", () => {
    const timestamp = "1700000000";
    const sig = signDaisyPayload(secret, timestamp, rawBody);
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  describe("verifyDaisySignature", () => {
    const nowSec = 1700001000;
    const nowMs = nowSec * 1000;

    it("accepts valid signature with current timestamp", () => {
      const timestamp = String(nowSec);
      const signature = signDaisyPayload(secret, timestamp, rawBody);

      const res = verifyDaisySignature({
        secret,
        timestamp,
        signature,
        rawBody,
        now: nowSec,
      });

      expect(res).toEqual({ ok: true });
    });

    it("accepts timestamp in milliseconds for now", () => {
      const timestamp = String(nowSec);
      const signature = signDaisyPayload(secret, timestamp, rawBody);

      const res = verifyDaisySignature({
        secret,
        timestamp,
        signature,
        rawBody,
        now: nowMs,
      });

      expect(res).toEqual({ ok: true });
    });

    it("returns missing_signature when signature is missing", () => {
      const res = verifyDaisySignature({
        secret,
        timestamp: String(nowSec),
        signature: null,
        rawBody,
        now: nowSec,
      });

      expect(res).toEqual({ ok: false, code: "missing_signature" });
    });

    it("returns missing_signature when timestamp is missing", () => {
      const signature = signDaisyPayload(secret, String(nowSec), rawBody);
      const res = verifyDaisySignature({
        secret,
        timestamp: null,
        signature,
        rawBody,
        now: nowSec,
      });

      expect(res).toEqual({ ok: false, code: "missing_signature" });
    });

    it("returns stale_timestamp for past timestamp beyond DAISY_MAX_SKEW_SECONDS", () => {
      const pastTs = String(nowSec - DAISY_MAX_SKEW_SECONDS - 1);
      const signature = signDaisyPayload(secret, pastTs, rawBody);

      const res = verifyDaisySignature({
        secret,
        timestamp: pastTs,
        signature,
        rawBody,
        now: nowSec,
      });

      expect(res).toEqual({ ok: false, code: "stale_timestamp" });
    });

    it("returns stale_timestamp for future timestamp beyond DAISY_MAX_SKEW_SECONDS", () => {
      const futureTs = String(nowSec + DAISY_MAX_SKEW_SECONDS + 1);
      const signature = signDaisyPayload(secret, futureTs, rawBody);

      const res = verifyDaisySignature({
        secret,
        timestamp: futureTs,
        signature,
        rawBody,
        now: nowSec,
      });

      expect(res).toEqual({ ok: false, code: "stale_timestamp" });
    });

    it("accepts timestamp near boundary within DAISY_MAX_SKEW_SECONDS", () => {
      const edgePast = String(nowSec - DAISY_MAX_SKEW_SECONDS);
      const edgeFuture = String(nowSec + DAISY_MAX_SKEW_SECONDS);

      const sigPast = signDaisyPayload(secret, edgePast, rawBody);
      const sigFuture = signDaisyPayload(secret, edgeFuture, rawBody);

      expect(
        verifyDaisySignature({
          secret,
          timestamp: edgePast,
          signature: sigPast,
          rawBody,
          now: nowSec,
        })
      ).toEqual({ ok: true });

      expect(
        verifyDaisySignature({
          secret,
          timestamp: edgeFuture,
          signature: sigFuture,
          rawBody,
          now: nowSec,
        })
      ).toEqual({ ok: true });
    });

    it("returns bad_signature when signature has invalid hmac", () => {
      const timestamp = String(nowSec);
      const badSig = "v1=" + "0".repeat(64);

      const res = verifyDaisySignature({
        secret,
        timestamp,
        signature: badSig,
        rawBody,
        now: nowSec,
      });

      expect(res).toEqual({ ok: false, code: "bad_signature" });
    });

    it("returns bad_signature when body is modified", () => {
      const timestamp = String(nowSec);
      const signature = signDaisyPayload(secret, timestamp, rawBody);

      const res = verifyDaisySignature({
        secret,
        timestamp,
        signature,
        rawBody: JSON.stringify({ tampered: true }),
        now: nowSec,
      });

      expect(res).toEqual({ ok: false, code: "bad_signature" });
    });
  });

  describe("buildSignedHeaders", () => {
    it("generates headers that pass verification", () => {
      const nowSec = 1700002000;
      const headers = buildSignedHeaders(secret, rawBody, eventId, nowSec);

      expect(headers[DAISY_EVENT_ID_HEADER]).toBe(eventId);
      expect(headers[DAISY_TIMESTAMP_HEADER]).toBe(String(nowSec));
      expect(headers[DAISY_SIGNATURE_HEADER]).toMatch(/^v1=[0-9a-f]{64}$/);

      const verified = verifyDaisySignature({
        secret,
        timestamp: headers[DAISY_TIMESTAMP_HEADER],
        signature: headers[DAISY_SIGNATURE_HEADER],
        rawBody,
        now: nowSec,
      });

      expect(verified).toEqual({ ok: true });
    });
  });
});
