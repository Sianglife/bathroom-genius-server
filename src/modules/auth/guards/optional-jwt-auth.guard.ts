import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader =
      request.headers['authorization'] || request.headers['Authorization'];

    if (!authHeader || typeof authHeader !== 'string') {
      request.user = undefined;
      return true;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      request.user = undefined;
      return true;
    }

    const token = parts[1];
    const secret =
      this.configService.get<string>('JWT_SECRET') ||
      'optional_secret_for_future_extension';

    try {
      const decoded = jwt.verify(token, secret);
      request.user = decoded;
    } catch {
      const decoded = jwt.decode(token);
      request.user =
        typeof decoded === 'object' && decoded !== null ? decoded : undefined;
    }

    return true;
  }
}
