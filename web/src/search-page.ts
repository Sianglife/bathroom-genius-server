import type {
  NearbyPage,
  Page,
  ToiletSummary,
} from '@bathroom-genius/contracts';
import { get } from './api';
import { button, el, toiletCard } from './dom';
import {
  clearCache,
  emptyFilters,
  filterQuery,
  readCache,
  readFilters,
  saveCache,
  validPosition,
  type Position,
  type Filters,
  type SearchCache,
} from './search-state';

export function mountSearch(container: HTMLElement) {
  const section = el('section', undefined, 'search-section');
  const form = el('form', undefined, 'search-form');
  form.setAttribute('aria-label', '搜尋與篩選');
  form.innerHTML = `
    <label class="search-field">名稱或地址<input name="search" type="search" maxlength="200" placeholder="例如：台北車站、大安公園" autocomplete="off"></label>
    <button type="submit" class="primary">搜尋廁所</button>
    <details class="filter-panel"><summary>篩選條件</summary><div class="filter-grid">
      <label>搜尋半徑<select name="radius"><option value="500">500 公尺</option><option value="1000">1 公里</option><option value="3000">3 公里</option></select></label>
      <label>衛生紙<select name="hasToiletPaper"><option value="">不限</option><option value="true">有衛生紙</option><option value="false">沒有衛生紙</option></select></label>
      <label>無障礙設施<select name="isAccessible"><option value="">不限</option><option value="true">有無障礙設施</option><option value="false">無無障礙設施</option></select></label>
      <label>最低乾淨度<select name="minCleanScore"><option value="">不限</option><option value="1">1 星以上</option><option value="2">2 星以上</option><option value="3">3 星以上</option><option value="4">4 星以上</option><option value="5">5 星</option></select></label>
      <label>最低便利度<select name="minConvenienceScore"><option value="">不限</option><option value="1">1 星以上</option><option value="2">2 星以上</option><option value="3">3 星以上</option><option value="4">4 星以上</option><option value="5">5 星</option></select></label>
      <label>設施標籤<input name="tags" maxlength="200" placeholder="以逗號分隔，例如：親子,24H"></label>
    </div><p class="muted">未評分廁所仍會顯示；標籤符合任一項即可。半徑只在定位後生效。</p></details>`;
  const locationBar = el('div', undefined, 'location-bar');
  const locationStatus = el(
    'p',
    '尚未設定位置，可先依名稱或地址搜尋。',
    'muted',
  );
  locationStatus.setAttribute('role', 'status');
  const locate = button('使用目前位置', locateNow, 'primary');
  const clearPosition = button('清除位置', () => {
    ++locationGeneration;
    locate.disabled = false;
    position = null;
    cache = null;
    clearCache();
    showPosition();
    void load(true);
  });
  locationBar.append(locate, clearPosition);
  const status = el('p', undefined, 'search-status');
  status.setAttribute('role', 'status');
  const error = el('div', undefined, 'error-box');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const resultHeading = el('h2', '廁所清單');
  const results = el('div', undefined, 'results-grid');
  const empty = el('div', undefined, 'empty-state');
  empty.hidden = true;
  const expand = button('擴大搜尋範圍', () => {
    filters.radius = filters.radius === '500' ? '1000' : '3000';
    fillForm();
    writeUrl();
    void load(true);
  });
  const clear = button('清除所有篩選', clearFilters);
  empty.append(
    el('h3', '找不到符合條件的廁所'),
    el('p', '試著調整關鍵字、放寬篩選或擴大定位範圍。'),
    expand,
    clear,
  );
  const more = button('載入更多', () => {
    void load(false);
  });
  more.hidden = true;
  section.append(
    locationBar,
    locationStatus,
    form,
    status,
    error,
    resultHeading,
    results,
    empty,
    more,
  );
  container.append(section);

  let filters = readFilters(location.search);
  const cached = readCache();
  let position: Position | null = cached?.position || null;
  let items: ToiletSummary[] = [];
  let page = 0;
  let total = 0;
  let controller: AbortController | null = null;
  let generation = 0;
  let locationGeneration = 0;
  let active = true;
  let cache: SearchCache | null = null;

  function fillForm() {
    for (const key of Object.keys(filters) as (keyof Filters)[]) {
      (
        form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement
      ).value = filters[key];
    }
    if (
      Object.entries(filters).some(
        ([key, value]) =>
          key !== 'search' && value && !(key === 'radius' && value === '1000'),
      )
    ) {
      form.querySelector('details')!.open = true;
    }
  }
  function writeUrl(replace = false) {
    const query = filterQuery(filters);
    const url = query ? `/?${query}` : '/';
    if (`${location.pathname}${location.search}` !== url)
      history[replace ? 'replaceState' : 'pushState'](history.state, '', url);
  }
  function showPosition() {
    clearPosition.hidden = !position;
    locate.textContent = position ? '重新定位' : '使用目前位置';
    locationStatus.textContent = position
      ? '已設定位置，依直線距離由近到遠搜尋。'
      : '尚未設定位置，可先依名稱或地址搜尋。';
  }
  function clearFilters() {
    filters = emptyFilters();
    fillForm();
    writeUrl();
    void load(true);
  }
  function renderResults() {
    results.replaceChildren(
      ...items.map((item) => toiletCard(item, !!position)),
    );
    resultHeading.textContent = `${position ? '附近廁所' : '廁所清單'} · 共 ${total} 間`;
    more.hidden = items.length >= total;
    empty.hidden = total !== 0;
    expand.hidden = !position || filters.radius === '3000';
  }
  function persist() {
    if (cache) saveCache({ ...cache, scrollY: window.scrollY });
  }
  async function load(reset: boolean) {
    controller?.abort();
    controller = new AbortController();
    const current = ++generation;
    const next = reset ? 1 : page + 1;
    const currentFilters = { ...filters };
    const currentPosition = position ? { ...position } : null;
    const params = new URLSearchParams(filterQuery(currentFilters));
    if (currentPosition) {
      params.set('lat', String(currentPosition.lat));
      params.set('lng', String(currentPosition.lng));
      params.set('radius', currentFilters.radius);
    } else params.delete('radius');
    params.set('page', String(next));
    params.set('limit', '10');
    status.textContent = reset ? '正在搜尋廁所…' : '正在載入更多…';
    results.setAttribute('aria-busy', 'true');
    more.disabled = true;
    error.hidden = true;
    empty.hidden = true;
    try {
      const response = await get<
        Page<ToiletSummary> | NearbyPage<ToiletSummary>
      >(
        `/api/toilets${currentPosition ? '/nearby' : ''}?${params}`,
        controller.signal,
      );
      if (!active || current !== generation) return;
      const combined = reset ? response.data : [...items, ...response.data];
      items = [...new Map(combined.map((item) => [item._id, item])).values()];
      page = response.page;
      total = response.total;
      renderResults();
      // Use API pagination rather than unique item count when data changes across pages.
      more.hidden =
        'hasMore' in response
          ? !response.hasMore
          : response.page * response.limit >= response.total;
      status.textContent = `已顯示 ${items.length} 間${currentPosition ? '，距離為直線距離' : '，未依距離排序'}。`;
      cache = {
        query: filterQuery(currentFilters),
        position: currentPosition,
        items,
        page,
        total,
        scrollY: window.scrollY,
        loadedAt: Date.now(),
      };
      persist();
    } catch (failure) {
      if (
        !active ||
        current !== generation ||
        (failure instanceof DOMException && failure.name === 'AbortError')
      )
        return;
      status.textContent = items.length
        ? '目前保留上次成功載入的結果。'
        : '尚未載入搜尋結果。';
      error.replaceChildren(
        el('p', '搜尋失敗，請檢查網路連線後重試。'),
        button('重試搜尋', () => {
          void load(reset);
        }),
      );
      error.hidden = false;
    } finally {
      if (current === generation) {
        more.disabled = false;
        results.setAttribute('aria-busy', 'false');
      }
    }
  }
  function locateNow() {
    if (!navigator.geolocation) {
      locationStatus.textContent =
        '此瀏覽器不支援定位，仍可使用名稱或地址搜尋。';
      return;
    }
    locate.disabled = true;
    const locationRequest = ++locationGeneration;
    locationStatus.textContent = '正在取得目前位置…';
    navigator.geolocation.getCurrentPosition(
      (result) => {
        if (!active || locationRequest !== locationGeneration) return;
        locate.disabled = false;
        const next = {
          lat: result.coords.latitude,
          lng: result.coords.longitude,
        };
        if (!validPosition(next)) {
          locationStatus.textContent = '無法取得有效位置，請重試。';
          return;
        }
        position = next;
        showPosition();
        void load(true);
      },
      (failure) => {
        if (!active || locationRequest !== locationGeneration) return;
        locate.disabled = false;
        locationStatus.textContent = `${failure.code === 1 ? '定位權限遭拒絕' : failure.code === 3 ? '定位逾時' : '暫時無法定位'}，可重試或繼續使用名稱、地址搜尋。${position ? '目前保留上次位置。' : ''}`;
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of data) {
      if (typeof value === 'string') params.set(key, value);
    }
    filters = readFilters(params.toString());
    fillForm();
    writeUrl();
    void load(true);
  });
  window.addEventListener('popstate', () => {
    filters = readFilters(location.search);
    fillForm();
    void load(true);
  });
  window.addEventListener('scroll', persist, { passive: true });
  window.addEventListener('pagehide', () => {
    persist();
    active = false;
    ++generation;
    ++locationGeneration;
    controller?.abort();
  });
  window.addEventListener('pageshow', (event) => {
    active = true;
    if (event.persisted) {
      const interrupted = results.getAttribute('aria-busy') === 'true';
      more.disabled = false;
      locate.disabled = false;
      results.setAttribute('aria-busy', 'false');
      if (interrupted) void load(true);
    }
  });
  fillForm();
  writeUrl(true);
  showPosition();
  if (cached && cached.query === filterQuery(filters)) {
    cache = cached;
    items = cached.items;
    page = cached.page;
    total = cached.total;
    renderResults();
    more.hidden = page * 10 >= total;
    status.textContent = `已還原 ${items.length} 間搜尋結果，可重新搜尋以更新資料。`;
    requestAnimationFrame(() => window.scrollTo(0, cached.scrollY));
  } else void load(true);
}
