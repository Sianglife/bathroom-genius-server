import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LinebotService } from './services/linebot.service';
import { LineSignatureGuard } from './guards/line-signature.guard';
import { LineWebhookDto } from './dto/line-webhook.dto';

@Controller('linebot')
export class LinebotController {
  constructor(private readonly linebotService: LinebotService) {}

  @Post('webhook')
  @UseGuards(LineSignatureGuard)
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: LineWebhookDto): Promise<string> {
    if (body.events && body.events.length > 0) {
      await this.linebotService.handleEvents(body.events);
    }
    return 'OK';
  }
}
