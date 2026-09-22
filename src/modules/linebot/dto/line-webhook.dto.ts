import { IsArray, IsOptional, IsString } from 'class-validator';
import { webhook } from '@line/bot-sdk';

export class LineWebhookDto {
  @IsOptional()
  @IsString()
  destination?: string;

  @IsArray()
  events: webhook.Event[];
}
