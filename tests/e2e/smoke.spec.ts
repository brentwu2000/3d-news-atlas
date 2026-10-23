import type { ConsoleMessage, Page } from "@playwright/test";
// Type-only import pulls in the window.__ATLAS_STATS__ global declaration.
import type {} from "../../src/components/atlas/PerfProbe";
import { expect, test } from "./fixtures";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("renders the 3D city without hydration or console errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  const scene = page.getByTestId("atlas-scene");
  await expect(scene).toHaveAttribute("data-scene-status", "ready", { timeout: 30_000 });
  const canvas = scene.locator("canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(200);
  expect(box?.height).toBeGreaterThan(200);
  await page.waitForTimeout(1000);
  expect(errors.filter((e) => /hydrat|did not match|error #418|error #423/i.test(e))).toEqual([]);
  expect(errors).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

test("server-rendered index contains every topic, event summary and source", async ({ page, request }) => {
  // Raw HTML (before any JS) must already contain events, summaries and sources.
  const html = await (await request.get("/")).text();
  expect(html).toContain("東延線工程經費估算出現分歧");
  expect(html).toContain("市府估算與外部顧問報告的經費差距約兩成");
  expect(html).toContain("貨車排隊回堵引發居民陳情");
  expect(html).toContain("https://example.org/fictional/");
  await page.goto("/");
  await expect(page.locator('button[id^="nav-topic-"]')).toHaveCount(19);
  // Editorial: a "fictional sample" label must be visible at every viewport width.
  await expect(page.getByText("虛構範例").first()).toBeVisible();
});

test("first visit shows onboarding once; it can be completed and is remembered", async ({ freshPage: page }) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "這是一座虛構的城市" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "下一步 →" })).toBeFocused();
  await dialog.getByRole("button", { name: "下一步 →" }).click();
  await page.getByRole("button", { name: "下一步 →" }).click();
  await page.getByRole("button", { name: "開始探索" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("atlas-scene")).toHaveAttribute("data-scene-status", "ready", { timeout: 30_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("orbit controls respond to drag and wheel", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse drag/wheel covered on desktop only");
  await page.goto("/");
  await expect(page.getByTestId("atlas-scene")).toHaveAttribute("data-scene-status", "ready", { timeout: 30_000 });
  const canvas = page.locator("canvas");
  const before = await canvas.screenshot();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 40, { steps: 10 });
  await page.mouse.up();
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(800);
  const after = await canvas.screenshot();
  expect(Buffer.compare(before, after)).not.toBe(0);
  await page.getByRole("button", { name: "全景" }).click();
  await page.waitForTimeout(1500);
});

test("time-of-day switch changes the lighting", async ({ page }) => {
  await page.goto("/");
  const scene = page.getByTestId("atlas-scene");
  await expect(scene).toHaveAttribute("data-scene-status", "ready", { timeout: 30_000 });
  await page.waitForTimeout(500);
  const night = await scene.screenshot();
  await page.getByRole("button", { name: /白天/ }).first().click();
  await expect(page.getByRole("button", { name: /白天/ }).first()).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(800);
  expect(Buffer.compare(night, await scene.screenshot())).not.toBe(0);
});

test("WebGL-disabled fallback still exposes topics, events and sources", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?webgl=0");
  const fallback = page.getByTestId("webgl-fallback");
  await expect(fallback).toBeVisible();
  await expect(fallback.getByRole("group", { name: /主題六邊形配置/ })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  // 2D hex tiles are real buttons; selecting one opens the same detail card.
  await fallback.getByRole("button", { name: "05 預算審議" }).click();
  const panel = page.getByTestId("event-panel");
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("中央議會年度預算審議");
  await panel.getByRole("listitem").getByRole("button", { name: /^年度預算三讀表決/ }).first().click();
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("年度預算三讀表決");
  await expect(panel.getByTestId("event-status")).toContainText("已報導");
  const link = panel.getByRole("link", { name: /年度預算三讀通過/ });
  await expect(link).toHaveAttribute("href", /^https:\/\/example\.org\//);
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("mobile uses the low quality preset", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  const scene = page.getByTestId("atlas-scene");
  await expect(scene).toHaveAttribute("data-scene-status", "ready", { timeout: 30_000 });
  await expect(scene).toHaveAttribute("data-quality", "low");
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  async function readyCanvasShot(page: Page) {
    const scene = page.getByTestId("atlas-scene");
    await expect(scene).toHaveAttribute("data-scene-status", "ready", { timeout: 30_000 });
    // Web fonts load asynchronously (cached on reload): compare only fully-styled frames.
    await page.evaluate(() => document.fonts.ready);
    // Demand frameloop: allow the first frames (and drei Html labels) to settle.
    await page.waitForTimeout(1500);
    return scene.screenshot();
  }

  test("removes idle motion (train, smoke, particles) entirely", async ({ page }) => {
    await page.goto("/");
    const first = await readyCanvasShot(page);
    await page.waitForTimeout(1500);
    const second = await page.getByTestId("atlas-scene").screenshot();
    expect(Buffer.compare(first, second)).toBe(0);
  });

  test("reloads render identically for the same viewport and seed", async ({ page }) => {
    await page.goto("/");
    const first = await readyCanvasShot(page);
    await page.reload();
    const second = await readyCanvasShot(page);
    expect(Buffer.compare(first, second)).toBe(0);
  });
});

test("renderer stays within the draw-call budget", async ({ page }) => {
  await page.goto("/?debug=1");
  await page.waitForFunction(() => (window.__ATLAS_STATS__?.samples ?? 0) >= 2, null, { timeout: 30_000 });
  const stats = await page.evaluate(() => window.__ATLAS_STATS__!);
  // Whole 19-tile city is instanced; the count is independent of tile/event numbers.
  expect(stats.drawCalls).toBeLessThan(160);
  expect(stats.dpr).toBeLessThanOrEqual(1.5);
});
