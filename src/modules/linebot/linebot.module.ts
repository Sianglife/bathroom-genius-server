import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { messagingApi } from '@line/bot-sdk';
import { LinebotController } from './linebot.controller';
import { LinebotService } from './services/linebot.service';
import { LinebotTemplateService } from './services/linebot-template.service';
import { LineSignatureGuard } from './guards/line-signature.guard';
import { ToiletsModule } from '../toilets/toilets.module';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [ConfigModule, ToiletsModule, ReviewsModule],
  controllers: [LinebotController],
  providers: [
    LinebotService,
    LinebotTemplateService,
    LineSignatureGuard,
    {
      provide: 'LINE_CLIENT',
      useFactory: (configService: ConfigService) => {
        const channelAccessToken =
          configService.get<string>('LINE_CHANNEL_ACCESS_TOKEN') || '';
        return new messagingApi.MessagingApiClient({
          channelAccessToken,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [LinebotService, LinebotTemplateService, 'LINE_CLIENT'],
})
export class LinebotModule {}
