import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthConfig } from './auth.config';

interface VerifiedIdentity {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  name?: string;
}

@Injectable()
export class LineIdentityService {
  constructor(private readonly config: AuthConfig) {}

  private async post(
    url: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ServiceUnavailableException('LINE is temporarily unavailable');
    }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429)
        throw new ServiceUnavailableException(
          'LINE is temporarily unavailable',
        );
      throw new UnauthorizedException('LINE authentication failed');
    }
    try {
      const data: unknown = await response.json();
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Expected a LINE response object');
      }
      return data as Record<string, unknown>;
    } catch {
      throw new ServiceUnavailableException('Invalid LINE response');
    }
  }

  async exchange(code: string, verifier: string): Promise<string> {
    this.config.requireLogin();
    const data = await this.post('https://api.line.me/oauth2/v2.1/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.callbackUrl,
      client_id: this.config.channelId,
      client_secret: this.config.channelSecret,
      code_verifier: verifier,
    });
    if (typeof data.id_token !== 'string')
      throw new UnauthorizedException('Missing LINE identity');
    // Do not persist LINE access/refresh tokens: this app only needs verified identity.
    return data.id_token;
  }

  async verify(
    idToken: string,
    channelId: string,
    nonce?: string,
  ): Promise<VerifiedIdentity> {
    this.config.requireLogin();
    const data = await this.post('https://api.line.me/oauth2/v2.1/verify', {
      id_token: idToken,
      client_id: channelId,
      ...(nonce ? { nonce } : {}),
    });
    const now = Math.floor(Date.now() / 1000);
    if (
      data.iss !== 'https://access.line.me' ||
      data.aud !== channelId ||
      typeof data.sub !== 'string' ||
      !/^U[a-f\d]{32}$/i.test(data.sub) ||
      typeof data.exp !== 'number' ||
      !Number.isFinite(data.exp) ||
      data.exp <= now ||
      typeof data.iat !== 'number' ||
      !Number.isFinite(data.iat) ||
      data.iat > now + 60 ||
      (nonce !== undefined && data.nonce !== nonce)
    ) {
      throw new UnauthorizedException('Invalid LINE identity');
    }
    return data as unknown as VerifiedIdentity;
  }
}
