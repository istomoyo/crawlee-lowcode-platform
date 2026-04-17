import { expect, test } from "@playwright/test";
import { loginAsSmokeUser } from "./helpers/auth";
import {
  cleanupCookieCredentialsByPrefix,
  createCookieCredential,
} from "./helpers/cookie-credentials";

test.describe("task cookie auto match", () => {
  test("suggests and applies a saved credential when task url matches domain", async ({
    page,
  }) => {
    const prefix = `smoke-task-cookie-${Date.now()}`;
    const credentialName = `${prefix}-credential`;

    await loginAsSmokeUser(page);
    await cleanupCookieCredentialsByPrefix(page, prefix);

    try {
      await createCookieCredential(page, {
        name: credentialName,
        cookieString: "session=task123; theme=dark",
        cookieDomain: "example.com",
        notes: "smoke auto match",
      });

      await page.goto("/crawleer/task-add/basic");
      await page.locator('[data-testid="task-basic-name"] input').fill(`${prefix}-task`);
      await page.locator('[data-testid="task-basic-url"] input').fill("https://sub.example.com/list");

      await expect(page.getByTestId("cookie-match-card")).toContainText(credentialName);
      await page.getByTestId("cookie-apply-suggestion").click();

      const selectedCredential = page.getByTestId("selected-cookie-credential");
      await expect(selectedCredential).toBeVisible();
      await expect(selectedCredential).toContainText(credentialName);
      await expect(selectedCredential).toContainText("example.com");
    } finally {
      await cleanupCookieCredentialsByPrefix(page, prefix);
    }
  });
});
