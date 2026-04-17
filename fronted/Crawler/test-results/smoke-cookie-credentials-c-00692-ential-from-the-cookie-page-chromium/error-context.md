# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke\cookie-credentials.spec.ts >> cookie credential center >> can create, update and delete a credential from the cookie page
- Location: tests\smoke\cookie-credentials.spec.ts:8:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5173/login
Call log:
  - navigating to "http://127.0.0.1:5173/login", waiting until "load"

```

# Test source

```ts
  1  | import { expect, type Page } from "@playwright/test";
  2  | 
  3  | export function getSmokeCredentials() {
  4  |   const email = String(process.env.SMOKE_USER_EMAIL || "").trim();
  5  |   const password = String(process.env.SMOKE_USER_PASSWORD || "").trim();
  6  | 
  7  |   if (!email || !password) {
  8  |     throw new Error(
  9  |       "Missing smoke credentials. Please set SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD before running npm run test:smoke.",
  10 |     );
  11 |   }
  12 | 
  13 |   return {
  14 |     email,
  15 |     password,
  16 |   };
  17 | }
  18 | 
  19 | export async function loginAsSmokeUser(page: Page) {
  20 |   const credentials = getSmokeCredentials();
  21 | 
> 22 |   await page.goto("/login");
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5173/login
  23 |   await expect(page.getByTestId("login-card")).toBeVisible();
  24 | 
  25 |   await page.getByTestId("login-email").locator("input, textarea").fill(credentials.email);
  26 |   await page.getByTestId("login-password").locator("input, textarea").fill(credentials.password);
  27 |   await page.getByTestId("login-submit").click();
  28 | 
  29 |   await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  30 | }
  31 | 
```