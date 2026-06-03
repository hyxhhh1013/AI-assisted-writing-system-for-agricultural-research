import { test, expect } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "admin@lab.local";
const password = process.env.E2E_PASSWORD ?? "admin123456";

test.describe("主路径冒烟", () => {
  test("登录 → 新建项目 → 编辑引言 → 保存到云端", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("admin@lab.local").fill(email);
    await page.getByPlaceholder("••••••").fill(password);
    await page.getByRole("button", { name: "登录" }).click();

    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });

    await page.goto("/projects");
    await page.getByRole("button", { name: "新建论文项目" }).click();
    await page.waitForURL(/\/workbench\?id=/, { timeout: 30_000 });

    const marker = `e2e-smoke-${Date.now()}`;
    const editor = page.locator("textarea").first();
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.fill(marker);

    const saveResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/api/projects") &&
        res.request().method() === "POST" &&
        res.ok(),
      { timeout: 30_000 },
    );
    await page.getByTitle("保存项目").click();
    await saveResponse;

    await page.reload();
    await expect(editor).toHaveValue(marker, { timeout: 30_000 });
  });
});
