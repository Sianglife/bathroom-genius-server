import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'crypto';
import { messagingApi } from '@line/bot-sdk';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import {
  Toilet,
  ToiletDocument,
} from '../src/modules/toilets/schemas/toilet.schema';
import {
  Review,
  ReviewDocument,
} from '../src/modules/reviews/schemas/review.schema';

describe('LINE Bot Webhook & Integration (e2e)', () => {
  let app: INestApplication<App>;
  let configService: ConfigService;
  let toiletModel: Model<ToiletDocument>;
  let reviewModel: Model<ReviewDocument>;
  let channelSecret: string;

  const mockLineClient = {
    replyMessage: jest.fn().mockResolvedValue({}),
  };

  const getCallArgs = (callIndex = 0): messagingApi.ReplyMessageRequest => {
    const calls = mockLineClient.replyMessage.mock.calls as unknown as [
      messagingApi.ReplyMessageRequest,
    ][];
    return calls[callIndex][0];
  };

  const getFirstSentMessage = <
    T extends messagingApi.Message = messagingApi.Message,
  >(
    callIndex = 0,
  ): T => {
    const args = getCallArgs(callIndex);
    return (
      Array.isArray(args.messages) ? args.messages[0] : args.messages
    ) as T;
  };

  let testToiletId: string;
  let testReviewId: string;

  /**
   * 輔助函式：依照 LINE Messaging API 規範，使用 HMAC-SHA256 計算 Webhook 簽章
   */
  const generateSignature = (
    body: string | Record<string, any>,
    secret: string,
  ): string => {
    const rawString = typeof body === 'string' ? body : JSON.stringify(body);
    return crypto
      .createHmac('sha256', secret)
      .update(rawString)
      .digest('base64');
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('LINE_CLIENT')
      .useValue(mockLineClient)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });

    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();

    configService = app.get(ConfigService);
    toiletModel = app.get<Model<ToiletDocument>>(getModelToken(Toilet.name));
    reviewModel = app.get<Model<ReviewDocument>>(getModelToken(Review.name));

    channelSecret =
      configService.get<string>('LINE_CHANNEL_SECRET') || 'test-channel-secret';

    // 建立 E2E 測試專用公廁與評價種子資料
    const createdToilet = await toiletModel.create({
      name: 'E2E 測試台北車站公廁',
      address: '台北市中正區北平西路3號B1',
      landmark: '台北車站捷運站出口',
      location: {
        type: 'Point',
        coordinates: [121.517, 25.0478], // [lng, lat]
      },
      hasToiletPaper: true,
      isAccessible: true,
      tags: ['無障礙', '衛生紙', '捷運站'],
      avgCleanScore: 4.8,
      avgConvenienceScore: 4.5,
      reviewCount: 1,
    });
    testToiletId = String(createdToilet._id);

    const createdReview = await reviewModel.create({
      toiletId: new Types.ObjectId(testToiletId),
      cleanScore: 5,
      convenienceScore: 4,
      hasToiletPaper: true,
      comment: '乾淨明亮，設施齊全！',
      tags: ['乾淨', '明亮'],
      authorNickname: 'E2E 測試探員',
    });
    testReviewId = String(createdReview._id);
  });

  afterAll(async () => {
    // 清理測試種子資料並關閉連線
    if (testToiletId) {
      await toiletModel.findByIdAndDelete(testToiletId).exec();
    }
    if (testReviewId) {
      await reviewModel.findByIdAndDelete(testReviewId).exec();
    }
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Webhook 簽章安全性檢驗 (Security & Signature Verification)', () => {
    it('應在缺少 x-line-signature header 時回傳 401 Unauthorized', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [],
      };

      const response = await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .send(payload)
        .expect(401);

      expect(response.body).toHaveProperty(
        'message',
        'Missing LINE signature header',
      );
      expect(mockLineClient.replyMessage).not.toHaveBeenCalled();
    });

    it('應在提供無效/偽造的 x-line-signature 時回傳 401 Unauthorized', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [],
      };

      const response = await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', 'invalid_forged_signature_string==')
        .send(payload)
        .expect(401);

      expect(response.body).toHaveProperty('message', 'Invalid LINE signature');
      expect(mockLineClient.replyMessage).not.toHaveBeenCalled();
    });

    it('應在提供合法 HMAC 簽章且 events 為空陣列時回傳 200 OK ("OK")', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      const response = await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(response.text).toBe('OK');
      expect(mockLineClient.replyMessage).not.toHaveBeenCalled();
    });
  });

  describe('2. 文字訊息事件 (Text Message Events)', () => {
    it('接收關鍵字「找廁所」時，應回覆索取定位 Quick Reply 按鈕', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [
          {
            type: 'message',
            replyToken: 'test-reply-token-find-toilet',
            source: { userId: 'U1111222233', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
            message: {
              type: 'text',
              id: 'msg-001',
              text: '找廁所',
            },
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      const response = await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(response.text).toBe('OK');
      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(1);

      const replyArgs = getCallArgs(0);
      expect(replyArgs.replyToken).toBe('test-reply-token-find-toilet');
      expect(replyArgs.messages).toHaveLength(1);

      const sentMsg = getFirstSentMessage<messagingApi.TextMessage>(0);
      expect(sentMsg.type).toBe('text');
      expect(sentMsg.text).toContain('請點擊下方按鈕分享您的目前位置');
      expect(sentMsg.quickReply).toBeDefined();
      expect(sentMsg.quickReply?.items).toHaveLength(1);
      expect(sentMsg.quickReply?.items[0].action).toMatchObject({
        type: 'location',
        label: '📍 傳送目前位置',
      });
    });

    it('接收英文關鍵字「WC」或「toilet」時，亦應正常觸發定位索取', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [
          {
            type: 'message',
            replyToken: 'test-reply-token-wc',
            source: { userId: 'U1111222233', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
            message: {
              type: 'text',
              id: 'msg-002',
              text: 'Where is the wc?',
            },
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(1);
      const sentMsg = getFirstSentMessage<messagingApi.TextMessage>(0);
      expect(sentMsg.quickReply?.items[0].action.type).toBe('location');
    });

    it('接收非關鍵字一般文字（如「你好」）時，應回傳使用導覽訊息', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [
          {
            type: 'message',
            replyToken: 'test-reply-token-greeting',
            source: { userId: 'U1111222233', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
            message: {
              type: 'text',
              id: 'msg-003',
              text: '你好！早安！',
            },
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(1);
      const sentMsg = getFirstSentMessage<messagingApi.TextMessage>(0);
      expect(sentMsg.type).toBe('text');
      expect(sentMsg.text).toContain('我是廁所達人小幫手');
      expect(sentMsg.quickReply?.items[0].action.type).toBe('location');
    });
  });

  describe('3. 位置訊息事件 (Location Message Events)', () => {
    it('接收周邊有公廁的座標時，應回傳 Flex Carousel 輪播卡片（含地圖、導航與評價按鈕）', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [
          {
            type: 'message',
            replyToken: 'test-reply-token-nearby',
            source: { userId: 'U1111222233', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
            message: {
              type: 'location',
              id: 'loc-001',
              title: '台北車站',
              address: '台北市中正區',
              latitude: 25.0478,
              longitude: 121.517,
            },
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      const response = await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(response.text).toBe('OK');
      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(1);

      const replyArgs = getCallArgs(0);
      expect(replyArgs.replyToken).toBe('test-reply-token-nearby');

      const flexMsg = getFirstSentMessage<messagingApi.FlexMessage>(0);
      expect(flexMsg.type).toBe('flex');
      expect(flexMsg.altText).toBe('周邊公廁推薦列表');

      const carousel = flexMsg.contents as messagingApi.FlexCarousel;
      expect(carousel.type).toBe('carousel');
      expect(carousel.contents.length).toBeGreaterThanOrEqual(1);

      // 檢驗推薦第一張卡片內容結構
      const card = carousel.contents[0];
      expect(card.type).toBe('bubble');
      const hero = card.hero as messagingApi.FlexImage;
      expect(hero.type).toBe('image');
      expect(hero.url).toContain('https://maps.googleapis.com/maps/api/staticmap');

      // 檢驗卡片按鈕包含導航與查看評價
      const footerBox = card.footer as messagingApi.FlexBox;
      const footerButtons = footerBox.contents as messagingApi.FlexButton[];
      expect(footerButtons.length).toBe(2);

      const navButton = footerButtons[0];
      const navAction = navButton.action as messagingApi.URIAction;
      expect(navAction.type).toBe('uri');
      expect(navAction.label).toBe('🧭 Google Maps 導航');
      expect(navAction.uri).toContain('https://www.google.com/maps/dir/?api=1');

      const reviewButton = footerButtons[1];
      const reviewAction = reviewButton.action as messagingApi.PostbackAction;
      expect(reviewAction.type).toBe('postback');
      expect(reviewAction.label).toBe('💬 查看評價');
      expect(reviewAction.data).toContain('action=view_reviews');
      expect(reviewAction.data).toContain(`toiletId=${testToiletId}`);
    });

    it('接收遠離所有公廁的偏遠座標（查無公廁邊界）時，應回傳友善提示與重新定位按鈕', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [
          {
            type: 'message',
            replyToken: 'test-reply-token-empty-location',
            source: { userId: 'U1111222233', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
            message: {
              type: 'location',
              id: 'loc-002',
              title: '太平洋外海',
              address: '太平洋',
              latitude: 0.0,
              longitude: 0.0,
            },
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      const response = await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(response.text).toBe('OK');
      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(1);

      const flexMsg = getFirstSentMessage<messagingApi.FlexMessage>(0);
      expect(flexMsg.type).toBe('flex');
      expect(flexMsg.altText).toBe('附近未找到公廁');
      expect(flexMsg.contents.type).toBe('bubble');
      expect(JSON.stringify(flexMsg.contents)).toContain(
        '在您目前位置周邊 1000m 範圍內查無已登錄的公廁',
      );
      expect(flexMsg.quickReply?.items[0].action.type).toBe('location');
    });
  });

  describe('4. Postback 互動事件 (Postback Events)', () => {
    it('點擊「查看評價/評分」時，應查詢公廁評價並回傳評價 Flex Bubble', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [
          {
            type: 'postback',
            replyToken: 'test-reply-token-reviews',
            source: { userId: 'U1111222233', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
            postback: {
              data: `action=view_reviews&toiletId=${testToiletId}`,
            },
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      const response = await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(response.text).toBe('OK');
      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(1);

      const flexMsg = getFirstSentMessage<messagingApi.FlexMessage>(0);
      expect(flexMsg.type).toBe('flex');
      expect(flexMsg.altText).toContain('評價列表');
      expect(flexMsg.contents.type).toBe('bubble');
      expect(JSON.stringify(flexMsg.contents)).toContain(
        'E2E 測試台北車站公廁',
      );
      expect(JSON.stringify(flexMsg.contents)).toContain(
        '乾淨明亮，設施齊全！',
      );
    });

    it('查詢不存在之 toiletId 時，應優雅降級回傳提示文字，且維持 200 OK', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      const payload = {
        destination: 'U1234567890',
        events: [
          {
            type: 'postback',
            replyToken: 'test-reply-token-reviews-err',
            source: { userId: 'U1111222233', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
            postback: {
              data: `action=view_reviews&toiletId=${nonExistentId}`,
            },
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      const response = await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(response.text).toBe('OK');
      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(1);

      const sentMsg = getFirstSentMessage<messagingApi.TextMessage>(0);
      expect(sentMsg.type).toBe('text');
      expect(sentMsg.text).toContain('抱歉，暫時無法取得該公廁的評價資訊');
    });
  });

  describe('5. 關注 (Follow) 與多媒體/其他事件', () => {
    it('接收關注事件 (Follow Event) 時，應回覆迎賓導覽訊息', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [
          {
            type: 'follow',
            replyToken: 'test-reply-token-follow',
            source: { userId: 'U9999888877', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      const response = await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(response.text).toBe('OK');
      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(1);
      const sentMsg = getFirstSentMessage<messagingApi.TextMessage>(0);
      expect(sentMsg.text).toContain('我是廁所達人小幫手');
    });

    it('接收貼圖或圖片等其他媒體訊息時，應回傳導引訊息', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [
          {
            type: 'message',
            replyToken: 'test-reply-token-sticker',
            source: { userId: 'U1111222233', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
            message: {
              type: 'sticker',
              id: 'stk-001',
              packageId: '446',
              stickerId: '1988',
            },
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(1);
      const sentMsg = getFirstSentMessage<messagingApi.TextMessage>(0);
      expect(sentMsg.text).toContain('我是廁所達人小幫手');
    });

    it('單次 Webhook 接收多筆事件 (Batch Processing) 時，應全部順利分發處理', async () => {
      const payload = {
        destination: 'U1234567890',
        events: [
          {
            type: 'message',
            replyToken: 'batch-token-1',
            source: { userId: 'U111', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
            message: { type: 'text', id: 'm1', text: '找廁所' },
          },
          {
            type: 'follow',
            replyToken: 'batch-token-2',
            source: { userId: 'U222', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      const response = await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(response.text).toBe('OK');
      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('6. LINE Messaging API 例外防護 (API Fault Resilience)', () => {
    it('當 Messaging API replyMessage 拋出網路異常時，控制器應安全捕捉並依舊回傳 200 OK', async () => {
      mockLineClient.replyMessage.mockRejectedValueOnce(
        new Error('LINE API Network Gateway Timeout'),
      );

      const payload = {
        destination: 'U1234567890',
        events: [
          {
            type: 'message',
            replyToken: 'test-reply-token-fault',
            source: { userId: 'U1111222233', type: 'user' },
            timestamp: Date.now(),
            mode: 'active',
            message: {
              type: 'text',
              id: 'msg-err-001',
              text: '找廁所',
            },
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateSignature(rawBody, channelSecret);

      const response = await request(app.getHttpServer())
        .post('/api/linebot/webhook')
        .set('x-line-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(response.text).toBe('OK');
      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(1);
    });
  });
});
