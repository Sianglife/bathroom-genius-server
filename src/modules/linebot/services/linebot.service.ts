import { Inject, Injectable, Logger } from '@nestjs/common';
import { messagingApi, webhook } from '@line/bot-sdk';
import { ToiletsService } from '../../toilets/toilets.service';
import { ReviewsService } from '../../reviews/reviews.service';
import { LinebotTemplateService } from './linebot-template.service';

export const DEFAULT_SEARCH_RADIUS = 1000;
export const DEFAULT_LIMIT = 5;

@Injectable()
export class LinebotService {
  private readonly logger = new Logger(LinebotService.name);

  constructor(
    @Inject('LINE_CLIENT')
    private readonly lineClient: messagingApi.MessagingApiClient,
    private readonly toiletsService: ToiletsService,
    private readonly reviewsService: ReviewsService,
    private readonly templateService: LinebotTemplateService,
  ) { }

  /**
   * 批次分發與處理多個 LINE Webhook 事件
   */
  async handleEvents(events: webhook.Event[]): Promise<void> {
    if (!events || events.length === 0) {
      return;
    }

    await Promise.all(
      events.map((event) =>
        this.handleEvent(event).catch((err) => {
          this.logger.error(
            `Error processing event (${event.type}): ${err.message}`,
            err.stack,
          );
        }),
      ),
    );
  }

  /**
   * 依據事件類型分發處理單一事件
   */
  async handleEvent(event: webhook.Event): Promise<void> {
    this.logger.log(`Received event type: ${event.type}`);

    switch (event.type) {
      case 'message':
        await this.handleMessageEvent(event);
        break;
      case 'postback':
        await this.handlePostbackEvent(event);
        break;
      case 'follow':
        await this.handleFollowEvent(event);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
        break;
    }
  }

  /**
   * 處理訊息事件 (文字訊息、位置訊息、其他多媒體訊息)
   */
  private async handleMessageEvent(event: webhook.MessageEvent): Promise<void> {
    const message = event.message;

    if (message.type === 'text') {
      const text = message.text.trim();
      const findToiletKeywords = [
        '找廁所',
        '廁所',
        '公廁',
        '便所',
        'wc',
        'toilet',
        'washroom',
        'restroom',
      ];
      const isFindingToilet = findToiletKeywords.some((kw) =>
        text.toLowerCase().includes(kw.toLowerCase()),
      );

      if (isFindingToilet) {
        // case of finding bathroom
        const quickReply = this.templateService.createLocationQuickReply();
        await this.reply(event.replyToken, quickReply);
      } else {
        // other texts
        const welcomeGuide = this.templateService.createWelcomeGuideMessage();
        await this.reply(event.replyToken, welcomeGuide);
      }
    } else if (message.type === 'location') {
      const { latitude, longitude } = message;
      const toilets = await this.toiletsService.findNearby({
        lat: latitude,
        lng: longitude,
        radius: DEFAULT_SEARCH_RADIUS,
        limit: DEFAULT_LIMIT,
      });

      if (!toilets || toilets.length === 0) {
        const noToiletsMsg = this.templateService.createNoToiletsMessage();
        await this.reply(event.replyToken, noToiletsMsg);
      } else {
        const carouselMsg = this.templateService.createToiletsCarousel(toilets);
        await this.reply(event.replyToken, carouselMsg);
      }
    } else {
      // 其它訊息類型（貼圖、圖片、語音等），回傳友善引導
      const welcomeGuide = this.templateService.createWelcomeGuideMessage();
      await this.reply(event.replyToken, welcomeGuide);
    }
  }

  /**
   * 處理 Postback 事件 (查看評價等互動動作)
   */
  private async handlePostbackEvent(
    event: webhook.PostbackEvent,
  ): Promise<void> {
    const data = event.postback?.data || '';
    const params = new URLSearchParams(data);
    const action = params.get('action');
    const toiletId = params.get('toiletId');

    if (action === 'view_reviews' && toiletId) {
      try {
        const toilet = await this.toiletsService.findOne(toiletId);
        const reviewsResult = await this.reviewsService.findByToiletId(
          toiletId,
          {
            page: 1,
            limit: 3,
          },
        );
        const reviewsMsg = this.templateService.createToiletReviewsMessage(
          toilet,
          reviewsResult.data,
        );
        await this.reply(event.replyToken, reviewsMsg);
      } catch (err: any) {
        this.logger.error(
          `Failed to process view_reviews postback for toiletId '${toiletId}': ${err.message}`,
          err.stack,
        );
        await this.reply(event.replyToken, {
          type: 'text',
          text: '抱歉，暫時無法取得該公廁的評價資訊，請稍後再試！',
        });
      }
    } else {
      this.logger.warn(`Unknown or unhandled postback data: ${data}`);
    }
  }

  /**
   * 處理關注 (Follow) 事件
   */
  private async handleFollowEvent(event: webhook.FollowEvent): Promise<void> {
    const welcomeGuide = this.templateService.createWelcomeGuideMessage();
    await this.reply(event.replyToken, welcomeGuide);
  }

  /**
   * 封裝 Messaging API 回覆訊息邏輯與例外防護
   */
  private async reply(
    replyToken: string | undefined,
    messages: messagingApi.Message | messagingApi.Message[],
  ): Promise<void> {
    if (!replyToken) {
      this.logger.warn(
        'Cannot reply message: replyToken is undefined or empty',
      );
      return;
    }

    const messageList = Array.isArray(messages) ? messages : [messages];

    try {
      await this.lineClient.replyMessage({
        replyToken,
        messages: messageList,
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to send replyMessage via LINE Messaging API: ${err.message}`,
        err.stack,
      );
    }
  }
}
