import { expect, type Page } from "@playwright/test";

export function getSmokeCredentials() {
  const email = String(process.env.SMOKE_USER_EMAIL || "").trim();
  const password = String(process.env.SMOKE_USER_PASSWORD || "").trim();

  if (!email || !password) {
    throw new Error(
      "Missing smoke credentials. Please set SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD before running npm run test:smoke.",
    );
  }

  return {
    email,
    password,
  };
}

export async function loginAsSmokeUser(page: Page) {
  const credentials = getSmokeCredentials();

  await page.goto("/login");
  await expect(page.getByTestId("login-card")).toBeVisible();

  await page.getByTestId("login-email").locator("input, textarea").fill(credentials.email);
  await page.getByTestId("login-password").locator("input, textarea").fill(credentials.password);
  await page.getByTestId("login-submit").click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
