import type { ApiError, HealthStatus } from '@bathroom-genius/contracts';

export class ApiRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

/** Read-only client. Authenticated writes and CSRF are added in phase 2. */
export async function get<T>(path: `/api/${string}`, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as ApiError | null;
    const message = Array.isArray(error?.message) ? error.message.join('；') : error?.message;
    throw new ApiRequestError(response.status, message || '暫時無法取得資料，請稍後重試。');
  }
  return response.json() as Promise<T>;
}

export const getHealth = (signal?: AbortSignal) => get<HealthStatus>('/api/health', signal);
