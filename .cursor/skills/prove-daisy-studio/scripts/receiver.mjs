// Mock Daisy webhook receiver: verifies our outbound signature, logs envelopes.
import http from "node:http"; import crypto from "node:crypto"; import fs from "node:fs";
const secret = process.env.DAISY_WEBHOOK_SECRET;
http.createServer((req, res) => { let b=""; req.on("data",c=>b+=c); req.on("end",()=>{
  const ts=req.headers["x-daisy-timestamp"], sig=req.headers["x-daisy-signature"];
  const exp="v1="+crypto.createHmac("sha256",secret).update(`${ts}.${b}`).digest("hex");
  const ok = sig && sig.length===exp.length && crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(exp));
  fs.appendFileSync("/workspace/daisy-studio-evidence/outbound-received.jsonl", JSON.stringify({signatureValid:ok, eventIdHeader:req.headers["x-daisy-event-id"], body:JSON.parse(b)})+"\n");
  res.writeHead(ok?200:401).end(ok?"ok":"bad sig"); }); }).listen(8799);
