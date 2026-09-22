import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';

@Module({
  imports: [ConfigModule],
  providers: [OptionalJwtAuthGuard],
  exports: [OptionalJwtAuthGuard],
})
export class AuthModule {}
