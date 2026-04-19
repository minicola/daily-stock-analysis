import { test, expect } from "@playwright/test";

test("shell renders and navigates across features", async ({ page }) => {
  await page.goto("/viz/");
  await expect(page.getByText("仪表盘")).toBeVisible();
  await page.getByRole("link", { name: "行情" }).click();
  await expect(page.getByPlaceholder(/600519/)).toBeVisible();
  await page.getByRole("link", { name: "组合" }).click();
  await expect(page.getByText("录入交易")).toBeVisible();
  await page.getByRole("link", { name: "筛选" }).click();
  await expect(page.getByText("开始筛选")).toBeVisible();
});
