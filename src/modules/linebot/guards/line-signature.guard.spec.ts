import {
  BadRequestException,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { LineSignatureGuard } from './line-signature.guard';

describe('LineSignatureGuard', () => {
  let guard: LineSignatureGuard;
  let configService: ConfigService;
  const channelSecret = 'test_channel_secret';

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'LINE_CHANNEL_SECRET') return channelSecret;
        return undefined;
      }),
    } as unknown as ConfigService;

    guard = new LineSignatureGuard(configService);
  });

  const createMockContext = (
    headers: Record<string, any>,
    rawBody?: any,
    body?: any,
  ): ExecutionContext => {
    const request = {
      headers,
      rawBody,
      body,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  const generateSignature = (body: string | Buffer, secret: string): string => {
    return crypto.createHmac('SHA256', secret).update(body).digest('base64');
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should throw UnauthorizedException when signature header is missing', () => {
    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Missing LINE signature header'),
    );
  });

  it('should throw UnauthorizedException when LINE_CHANNEL_SECRET is not configured', () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);
    const context = createMockContext(
      { 'x-line-signature': 'some-signature' },
      Buffer.from('{}'),
    );
    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('LINE_CHANNEL_SECRET is not configured'),
    );
  });

  it('should throw BadRequestException when rawBody and body are missing', () => {
    const context = createMockContext(
      { 'x-line-signature': 'some-signature' },
      null,
      null,
    );
    expect(() => guard.canActivate(context)).toThrow(
      new BadRequestException(
        'Missing request body for signature verification',
      ),
    );
  });

  it('should return true when signature is valid with Buffer rawBody', () => {
    const bodyStr = JSON.stringify({ events: [] });
    const rawBody = Buffer.from(bodyStr);
    const signature = generateSignature(rawBody, channelSecret);

    const context = createMockContext(
      { 'x-line-signature': signature },
      rawBody,
    );
    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should return true when signature is valid with string body fallback', () => {
    const bodyStr = JSON.stringify({ events: [] });
    const signature = generateSignature(bodyStr, channelSecret);

    const context = createMockContext(
      { 'x-line-signature': signature },
      undefined,
      bodyStr,
    );
    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException when signature is invalid', () => {
    const bodyStr = JSON.stringify({ events: [] });
    const rawBody = Buffer.from(bodyStr);
    const invalidSignature = 'invalid_signature_string';

    const context = createMockContext(
      { 'x-line-signature': invalidSignature },
      rawBody,
    );
    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Invalid LINE signature'),
    );
  });
});
