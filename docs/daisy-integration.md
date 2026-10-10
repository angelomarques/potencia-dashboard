# Daisy Studio Integration Guide

Daisy is an external AI UI-designer agent collaborating with the Potencia Dashboard. This document defines the wire contract for bidirectional communication between Daisy and the dashboard, designed so an autonomous agent can integrate directly using `curl`, Node.js, or any HTTP client.

---

## 1. Architecture Overview

Communication between Daisy and the Potencia Dashboard is bidirectional, authenticated via HMAC-SHA256 signatures or Bearer tokens, and supports both push and pull patterns with deduplication:

1. **Inbound (Daisy → Dashboard)**: Daisy pushes signed webhook events to `/api/daisy/webhooks` or dedicated sub-routes (`/api/daisy/webhooks/{project|message|sketch|section-ready|preview}`).
2. **Outbound Push (Dashboard → Daisy)**: The dashboard immediately POSTs signed webhook envelopes to `DAISY_WEBHOOK_URL` whenever the owner takes an action. Failed deliveries are retried using exponential backoff.
3. **Outbound Pull & Reconcile (Daisy → Dashboard)**: Daisy can pull outbound events via `GET /api/daisy/events?after=<seq>` authenticated by `DAISY_PULL_TOKEN`. Events remain pullable until acknowledged via `POST /api/daisy/events/ack` (even if already delivered via push). Daisy **must deduplicate** events by `id`.

---

## 2. Environment Variables

| Variable | Description |
|---|---|
| `DAISY_WEBHOOK_SECRET` | Shared secret key used for HMAC-SHA256 signature generation and verification in both directions. |
| `DAISY_WEBHOOK_URL` | Daisy's HTTPS endpoint where the dashboard pushes outbound event webhooks. |
| `DAISY_WEBHOOK_BEARER` | Optional Bearer token for outbound webhook deliveries. When set, requests to `DAISY_WEBHOOK_URL` include `Authorization: Bearer <value>` (e.g. Cursor routine webhook endpoint). |
| `DAISY_PULL_TOKEN` | Bearer token used by Daisy to authenticate against `GET /api/daisy/events` and `POST /api/daisy/events/ack`. |
| `DAISY_OWNER_EMAIL` | Optional email address of the studio dashboard owner. |
| `DAISY_PREVIEW_ALLOWED_ORIGINS` | Optional comma-separated extra domains or wildcards (e.g. `*.myhost.com,https://preview.app`) allowed for iframe previews. |
| `UPSTASH_REDIS_REST_URL` | Optional Upstash Redis URL for sliding-window rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | Optional Upstash Redis REST token. |
| `CRON_SECRET` | Bearer token for triggering retry sweeps via `GET /api/daisy/outbound/deliver`. |

---

## 3. Webhook Signing Recipe (Inbound & Outbound)

Both inbound webhooks (from Daisy) and outbound webhooks (from the dashboard) use the same HMAC-SHA256 signing scheme.

### Formula

$$\text{signature} = \text{"v1="} + \text{hex}\left(\text{HMAC-SHA256}\left(\text{DAISY\_WEBHOOK\_SECRET}, \text{timestamp} + \text{"."} + \text{rawBody}\right)\right)$$

- **`timestamp`**: Current epoch time in **seconds** (e.g. `1728590000`).
- **`rawBody`**: The exact utf-8 raw JSON request body string before any parsing.
- **Clock Skew Window**: Requests must be within 300 seconds (5 minutes) of the recipient's clock in either direction (`|now - timestamp| <= 300`).
- **Constant-Time Verification**: Verification must use constant-time comparison (e.g. `crypto.timingSafeEqual`) to prevent timing attacks.

### Required HTTP Headers

| Header | Description | Example |
|---|---|---|
| `x-daisy-signature` | Signed HMAC digest with prefix `v1=` | `v1=4a5d...` |
| `x-daisy-timestamp` | Unix timestamp in seconds | `1728590000` |
| `x-daisy-event-id` | Unique UUID / string event ID matching body `id` | `evt_daisy_991823` |
| `Content-Type` | MIME type | `application/json` |

---

## 4. Inbound Endpoints (Daisy → Dashboard)

Daisy can post to the universal webhook endpoint:
- `POST /api/daisy/webhooks`

Or use dedicated sub-routes:
- `POST /api/daisy/webhooks/project` (`project.upserted`)
- `POST /api/daisy/webhooks/message` (`message.created`)
- `POST /api/daisy/webhooks/sketch` (`sketch.created`)
- `POST /api/daisy/webhooks/section-ready` (`section.ready`)
- `POST /api/daisy/webhooks/preview` (`preview.updated`)

### Wire Envelope Schema

```json
{
  "id": "evt_c83d8a1f-4d69-450a-bf47-063fbce98201",
  "type": "project.upserted",
  "createdAt": "2026-10-10T18:00:00.000Z",
  "data": { ... }
}
```

- `id`: string, 8 to 128 characters. Required idempotency key.
- `type`: string literal matching the event type.
- `createdAt`: ISO 8601 string (optional).
- `data`: Payload specific to the event type.

### Event Schemas

#### 1. `project.upserted`
Creates or updates a Daisy project.
```json
{
  "id": "evt_proj_001",
  "type": "project.upserted",
  "data": {
    "projectId": "proj_brand_refresh",
    "name": "Brand Refresh 2026",
    "status": "active",
    "summary": "Full overhaul of homepage and pricing sections.",
    "currentSection": "Hero Section"
  }
}
```
- `projectId`: string, 1..128 chars.
- `name`: string, 1..200 chars.
- `status`: `"active"` | `"done"` (default: `"active"`).
- `summary`: optional string, max 2000 chars.
- `currentSection`: optional string, max 200 chars.

#### 2. `message.created`
Daisy posts a message to the project thread.
```json
{
  "id": "evt_msg_001",
  "type": "message.created",
  "data": {
    "projectId": "proj_brand_refresh",
    "messageId": "msg_d_001",
    "body": "I have created two options for the Hero Section. Please review!"
  }
}
```
- `projectId`: string, 1..128 chars.
- `messageId`: optional string, 1..128 chars.
- `body`: string, 1..20000 chars.

#### 3. `sketch.created`
Daisy uploads alternative UI sketches/cards for the owner to choose from.
```json
{
  "id": "evt_sk_001",
  "type": "sketch.created",
  "data": {
    "projectId": "proj_brand_refresh",
    "sketchId": "sketch_opt_a",
    "groupId": "group_hero_v1",
    "section": "Hero Section",
    "label": "Option A: Minimalist Layout",
    "kind": "card",
    "imageUrl": "https://cdn.daisy.design/sketches/opt_a.png",
    "url": "https://preview.daisy.design/opt_a"
  }
}
```
- `projectId`: string, 1..128 chars.
- `sketchId`: string, 1..128 chars.
- `groupId`: optional string, max 128 chars (sketches with same `groupId` are mutually exclusive options).
- `section`: optional string, max 200 chars.
- `label`: string, 1..200 chars.
- `kind`: `"card"` | `"slide"` (default: `"card"`).
- `imageUrl`: optional https URL (must start with `https://`, max 2048 chars).
- `url`: optional https URL (must start with `https://`, max 2048 chars).
- *Constraint*: At least one of `imageUrl` or `url` is required.

#### 4. `section.ready`
Daisy indicates a section is complete and opens a handoff gate for the owner.
```json
{
  "id": "evt_gate_001",
  "type": "section.ready",
  "data": {
    "projectId": "proj_brand_refresh",
    "section": "Hero Section",
    "prompt": "Please upload any reference assets or notes before we move to the Pricing section."
  }
}
```
- `projectId`: string, 1..128 chars.
- `section`: string, 1..200 chars.
- `prompt`: optional string, max 2000 chars.

#### 5. `preview.updated`
Daisy updates the live preview URL for the iframe embed.
```json
{
  "id": "evt_prev_001",
  "type": "preview.updated",
  "data": {
    "projectId": "proj_brand_refresh",
    "previewUrl": "https://daisy-preview-hero.vercel.app/demo"
  }
}
```
- `projectId`: string, 1..128 chars.
- `previewUrl`: string, must start with `https://`, max 2048 chars, host must match the preview allowlist.

---

## 5. Idempotency & Preview Allowlist

### Idempotency
- Every inbound event `id` is recorded in the dashboard database.
- If an event with the same `id` is posted more than once, the dashboard returns `200 OK` with:
  ```json
  { "ok": true, "duplicate": true }
  ```
- The event is not re-processed, preventing duplicate messages, gates, or sketches.

### Preview Allowlist
For security, live preview URLs rendered in the dashboard iframe are strictly validated:
- Must use `https://`.
- Must not contain credentials (`user:pass@host`).
- Default allowed hosts:
  - `*.vercel.app`
  - `potenciaapps.com.br`
  - `*.potenciaapps.com.br`
- Additional origins can be configured in `DAISY_PREVIEW_ALLOWED_ORIGINS` (comma-separated origins/wildcards).
- If the host is not allowlisted, the endpoint returns `422 Unprocessable Entity` with error code `preview_origin_not_allowed`.

---

## 6. HTTP Error Codes

| Status | Code | Meaning / Resolution |
|---|---|---|
| `400` | `invalid_json` | Request body could not be parsed as JSON. |
| `400` | `event_id_mismatch` | Header `x-daisy-event-id` does not match body `id`. |
| `401` | `missing_signature` | Header `x-daisy-signature` or `x-daisy-timestamp` missing. |
| `401` | `stale_timestamp` | Timestamp differs from server time by more than 300s. |
| `401` | `bad_signature` | HMAC signature verification failed. Check `DAISY_WEBHOOK_SECRET`. |
| `401` | `missing_authorization` / `unauthorized` | Missing or invalid Bearer token on pull/ack/cron endpoints. |
| `413` | `payload_too_large` | Request body exceeded maximum allowed size. |
| `422` | `invalid_payload` | Payload validation failed (Zod schema mismatch). |
| `422` | `type_mismatch` | Event type in body does not match sub-route endpoint. |
| `422` | `preview_origin_not_allowed` | Preview URL hostname is not allowlisted. |
| `429` | `rate_limited` | Rate limit exceeded. Read `Retry-After` header for seconds to wait. |
| `503` | `daisy_not_configured` | Required environment variable (e.g. `DAISY_WEBHOOK_SECRET`, `DAISY_PULL_TOKEN`) is not configured. |

---

## 7. Outbound Events (Dashboard → Daisy)

When the project owner takes action on the dashboard, an outbound event is stored and delivered.

### Outbound Envelope
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "seq": 142,
  "type": "owner.message",
  "createdAt": "2026-10-10T20:15:30.123Z",
  "data": { ... }
}
```
- `id`: string (UUID generated by dashboard).
- `seq`: number (monotonically increasing integer cursor).
- `type`: Outbound event type.
- `createdAt`: ISO 8601 string.
- `data`: Typed payload.

### Outbound Event Types and Payloads

#### 1. `owner.message`
Owner posted a message in the chat thread.
```json
{
  "projectId": "proj_brand_refresh",
  "messageId": "msg_own_101",
  "body": "Could we try a darker background for Option A?"
}
```

#### 2. `owner.sketch_chosen`
Owner selected a winning sketch from a group of alternatives.
```json
{
  "projectId": "proj_brand_refresh",
  "sketchId": "sketch_opt_a",
  "groupId": "group_hero_v1",
  "rejectedSketchIds": ["sketch_opt_b"]
}
```

#### 3. `owner.comment`
Owner pinned a feedback comment to a specific position on a sketch.
```json
{
  "projectId": "proj_brand_refresh",
  "sketchId": "sketch_opt_a",
  "commentId": "comm_991",
  "body": "Increase logo padding here.",
  "x": 0.45,
  "y": 0.12
}
```
- `x`, `y`: Relative coordinates between `0.0` and `1.0`, or `null`.

#### 4. `owner.gate_submitted`
Owner resolved a section handoff gate by providing reference assets and/or feedback notes.
```json
{
  "projectId": "proj_brand_refresh",
  "gateId": "gate_hero_01",
  "section": "Hero Section",
  "notes": "Here are our competitor brand references.",
  "references": [
    {
      "key": "potencia-dashboard/daisy/proj_brand_refresh/gate_hero_01/ref1.png",
      "filename": "ref1.png",
      "contentType": "image/png",
      "sizeBytes": 204850,
      "url": "https://r2.potenciaapps.com.br/presigned-get-url..."
    }
  ]
}
```

#### 5. `owner.gate_continued`
Owner skipped providing references and chose "Continue" on the handoff gate.
```json
{
  "projectId": "proj_brand_refresh",
  "gateId": "gate_hero_01",
  "section": "Hero Section"
}
```

---

## 8. Push Delivery & Retry Schedule

When `DAISY_WEBHOOK_URL` and `DAISY_WEBHOOK_SECRET` are configured:
1. **Immediate Delivery**: The dashboard attempts an immediate HTTP POST to `DAISY_WEBHOOK_URL` with a 10-second timeout.
2. **Success**: If Daisy replies with `2xx`, the event is marked `delivered`.
3. **Failure & Exponential Backoff**: If Daisy replies with non-2xx or connection fails/times out, the event is scheduled for retry:

| Attempt | Backoff Delay | Cumulative Time |
|---|---|---|
| 1st failure | 30 seconds | 30s |
| 2nd failure | 2 minutes | ~2.5m |
| 3rd failure | 10 minutes | ~12.5m |
| 4th failure | 30 minutes | ~42.5m |
| 5th failure | 2 hours | ~2.7h |
| 6th failure | 6 hours | ~8.7h |
| 7th failure | 12 hours | ~20.7h |
| 8th failure | Max attempts reached (marked `failed`) | — |

4. **Retry Triggers**:
   - Opportunistically on every new outbound event emission.
   - Opportunistically on each Daisy pull request.
   - Vercel Cron schedule (`0 3 * * *` via `GET /api/daisy/outbound/deliver`).

> **Important**: Delivered events remain pullable via `GET /api/daisy/events` until explicitly acknowledged via `POST /api/daisy/events/ack`. Daisy should deduplicate events by `id`.

### Outbound Bearer Authentication (`DAISY_WEBHOOK_BEARER`)

Outbound requests to `DAISY_WEBHOOK_URL` include the standard HMAC headers:
- `x-daisy-signature`: HMAC-SHA256 signature (`v1=<hex>`).
- `x-daisy-timestamp`: Unix timestamp in seconds.
- `x-daisy-event-id`: Outbound event ID.
- `content-type`: `application/json`.
- `user-agent`: `potencia-dashboard-daisy/1`.

#### Optional Bearer Header
When the environment variable `DAISY_WEBHOOK_BEARER` is configured:
- Every outbound webhook delivery (both immediate push and retry attempts) includes an `Authorization: Bearer <value>` header alongside the HMAC headers.
- When `DAISY_WEBHOOK_BEARER` is unset or empty, no `Authorization` header is sent.
- The HMAC signature computation is **unchanged**; it signs `timestamp.rawBody` regardless of whether the Bearer header is included.

#### When to Use It
Set `DAISY_WEBHOOK_BEARER` when the receiver endpoint listening on `DAISY_WEBHOOK_URL` requires Bearer token authentication in addition to or alongside HMAC signatures:
- **Cursor Routine Webhook Endpoints**: Cursor routine automations or webhooks that require a fixed API bearer token in the `Authorization` header.
- **Protected Receiver Gateways**: Receiver infrastructure behind Cloudflare Access Service Tokens, reverse proxies, or API gateways enforcing Authorization headers.

---

## 9. Daisy Pull & Acknowledge Endpoints

If Daisy cannot receive webhooks or needs to reconcile missed events, Daisy can pull events using cursor pagination:

### Pull Events: `GET /api/daisy/events`

**Query Parameters:**
- `after`: Integer seq cursor (default: `0`). Returns events where `seq > after`.
- `limit`: Integer between 1 and 100 (default: `50`).

**Headers:**
- `Authorization: Bearer <DAISY_PULL_TOKEN>`

**Response (200 OK):**
```json
{
  "events": [
    {
      "id": "e6a2b8e4-1845-429d-b8d4-593b492b4991",
      "seq": 1,
      "type": "owner.message",
      "createdAt": "2026-10-10T18:30:00.000Z",
      "data": {
        "projectId": "proj_brand_refresh",
        "messageId": "msg_001",
        "body": "Looks great, let's proceed."
      }
    }
  ],
  "nextCursor": 1,
  "hasMore": false
}
```

### Acknowledge Events: `POST /api/daisy/events/ack`

Acknowledges that Daisy has processed all events up to seq `upTo`. Acknowledged events are excluded from future pull responses.

**Headers:**
- `Authorization: Bearer <DAISY_PULL_TOKEN>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "upTo": 1
}
```

**Response (200 OK):**
```json
{
  "acked": 1
}
```

---

## 10. Verification Code Examples

### Bash + OpenSSL + cURL

```bash
#!/usr/bin/env bash
set -euo pipefail

SECRET="your_daisy_webhook_secret_here"
URL="https://dashboard.potenciaapps.com.br/api/daisy/webhooks"
EVENT_ID="evt_$(uuidgen | tr '[:upper:]' '[:lower:]')"
TIMESTAMP=$(date +%s)

BODY=$(cat <<EOF
{
  "id": "${EVENT_ID}",
  "type": "project.upserted",
  "data": {
    "projectId": "proj_demo",
    "name": "Demo Project",
    "status": "active",
    "summary": "Created from bash curl"
  }
}
EOF
)

# HMAC-SHA256 signature
SIG_PAYLOAD="${TIMESTAMP}.${BODY}"
HEX_SIG=$(printf "%s" "${SIG_PAYLOAD}" | openssl dgst -sha256 -hmac "${SECRET}" -r | awk '{print $1}')
SIGNATURE="v1=${HEX_SIG}"

curl -s -X POST "${URL}" \
  -H "Content-Type: application/json" \
  -H "x-daisy-event-id: ${EVENT_ID}" \
  -H "x-daisy-timestamp: ${TIMESTAMP}" \
  -H "x-daisy-signature: ${SIGNATURE}" \
  -d "${BODY}"
```

### Node.js Example (Send Inbound Webhook)

```ts
import crypto from "node:crypto";

async function postInboundWebhook() {
  const secret = process.env.DAISY_WEBHOOK_SECRET!;
  const url = "https://dashboard.potenciaapps.com.br/api/daisy/webhooks";

  const eventId = "evt_" + crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const bodyObj = {
    id: eventId,
    type: "message.created",
    data: {
      projectId: "proj_demo",
      body: "Hello from Daisy AI agent!",
    },
  };
  const rawBody = JSON.stringify(bodyObj);

  const signature =
    "v1=" +
    crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-daisy-event-id": eventId,
      "x-daisy-timestamp": timestamp,
      "x-daisy-signature": signature,
    },
    body: rawBody,
  });

  const data = await res.json();
  console.log("Status:", res.status, "Response:", data);
}
```

### Node.js Example (Verify Outbound Signature on Daisy's Side)

```ts
import crypto from "node:crypto";

function verifyDashboardWebhook(
  rawBody: string,
  headers: Record<string, string>,
  secret: string
): boolean {
  const signatureHeader = headers["x-daisy-signature"];
  const timestampHeader = headers["x-daisy-timestamp"];
  const eventIdHeader = headers["x-daisy-event-id"];

  if (!signatureHeader || !timestampHeader || !eventIdHeader) {
    return false;
  }

  // Check clock skew within 300 seconds
  const ts = parseInt(timestampHeader, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    return false;
  }

  // Expected signature
  const expectedSig =
    "v1=" +
    crypto
      .createHmac("sha256", secret)
      .update(`${timestampHeader}.${rawBody}`)
      .digest("hex");

  // Constant-time comparison
  const bufA = Buffer.from(signatureHeader);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
```

### Pull & Ack Example with cURL

```bash
# 1. Pull events after sequence 0
curl -s -X GET "https://dashboard.potenciaapps.com.br/api/daisy/events?after=0&limit=50" \
  -H "Authorization: Bearer ${DAISY_PULL_TOKEN}"

# 2. Acknowledge events up to sequence 42
curl -s -X POST "https://dashboard.potenciaapps.com.br/api/daisy/events/ack" \
  -H "Authorization: Bearer ${DAISY_PULL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"upTo": 42}'
```
