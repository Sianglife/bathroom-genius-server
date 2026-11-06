import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';

@Injectable()
export class AuthConfig {
  readonly origin: string;
  readonly secure: boolean;
  readonly cookieName: string;
  readonly channelId: string;
  readonly channelSecret: string;
  readonly liffChannelId: string;
  readonly providerId: string;
  readonly callbackUrl: string;
  readonly sessionTtlMs = 7 * 24 * 60 * 60 * 1000;

  constructor(config: ConfigService) {
    const production = config.get<string>('NODE_ENV') === 'production';
    const origin =
      config.get<string>('APP_ORIGIN') ||
      (production ? '' : 'http://127.0.0.1:5173');
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('APP_ORIGIN must be a valid origin');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error(
        'APP_ORIGIN must contain only scheme, host and optional port',
      );
    }
    if (
      parsed.protocol !== 'https:' &&
      (production ||
        !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
    ) {
      throw new Error('APP_ORIGIN must use HTTPS outside local development');
    }
    this.origin = origin;
    this.secure = parsed.protocol === 'https:';
    this.cookieName = this.secure ? '__Host-session' : 'bathroom-session';
    this.channelId = config.get<string>('LINE_LOGIN_CHANNEL_ID') || '';
    this.channelSecret = config.get<string>('LINE_LOGIN_CHANNEL_SECRET') || '';
    this.providerId = config.get<string>('LINE_PROVIDER_ID') || '';
    this.liffChannelId =
      config.get<string>('LINE_LIFF_CHANNEL_ID') || this.channelId;
    if (
      this.liffChannelId !== this.channelId &&
      (!this.providerId ||
        config.get<string>('LINE_LIFF_PROVIDER_ID') !== this.providerId)
    ) {
      throw new Error(
        'Separate LIFF and Login channels must declare the same LINE provider',
      );
    }
    this.callbackUrl = `${origin}/api/auth/line/callback`;
    if (
      production &&
      (!this.channelId || !this.channelSecret || !this.providerId)
    ) {
      throw new Error(
        'Production requires LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET and LINE_PROVIDER_ID',
      );
    }
  }

  requireLogin() {
    if (!this.channelId || !this.channelSecret || !this.providerId) {
      throw new ServiceUnavailableException('LINE login is not configured');
    }
  }

  cookieOptions(maxAge?: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: '/',
      ...(maxAge === undefined ? {} : { maxAge }),
    };
  }
}
