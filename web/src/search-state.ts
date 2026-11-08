import type { ToiletSummary } from '@bathroom-genius/contracts';

export interface Filters {
  search: string;
  radius: string;
  hasToiletPaper: string;
  isAccessible: string;
  minCleanScore: string;
  minConvenienceScore: string;
  tags: string;
}
export interface Position {
  lat: number;
  lng: number;
}
export interface SearchCache {
  query: string;
  position: Position | null;
  items: ToiletSummary[];
  page: number;
  total: number;
  scrollY: number;
  loadedAt: number;
}
const key = 'bathroom-search-v1';
export const emptyFilters = (): Filters => ({
  search: '',
  radius: '1000',
  hasToiletPaper: '',
  isAccessible: '',
  minCleanScore: '',
  minConvenienceScore: '',
  tags: '',
});

export function readFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const filters = emptyFilters();
  filters.search = (params.get('search') || '').trim().slice(0, 200);
  filters.radius = ['500', '1000', '3000'].includes(params.get('radius') || '')
    ? params.get('radius')!
    : '1000';
  for (const field of ['hasToiletPaper', 'isAccessible'] as const) {
    const value = params.get(field) || '';
    filters[field] = ['true', 'false'].includes(value) ? value : '';
  }
  for (const field of ['minCleanScore', 'minConvenienceScore'] as const) {
    const value = params.get(field) || '';
    filters[field] = /^[1-5]$/.test(value) ? value : '';
  }
  filters.tags = [
    ...new Set(
      (params.get('tags') || '')
        .slice(0, 200)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ].join(',');
  return filters;
}

export function filterQuery(filters: Filters) {
  const params = new URLSearchParams();
  for (const field of Object.keys(filters) as (keyof Filters)[]) {
    const value = filters[field];
    if (value && !(field === 'radius' && value === '1000'))
      params.set(field, value);
  }
  return params.toString();
}

export function validPosition(value: unknown): value is Position {
  const position = value as Position | null;
  return (
    !!position &&
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng) &&
    Math.abs(position.lat) <= 90 &&
    Math.abs(position.lng) <= 180
  );
}

export function readCache(): SearchCache | null {
  try {
    const cache = JSON.parse(
      sessionStorage.getItem(key) || 'null',
    ) as SearchCache | null;
    if (
      !cache ||
      typeof cache.query !== 'string' ||
      !Array.isArray(cache.items) ||
      !cache.items.every(
        (item) =>
          item &&
          typeof item._id === 'string' &&
          /^[a-f\d]{24}$/i.test(item._id),
      ) ||
      !Number.isInteger(cache.page) ||
      cache.page < 1 ||
      !Number.isFinite(cache.total) ||
      cache.total < 0 ||
      !Number.isFinite(cache.scrollY) ||
      !Number.isFinite(cache.loadedAt) ||
      Date.now() - cache.loadedAt > 30 * 60 * 1000 ||
      cache.loadedAt > Date.now() ||
      (cache.position !== null && !validPosition(cache.position))
    )
      return null;
    return cache;
  } catch {
    return null;
  }
}

export function saveCache(cache: SearchCache) {
  try {
    sessionStorage.setItem(key, JSON.stringify(cache));
  } catch {
    /* Search still works when storage is unavailable/full. */
  }
}

export function clearCache() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Storage may be disabled. */
  }
}

export function backToSearchHref() {
  const cache = readCache();
  const query = cache ? filterQuery(readFilters(cache.query)) : '';
  return query ? `/?${query}` : '/';
}
