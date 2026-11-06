import { ConfigService } from '@nestjs/config';
import { AuthConfig } from './auth.config';
import { equalToken, safeReturnTo } from './auth.utils';

describe('Auth configuration and return URL validation', () => {
  it('uses secure host-only cookie options in production', () => {
    const config = new AuthConfig(
      new ConfigService({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://bathroom.example.com',
        LINE_LOGIN_CHANNEL_ID: '123',
        LINE_LOGIN_CHANNEL_SECRET: 'secret',
        LINE_PROVIDER_ID: 'provider',
      }),
    );
    expect(config.cookieName).toBe('__Host-session');
    expect(config.cookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(config.callbackUrl).toBe(
      'https://bathroom.example.com/api/auth/line/callback',
    );
  });

  it('fails fast for insecure production and incomplete production credentials', () => {
    expect(
      () =>
        new AuthConfig(
          new ConfigService({
            NODE_ENV: 'production',
            APP_ORIGIN: 'http://example.com',
          }),
        ),
    ).toThrow();
    expect(
      () =>
        new AuthConfig(
          new ConfigService({
            NODE_ENV: 'production',
            APP_ORIGIN: 'https://example.com',
          }),
        ),
    ).toThrow();
    expect(
      () =>
        new AuthConfig(
          new ConfigService({ APP_ORIGIN: 'https://example.com/path' }),
        ),
    ).toThrow();
  });

  it('requires declared matching providers for separate LIFF channels', () => {
    expect(
      () =>
        new AuthConfig(
          new ConfigService({
            LINE_LOGIN_CHANNEL_ID: '123',
            LINE_LIFF_CHANNEL_ID: '456',
          }),
        ),
    ).toThrow();
  });

  it('accepts declared same-provider channels and rejects a provider mismatch', () => {
    const values = {
      NODE_ENV: 'test',
      APP_ORIGIN: 'http://127.0.0.1:5173',
      LINE_LOGIN_CHANNEL_ID: '123',
      LINE_LIFF_CHANNEL_ID: '456',
      LINE_PROVIDER_ID: 'provider',
      LINE_LIFF_PROVIDER_ID: 'provider',
    };
    expect(new AuthConfig(new ConfigService(values)).liffChannelId).toBe('456');
    expect(
      () =>
        new AuthConfig(
          new ConfigService({ ...values, LINE_LIFF_PROVIDER_ID: 'other' }),
        ),
    ).toThrow();
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/%2f%2fevil.example',
    '/api/auth/logout',
    '/?returnTo=evil',
    '/me/reviews\n',
  ])('rejects unsafe return path %s', (value) => {
    expect(safeReturnTo(value)).toBe('/');
  });

  it('accepts supported routes and safely rejects multibyte CSRF input', () => {
    expect(safeReturnTo('/toilets/507f1f77bcf86cd799439011/review')).toBe(
      '/toilets/507f1f77bcf86cd799439011/review',
    );
    expect(equalToken('中'.repeat(43), 'a'.repeat(43))).toBe(false);
  });
});
