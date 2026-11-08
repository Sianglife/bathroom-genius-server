import './style.css';
import { mountAccount } from './auth';
import { mountSearch } from './search-page';
import { mountDetail } from './detail-page';

const main = document.querySelector<HTMLElement>('#content')!;
const path = window.location.pathname.replace(/\/$/, '') || '/';
const detail = /^\/toilets\/([a-f\d]{24})$/i.test(path);
const review = /^\/toilets\/([a-f\d]{24})\/review$/i.test(path);

const content =
  path === '/'
    ? [
        '附近廁所',
        '找到附近，安心出發。',
        '先查看設施與評價，找到適合你的廁所。',
      ]
    : detail
      ? [
          '廁所詳情',
          '先了解設施，再決定目的地。',
          '查看設施、開放資訊與使用者評論。',
        ]
      : review
        ? [
            '撰寫評論',
            '分享你的使用經驗。',
            '可先使用 LINE 登入，評論表單將於後續階段開放。',
          ]
        : path === '/me/reviews'
          ? [
              '我的評論',
              '你的經驗，幫助下一位使用者。',
              '可先使用 LINE 登入，評論管理將於後續階段開放。',
            ]
          : ['找不到頁面', '這個連結可能已失效。', '請回到附近廁所繼續瀏覽。'];

document.title = `${content[0]}｜Bathroom Genius`;
const eyebrow = document.createElement('p');
eyebrow.className = 'eyebrow';
eyebrow.textContent = content[0];
const title = document.createElement('h1');
title.textContent = content[1];
const description = document.createElement('p');
description.textContent = content[2];
main.append(eyebrow, title, description);
const pageUrl = new URL(window.location.href);
if (pageUrl.searchParams.get('login') === 'cancelled') {
  const notice = document.createElement('p');
  notice.className = 'notice';
  notice.setAttribute('role', 'status');
  notice.textContent = '已取消 LINE 登入，你仍可繼續瀏覽。';
  main.insertBefore(notice, description);
  pageUrl.searchParams.delete('login');
  history.replaceState(
    history.state,
    '',
    `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`,
  );
}
void mountAccount(document.querySelector<HTMLElement>('#account')!);
if (path === '/') mountSearch(main);
else if (detail) mountDetail(main, path.split('/')[2]);
else if (path !== '/') {
  const home = document.createElement('a');
  home.className = 'button';
  home.href = '/';
  home.textContent = '回到附近廁所';
  main.append(home);
}
