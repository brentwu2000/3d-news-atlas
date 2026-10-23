// Capture screenshots + renderer stats against a running production server.
// Usage: node scripts/measure.mjs <label> [baseUrl]
//   e.g. npm run build && npx next start -p 3100   (in another shell)
//        node scripts/measure.mjs after http://127.0.0.1:3100
// Headless Chromium renders with SwiftShader (CPU), so FPS here is a lower
// bound for regression comparison only, not a real-device measurement.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";

const label = process.argv[2] ?? "current";
const baseUrl = process.argv[3] ?? "http://127.0.0.1:3100";
const outDir = `docs/screenshots/${label}`;
await mkdir(outDir, { recursive: true });

const targets = [
  { name: "desktop", context: { viewport: { width: 1440, height: 900 } } },
  { name: "mobile", context: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
];

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const report = { label, baseUrl, renderer: "headless Chromium + SwiftShader (software)", results: {} };

for (const target of targets) {
  const ctx = await browser.newContext(target.context);
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/?debug=1`, { waitUntil: "load" });
  await page.waitForSelector('[data-scene-status="ready"]', { timeout: 30_000 });
  // Discard the warm-up window, then average a few 1s samples.
  await page.waitForFunction(() => (window.__ATLAS_STATS__?.samples ?? 0) >= 2, null, { timeout: 30_000 });
  const samples = [];
  for (let i = 0; i < 4; i++) {
    const before = await page.evaluate(() => window.__ATLAS_STATS__?.samples ?? 0);
    await page.waitForFunction((n) => (window.__ATLAS_STATS__?.samples ?? 0) > n, before, { timeout: 30_000 });
    samples.push(await page.evaluate(() => window.__ATLAS_STATS__));
  }
  const transfer = await page.evaluate(() => {
    const entries = performance.getEntriesByType("resource");
    const js = entries.filter((e) => e.initiatorType === "script" || e.name.endsWith(".js"));
    const sum = (list) => list.reduce((s, e) => s + (e.transferSize || 0), 0);
    return { jsBytes: sum(js), allBytes: sum(entries), jsFiles: js.length };
  });
  const last = samples[samples.length - 1];
  report.results[target.name] = {
    viewport: target.context.viewport,
    fpsSamples: samples.map((s) => s.fps),
    fpsMedian: samples.map((s) => s.fps).sort((a, b) => a - b)[Math.floor(samples.length / 2)],
    drawCalls: last.drawCalls,
    triangles: last.triangles,
    geometries: last.geometries,
    textures: last.textures,
    programs: last.programs,
    dpr: last.dpr,
    transfer,
  };
  // Screenshot without the debug overlay so before/after images compare cleanly.
  await page.goto(`${baseUrl}/`, { waitUntil: "load" });
  await page.waitForSelector('[data-scene-status="ready"]', { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/${target.name}.png` });
  await ctx.close();
}

const fallbackCtx = await browser.newContext(targets[1].context);
const fallbackPage = await fallbackCtx.newPage();
await fallbackPage.goto(`${baseUrl}/?webgl=0`);
await fallbackPage.waitForSelector('[data-testid="webgl-fallback"]');
await fallbackPage.screenshot({ path: `${outDir}/fallback-mobile.png` });
await fallbackCtx.close();

await browser.close();
await writeFile(`${outDir}/perf.json`, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
