import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;
  let configService: ConfigService;
  const secret = 'test-secret';

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return secret;
        return undefined;
      }),
    } as unknown as ConfigService;

    guard = new OptionalJwtAuthGuard(configService);
  });

  const createMockContext = (
    headers: Record<string, any>,
  ): ExecutionContext => {
    const request = { headers, user: undefined };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return true and set user to undefined when no Authorization header is present', () => {
    const context = createMockContext({});
    const result = guard.canActivate(context);
    const req = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('should return true and set user to undefined when Authorization header is not Bearer', () => {
    const context = createMockContext({ authorization: 'Basic 123456' });
    const result = guard.canActivate(context);
    const req = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('should return true and attach payload to req.user when valid JWT token is provided', () => {
    const payload = { userId: 'user-123', username: 'testuser' };
    const token = jwt.sign(payload, secret);
    const context = createMockContext({ authorization: `Bearer ${token}` });

    const result = guard.canActivate(context);
    const req = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe('user-123');
    expect(req.user.username).toBe('testuser');
  });

  it('should handle unverified tokens gracefully by decoding or setting user undefined', () => {
    const payload = { userId: 'user-456' };
    const token = jwt.sign(payload, 'wrong-secret');
    const context = createMockContext({ authorization: `Bearer ${token}` });

    const result = guard.canActivate(context);
    const req = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(req.user.userId).toBe('user-456');
  });

  it('should set user to undefined if token is completely invalid string', () => {
    const context = createMockContext({
      authorization: 'Bearer invalid.jwt.string',
    });

    const result = guard.canActivate(context);
    const req = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(req.user).toBeUndefined();
  });
});
