import { expect, test, type Page } from "@playwright/test";
// Type-only import pulls in the window.__ATLAS_DEBUG__ global declaration.
import type {} from "../../src/components/atlas/DebugBridge";

const scene = (page: Page) => page.getByTestId("atlas-scene");
const panel = (page: Page) => page.getByTestId("event-panel");

async function gotoReady(page: Page, query = "") {
  await page.goto(`/?debug=1${query ? `&${query}` : ""}`);
  await expect(scene(page)).toHaveAttribute("data-scene-status", "ready", { timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__ATLAS_DEBUG__));
  // Let a few frames render so projected positions are stable.
  await page.waitForTimeout(400);
}

async function islandPoint(page: Page, topicId: string) {
  const p = await page.evaluate((id) => window.__ATLAS_DEBUG__!.islandScreenPoint(id), topicId);
  expect(p, `island ${topicId} on screen`).not.toBeNull();
  return p!;
}

async function markerPoint(page: Page, eventId: string) {
  const p = await page.evaluate((id) => window.__ATLAS_DEBUG__!.markerScreenPoint(id), eventId);
  expect(p, `marker ${eventId} on screen`).not.toBeNull();
  return p!;
}

async function tapOrClick(page: Page, isMobile: boolean, p: { x: number; y: number }) {
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

const pose = (page: Page) => page.evaluate(() => window.__ATLAS_DEBUG__!.cameraPose());

function expectPoseClose(a: { position: number[]; target: number[] }, b: { position: number[]; target: number[] }, digits = 2) {
  [...a.position, ...a.target].forEach((v, i) => expect(v).toBeCloseTo([...b.position, ...b.target][i]!, digits));
}

test("clicking an island focuses it and opens the topic panel", async ({ page, isMobile }) => {
  await gotoReady(page);
  await tapOrClick(page, isMobile, await islandPoint(page, "harborton-light-rail"));
  await expect(scene(page)).toHaveAttribute("data-camera-mode", "focused", { timeout: 5_000 });
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("【虛構範例】海港市輕軌延伸計畫");
  await expect(page).toHaveURL(/topic=harborton-light-rail/);
});

test("dragging across an island orbits but does not select it", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse drag; touch drag is covered by OrbitControls itself");
  await gotoReady(page);
  const before = await pose(page);
  const p = await islandPoint(page, "northbay-industrial-transition");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y + 10, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await expect(panel(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/topic=/);
  expect(await pose(page)).not.toEqual(before);
});

test("a sub-threshold wobble (< 6px) still counts as a click", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse only");
  await gotoReady(page);
  const p = await islandPoint(page, "silversand-coast-monitoring");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 3, p.y + 2);
  await page.mouse.up();
  await expect(page).toHaveURL(/topic=silversand-coast-monitoring/);
});

test("marker click has priority over its island and opens the event", async ({ page, isMobile }) => {
  await gotoReady(page);
  await tapOrClick(page, isMobile, await markerPoint(page, "ss-erosion-report"));
  await expect(page).toHaveURL(/event=ss-erosion-report/);
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("年度海岸侵蝕監測報告發布");
  // Status, date, publisher and source link are present as text.
  await expect(panel(page).getByTestId("event-status")).toContainText("已報導");
  await expect(panel(page)).toContainText("銀沙海岸電台（虛構）");
  await expect(panel(page).getByRole("link", { name: /銀沙海岸年度侵蝕報告重點/ })).toBeVisible();
});

test("rapid topic switching always settles on the last topic's deterministic pose", async ({ page, browser, isMobile }) => {
  test.skip(isMobile, "uses the desktop list");
  await gotoReady(page);
  const ids = ["harborton-light-rail", "greenridge-reforestation", "central-council-budget", "silversand-coast-monitoring", "northbay-industrial-transition"];
  for (let round = 0; round < 2; round++) {
    for (const id of ids) await page.locator(`#nav-topic-${id}`).click({ delay: 0 });
  }
  await page.keyboard.press("Escape");
  await page.locator("#nav-topic-northbay-industrial-transition").click();
  await expect(scene(page)).toHaveAttribute("data-camera-mode", "focused", { timeout: 5_000 });
  const settled = await pose(page);

  // Reference: one clean selection in a fresh page with the same viewport.
  const ref = await browser.newPage({ viewport: page.viewportSize()! });
  await gotoReady(ref);
  await ref.locator("#nav-topic-northbay-industrial-transition").click();
  await expect(scene(ref)).toHaveAttribute("data-camera-mode", "focused", { timeout: 5_000 });
  expectPoseClose(settled, await pose(ref));
  await ref.close();
});

test("user drag during a transition cancels it without leaving the camera mid-state", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse drag");
  await gotoReady(page);
  await page.locator("#nav-topic-central-council-budget").click();
  await expect(scene(page)).toHaveAttribute("data-camera-mode", "focusing");
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3 + 80, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();
  await expect(scene(page)).toHaveAttribute("data-camera-mode", "focused");
  // Back to overview still works afterwards.
  await page.keyboard.press("Escape");
  await expect(scene(page)).toHaveAttribute("data-camera-mode", "overview", { timeout: 5_000 });
});

test("keyboard: list opens events, Escape closes them and restores focus", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop keyboard flow");
  await gotoReady(page);
  await page.locator("#nav-event-nb-training-program").focus();
  await page.keyboard.press("Enter");
  const heading = panel(page).getByRole("heading", { level: 2 });
  await expect(heading).toHaveText("勞工轉職訓練課程開班");
  await expect(heading).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(heading).toHaveText("【虛構範例】北灣工業區轉型");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator("#nav-topic-northbay-industrial-transition")).toBeFocused();
  await expect(scene(page)).toHaveAttribute("data-camera-mode", "overview", { timeout: 5_000 });
  await expect(page).not.toHaveURL(/topic=|event=/);
});

test("returning to overview restores the user's previous orbit", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse orbit");
  await gotoReady(page);
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height - 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + box.height - 120, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(2500); // let damping settle
  const orbit = await pose(page);
  await page.locator("#nav-topic-greenridge-reforestation").click();
  await expect(scene(page)).toHaveAttribute("data-camera-mode", "focused", { timeout: 5_000 });
  await page.keyboard.press("Escape");
  await expect(scene(page)).toHaveAttribute("data-camera-mode", "overview", { timeout: 5_000 });
  // Damping may still be decaying by a hair when the orbit is captured.
  expectPoseClose(await pose(page), orbit, 1);
});

test("search filters the list and the 3D markers identically", async ({ page }) => {
  await gotoReady(page);
  await page.getByLabel("搜尋事件（標題、摘要、標籤）").fill("預算");
  const visibleNav = page.locator('button[id^="nav-event-"]');
  await expect(page.getByTestId("visible-count")).toContainText("顯示 4 / 17");
  const listIds = (await visibleNav.evaluateAll((els) => els.map((e) => e.id.replace("nav-event-", "")))).sort();
  const markerIds = (await page.evaluate(() => window.__ATLAS_DEBUG__!.visibleMarkerIds())).sort();
  expect(markerIds).toEqual(listIds);
  await expect(page).toHaveURL(/q=%E9%A0%90%E7%AE%97/);

  await page.getByLabel("搜尋事件（標題、摘要、標籤）").fill("沒有這個字");
  await expect(page.getByText("沒有符合目前搜尋、分類或時間條件的事件。")).toBeVisible();
  await page.getByRole("button", { name: "清除所有篩選" }).click();
  await expect(page.getByTestId("visible-count")).toContainText("顯示 17 / 17");
});

test("category chips filter list and markers", async ({ page }) => {
  await gotoReady(page);
  await page.getByRole("button", { name: "環境", exact: true }).click();
  await expect(page.getByRole("button", { name: "環境", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("visible-count")).toContainText("顯示 3 / 17");
  expect((await page.evaluate(() => window.__ATLAS_DEBUG__!.visibleMarkerIds())).length).toBe(3);
});

test("timeline scrub, play/pause, and pause on selection", async ({ page }) => {
  await gotoReady(page);
  const range = page.getByLabel("依發生日期篩選");
  await range.focus();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("timeline-label")).toContainText("2026年1月14日");
  await expect(page.getByTestId("visible-count")).toContainText("顯示 1 / 17");
  expect(await page.evaluate(() => window.__ATLAS_DEBUG__!.visibleMarkerIds())).toEqual(["hr-route-hearing"]);
  await expect(range).toHaveAttribute("aria-valuetext", /顯示 1 \/ 17 則事件/);
  await expect(page).toHaveURL(/until=2026-01-14/);

  const play = page.getByRole("button", { name: "播放" });
  await play.click();
  await expect(page.getByRole("button", { name: "暫停" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("visible-count")).not.toContainText("顯示 1 / 17", { timeout: 4_000 });
  // Selecting something pauses playback.
  await page.locator("#nav-topic-harborton-light-rail").click();
  await expect(page.getByRole("button", { name: "播放" })).toHaveAttribute("aria-pressed", "false");
});

test("deep link opens the event and focuses its island", async ({ page }) => {
  await gotoReady(page, "event=ss-dune-restoration&q=%E5%BE%A9%E8%82%B2");
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("沙丘復育試驗區完工");
  await expect(scene(page)).toHaveAttribute("data-camera-mode", "focused", { timeout: 5_000 });
  await expect(page.getByLabel("搜尋事件（標題、摘要、標籤）")).toHaveValue("復育");
});

test("invalid deep-link params are ignored safely", async ({ page }) => {
  await gotoReady(page, "event=%3Cscript%3E&topic=nope&until=2026-99-99&cat=%E5%81%87");
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByTestId("visible-count")).toContainText("顯示 17 / 17");
});

test.describe("mobile panel", () => {
  test("bottom sheet expands/collapses and leaves part of the canvas visible", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await gotoReady(page);
    const toggle = page.locator("#atlas-nav").getByRole("button", { name: "展開面板" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(page.locator("#atlas-nav").getByRole("button", { name: "收合面板" })).toHaveAttribute("aria-expanded", "true");
    const canvas = (await page.locator("canvas").boundingBox())!;
    const sheet = (await page.locator("#atlas-nav").boundingBox())!;
    expect(sheet.y).toBeGreaterThan(canvas.y + 40); // canvas never fully covered
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.locator("#atlas-nav").getByRole("button", { name: "收合面板" }).click();
    await tapOrClick(page, true, await islandPoint(page, "central-council-budget"));
    await expect(page.locator("#atlas-panel")).toBeVisible();
    await expect(page.locator("#atlas-nav")).toBeHidden();
    const overflowAfter = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflowAfter).toBeLessThanOrEqual(0);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("camera changes are immediate (no focusing/returning phase)", async ({ page }) => {
    await gotoReady(page);
    const modes: string[] = [];
    await page.exposeFunction("__recordMode", (m: string) => modes.push(m));
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="atlas-scene"]')!;
      new MutationObserver(() => (window as unknown as { __recordMode: (m: string) => void }).__recordMode(el.getAttribute("data-camera-mode") ?? "")).observe(el, {
        attributes: true,
        attributeFilter: ["data-camera-mode"],
      });
    });
    await page.locator("#nav-topic-greenridge-reforestation").click();
    await expect(scene(page)).toHaveAttribute("data-camera-mode", "focused");
    await page.keyboard.press("Escape");
    await expect(scene(page)).toHaveAttribute("data-camera-mode", "overview");
    expect(modes).not.toContain("focusing");
    expect(modes).not.toContain("returning");
  });
});
