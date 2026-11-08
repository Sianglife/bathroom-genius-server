import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 503,
      json: { message: 'Test backend unavailable' },
    }),
  );
});

test('direct detail URL survives reload without LINE SDK', async ({ page }) => {
  await page.goto('/toilets/507f1f77bcf86cd799439011');
  await page.reload();
  await expect(page).toHaveTitle('廁所詳情｜Bathroom Genius');
  await expect(
    page.getByRole('link', { name: '← 回到搜尋結果' }),
  ).toBeVisible();
});

test('unknown paths offer a route back home', async ({ page }) => {
  await page.goto('/unknown');
  await expect(page).toHaveTitle('找不到頁面｜Bathroom Genius');
  await page.getByRole('link', { name: '回到附近廁所' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '找到附近，安心出發。',
  );
});

test('guest login preserves the review return path', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { message: 'Login required' } }),
  );
  const path = '/toilets/507f1f77bcf86cd799439011/review';
  await page.goto(path);
  await expect(
    page.getByRole('link', { name: '使用 LINE 登入' }),
  ).toHaveAttribute(
    'href',
    `/api/auth/line/start?${new URLSearchParams({ returnTo: path })}`,
  );
});

test('cancelled LINE login shows a notice on the original page and can be retried', async ({
  page,
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { message: 'Login required' } }),
  );
  const path = '/toilets/507f1f77bcf86cd799439011';
  await page.goto(`${path}?login=cancelled`);
  await expect(page).toHaveTitle('廁所詳情｜Bathroom Genius');
  await expect(page.locator('.notice')).toHaveText(
    '已取消 LINE 登入，你仍可繼續瀏覽。',
  );
  await expect(page).toHaveURL(`http://127.0.0.1:5173${path}`);
  await expect(
    page.getByRole('link', { name: '使用 LINE 登入' }),
  ).toHaveAttribute(
    'href',
    `/api/auth/line/start?${new URLSearchParams({ returnTo: path })}`,
  );
  await page.reload();
  await expect(page.locator('.notice')).toHaveCount(0);
});

test('logout obtains a CSRF token and refreshes account status', async ({
  page,
}) => {
  let loggedIn = true;
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: loggedIn ? 200 : 401,
      json: loggedIn
        ? { id: 'user', displayName: '測試使用者', role: 'user' }
        : { message: 'Login required' },
    }),
  );
  await page.route('**/api/auth/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route('**/api/auth/logout', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['x-csrf-token']).toBe('test-csrf');
    loggedIn = false;
    await route.fulfill({ json: { success: true } });
  });
  await page.goto('/');
  await expect(page.getByText('測試使用者', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '登出', exact: true }).click();
  await expect(
    page.getByRole('link', { name: '使用 LINE 登入' }),
  ).toBeVisible();
});

test('logout of an expired session returns to the guest account state', async ({
  page,
}) => {
  let expired = false;
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: expired ? 401 : 200,
      json: expired
        ? { message: 'Login required' }
        : { id: 'user', displayName: '即將過期', role: 'user' },
    }),
  );
  await page.route('**/api/auth/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'guest-csrf' } }),
  );
  await page.route('**/api/auth/logout', (route) => {
    expired = true;
    return route.fulfill({ status: 401, json: { message: 'Login required' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '登出', exact: true }).click();
  await expect(
    page.getByRole('link', { name: '使用 LINE 登入' }),
  ).toBeVisible();
});
