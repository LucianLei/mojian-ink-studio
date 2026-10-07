import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chrome" } },
  ],
});
