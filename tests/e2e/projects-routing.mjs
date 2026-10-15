// Routing checks for projects home + per-project kanban (unauthenticated).
// Usage: BASE_URL=http://localhost:3000 node tests/e2e/projects-routing.mjs
const base = process.env.BASE_URL || "http://localhost:3000";

let fail = 0;

async function expectRedirect(path, expectedLocationPart, expectedQueryPart) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  const location = res.headers.get("location") || "";
  const ok =
    (res.status === 307 || res.status === 308 || res.status === 302) &&
    location.includes(expectedLocationPart) &&
    (!expectedQueryPart || location.includes(expectedQueryPart));

  console.log(
    `${ok ? "PASS" : "FAIL"} ${path} -> ${res.status} ${location} (expect ${expectedLocationPart}${expectedQueryPart ? ` + ${expectedQueryPart}` : ""})`,
  );
  if (!ok) fail++;
}

await expectRedirect("/projects", "/sign-in", "callbackUrl=%2Fprojects");
await expectRedirect("/projects/lawa", "/sign-in", "callbackUrl=%2Fprojects%2Flawa");
await expectRedirect("/board", "/sign-in", "callbackUrl=%2Fboard");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exit(fail ? 1 : 0);
