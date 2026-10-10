// Mock Daisy webhook receiver: verifies our outbound signature, logs envelopes.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

const secret = process.env.DAISY_WEBHOOK_SECRET;
const bearer = process.env.DAISY_WEBHOOK_BEARER;
const checkBearer = Boolean(bearer && bearer.trim() !== "");

http
  .createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      const ts = req.headers["x-daisy-timestamp"],
        sig = req.headers["x-daisy-signature"];
      const exp =
        "v1=" +
        crypto.createHmac("sha256", secret).update(`${ts}.${b}`).digest("hex");
      const sigOk = Boolean(
        sig &&
          sig.length === exp.length &&
          crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))
      );

      let authOk;
      let authPassed = true;
      if (checkBearer) {
        const authHeader = req.headers["authorization"];
        const expectedAuth = `Bearer ${bearer.trim()}`;
        authOk = Boolean(
          authHeader &&
            authHeader.length === expectedAuth.length &&
            crypto.timingSafeEqual(
              Buffer.from(authHeader),
              Buffer.from(expectedAuth)
            )
        );
        authPassed = authOk;
      }

      const ok = sigOk && authPassed;
      const record = {
        signatureValid: sigOk,
        eventIdHeader: req.headers["x-daisy-event-id"],
        body: JSON.parse(b),
      };
      if (checkBearer) {
        record.authOk = authOk;
      }

      fs.mkdirSync("/workspace/daisy-studio-evidence", { recursive: true });
      fs.appendFileSync(
        "/workspace/daisy-studio-evidence/outbound-received.jsonl",
        JSON.stringify(record) + "\n"
      );

      if (!sigOk) {
        res.writeHead(401).end("bad sig");
      } else if (checkBearer && !authOk) {
        res.writeHead(401).end("bad auth");
      } else {
        res.writeHead(200).end("ok");
      }
    });
  })
  .listen(8799);
