import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  LinebotTemplateService,
  ToiletItem,
  ReviewItem,
} from './linebot-template.service';
import { messagingApi } from '@line/bot-sdk';

describe('LinebotTemplateService', () => {
  let service: LinebotTemplateService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinebotTemplateService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LinebotTemplateService>(LinebotTemplateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStaticMapUrl', () => {
    const lat = 25.033964;
    const lng = 121.564468;

    it('should return Google Static Maps URL with API key when configured', () => {
      mockConfigService.get.mockReturnValue('test-google-api-key');

      const url = service.getStaticMapUrl(lat, lng);
      expect(url).toContain('https://maps.googleapis.com/maps/api/staticmap');
      expect(url).toContain(`center=${lat},${lng}`);
      expect(url).toContain('language=zh-tw');
      expect(url).toContain(`markers=color:red%7C${lat},${lng}`);
      expect(url).toContain('key=test-google-api-key');
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'GOOGLE_MAPS_STATIC_API_KEY',
      );
    });

    it('should return Google Static Maps URL when GOOGLE_MAPS_STATIC_API_KEY is not set', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const url = service.getStaticMapUrl(lat, lng);
      expect(url).toContain('https://maps.googleapis.com/maps/api/staticmap');
      expect(url).toContain(`center=${lat},${lng}`);
      expect(url).toContain('language=zh-tw');
      expect(url).toContain(`markers=color:red%7C${lat},${lng}`);
      expect(url).toContain('key=');
    });
  });

  describe('formatDistance', () => {
    it('should format distance under 1000m as meters', () => {
      expect(service.formatDistance(120)).toBe('120m');
      expect(service.formatDistance(999.4)).toBe('999m');
    });

    it('should format distance >= 1000m as kilometers with 1 decimal place', () => {
      expect(service.formatDistance(1000)).toBe('1.0km');
      expect(service.formatDistance(1250)).toBe('1.3km');
      expect(service.formatDistance(2500)).toBe('2.5km');
    });

    it('should return empty string for null, undefined, or NaN', () => {
      expect(service.formatDistance(undefined)).toBe('');
      expect(service.formatDistance(null as unknown as number)).toBe('');
      expect(service.formatDistance(NaN)).toBe('');
    });
  });

  describe('createLocationQuickReply', () => {
    it('should return valid TextMessage with location quickReply item', () => {
      const message = service.createLocationQuickReply();

      expect(message.type).toBe('text');
      expect(message.text).toContain('請點擊下方按鈕分享您的目前位置');
      expect(message.quickReply).toBeDefined();
      expect(message.quickReply?.items).toHaveLength(1);

      const item = message.quickReply?.items?.[0];
      expect(item?.type).toBe('action');
      expect(item?.action).toEqual({
        type: 'location',
        label: '📍 傳送目前位置',
      });
    });
  });

  describe('createWelcomeGuideMessage', () => {
    it('should return valid TextMessage with welcome guide text and location quickReply item', () => {
      const message = service.createWelcomeGuideMessage();

      expect(message.type).toBe('text');
      expect(message.text).toContain('我是廁所達人小幫手');
      expect(message.quickReply).toBeDefined();
      expect(message.quickReply?.items).toHaveLength(1);

      const item = message.quickReply?.items?.[0];
      expect(item?.type).toBe('action');
      expect(item?.action).toEqual({
        type: 'location',
        label: '📍 傳送目前位置',
      });
    });
  });

  describe('createToiletsCarousel', () => {
    const mockToilets: ToiletItem[] = [
      {
        _id: 'toilet1',
        name: '台北車站大廳公廁',
        address: '台北市中正區北平西路3號',
        location: {
          type: 'Point',
          coordinates: [121.517, 25.047],
        },
        distance: 120,
        avgCleanScore: 4.5,
        avgConvenienceScore: 4.8,
        reviewCount: 15,
        hasToiletPaper: true,
        isAccessible: true,
        openInfo: { openType: '24H' },
      },
      {
        _id: 'toilet2',
        name: '捷運中山站公廁',
        address: '台北市中山區南京西路16號',
        location: {
          type: 'Point',
          coordinates: [121.521, 25.053],
        },
        distance: 850,
        avgCleanScore: 0,
        reviewCount: 0,
        hasToiletPaper: false,
        isAccessible: false,
      },
      {
        _id: 'toilet3',
        name: '公園公廁',
        address: '台北市大安區新生南路二段1號',
        location: {
          type: 'Point',
          coordinates: [121.535, 25.03],
        },
        distance: 1500,
        avgCleanScore: 3.2,
        reviewCount: 5,
        hasToiletPaper: null,
        isAccessible: null,
        openInfo: { hours: '08:00 - 22:00' },
      },
    ];

    it('should return no toilets message when input array is empty or undefined', () => {
      const emptyResult = service.createToiletsCarousel([]);
      expect(emptyResult.altText).toBe('附近未找到公廁');

      const nullResult = service.createToiletsCarousel(
        null as unknown as ToiletItem[],
      );
      expect(nullResult.altText).toBe('附近未找到公廁');
    });

    it('should generate valid Carousel FlexMessage with correct bubbles', () => {
      const result = service.createToiletsCarousel(mockToilets);

      expect(result.type).toBe('flex');
      expect(result.altText).toBe('周邊公廁推薦列表');
      expect(result.contents.type).toBe('carousel');

      const carousel = result.contents as messagingApi.FlexCarousel;
      expect(carousel.contents).toHaveLength(3);

      // 檢查第一張 Bubble
      const bubble1 = carousel.contents[0];
      expect(bubble1.type).toBe('bubble');
      expect(bubble1.size).toBe('mega');

      // Hero image & Action
      const hero = bubble1.hero as messagingApi.FlexImage;
      expect(hero.type).toBe('image');
      expect(hero.url).toContain('121.517');
      expect(hero.url).toContain('25.047');
      expect(hero.aspectRatio).toBe('20:13');
      expect(hero.action).toEqual({
        type: 'uri',
        label: 'Google Maps 導航',
        uri: 'https://www.google.com/maps/dir/?api=1&destination=25.047,121.517&travelmode=walking',
      });

      // Header 標題與距離
      const headerBox = bubble1.header as messagingApi.FlexBox;
      const titleBox = headerBox.contents[0] as messagingApi.FlexBox;
      const titleText = titleBox.contents[0] as messagingApi.FlexText;
      expect(titleText.text).toBe('台北車站大廳公廁');

      // Footer Actions (導航與 Postback 查看評價)
      const footerBox = bubble1.footer as messagingApi.FlexBox;
      expect(footerBox.contents).toHaveLength(2);

      const navBtn = footerBox.contents[0] as messagingApi.FlexButton;
      expect(navBtn.action).toEqual({
        type: 'uri',
        label: '🧭 Google Maps 導航',
        uri: 'https://www.google.com/maps/dir/?api=1&destination=25.047,121.517&travelmode=walking',
      });

      const reviewBtn = footerBox.contents[1] as messagingApi.FlexButton;
      expect(reviewBtn.action).toEqual({
        type: 'postback',
        label: '💬 查看評價',
        data: 'action=view_reviews&toiletId=toilet1',
        displayText: '查看「台北車站大廳公廁」的評價',
      });
    });

    it('should correctly render tri-state badges for facilities', () => {
      const result = service.createToiletsCarousel(mockToilets);
      const carousel = result.contents as messagingApi.FlexCarousel;

      // Bubble 1: true / true / 24H
      const bubble1 = carousel.contents[0];
      const body1 = bubble1.body as messagingApi.FlexBox;
      const badgeBox1 = body1.contents[1] as messagingApi.FlexBox;
      const firstRow1 = badgeBox1.contents[0] as messagingApi.FlexBox;
      const firstRowTexts1 = firstRow1.contents as messagingApi.FlexText[];
      expect(firstRowTexts1[0].text).toBe('🧻 提供衛生紙');
      expect(firstRowTexts1[1].text).toBe('♿ 無障礙友善');

      const secondRow1 = badgeBox1.contents[1] as messagingApi.FlexBox;
      const secondRowTexts1 = secondRow1.contents as messagingApi.FlexText[];
      expect(secondRowTexts1[0].text).toBe('🕒 24小時開放');

      // Bubble 2: false / false
      const bubble2 = carousel.contents[1];
      const body2 = bubble2.body as messagingApi.FlexBox;
      const badgeBox2 = body2.contents[1] as messagingApi.FlexBox;
      const firstRow2 = badgeBox2.contents[0] as messagingApi.FlexBox;
      const firstRowTexts2 = firstRow2.contents as messagingApi.FlexText[];
      expect(firstRowTexts2[0].text).toBe('❌ 無衛生紙');
      expect(firstRowTexts2[1].text).toBe('🚷 無設置無障礙設施');

      // Bubble 3: null / null / hours
      const bubble3 = carousel.contents[2];
      const body3 = bubble3.body as messagingApi.FlexBox;
      const badgeBox3 = body3.contents[1] as messagingApi.FlexBox;
      const firstRow3 = badgeBox3.contents[0] as messagingApi.FlexBox;
      const firstRowTexts3 = firstRow3.contents as messagingApi.FlexText[];
      expect(firstRowTexts3[0].text).toBe('❓ 衛生紙未知');
      expect(firstRowTexts3[1].text).toBe('❓ 無障礙未知');

      const secondRow3 = badgeBox3.contents[1] as messagingApi.FlexBox;
      const secondRowTexts3 = secondRow3.contents as messagingApi.FlexText[];
      expect(secondRowTexts3[0].text).toBe('🕒 08:00 - 22:00');
    });

    it('should limit carousel bubbles to 10 max when more than 10 toilets are passed', () => {
      const manyToilets: ToiletItem[] = Array.from({ length: 15 }, (_, i) => ({
        _id: `toilet_${i}`,
        name: `公廁 ${i}`,
        location: { type: 'Point', coordinates: [121.5, 25.0] },
        distance: 100 * (i + 1),
      }));

      const result = service.createToiletsCarousel(manyToilets);
      const carousel = result.contents as messagingApi.FlexCarousel;
      expect(carousel.contents).toHaveLength(10);
    });
  });

  describe('createNoToiletsMessage', () => {
    it('should return friendly no-toilets FlexBubble with retry quick reply', () => {
      const message = service.createNoToiletsMessage();

      expect(message.type).toBe('flex');
      expect(message.altText).toBe('附近未找到公廁');

      const bubble = message.contents as messagingApi.FlexBubble;
      expect(bubble.type).toBe('bubble');
      expect(bubble.footer).toBeUndefined();
      expect(message.quickReply?.items?.[0]?.action).toEqual({
        type: 'location',
        label: '📍 重新傳送位置',
      });
    });
  });

  describe('createToiletReviewsMessage', () => {
    const mockToilet: ToiletItem = {
      _id: 'toilet1',
      name: '台北車站公廁',
      location: { coordinates: [121.517, 25.047] },
      avgCleanScore: 4.2,
      avgConvenienceScore: 4.5,
      reviewCount: 2,
    };

    it('should return no reviews message when reviews array is empty', () => {
      const message = service.createToiletReviewsMessage(mockToilet, []);

      expect(message.type).toBe('flex');
      expect(message.altText).toBe('【台北車站公廁】評價列表');

      const bubble = message.contents as messagingApi.FlexBubble;
      const body = bubble.body as messagingApi.FlexBox;
      const emptyNotice = body.contents.find((c) => {
        if (c.type === 'box') {
          const box = c;
          const firstChild = box.contents?.[0] as messagingApi.FlexText;
          return firstChild?.text?.includes('目前尚無任何評論');
        }
        return false;
      });
      expect(emptyNotice).toBeDefined();
    });

    it('should return reviews list when reviews exist', () => {
      const mockReviews: ReviewItem[] = [
        {
          _id: 'rev1',
          authorName: '小明',
          cleanScore: 5,
          convenienceScore: 4,
          hasToiletPaper: true,
          comment: '非常乾淨，有自動芳香機！',
          createdAt: new Date('2026-03-01T10:00:00Z'),
        },
        {
          _id: 'rev2',
          authorName: '小華',
          cleanScore: 3,
          convenienceScore: 5,
          hasToiletPaper: false,
          comment: '人潮較多需排隊',
          createdAt: new Date('2026-03-02T12:00:00Z'),
        },
      ];

      const message = service.createToiletReviewsMessage(
        mockToilet,
        mockReviews,
      );

      expect(message.type).toBe('flex');
      expect(message.altText).toBe('【台北車站公廁】評價列表');

      const bubble = message.contents as messagingApi.FlexBubble;
      const header = bubble.header as messagingApi.FlexBox;
      expect((header.contents[0] as messagingApi.FlexText).text).toBe(
        '💬【台北車站公廁】評價一覽',
      );

      const footer = bubble.footer as messagingApi.FlexBox;
      const navBtn = footer.contents[0] as messagingApi.FlexButton;
      expect(navBtn.action).toEqual({
        type: 'uri',
        label: '🧭 Google Maps 導航',
        uri: 'https://www.google.com/maps/dir/?api=1&destination=25.047,121.517&travelmode=walking',
      });
    });
  });
});
