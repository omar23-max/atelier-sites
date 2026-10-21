// Met côte à côte la page d'origine et sa reconstruction, en desktop et mobile.
// Usage : npm run compare -- <nom-de-page> <dossier-import>
//   → imports/<dossier>/compare-desktop.png et compare-mobile.png
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { renderPage } from "./render-page.mjs";
import { root } from "./lib/load.mjs";

const [name, importDir] = process.argv.slice(2);
if (!name || !importDir) {
  console.error("Usage : npm run compare -- <nom-de-page> <dossier-import>");
  process.exit(1);
}

const importPath = join(root, "imports", importDir);
const htmlDir = join(root, "export", "html");
await mkdir(htmlDir, { recursive: true });
const htmlFile = join(htmlDir, `${name}.html`);
await writeFile(htmlFile, await renderPage(name), "utf8");

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  // Résolution 1 : voir scripts/capture.mjs (limite des captures très hautes).
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [view, options] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const rebuilt = join(importPath, `rebuilt-${view}.png`);
    await page.screenshot({ path: rebuilt, fullPage: true });
    await context.close();

    // Planche de comparaison : original à gauche, reconstruction à droite.
    const toData = async (file) => `data:image/png;base64,${(await readFile(file)).toString("base64")}`;
    const width = options.viewport.width;
    const board = await browser.newContext({ viewport: { width: width * 2 + 48, height: 900 }, deviceScaleFactor: 1 });
    const boardPage = await board.newPage();
    await boardPage.setContent(`<!doctype html><html><body style="margin:0;background:#e9e9e9;font:600 18px system-ui">
      <div style="display:flex;gap:16px;padding:16px;align-items:flex-start">
        <figure style="margin:0;width:${width}px"><figcaption style="padding:0 0 8px">Original</figcaption>
          <img style="width:${width}px;display:block" src="${await toData(join(importPath, `${view}.png`))}"></figure>
        <figure style="margin:0;width:${width}px"><figcaption style="padding:0 0 8px">Reconstruction</figcaption>
          <img style="width:${width}px;display:block" src="${await toData(rebuilt)}"></figure>
      </div></body></html>`);
    await boardPage.waitForTimeout(300);
    await boardPage.screenshot({ path: join(importPath, `compare-${view}.png`), fullPage: true });
    await board.close();
    console.log(`✓ imports/${importDir}/compare-${view}.png`);
  }
} finally {
  await browser.close();
}
