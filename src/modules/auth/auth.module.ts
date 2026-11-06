import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { User, UserSchema } from './schemas/user.schema';
import {
  Session,
  SessionSchema,
  LoginAttempt,
  LoginAttemptSchema,
} from './schemas/session.schema';
import { AuthService } from './auth.service';
import { AuthConfig } from './auth.config';
import { LineIdentityService } from './line-identity.service';
import { AuthController } from './auth.controller';
import {
  AdminGuard,
  CsrfGuard,
  SessionAuthGuard,
} from './guards/session-auth.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
      { name: LoginAttempt.name, schema: LoginAttemptSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthConfig,
    LineIdentityService,
    OptionalJwtAuthGuard,
    SessionAuthGuard,
    CsrfGuard,
    AdminGuard,
  ],
  exports: [
    AuthService,
    AuthConfig,
    OptionalJwtAuthGuard,
    SessionAuthGuard,
    CsrfGuard,
    AdminGuard,
  ],
})
export class AuthModule {}
