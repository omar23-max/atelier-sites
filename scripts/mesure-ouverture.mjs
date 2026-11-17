// Mesure de l'ouverture de l'éditeur (2026-11-17) : temps jusqu'à la première
// section affichée, nombre de requêtes et octets transférés, à froid (sans
// cache) puis à chaud (cache du navigateur). Page jetable zz-test-vitesse.
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://127.0.0.1:5180/?page=zz-test-vitesse";
const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

async function run(label) {
  const page = await ctx.newPage();
  const reqs = [];
  page.on("requestfinished", async (r) => {
    try {
      const s = await r.sizes();
      reqs.push({ url: r.url(), bytes: s.responseBodySize + s.responseHeadersSize, type: r.resourceType() });
    } catch {}
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => [...document.querySelectorAll("iframe")].some((f) => f.contentDocument?.querySelector("[data-atl-id]")), null, { timeout: 120000 });
  const first = Date.now() - t0;
  await page.waitForLoadState("networkidle").catch(() => {});
  const idle = Date.now() - t0;
  const big = [...reqs].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((r) => `${Math.round(r.bytes / 1024)} Ko ${r.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 90)}`);
  const total = reqs.reduce((n, r) => n + r.bytes, 0);
  const scripts = reqs.filter((r) => r.type === "script").length;
  console.log(`\n== ${label} : première section ${(first / 1000).toFixed(1)} s · réseau calme ${(idle / 1000).toFixed(1)} s · ${reqs.length} requêtes (${scripts} scripts) · ${(total / 1048576).toFixed(1)} Mo`);
  big.forEach((b) => console.log("   " + b));
  await page.close();
}

await run("À froid");
await run("À chaud");
await browser.close();
