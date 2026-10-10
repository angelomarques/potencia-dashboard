import crypto from "node:crypto"; import fs from "node:fs";
import { chromium } from "playwright-core";
const BASE="http://localhost:43211", SECRET=process.env.DAISY_WEBHOOK_SECRET, PULL=process.env.DAISY_PULL_TOKEN;
const OUT="/workspace/daisy-studio-evidence"; const results=[];
const check=(name,ok,detail="")=>{results.push({name,ok,detail});console.log(`${ok?"PASS":"FAIL"} ${name} ${detail}`);};
const sign=(ts,body)=>"v1="+crypto.createHmac("sha256",SECRET).update(`${ts}.${body}`).digest("hex");
async function post(path,evt,{ts=Math.floor(Date.now()/1000),badSig=false}={}){
  const body=JSON.stringify(evt);
  const r=await fetch(BASE+path,{method:"POST",headers:{"content-type":"application/json","x-daisy-timestamp":String(ts),"x-daisy-event-id":evt.id,"x-daisy-signature":badSig?sign(ts,body+"x"):sign(ts,body)},body});
  return {status:r.status,json:await r.json().catch(()=>null)};
}
const id=()=>"evt_"+crypto.randomUUID();
// ---- Seed via signed inbound webhooks ----
const P="lawa-landing", P2="eo-shop";
const seed=[
 ["/api/daisy/webhooks/project",{id:id(),type:"project.upserted",data:{projectId:P,name:"Lawa — landing page",status:"active",summary:"Marketing landing for Lawa",currentSection:"Hero"}}],
 ["/api/daisy/webhooks/project",{id:id(),type:"project.upserted",data:{projectId:P2,name:"Empire Oddities shop",status:"done",summary:"Merch storefront",currentSection:"Footer"}}],
 ["/api/daisy/webhooks/message",{id:id(),type:"message.created",data:{projectId:P,body:"Oi Ângelo! I drafted two hero directions. Pick one and pin any tweaks to the sketch."}}],
 ["/api/daisy/webhooks/sketch",{id:id(),type:"sketch.created",data:{projectId:P,sketchId:"sk-hero-a",groupId:"hero",section:"Hero",label:"Hero A — bold gradient",kind:"card",imageUrl:"https://placehold.co/640x360/7c3aed/ffffff/png?text=Hero+A"}}],
 ["/api/daisy/webhooks/sketch",{id:id(),type:"sketch.created",data:{projectId:P,sketchId:"sk-hero-b",groupId:"hero",section:"Hero",label:"Hero B — photo split",kind:"slide",imageUrl:"https://placehold.co/640x360/0ea5e9/ffffff/png?text=Hero+B"}}],
 ["/api/daisy/webhooks/preview",{id:id(),type:"preview.updated",data:{projectId:P,previewUrl:"https://next-blog-starter.vercel.app"}}],
];
for (const [p,e] of seed){ const r=await post(p,e); check(`inbound ${e.type}`, r.status===200, String(r.status)); }
// ---- Signature accept/reject ----
const good={id:id(),type:"message.created",data:{projectId:P,body:"Signature test message"}};
check("webhook: valid signature accepted",(await post("/api/daisy/webhooks",good)).status===200);
const replay=await post("/api/daisy/webhooks",good); check("webhook: replay dropped (duplicate:true)",replay.status===200&&replay.json?.duplicate===true,JSON.stringify(replay.json));
const bad=await post("/api/daisy/webhooks",{...good,id:id()},{badSig:true}); check("webhook: bad signature rejected 401",bad.status===401&&bad.json?.error==="bad_signature",JSON.stringify(bad.json));
const stale=await post("/api/daisy/webhooks",{...good,id:id()},{ts:Math.floor(Date.now()/1000)-600}); check("webhook: stale timestamp rejected 401",stale.status===401&&stale.json?.error==="stale_timestamp",JSON.stringify(stale.json));
const nosig=await fetch(BASE+"/api/daisy/webhooks",{method:"POST",body:"{}"}); check("webhook: missing signature 401",nosig.status===401);
const evil=await post("/api/daisy/webhooks/preview",{id:id(),type:"preview.updated",data:{projectId:P2,previewUrl:"https://evil.example.com"}}); check("webhook: disallowed preview origin rejected 422",evil.status===422,JSON.stringify(evil.json));
const httpPrev=await post("/api/daisy/webhooks/preview",{id:id(),type:"preview.updated",data:{projectId:P2,previewUrl:"http://foo.vercel.app"}}); check("webhook: http preview rejected 422",httpPrev.status===422);
// simulate legacy bad row to prove render-time blocking
await fetch("http://127.0.0.1:8788/q",{method:"POST",body:JSON.stringify({sql:"UPDATE daisy_projects SET preview_url=? WHERE id=?",params:["https://evil.example.com",P2]})});
// ---- Section ready (opens gate) after sketches
check("inbound section.ready",(await post("/api/daisy/webhooks/section-ready",{id:id(),type:"section.ready",data:{projectId:P,section:"Features",prompt:"Next up: Features grid. Any references or notes before I start?"}})).status===200);
// ---- Auth: sign up owner
const su=await fetch(BASE+"/api/auth/sign-up/email",{method:"POST",headers:{"content-type":"application/json",origin:BASE},body:JSON.stringify({email:"angelo@example.com",password:"local-evidence-pw-123",name:"Ângelo"})});
check("owner sign-up (local)",su.ok,String(su.status));
const cookies=(su.headers.getSetCookie?.()??[]).map(c=>{const [nv]=c.split(";");const i=nv.indexOf("=");return {name:nv.slice(0,i),value:nv.slice(i+1),domain:"localhost",path:"/"};});
const browser=await chromium.launch({executablePath:process.env.CHROME||"/usr/bin/google-chrome",args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:OUT+"/video",size:{width:1440,height:960}}});
await ctx.addCookies(cookies); const page=await ctx.newPage();
const shot=async(n)=>{await page.waitForTimeout(600);await page.screenshot({path:`${OUT}/${n}.png`,fullPage:true});};
await page.goto(BASE+"/daisy"); await page.waitForSelector('[data-testid="daisy-project-card"]');
const cards=await page.locator('[data-testid="daisy-project-card"]').count(); check("UI: projects list shows projects",cards===2,`cards=${cards}`);
check("UI: nav link to /daisy in header",await page.locator('header a[href="/daisy"]').count()>0);
await shot("01-projects-index");
await page.goto(BASE+"/daisy/"+P); await page.waitForSelector('[data-testid="sketch-box"]');
check("UI: thread shows messages + sketches",(await page.locator('[data-testid="thread-message"]').count())>=1 && (await page.locator('[data-testid="sketch-box"]').count())===2);
check("UI: allowed preview iframe rendered sandboxed",(await page.locator('iframe[data-testid="preview-iframe"][sandbox]').count())===1);
await shot("02-project-thread-and-preview");
await page.locator('[data-testid="choose-sketch"]').first().click(); await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="sketch-status"]')].some(e=>/chosen/i.test(e.textContent))&&[...document.querySelectorAll('[data-testid="sketch-status"]')].some(e=>/rejected/i.test(e.textContent)),null,{timeout:20000}).catch(()=>{});
const st=(await page.locator('[data-testid="sketch-status"]').allTextContents()).join("|"); check("UI: choose sketch -> chosen/rejected",/chosen/i.test(st)&&/rejected/i.test(st),st);
await shot("03-sketch-chosen");
await page.locator('[data-testid="comment-input"]').first().fill("Make the CTA button larger and use the brand pink.");
await page.locator('[data-testid="comment-submit"]').first().click(); await page.waitForSelector('[data-testid="sketch-comment"]');
check("UI: pinned comment on sketch",(await page.locator('[data-testid="sketch-comment"]').count())>=1);
await shot("04-pinned-comment");
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==","base64");
fs.writeFileSync("/tmp/ref.png",png);
await page.locator('[data-testid="gate-box"]').first().scrollIntoViewIfNeeded();
await shot("05-gate-open");
const [upResp]=await Promise.all([page.waitForResponse(r=>r.url().includes("/api/daisy/references"),{timeout:30000}),page.locator('[data-testid="gate-file-input"]').setInputFiles("/tmp/ref.png")]);
check("UI: reference image upload to R2",upResp.status()===200||upResp.status()===201,String(upResp.status()));
await page.waitForTimeout(800);
await page.locator('[data-testid="gate-notes"]').fill("Use the Lawa palette; keep 3 columns on desktop.");
await shot("06-gate-reference-uploaded");
await page.locator('[data-testid="gate-submit"]').click(); await page.waitForTimeout(2000);
check("UI: gate submitted (no open gate)",(await page.locator('[data-testid="gate-submit"]').count())===0);
await shot("07-gate-submitted");
// second gate -> Continue
await post("/api/daisy/webhooks/section-ready",{id:id(),type:"section.ready",data:{projectId:P,section:"Pricing",prompt:"Pricing next — references?"}});
await page.reload(); await page.waitForSelector('[data-testid="gate-continue"]');
await page.locator('[data-testid="gate-continue"]').click(); await page.waitForTimeout(2000);
check("UI: gate Continue resolves gate",(await page.locator('[data-testid="gate-continue"]').count())===0);
await page.locator('[data-testid="message-input"]').fill("Looks great, go ahead!"); await page.locator('[data-testid="message-send"]').click(); await page.waitForTimeout(1500);
await shot("08-continue-and-message");
await page.goto(BASE+"/daisy/"+P2); await page.waitForTimeout(1500);
check("UI: disallowed stored preview blocked (no iframe)",(await page.locator('[data-testid="preview-blocked"]').count())===1&&(await page.locator('iframe').count())===0);
await shot("09-preview-blocked");
await ctx.close(); await browser.close();
// ---- Outbound: push receiver + pull/ack
await new Promise(r=>setTimeout(r,1500));
const recv=fs.existsSync(OUT+"/outbound-received.jsonl")?fs.readFileSync(OUT+"/outbound-received.jsonl","utf8").trim().split("\n").map(JSON.parse):[];
const types=new Set(recv.map(r=>r.body.type));
check("outbound push: all owner event types delivered + signature valid",["owner.sketch_chosen","owner.comment","owner.gate_submitted","owner.gate_continued","owner.message"].every(t=>types.has(t))&&recv.every(r=>r.signatureValid),[...types].join(","));
const pu=await fetch(BASE+"/api/daisy/events?after=0&limit=100",{headers:{authorization:"Bearer "+PULL}}); const pj=await pu.json();
check("pull: bearer auth returns events",pu.status===200&&pj.events.length>=5,`n=${pj.events?.length} nextCursor=${pj.nextCursor}`);
check("pull: wrong token 401",(await fetch(BASE+"/api/daisy/events",{headers:{authorization:"Bearer nope"}})).status===401);
const ack=await fetch(BASE+"/api/daisy/events/ack",{method:"POST",headers:{authorization:"Bearer "+PULL,"content-type":"application/json"},body:JSON.stringify({upTo:pj.nextCursor})}); const aj=await ack.json();
const after=await (await fetch(BASE+"/api/daisy/events?after=0",{headers:{authorization:"Bearer "+PULL}})).json();
check("pull: ack removes acked events",ack.ok&&after.events.length===0,`acked=${aj.acked} remaining=${after.events.length}`);
fs.writeFileSync(OUT+"/pull-sample.json",JSON.stringify(pj,null,2));
fs.writeFileSync(OUT+"/validation-report.json",JSON.stringify({at:new Date().toISOString(),results},null,2));
console.log(results.every(r=>r.ok)?"ALL PASS":"SOME FAILED");
