import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import * as dns from 'node:dns';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ToiletsModule } from './modules/toilets/toilets.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { LinebotModule } from './modules/linebot/linebot.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dnsServers = configService.get<string>('DNS_SERVERS');
        if (dnsServers) {
          const servers = dnsServers
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (servers.length > 0) {
            try {
              dns.setServers(servers);
            } catch (error) {
              console.warn('Failed to set custom DNS servers:', error);
            }
          }
        }

        const dbName =
          configService.get<string>('MONGODB_DB_NAME') ||
          configService.get<string>('DB_NAME');

        return {
          uri:
            configService.get<string>('MONGODB_URI') ||
            'mongodb://localhost:27017/bathroom_genius',
          ...(dbName ? { dbName } : {}),
        };
      },
      inject: [ConfigService],
    }),
    HealthModule,
    AuthModule,
    ToiletsModule,
    ReviewsModule,
    LinebotModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
