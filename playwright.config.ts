import { defineConfig } from "@playwright/test";
const webPort = Number(process.env.WEB_PORT || 4273);
const peerPort = Number(process.env.PEER_PORT || 4274);
export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || `http://127.0.0.1:${webPort}`,
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          args: [
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
          ],
        },
      },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : [
        {
          command: "npm run dev",
          url: `http://127.0.0.1:${webPort}`,
          reuseExistingServer: false,
          env: { WEB_PORT: String(webPort), VITE_PEER_PORT: String(peerPort) },
        },
        {
          command: "npm run relay",
          url: `http://127.0.0.1:${peerPort}/health`,
          reuseExistingServer: false,
          env: { PORT: String(peerPort) },
        },
      ],
});
