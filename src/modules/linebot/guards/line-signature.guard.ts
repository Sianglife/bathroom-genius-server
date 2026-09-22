import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateSignature } from '@line/bot-sdk';

@Injectable()
export class LineSignatureGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const signature =
      request.headers['x-line-signature'] ||
      request.headers['X-Line-Signature'];

    if (!signature || typeof signature !== 'string') {
      throw new UnauthorizedException('Missing LINE signature header');
    }

    const channelSecret = this.configService.get<string>('LINE_CHANNEL_SECRET');
    if (!channelSecret) {
      throw new UnauthorizedException('LINE_CHANNEL_SECRET is not configured');
    }

    let rawBody = request.rawBody;
    if (!rawBody && request.body !== undefined && request.body !== null) {
      rawBody =
        typeof request.body === 'string' || Buffer.isBuffer(request.body)
          ? request.body
          : JSON.stringify(request.body);
    }

    if (!rawBody) {
      throw new BadRequestException(
        'Missing request body for signature verification',
      );
    }

    const isValid = validateSignature(rawBody, channelSecret, signature);
    if (!isValid) {
      throw new UnauthorizedException('Invalid LINE signature');
    }

    return true;
  }
}
