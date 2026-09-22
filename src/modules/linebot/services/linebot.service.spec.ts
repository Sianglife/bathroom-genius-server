import { Test, TestingModule } from '@nestjs/testing';
import {
  LinebotService,
  DEFAULT_SEARCH_RADIUS,
  DEFAULT_LIMIT,
} from './linebot.service';
import { ToiletsService } from '../../toilets/toilets.service';
import { ReviewsService } from '../../reviews/reviews.service';
import { LinebotTemplateService } from './linebot-template.service';
import { webhook } from '@line/bot-sdk';

describe('LinebotService', () => {
  let service: LinebotService;
  let toiletsService: jest.Mocked<ToiletsService>;
  let reviewsService: jest.Mocked<ReviewsService>;
  let templateService: jest.Mocked<LinebotTemplateService>;
  let mockLineClient: { replyMessage: jest.Mock };

  beforeEach(async () => {
    mockLineClient = {
      replyMessage: jest.fn().mockResolvedValue({}),
    };

    const mockToiletsService = {
      findNearby: jest.fn(),
      findOne: jest.fn(),
    };

    const mockReviewsService = {
      findByToiletId: jest.fn(),
    };

    const mockTemplateService = {
      createLocationQuickReply: jest.fn().mockReturnValue({
        type: 'text',
        text: '請點擊下方按鈕分享您的目前位置',
        quickReply: { items: [] },
      }),
      createWelcomeGuideMessage: jest.fn().mockReturnValue({
        type: 'text',
        text: '您好！我是廁所達人小幫手',
        quickReply: { items: [] },
      }),
      createToiletsCarousel: jest.fn().mockReturnValue({
        type: 'flex',
        altText: '周邊公廁推薦列表',
        contents: { type: 'carousel', contents: [] },
      }),
      createNoToiletsMessage: jest.fn().mockReturnValue({
        type: 'flex',
        altText: '附近未找到公廁',
        contents: { type: 'bubble' },
      }),
      createToiletReviewsMessage: jest.fn().mockReturnValue({
        type: 'flex',
        altText: '公廁評價列表',
        contents: { type: 'bubble' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinebotService,
        {
          provide: 'LINE_CLIENT',
          useValue: mockLineClient,
        },
        {
          provide: ToiletsService,
          useValue: mockToiletsService,
        },
        {
          provide: ReviewsService,
          useValue: mockReviewsService,
        },
        {
          provide: LinebotTemplateService,
          useValue: mockTemplateService,
        },
      ],
    }).compile();

    service = module.get<LinebotService>(LinebotService);
    toiletsService = module.get(ToiletsService);
    reviewsService = module.get(ReviewsService);
    templateService = module.get(LinebotTemplateService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleEvents', () => {
    it('should return early when events is empty or undefined', async () => {
      await expect(service.handleEvents([])).resolves.toBeUndefined();
      await expect(
        service.handleEvents(undefined as unknown as webhook.Event[]),
      ).resolves.toBeUndefined();
      expect(mockLineClient.replyMessage).not.toHaveBeenCalled();
    });

    it('should process multiple events concurrently and isolate errors', async () => {
      const event1: webhook.MessageEvent = {
        type: 'message',
        mode: 'active',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'user1' },
        replyToken: 'token1',
        message: {
          id: 'msg1',
          type: 'text',
          text: '找廁所',
          quoteToken: 'q1',
        },
      };

      const event2: webhook.MessageEvent = {
        type: 'message',
        mode: 'active',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'user2' },
        replyToken: 'token2',
        message: {
          id: 'msg2',
          type: 'text',
          text: '你好',
          quoteToken: 'q2',
        },
      };

      await service.handleEvents([event1, event2]);

      expect(templateService.createLocationQuickReply).toHaveBeenCalled();
      expect(templateService.createWelcomeGuideMessage).toHaveBeenCalled();
      expect(mockLineClient.replyMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleMessageEvent', () => {
    describe('text message', () => {
      it('should reply with location quick reply when text contains "找廁所"', async () => {
        const event: webhook.MessageEvent = {
          type: 'message',
          mode: 'active',
          timestamp: Date.now(),
          source: { type: 'user', userId: 'user1' },
          replyToken: 'reply-token-find-toilet',
          message: {
            id: 'msg1',
            type: 'text',
            text: '我想找廁所',
            quoteToken: 'q1',
          },
        };

        await service.handleEvent(event);

        expect(templateService.createLocationQuickReply).toHaveBeenCalled();
        expect(mockLineClient.replyMessage).toHaveBeenCalledWith({
          replyToken: 'reply-token-find-toilet',
          messages: [
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('分享您的目前位置'),
            }),
          ],
        });
      });

      it('should reply with location quick reply for English keyword "wc" or "toilet"', async () => {
        const event: webhook.MessageEvent = {
          type: 'message',
          mode: 'active',
          timestamp: Date.now(),
          source: { type: 'user', userId: 'user1' },
          replyToken: 'reply-token-wc',
          message: {
            id: 'msg1',
            type: 'text',
            text: 'where is the WC?',
            quoteToken: 'q1',
          },
        };

        await service.handleEvent(event);

        expect(templateService.createLocationQuickReply).toHaveBeenCalled();
        expect(mockLineClient.replyMessage).toHaveBeenCalledWith({
          replyToken: 'reply-token-wc',
          messages: [expect.any(Object)],
        });
      });

      it('should reply with welcome guide message for general text message (e.g. "早安")', async () => {
        const event: webhook.MessageEvent = {
          type: 'message',
          mode: 'active',
          timestamp: Date.now(),
          source: { type: 'user', userId: 'user1' },
          replyToken: 'reply-token-general',
          message: {
            id: 'msg1',
            type: 'text',
            text: '早安！',
            quoteToken: 'q1',
          },
        };

        await service.handleEvent(event);

        expect(templateService.createWelcomeGuideMessage).toHaveBeenCalled();
        expect(mockLineClient.replyMessage).toHaveBeenCalledWith({
          replyToken: 'reply-token-general',
          messages: [
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('我是廁所達人小幫手'),
            }),
          ],
        });
      });
    });

    describe('location message', () => {
      const mockLocationEvent: webhook.MessageEvent = {
        type: 'message',
        mode: 'active',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'user1' },
        replyToken: 'reply-token-location',
        message: {
          id: 'msg1',
          type: 'location',
          title: '台北車站',
          address: '台北市中正區北平西路3號',
          latitude: 25.047,
          longitude: 121.517,
        },
      };

      it('should query toilets and reply with toilets carousel when toilets are found', async () => {
        const mockToilets = [
          {
            _id: 'toilet1',
            name: '台北車站大廳公廁',
            distance: 120,
            avgCleanScore: 4.5,
          },
        ];
        toiletsService.findNearby.mockResolvedValue(mockToilets);

        await service.handleEvent(mockLocationEvent);

        expect(toiletsService.findNearby).toHaveBeenCalledWith({
          lat: 25.047,
          lng: 121.517,
          radius: DEFAULT_SEARCH_RADIUS,
          limit: DEFAULT_LIMIT,
        });
        expect(templateService.createToiletsCarousel).toHaveBeenCalledWith(
          mockToilets,
        );
        expect(mockLineClient.replyMessage).toHaveBeenCalledWith({
          replyToken: 'reply-token-location',
          messages: [
            expect.objectContaining({
              type: 'flex',
              altText: '周邊公廁推薦列表',
            }),
          ],
        });
      });

      it('should reply with no toilets message when findNearby returns empty array', async () => {
        toiletsService.findNearby.mockResolvedValue([]);

        await service.handleEvent(mockLocationEvent);

        expect(toiletsService.findNearby).toHaveBeenCalledWith({
          lat: 25.047,
          lng: 121.517,
          radius: DEFAULT_SEARCH_RADIUS,
          limit: DEFAULT_LIMIT,
        });
        expect(templateService.createNoToiletsMessage).toHaveBeenCalled();
        expect(mockLineClient.replyMessage).toHaveBeenCalledWith({
          replyToken: 'reply-token-location',
          messages: [
            expect.objectContaining({
              type: 'flex',
              altText: '附近未找到公廁',
            }),
          ],
        });
      });
    });

    describe('other message types', () => {
      it('should reply with welcome guide message for sticker message', async () => {
        const event: webhook.MessageEvent = {
          type: 'message',
          mode: 'active',
          timestamp: Date.now(),
          source: { type: 'user', userId: 'user1' },
          replyToken: 'reply-token-sticker',
          message: {
            id: 'msg1',
            type: 'sticker',
            packageId: '1',
            stickerId: '1',
            stickerResourceType: 'STATIC',
          },
        };

        await service.handleEvent(event);

        expect(templateService.createWelcomeGuideMessage).toHaveBeenCalled();
        expect(mockLineClient.replyMessage).toHaveBeenCalledWith({
          replyToken: 'reply-token-sticker',
          messages: [expect.any(Object)],
        });
      });
    });
  });

  describe('handlePostbackEvent', () => {
    it('should query toilet and reviews and reply with reviews flex message for view_reviews action', async () => {
      const postbackEvent: webhook.PostbackEvent = {
        type: 'postback',
        mode: 'active',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'user1' },
        replyToken: 'reply-token-postback',
        postback: {
          data: 'action=view_reviews&toiletId=toilet123',
        },
      };

      const mockToilet = {
        _id: 'toilet123',
        name: '捷運公廁',
      };
      const mockReviewsData = {
        data: [
          {
            _id: 'review1',
            cleanScore: 5,
            comment: '很乾淨！',
          },
        ],
        total: 1,
        page: 1,
        limit: 3,
      };

      toiletsService.findOne.mockResolvedValue(mockToilet as any);
      reviewsService.findByToiletId.mockResolvedValue(mockReviewsData as any);

      await service.handleEvent(postbackEvent);

      expect(toiletsService.findOne).toHaveBeenCalledWith('toilet123');
      expect(reviewsService.findByToiletId).toHaveBeenCalledWith('toilet123', {
        page: 1,
        limit: 3,
      });
      expect(templateService.createToiletReviewsMessage).toHaveBeenCalledWith(
        mockToilet,
        mockReviewsData.data,
      );
      expect(mockLineClient.replyMessage).toHaveBeenCalledWith({
        replyToken: 'reply-token-postback',
        messages: [
          expect.objectContaining({
            type: 'flex',
            altText: '公廁評價列表',
          }),
        ],
      });
    });

    it('should reply with fallback message when toilet or reviews query throws exception', async () => {
      const postbackEvent: webhook.PostbackEvent = {
        type: 'postback',
        mode: 'active',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'user1' },
        replyToken: 'reply-token-postback-error',
        postback: {
          data: 'action=view_reviews&toiletId=non_existing_id',
        },
      };

      toiletsService.findOne.mockRejectedValue(new Error('Toilet not found'));

      await service.handleEvent(postbackEvent);

      expect(mockLineClient.replyMessage).toHaveBeenCalledWith({
        replyToken: 'reply-token-postback-error',
        messages: [
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('暫時無法取得該公廁的評價資訊'),
          }),
        ],
      });
    });

    it('should ignore and log warn for unknown postback action', async () => {
      const postbackEvent: webhook.PostbackEvent = {
        type: 'postback',
        mode: 'active',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'user1' },
        replyToken: 'reply-token-unknown',
        postback: {
          data: 'action=unknown_action',
        },
      };

      await service.handleEvent(postbackEvent);

      expect(mockLineClient.replyMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleFollowEvent', () => {
    it('should reply with welcome guide message when user follows the bot', async () => {
      const followEvent: webhook.FollowEvent = {
        type: 'follow',
        mode: 'active',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'user1' },
        replyToken: 'reply-token-follow',
        follow: {
          isUnblocked: false,
        },
      };

      await service.handleEvent(followEvent);

      expect(templateService.createWelcomeGuideMessage).toHaveBeenCalled();
      expect(mockLineClient.replyMessage).toHaveBeenCalledWith({
        replyToken: 'reply-token-follow',
        messages: [
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('我是廁所達人小幫手'),
          }),
        ],
      });
    });
  });

  describe('unhandled event types', () => {
    it('should safely log and ignore unknown event types without throwing', async () => {
      const unknownEvent = {
        type: 'unfollow',
        mode: 'active',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'user1' },
      } as unknown as webhook.Event;

      await expect(service.handleEvent(unknownEvent)).resolves.toBeUndefined();
      expect(mockLineClient.replyMessage).not.toHaveBeenCalled();
    });
  });

  describe('reply exception resilience', () => {
    it('should safely catch LINE Messaging API network/server errors without crashing', async () => {
      mockLineClient.replyMessage.mockRejectedValue(
        new Error('LINE API connection timeout'),
      );

      const event: webhook.MessageEvent = {
        type: 'message',
        mode: 'active',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'user1' },
        replyToken: 'reply-token-err',
        message: {
          id: 'msg1',
          type: 'text',
          text: '找廁所',
          quoteToken: 'q1',
        },
      };

      await expect(service.handleEvent(event)).resolves.toBeUndefined();
      expect(mockLineClient.replyMessage).toHaveBeenCalled();
    });

    it('should not call replyMessage if replyToken is empty or undefined', async () => {
      const event: webhook.MessageEvent = {
        type: 'message',
        mode: 'active',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'user1' },
        replyToken: '',
        message: {
          id: 'msg1',
          type: 'text',
          text: '找廁所',
          quoteToken: 'q1',
        },
      };

      await service.handleEvent(event);
      expect(mockLineClient.replyMessage).not.toHaveBeenCalled();
    });
  });
});
