import { expect, test } from "@playwright/test";
import { loginAsSmokeUser } from "./helpers/auth";
import {
  cleanupCookieCredentialsByPrefix,
} from "./helpers/cookie-credentials";

test.describe("cookie credential center", () => {
  test("can create, update and delete a credential from the cookie page", async ({ page }) => {
    const prefix = `smoke-cookie-page-${Date.now()}`;
    const initialName = `${prefix}-initial`;
    const updatedName = `${prefix}-updated`;

    await loginAsSmokeUser(page);
    await cleanupCookieCredentialsByPrefix(page, prefix);

    try {
      await page.goto("/account/cookies");
      await expect(page.getByTestId("cookie-credentials-page")).toBeVisible();

      await page.getByTestId("cookie-create-button").click();
      await page.getByTestId("cookie-name-input").locator("input, textarea").fill(initialName);
      await page.getByTestId("cookie-domain-input").locator("input, textarea").fill("example.com");
      await page.getByTestId("cookie-string-input").locator("textarea, input").fill("session=abc123; theme=dark");
      await page.getByTestId("cookie-notes-input").locator("textarea, input").fill("smoke create");
      await page.getByTestId("cookie-save-button").click();

      const createdCard = page.getByTestId("cookie-credential-card").filter({
        hasText: initialName,
      });
      await expect(createdCard).toBeVisible();

      await page.getByTestId("cookie-preview-url").locator("input").fill("https://sub.example.com/account");
      await expect(page.getByText(`已匹配到“${initialName}”`)).toBeVisible();

      await page.getByTestId("cookie-name-input").locator("input, textarea").fill(updatedName);
      await page.getByTestId("cookie-notes-input").locator("textarea, input").fill("smoke updated");
      await page.getByTestId("cookie-save-button").click();
      await expect(
        page.getByTestId("cookie-credential-card").filter({ hasText: updatedName }),
      ).toBeVisible();

      const updatedCard = page.getByTestId("cookie-credential-card").filter({
        hasText: updatedName,
      });
      await updatedCard.getByRole("button", { name: "删除" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "删除" }).click();

      await expect(
        page.getByTestId("cookie-credential-card").filter({ hasText: updatedName }),
      ).toHaveCount(0);
    } finally {
      await cleanupCookieCredentialsByPrefix(page, prefix);
    }
  });
});
