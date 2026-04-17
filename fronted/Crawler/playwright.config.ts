import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

function loadLocalSmokeEnv() {
  const smokeEnvFile = new URL("./.env.smoke.local", import.meta.url);

  if (!existsSync(smokeEnvFile)) {
    return;
  }

  const lines = readFileSync(smokeEnvFile, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = value.replace(/^['"]|['"]$/g, "");
  }
}

loadLocalSmokeEnv();

const baseURL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["smoke/**/*.spec.ts"],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
