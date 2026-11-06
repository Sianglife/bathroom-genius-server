import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { CurrentUser } from '@bathroom-genius/contracts';

export type Principal = CurrentUser;
export type AuthRequest = Request & { user?: Principal };
export const randomToken = () => randomBytes(32).toString('base64url');
export const hashToken = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const equalToken = (a: unknown, b: string): boolean => {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export function sessionToken(
  request: Request,
  name: string,
): string | undefined {
  const matches = (request.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  const token = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

/** Only canonical, explicitly supported routes can be login return targets. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || /\s/.test(value)) return '/';
  return /^(?:\/|\/me\/reviews|\/toilets\/[a-f\d]{24}(?:\/review)?)$/i.test(
    value,
  )
    ? value
    : '/';
}
