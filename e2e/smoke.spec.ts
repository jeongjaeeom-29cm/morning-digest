import { test, expect } from '@playwright/test';

test('home renders and theme toggles', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: "Today's picks" })).toBeVisible();
  const before = await page.locator('html').getAttribute('data-theme');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  const after = await page.locator('html').getAttribute('data-theme');
  expect(after).not.toBe(before);
});
