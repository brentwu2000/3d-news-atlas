import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // WebGL runs on SwiftShader (CPU) in headless Chromium; parallel workers starve each
  // other's render loops and make camera-timing assertions and context teardown flaky.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    // Always build fresh: reusing a leftover server once made e2e test a stale build.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
