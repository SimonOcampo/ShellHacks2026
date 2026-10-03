import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `${process.env.CI ? "uv" : "python -m uv"} run python -m uvicorn odd_scout.api.main:app --host 127.0.0.1 --port 8000`,
      cwd: "../..",
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: !process.env.CI,
      env: { ODD_DATA_MODE: "mock" },
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8000",
        NEXT_PUBLIC_DATA_TRANSPORT: "http",
      },
    },
  ],
});
