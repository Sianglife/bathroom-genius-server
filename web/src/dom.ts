import type { ToiletSummary } from '@bathroom-genius/contracts';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function link(text: string, href: string, className?: string) {
  const node = el('a', text, className);
  node.href = href;
  return node;
}

export function button(
  text: string,
  action: () => void,
  className = 'secondary',
) {
  const node = el('button', text, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

export const scoreText = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 1 &&
  value <= 5
    ? `${value.toFixed(1)} / 5`
    : '尚無評分';
export const facilityText = (value: unknown) =>
  value === true ? '有' : value === false ? '無' : '未知';

export function facilities(toilet: ToiletSummary) {
  const list = el('ul', undefined, 'badges');
  list.setAttribute('aria-label', '設施與標籤');
  list.append(
    el('li', `衛生紙：${facilityText(toilet.hasToiletPaper)}`),
    el('li', `無障礙：${facilityText(toilet.isAccessible)}`),
  );
  for (const tag of toilet.tags || []) list.append(el('li', tag));
  return list;
}

export function toiletCard(toilet: ToiletSummary, nearby: boolean) {
  const card = el('article', undefined, 'toilet-card');
  const heading = el('h3');
  heading.append(
    link(toilet.name, `/toilets/${encodeURIComponent(toilet._id)}`),
  );
  card.append(heading, el('p', toilet.address, 'muted'));
  if (
    nearby &&
    typeof toilet.distance === 'number' &&
    Number.isFinite(toilet.distance)
  ) {
    const distance =
      toilet.distance >= 1000
        ? `${(toilet.distance / 1000).toFixed(1)} 公里`
        : `${Math.round(toilet.distance)} 公尺`;
    card.append(el('p', `直線距離 ${distance}`, 'distance'));
  }
  card.append(
    facilities(toilet),
    el(
      'p',
      `乾淨度 ${scoreText(toilet.avgCleanScore)} · 便利度 ${scoreText(toilet.avgConvenienceScore)}`,
      'rating',
    ),
    el('p', `${toilet.reviewCount || 0} 則評論`, 'muted'),
  );
  return card;
}
