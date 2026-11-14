import { defineConfig } from "@playwright/test";

const port = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: `http://localhost:${port}`,
    // uses the locally installed Chrome, so no browser download is needed
    channel: "chrome",
    viewport: { width: 1600, height: 900 },
    acceptDownloads: true,
  },
  webServer: {
    command: `pnpm build && pnpm start --port ${port}`,
    url: `http://localhost:${port}/en`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
