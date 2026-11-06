import type { ApiError, HealthStatus } from '@bathroom-genius/contracts';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Same-origin reads; credentials never enter localStorage. */
export async function get<T>(
  path: `/api/${string}`,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as ApiError | null;
    const message = Array.isArray(error?.message)
      ? error.message.join('；')
      : error?.message;
    throw new ApiRequestError(
      response.status,
      message || '暫時無法取得資料，請稍後重試。',
    );
  }
  return response.json() as Promise<T>;
}

export const getHealth = (signal?: AbortSignal) =>
  get<HealthStatus>('/api/health', signal);

export async function post<T>(
  path: `/api/${string}`,
  body: unknown,
  csrfToken: string,
): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      response.status === 401
        ? '登入已失效，請重新登入。'
        : '操作失敗，請重新整理後再試。',
    );
  }
  return response.json() as Promise<T>;
}
