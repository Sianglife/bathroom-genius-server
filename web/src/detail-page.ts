import type {
  Page,
  PublicReview,
  ToiletSummary,
} from '@bathroom-genius/contracts';
import { ApiRequestError, get } from './api';
import { button, el, facilities, facilityText, link, scoreText } from './dom';
import { backToSearchHref, validPosition } from './search-state';

export function mountDetail(container: HTMLElement, id: string) {
  const section = el('section', undefined, 'detail-section');
  const back = link('← 回到搜尋結果', backToSearchHref(), 'back-link');
  const status = el('p', '正在載入廁所資訊…');
  status.setAttribute('role', 'status');
  const content = el('div');
  section.append(back, status, content);
  container.append(section);
  let controller = new AbortController();
  let reviewController: AbortController | null = null;
  let generation = 0;

  async function load() {
    controller.abort();
    controller = new AbortController();
    status.textContent = '正在載入廁所資訊…';
    content.replaceChildren();
    try {
      const toilet = await get<ToiletSummary>(
        `/api/toilets/${id}`,
        controller.signal,
      );
      document.title = `${toilet.name}｜Bathroom Genius`;
      status.textContent = '';
      const heading = container.querySelector('h1');
      if (heading) {
        heading.textContent = toilet.name;
        heading.hidden = false;
      }
      const summary = el('article', undefined, 'detail-card');
      summary.append(el('p', toilet.address, 'address'), facilities(toilet));
      const info = el('dl', undefined, 'detail-info');
      const values = [
        ['地標', toilet.landmark || '地標未提供'],
        [
          '開放時間',
          toilet.openInfo?.hours ||
            (toilet.openInfo?.openType === '24H'
              ? '24 小時開放'
              : '開放時間未提供'),
        ],
        ['乾淨度', scoreText(toilet.avgCleanScore)],
        ['便利度', scoreText(toilet.avgConvenienceScore)],
        ['評論數', `${toilet.reviewCount || 0} 則`],
        ['備註', toilet.note || '暫無備註'],
      ];
      for (const [label, value] of values)
        info.append(el('dt', label), el('dd', value));
      summary.append(info);
      const actions = el('div', undefined, 'actions');
      const coordinates = toilet.location?.coordinates;
      const point =
        Array.isArray(coordinates) && coordinates.length === 2
          ? { lng: coordinates[0], lat: coordinates[1] }
          : null;
      if (validPosition(point)) {
        const destination = new URLSearchParams({
          api: '1',
          destination: `${point.lat},${point.lng}`,
          travelmode: 'walking',
        });
        const navigate = link(
          '開始步行導航',
          `https://www.google.com/maps/dir/?${destination}`,
          'button',
        );
        navigate.target = '_blank';
        navigate.rel = 'noopener noreferrer';
        actions.append(navigate);
      } else actions.append(el('p', '座標資料不完整，暫時無法開啟導航。'));
      actions.append(link('撰寫評論', `/toilets/${id}/review`, 'text-action'));
      summary.append(actions);
      content.append(summary);
      mountReviews();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (
        error instanceof ApiRequestError &&
        (error.status === 404 || error.status === 400)
      ) {
        status.textContent = '找不到這間廁所，資料可能已移除。';
      } else {
        status.textContent = '廁所資訊載入失敗，請稍後重試。';
        content.append(
          button('重新載入詳情', () => {
            void load();
          }),
        );
      }
    }
  }

  function mountReviews() {
    const reviews = el('section', undefined, 'reviews-section');
    const heading = el('h2', '最新評論');
    const reviewStatus = el('p');
    reviewStatus.setAttribute('role', 'status');
    const list = el('div', undefined, 'review-list');
    const more = button('載入更多評論', () => {
      void loadReviews();
    });
    more.hidden = true;
    reviews.append(heading, reviewStatus, list, more);
    content.append(reviews);
    let page = 0;

    async function loadReviews() {
      reviewController?.abort();
      reviewController = new AbortController();
      const current = ++generation;
      more.disabled = true;
      reviewStatus.textContent = '正在載入評論…';
      const retry = reviews.querySelector('[data-retry]');
      retry?.remove();
      try {
        const result = await get<Page<PublicReview>>(
          `/api/toilets/${id}/reviews?page=${page + 1}&limit=5`,
          reviewController.signal,
        );
        if (current !== generation) return;
        for (const review of result.data) {
          const card = el('article', undefined, 'review-card');
          const date = new Date(review.createdAt);
          const formattedDate = Number.isNaN(date.getTime())
            ? '日期未提供'
            : new Intl.DateTimeFormat('zh-TW', {
                timeZone: 'Asia/Taipei',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }).format(date);
          card.append(
            el('h3', review.authorName || '匿名使用者'),
            el('p', formattedDate, 'muted'),
            el(
              'p',
              `乾淨度 ${scoreText(review.cleanScore)} · 便利度 ${scoreText(review.convenienceScore)}`,
            ),
            el('p', `衛生紙：${facilityText(review.hasToiletPaper)}`),
          );
          if (review.comment)
            card.append(el('p', review.comment, 'review-comment'));
          list.append(card);
        }
        page = result.page;
        heading.textContent = `最新評論 · ${result.total} 則`;
        reviewStatus.textContent =
          result.total === 0
            ? '尚無評論，歡迎分享你的使用經驗。'
            : `已載入 ${list.children.length} 則評論。`;
        more.hidden = result.page * result.limit >= result.total;
      } catch (error) {
        if (
          current !== generation ||
          (error instanceof DOMException && error.name === 'AbortError')
        )
          return;
        reviewStatus.textContent = '評論載入失敗，廁所資訊與導航仍可使用。';
        const retryButton = button('重試載入評論', () => {
          void loadReviews();
        });
        retryButton.dataset.retry = 'true';
        reviews.append(retryButton);
      } finally {
        if (current === generation) more.disabled = false;
      }
    }
    void loadReviews();
  }
  window.addEventListener('pagehide', () => {
    controller.abort();
    reviewController?.abort();
    ++generation;
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void load();
  });
  void load();
}
