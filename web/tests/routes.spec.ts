import { expect, test } from '@playwright/test';

test('direct detail URL survives reload without LINE SDK', async ({ page }) => {
  await page.goto('/toilets/507f1f77bcf86cd799439011');
  await page.reload();
  await expect(page).toHaveTitle('廁所詳情｜Bathroom Genius');
  await expect(page.getByRole('link', { name: '回到附近廁所' })).toBeVisible();
});

test('unknown paths offer a route back home', async ({ page }) => {
  await page.goto('/unknown');
  await expect(page).toHaveTitle('找不到頁面｜Bathroom Genius');
  await page.getByRole('link', { name: '回到附近廁所' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('找到附近，安心出發。');
});
