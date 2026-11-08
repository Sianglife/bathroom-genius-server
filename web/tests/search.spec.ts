import { expect, test, type Page } from '@playwright/test';

const id = (index: number) => index.toString(16).padStart(24, '0');
const toilet = (index: number) => ({
  _id: id(index),
  name: `測試廁所 ${index}`,
  address: '臺北市測試路 1 號',
  location: { type: 'Point', coordinates: [121.5, 25] },
  hasToiletPaper: index === 2 ? null : index === 3 ? false : true,
  isAccessible: index === 2 ? null : true,
  tags: ['親子'],
  avgCleanScore: index === 2 ? 0 : 4.5,
  avgConvenienceScore: index === 2 ? 0 : 4,
  reviewCount: index === 2 ? 0 : 6,
  distance: index * 100,
  note: '<script>不應執行</script>',
  landmark: '公園入口',
  openInfo: { hours: '08:00–20:00' },
});
const result = <T>(items: T[], total = items.length, page = 1, limit = 10) => ({
  data: items,
  total,
  page,
  limit,
  hasMore: page * limit < total,
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.permissions) {
      const original = navigator.geolocation.getCurrentPosition.bind(
        navigator.geolocation,
      );
      navigator.geolocation.getCurrentPosition = (
        success,
        failure,
        options,
      ) => {
        void navigator.permissions
          .query({ name: 'geolocation' })
          .then((permission) => {
            if (permission.state === 'granted')
              original(success, failure, options);
            else failure?.({ code: 1 } as GeolocationPositionError);
          });
      };
    }
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { message: 'Test only' } }),
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { message: 'Login required' } }),
  );
});

async function detailApi(page: Page, index = 1) {
  await page.route(`**/api/toilets/${id(index)}`, (route) =>
    route.fulfill({ json: toilet(index) }),
  );
  await page.route(`**/api/toilets/${id(index)}/reviews?*`, (route) => {
    const pageNumber = Number(
      new URL(route.request().url()).searchParams.get('page'),
    );
    const rows = Array.from({ length: pageNumber === 1 ? 5 : 1 }, (_, i) => ({
      _id: id(pageNumber * 10 + i),
      toiletId: id(index),
      authorName: `使用者 ${pageNumber}-${i}`,
      cleanScore: 4,
      convenienceScore: 3,
      hasToiletPaper: null,
      comment: '乾淨，入口好找。',
      createdAt: '2026-11-06T00:00:00.000Z',
    }));
    return route.fulfill({ json: result(rows, 6, pageNumber, 5) });
  });
}

test('explicit location, nearby pagination, detail navigation and cached return', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 25.033, longitude: 121.565 });
  let nearbyCalls = 0;
  await page.route('**/api/toilets?*', (route) =>
    route.fulfill({ json: result([toilet(2)]) }),
  );
  await page.route('**/api/toilets/nearby?*', (route) => {
    nearbyCalls++;
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('lat')).toBe('25.033');
    expect(params.get('lng')).toBe('121.565');
    expect(params.has('minCleanScore')).toBe(false);
    const current = Number(params.get('page'));
    return route.fulfill({
      json: result(
        Array.from({ length: current === 1 ? 10 : 2 }, (_, i) =>
          toilet(current === 1 ? i + 1 : i + 11),
        ),
        12,
        current,
      ),
    });
  });
  await detailApi(page, 11);
  await page.goto('/');
  await expect(page.getByLabel('名稱或地址')).toBeHidden();
  await expect(page.locator('.toilet-card')).toHaveCount(10);
  await expect(
    page.getByText('直線距離 100 公尺', { exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has('lat')).toBe(false);
  expect(new URL(page.url()).searchParams.has('lng')).toBe(false);
  await page.getByRole('button', { name: '載入更多', exact: true }).click();
  await expect(page.locator('.toilet-card')).toHaveCount(12);
  await expect(
    page.getByRole('button', { name: '載入更多', exact: true }),
  ).toBeHidden();
  await page.getByRole('link', { name: '測試廁所 11', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '測試廁所 11',
  );
  await expect(
    page.getByRole('link', { name: '開始步行導航' }),
  ).toHaveAttribute('href', /destination=25%2C121\.5&travelmode=walking/);
  await page.getByRole('link', { name: '← 回到搜尋結果' }).click();
  await expect(page.locator('.toilet-card')).toHaveCount(12);
  await expect(page.getByText(/已還原 12 間搜尋結果/)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  expect(nearbyCalls).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const [code, message] of [
  [1, '定位權限遭拒絕'],
  [3, '定位逾時'],
] as const) {
  test(`${message} still allows keyword search and URL filters`, async ({
    page,
  }) => {
    await page.addInitScript((failureCode) => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (
            _success: unknown,
            failure: (error: { code: number }) => void,
          ) => failure({ code: failureCode }),
        },
      });
    }, code);
    const calls: URL[] = [];
    await page.route('**/api/toilets?*', (route) => {
      calls.push(new URL(route.request().url()));
      return route.fulfill({
        json: result([
          toilet(calls.at(-1)!.searchParams.has('hasToiletPaper') ? 1 : 2),
        ]),
      });
    });
    await page.goto('/');
    await expect(page.getByText(new RegExp(message))).toBeVisible();
    await expect(
      page.locator('.toilet-card').getByText('衛生紙：未知'),
    ).toBeVisible();
    await expect(
      page.locator('.toilet-card').getByText(/尚無評分/),
    ).toBeVisible();
    await page.getByLabel('名稱或地址').fill('公園');
    await page.getByText('篩選條件', { exact: true }).click();
    await page
      .getByRole('combobox', { name: '衛生紙', exact: true })
      .selectOption('true');
    await page
      .getByRole('combobox', { name: '最低乾淨度', exact: true })
      .selectOption('4');
    await page.getByLabel('名稱或地址').blur();
    await expect
      .poll(() => calls.at(-1)?.searchParams.get('search'))
      .toBe('公園');
    expect(calls.at(-1)?.searchParams.get('hasToiletPaper')).toBe('true');
    expect(calls.at(-1)?.searchParams.has('lat')).toBe(false);
    expect(calls.at(-1)?.searchParams.has('radius')).toBe(false);
    await expect(page).toHaveURL(
      /search=.*hasToiletPaper=true.*minCleanScore=4/,
    );
    await expect(
      page.locator('.toilet-card').getByText('衛生紙：有'),
    ).toBeVisible();
    await expect(
      page.locator('.toilet-card').getByText(/直線距離/),
    ).toHaveCount(0);
  });
}

test('empty nearby results offer explicit expansion and filter reset', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 25, longitude: 121.5 });
  const radii: string[] = [];
  await page.route('**/api/toilets?*', (route) =>
    route.fulfill({ json: result([]) }),
  );
  await page.route('**/api/toilets/nearby?*', (route) => {
    radii.push(new URL(route.request().url()).searchParams.get('radius')!);
    return route.fulfill({ json: result([]) });
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '擴大搜尋範圍' }),
  ).toBeVisible();
  expect(radii).toEqual(['1000']);
  await page.getByRole('button', { name: '擴大搜尋範圍' }).click();
  await expect.poll(() => radii.at(-1)).toBe('3000');
  await expect(page.getByRole('button', { name: '擴大搜尋範圍' })).toBeHidden();
  await page.getByRole('button', { name: '清除所有篩選' }).click();
  await expect.poll(() => radii.at(-1)).toBe('1000');
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
});

test('failed search retains results and retry replaces them', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/api/toilets?*', (route) => {
    const query = new URL(route.request().url()).searchParams.get('search');
    if (query === '新結果' && fail)
      return route.fulfill({ status: 500, json: {} });
    return route.fulfill({ json: result([toilet(query ? 2 : 1)]) });
  });
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: '測試廁所 1', exact: true }),
  ).toBeVisible();
  await page.getByLabel('名稱或地址').fill('新結果');
  await page.getByLabel('名稱或地址').blur();
  await expect(page.getByRole('alert')).toContainText('搜尋失敗');
  await expect(
    page.getByRole('link', { name: '測試廁所 1', exact: true }),
  ).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: '重試搜尋' }).click();
  await expect(
    page.getByRole('link', { name: '測試廁所 2', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '測試廁所 1', exact: true }),
  ).toHaveCount(0);
});

test('old search responses cannot replace a newer query', async ({ page }) => {
  let release: () => void = () => {};
  let oldStarted = false;
  await page.route('**/api/toilets?*', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('search');
    if (query === '舊') {
      oldStarted = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ json: result([toilet(1)]) }).catch(() => {});
      return;
    }
    await route.fulfill({ json: result(query === '新' ? [toilet(2)] : []) });
  });
  await page.goto('/');
  await page.getByLabel('名稱或地址').fill('舊');
  await page.getByLabel('名稱或地址').blur();
  await expect.poll(() => oldStarted).toBe(true);
  await page.getByLabel('名稱或地址').fill('新');
  await page.getByLabel('名稱或地址').blur();
  await expect(
    page.getByRole('link', { name: '測試廁所 2', exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole('link', { name: '測試廁所 1', exact: true }),
  ).toHaveCount(0);
});

test('detail shows facilities, safe text, opening hours and paginated reviews', async ({
  page,
}) => {
  await detailApi(page, 2);
  await page.goto(`/toilets/${id(2)}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '測試廁所 2',
  );
  await expect(
    page.getByText('衛生紙：未知', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('無障礙：未知', { exact: true })).toBeVisible();
  await expect(page.getByText('08:00–20:00', { exact: true })).toBeVisible();
  await expect(
    page.getByText('<script>不應執行</script>', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.review-card')).toHaveCount(5);
  await page.getByRole('button', { name: '載入更多評論' }).click();
  await expect(page.locator('.review-card')).toHaveCount(6);
  await expect(page.getByRole('button', { name: '載入更多評論' })).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: '../.tmp/step4-detail.png', fullPage: true });
});

test('review errors do not block navigation and deleted toilets have a search exit', async ({
  page,
}) => {
  await detailApi(page);
  let fail = true;
  await page.route(`**/api/toilets/${id(1)}/reviews?*`, (route) =>
    route.fulfill(fail ? { status: 500, json: {} } : { json: result([]) }),
  );
  await page.goto(`/toilets/${id(1)}`);
  await expect(
    page.getByText('評論載入失敗，廁所資訊與導航仍可使用。'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '開始步行導航' })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: '重試載入評論' }).click();
  await expect(
    page.getByText('尚無評論，歡迎分享你的使用經驗。'),
  ).toBeVisible();
  await page.route(`**/api/toilets/${id(3)}`, (route) =>
    route.fulfill({ status: 404, json: {} }),
  );
  await page.goto(`/toilets/${id(3)}`);
  await expect(
    page.getByText('找不到這間廁所，資料可能已移除。'),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '← 回到搜尋結果' }),
  ).toBeVisible();
});

test('clearing location also ignores a pending GPS callback and removes stored coordinates', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          success: (result: {
            coords: { latitude: number; longitude: number };
          }) => void,
        ) => {
          if (++calls === 1)
            success({ coords: { latitude: 25, longitude: 121.5 } });
          else
            (window as unknown as { completeGps: () => void }).completeGps =
              () => success({ coords: { latitude: 26, longitude: 122 } });
        },
      },
    });
  });
  let nearbyCalls = 0;
  await page.route('**/api/toilets?*', (route) =>
    route.fulfill({ json: result([toilet(1)]) }),
  );
  await page.route('**/api/toilets/nearby?*', (route) => {
    nearbyCalls++;
    return route.fulfill({ json: result([toilet(1)]) });
  });
  await page.goto('/');
  await expect(
    page.getByText('直線距離 100 公尺', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '重新定位', exact: true }).click();
  await page.getByRole('link', { name: '手動輸入', exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { completeGps: () => void }).completeGps(),
  );
  await expect(page.locator('.search-notice')).toBeHidden();
  await expect(page.locator('.toilet-card').getByText(/直線距離/)).toHaveCount(
    0,
  );
  expect(nearbyCalls).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem('bathroom-search-v1') || 'null')
            ?.position,
      ),
    )
    .toBeNull();
});

test('desktop directory and mobile filters fit the viewport', async ({
  page,
}) => {
  await page.route('**/api/toilets?*', (route) =>
    route.fulfill({ json: result([toilet(1), toilet(2), toilet(3)]) }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('.toilet-card')).toHaveCount(3);
  await page.screenshot({
    path: '../.tmp/step4-search-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('篩選條件', { exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: '搜尋半徑', exact: true }),
  ).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '../.tmp/step4-search-mobile.png',
    fullPage: true,
  });
});

test('manual mode excludes GPS and switching back clears the keyword', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 25, longitude: 121.5 });
  const calls: URL[] = [];
  await page.route('**/api/toilets**', (route) => {
    calls.push(new URL(route.request().url()));
    return route.fulfill({ json: result([toilet(1)]) });
  });
  await page.goto('/');
  await expect(page.locator('.toilet-card')).toHaveCount(1);
  await expect(page.getByLabel('名稱或地址')).toBeHidden();
  await expect(
    page.getByRole('button', { name: '搜尋廁所', exact: true }),
  ).toBeHidden();
  await page.getByText('篩選條件', { exact: true }).click();
  await page
    .getByRole('combobox', { name: '搜尋半徑', exact: true })
    .selectOption('500');
  await expect.poll(() => calls.at(-1)?.searchParams.get('radius')).toBe('500');
  await page.getByRole('link', { name: '手動輸入', exact: true }).click();
  await page.getByLabel('名稱或地址').fill('車站');
  await page.getByLabel('名稱或地址').blur();
  await expect
    .poll(() => calls.at(-1)?.searchParams.get('search'))
    .toBe('車站');
  expect(calls.at(-1)?.searchParams.has('lat')).toBe(false);
  expect(calls.at(-1)?.searchParams.has('radius')).toBe(false);
  await expect(
    page.getByRole('button', { name: '使用目前位置', exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole('link', { name: '手動輸入', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: '使用目前位置', exact: true }).click();
  await expect.poll(() => calls.at(-1)?.pathname).toBe('/api/toilets/nearby');
  expect(calls.at(-1)?.searchParams.has('search')).toBe(false);
  await expect(page.getByLabel('名稱或地址')).toBeHidden();
});

test('detail loading does not flash a placeholder heading', async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/toilets/${id(1)}`, async (route) => {
    await pending;
    await route.fulfill({ json: toilet(1) });
  });
  await page.goto(`/toilets/${id(1)}`);
  await expect(
    page.getByText('正在載入廁所資訊…', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('h1')).toBeHidden();
  await expect(
    page.getByText('先了解設施，再決定目的地。', { exact: true }),
  ).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    toilet(1).name,
  );
});
