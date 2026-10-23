import { test as base, expect, type Page } from "@playwright/test";

/**
 * Default test fixture: marks onboarding as already seen so the first-visit
 * dialog doesn't cover the map. The onboarding flow itself is tested with
 * `freshPage`, which has clean storage.
 */
export const test = base.extend<{ freshPage: Page }>({
  page: async ({ page }, provide) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("news-atlas:onboarded", "1");
      } catch {
        // ignore
      }
    });
    await provide(page);
  },
  freshPage: async ({ browser, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }, provide) => {
    const context = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

export { expect };
