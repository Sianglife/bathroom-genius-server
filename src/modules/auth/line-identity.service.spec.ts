import { ConfigService } from '@nestjs/config';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthConfig } from './auth.config';
import { LineIdentityService } from './line-identity.service';

describe('LINE identity verification failure handling', () => {
  let service: LineIdentityService;
  let fetchSpy: jest.SpyInstance;
  const config = new AuthConfig(
    new ConfigService({
      NODE_ENV: 'test',
      APP_ORIGIN: 'http://127.0.0.1:5173',
      LINE_LOGIN_CHANNEL_ID: '12345',
      LINE_LOGIN_CHANNEL_SECRET: 'test-secret',
      LINE_PROVIDER_ID: 'provider',
    }),
  );
  const identity = () => ({
    iss: 'https://access.line.me',
    sub: `U${'a'.repeat(32)}`,
    aud: '12345',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    nonce: 'expected',
  });

  beforeEach(() => {
    service = new LineIdentityService(config);
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it.each([
    { iss: 'https://evil.example' },
    { sub: 'not-a-line-subject' },
    { aud: 'other' },
    { exp: 0 },
    { exp: '9999999999' },
    { iat: 9999999999 },
    { nonce: 'wrong' },
  ])('rejects invalid claims %j', async (claims) => {
    fetchSpy.mockResolvedValue(Response.json({ ...identity(), ...claims }));
    await expect(service.verify('token', '12345', 'expected')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it.each([429, 500, 503])(
    'returns a generic 503 for LINE HTTP %i',
    async (status) => {
      fetchSpy.mockResolvedValue(
        Response.json({ secret: 'must-not-leak' }, { status }),
      );
      await expect(service.verify('token', '12345')).rejects.toThrow(
        'LINE is temporarily unavailable',
      );
    },
  );

  it('does not expose network exceptions or credentials', async () => {
    fetchSpy.mockRejectedValue(new Error('private-network-error-with-token'));
    await expect(service.exchange('private-code', 'verifier')).rejects.toThrow(
      'LINE is temporarily unavailable',
    );
  });

  it.each([null, [], 'unexpected'])(
    'handles malformed JSON shape %j as unavailable',
    async (body) => {
      fetchSpy.mockResolvedValue(Response.json(body));
      await expect(service.verify('token', '12345')).rejects.toThrow(
        ServiceUnavailableException,
      );
    },
  );

  it('rejects non-JSON responses and token exchanges without an ID token', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('invalid-json'));
    await expect(service.verify('token', '12345')).rejects.toThrow(
      ServiceUnavailableException,
    );
    fetchSpy.mockResolvedValueOnce(
      Response.json({ access_token: 'not-an-identity' }),
    );
    await expect(service.exchange('code', 'verifier')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('sends channel, nonce and PKCE verifier to the correct LINE endpoints', async () => {
    fetchSpy.mockResolvedValueOnce(
      Response.json({ id_token: 'verified-token' }),
    );
    expect(await service.exchange('code', 'verifier')).toBe('verified-token');
    const [exchangeUrl, exchangeOptions] = fetchSpy.mock.calls[0];
    expect(exchangeUrl).toBe('https://api.line.me/oauth2/v2.1/token');
    expect(exchangeOptions.body.get('code_verifier')).toBe('verifier');
    expect(exchangeOptions.body.get('redirect_uri')).toBe(config.callbackUrl);
    fetchSpy.mockResolvedValueOnce(Response.json(identity()));
    await service.verify('verified-token', '12345', 'expected');
    const [verifyUrl, verifyOptions] = fetchSpy.mock.calls[1];
    expect(verifyUrl).toBe('https://api.line.me/oauth2/v2.1/verify');
    expect(verifyOptions.body.get('nonce')).toBe('expected');
    expect(verifyOptions.body.get('client_id')).toBe('12345');
  });
});
