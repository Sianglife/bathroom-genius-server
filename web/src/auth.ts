import type { CurrentUser } from '@bathroom-genius/contracts';
import { ApiRequestError, get, post } from './api';

/** Called by the future LIFF integration after liff.getIDToken(). */
export async function signInWithLiff(idToken: string) {
  const { csrfToken } = await get<{ csrfToken: string }>('/api/auth/csrf');
  return post<{ user: CurrentUser; csrfToken: string }>(
    '/api/auth/line',
    { idToken },
    csrfToken,
  );
}

export async function mountAccount(container: HTMLElement) {
  try {
    const user = await get<CurrentUser>('/api/auth/me');
    const label = document.createElement('span');
    label.textContent = user.displayName;
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.textContent = '登出';
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    logout.addEventListener('click', () => {
      logout.disabled = true;
      void (async () => {
        try {
          const { csrfToken } = await get<{ csrfToken: string }>(
            '/api/auth/csrf',
          );
          await post('/api/auth/logout', {}, csrfToken);
          // Draft forms are added in phase 5; session storage contains no credentials.
          sessionStorage.removeItem('review-draft');
          window.location.reload();
        } catch (error) {
          if (error instanceof ApiRequestError && error.status === 401) {
            // Expired/revoked sessions are already signed out on the server.
            window.location.reload();
            return;
          }
          status.textContent = '登出失敗，請重試。';
          logout.disabled = false;
        }
      })();
    });
    container.replaceChildren(label, logout, status);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      const login = document.createElement('a');
      const query = new URLSearchParams({ returnTo: window.location.pathname });
      login.href = `/api/auth/line/start?${query}`;
      login.textContent = '使用 LINE 登入';
      container.replaceChildren(login);
    } else {
      container.textContent = '登入暫時無法使用';
    }
  }
}
