import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { AuthRequest } from '../auth.utils';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.user = await this.auth.requireUser(request);
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    await this.auth.checkCsrf(context.switchToHttp().getRequest());
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (
      context.switchToHttp().getRequest<AuthRequest>().user?.role !== 'admin'
    ) {
      throw new ForbiddenException('Administrator access required');
    }
    return true;
  }
}
