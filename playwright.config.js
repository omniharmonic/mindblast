import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:5173",
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: ["--enable-webgl", "--ignore-gpu-blocklist"],
    },
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
