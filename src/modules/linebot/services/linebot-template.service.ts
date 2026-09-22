import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi } from '@line/bot-sdk';

export interface ToiletItem {
  _id?: string | { toString(): string };
  id?: string;
  name?: string;
  address?: string;
  distance?: number;
  avgCleanScore?: number;
  avgConvenienceScore?: number;
  reviewCount?: number;
  hasToiletPaper?: boolean | null;
  isAccessible?: boolean | null;
  tags?: string[];
  location?: {
    type?: string;
    coordinates?: number[];
  };
  openInfo?: {
    openType?: string;
    hours?: string;
  };
}

export interface ReviewItem {
  _id?: string | { toString(): string };
  toiletId?: string | { toString(): string };
  authorName?: string;
  cleanScore?: number;
  convenienceScore?: number;
  hasToiletPaper?: boolean | null;
  comment?: string;
  createdAt?: Date | string;
}

@Injectable()
export class LinebotTemplateService {
  constructor(private readonly configService: ConfigService) { }

  /**
   * 取得靜態地圖縮圖 URL (使用 Google Maps Static API)
   */
  getStaticMapUrl(lat: number, lng: number): string {
    const googleApiKey =
      this.configService.get<string>('GOOGLE_MAPS_STATIC_API_KEY') || '';

    return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=600x300&scale=2&maptype=roadmap&language=zh-tw&markers=color:red%7C${lat},${lng}&key=${googleApiKey}`;
  }

  /**
   * 格式化距離字串 (公尺 / 公里)
   */
  formatDistance(meters?: number): string {
    if (meters === undefined || meters === null || isNaN(meters)) {
      return '';
    }
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  }

  /**
   * 索取定位 Quick Reply 訊息
   */
  createLocationQuickReply(): messagingApi.TextMessage {
    return {
      type: 'text',
      text: '請點擊下方按鈕分享您的目前位置，將為您尋找附近的公廁 🚻：',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'location',
              label: '📍 傳送目前位置',
            },
          },
        ],
      },
    };
  }

  /**
   * 使用引導 / 歡迎訊息 (附帶定位 Quick Reply)
   */
  createWelcomeGuideMessage(): messagingApi.TextMessage {
    return {
      type: 'text',
      text: '您好！我是廁所達人小幫手 🚻\n請點擊下方按鈕分享您的位置，或輸入「找廁所」開始為您尋找附近的公廁！',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'location',
              label: '📍 傳送目前位置',
            },
          },
        ],
      },
    };
  }

  /**
   * 建立周邊公廁推薦 Flex Carousel 卡片
   */
  createToiletsCarousel(toilets: ToiletItem[]): messagingApi.FlexMessage {
    if (!toilets || toilets.length === 0) {
      return this.createNoToiletsMessage();
    }

    // LINE Flex Carousel 限制最多 10 張 Bubble
    const displayToilets = toilets.slice(0, 10);
    const bubbles: messagingApi.FlexBubble[] = displayToilets.map((toilet) =>
      this.buildToiletBubble(toilet),
    );

    return {
      type: 'flex',
      altText: '周邊公廁推薦列表',
      contents: {
        type: 'carousel',
        contents: bubbles,
      },
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'location',
              label: '📍 重新傳送位置',
            },
          },
        ],
      },
    };
  }

  /**
   * 建立單一公廁 Flex Bubble 卡片
   */
  private buildToiletBubble(toilet: ToiletItem): messagingApi.FlexBubble {
    const lat = toilet.location?.coordinates?.[1] ?? 0;
    const lng = toilet.location?.coordinates?.[0] ?? 0;
    const mapUrl = this.getStaticMapUrl(lat, lng);
    const navigationUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    const toiletId =
      typeof toilet._id === 'object' && toilet._id !== null
        ? toilet._id.toString()
        : (toilet._id ?? toilet.id ?? '');

    const distanceText = this.formatDistance(toilet.distance);
    const cleanScoreText =
      toilet.avgCleanScore && toilet.avgCleanScore > 0
        ? `⭐ ${toilet.avgCleanScore.toFixed(1)}`
        : '⭐ 尚無評分';
    const reviewCountText = `(${toilet.reviewCount || 0} 則評論)`;

    // 設施標籤元件
    const facilityBadges = this.buildFacilityBadges(toilet);

    return {
      type: 'bubble',
      size: 'mega',
      hero: {
        type: 'image',
        url: mapUrl,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
        action: {
          type: 'uri',
          label: 'Google Maps 導航',
          uri: navigationUrl,
        },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm', // title 和 address 的間距
        paddingBottom: 'none', // 地址下方貼合固定高度
        height: '90px', // 固定 Header 容器高度 (預設頂部 padding + 內容)
        justifyContent: 'center',
        contents: [
          // 標題區塊（高度砍半為 24px，單行高度）
          {
            type: 'box',
            layout: 'vertical',
            height: '24px',
            justifyContent: 'center',
            contents: [
              {
                type: 'text',
                text: toilet.name || '公共廁所',
                weight: 'bold',
                size: 'lg',
                wrap: true,
                maxLines: 1, // 單行呈現
                color: '#111111',
              },
            ],
          },
          // 距離與地址區塊（固定 2 行範圍高度，只有 1 行時垂直置中）
          {
            type: 'box',
            layout: 'vertical',
            height: '34px',
            justifyContent: 'center',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  ...(distanceText
                    ? [
                      {
                        type: 'text' as const,
                        text: `📍 ${distanceText}`,
                        weight: 'bold' as const,
                        size: 'sm' as const,
                        color: '#007AFF',
                        flex: 0,
                      },
                    ]
                    : []),
                  {
                    type: 'text' as const,
                    text: toilet.address || '',
                    size: 'xs' as const,
                    color: '#888888',
                    wrap: true,
                    maxLines: 2, // 地址最多 2 行
                    flex: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingBottom: 'xs', // 縮小 status 底部的內距
        contents: [
          // 評分資訊
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: cleanScoreText,
                weight: 'bold',
                size: 'sm',
                color: '#F39C12',
                flex: 0,
              },
              {
                type: 'text',
                text: reviewCountText,
                size: 'xs',
                color: '#888888',
                flex: 1,
              },
            ],
          },
          // 設施狀態標籤
          facilityBadges,
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingTop: 'xl', // Footer 上方間隔再大一級 (lg -> xl)
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: '#1DB446',
            action: {
              type: 'uri',
              label: '🧭 Google Maps 導航',
              uri: navigationUrl,
            },
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'postback',
              label: '💬 查看評價',
              data: `action=view_reviews&toiletId=${toiletId}`,
              displayText: `查看「${toilet.name || '公廁'}」的評價`,
            },
          },
        ],
      },
    };
  }

  /**
   * 建立設施標籤元件 (支援衛生紙、無障礙三態標籤與 24H 標籤)
   */
  private buildFacilityBadges(toilet: ToiletItem): messagingApi.FlexBox {
    // 衛生紙三態標籤
    let paperText = '❓ 衛生紙未知';
    let paperColor = '#888888';
    if (toilet.hasToiletPaper === true) {
      paperText = '🧻 提供衛生紙';
      paperColor = '#28a745';
    } else if (toilet.hasToiletPaper === false) {
      paperText = '❌ 無衛生紙';
      paperColor = '#dc3545';
    }

    // 無障礙三態標籤
    let accessibleText = '❓ 無障礙未知';
    let accessibleColor = '#888888';
    if (toilet.isAccessible === true) {
      accessibleText = '♿ 無障礙友善';
      accessibleColor = '#007bff';
    } else if (toilet.isAccessible === false) {
      accessibleText = '🚷 無設置無障礙設施';
      accessibleColor = '#6c757d';
    }

    const badgeContents: messagingApi.FlexComponent[] = [
      {
        type: 'box',
        layout: 'baseline',
        spacing: 'xs',
        contents: [
          {
            type: 'text',
            text: paperText,
            size: 'xs',
            color: paperColor,
            flex: 1,
          },
          {
            type: 'text',
            text: accessibleText,
            size: 'xs',
            color: accessibleColor,
            flex: 1,
          },
        ],
      },
    ];

    // 24H 開放或開放時間
    const is24H =
      toilet.openInfo?.openType === '24H' ||
      (toilet.tags && toilet.tags.includes('24H')) ||
      (toilet.openInfo?.hours && toilet.openInfo.hours.includes('24'));

    if (is24H || toilet.openInfo?.hours) {
      const openHoursText = is24H
        ? '🕒 24小時開放'
        : `🕒 ${toilet.openInfo?.hours ?? ''}`;

      badgeContents.push({
        type: 'box',
        layout: 'baseline',
        spacing: 'xs',
        contents: [
          {
            type: 'text',
            text: openHoursText,
            size: 'xs',
            color: '#6c757d',
            flex: 1,
          },
        ],
      });
    }

    return {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: badgeContents,
    };
  }

  /**
   * 查無廁所提示 Flex 訊息
   */
  createNoToiletsMessage(): messagingApi.FlexMessage {
    return {
      type: 'flex',
      altText: '附近未找到公廁',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🚻 附近未找到公廁',
              weight: 'bold',
              size: 'lg',
              color: '#333333',
            },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'text',
              text: '在您目前位置周邊 1000m 範圍內查無已登錄的公廁。您可以嘗試擴大搜尋範圍或重新傳送位置！',
              wrap: true,
              size: 'sm',
              color: '#666666',
            },
          ],
        },
      },
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'location',
              label: '📍 重新傳送位置',
            },
          },
        ],
      },
    };
  }

  /**
   * 建立廁所評價列表 Flex Bubble 訊息
   */
  createToiletReviewsMessage(
    toilet: ToiletItem,
    reviews: ReviewItem[],
  ): messagingApi.FlexMessage {
    const toiletName = toilet.name || '公廁';
    const lat = toilet.location?.coordinates?.[1] ?? 0;
    const lng = toilet.location?.coordinates?.[0] ?? 0;
    const navigationUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;

    const cleanScoreText =
      toilet.avgCleanScore && toilet.avgCleanScore > 0
        ? `⭐ 乾淨度: ${toilet.avgCleanScore.toFixed(1)} / 5`
        : '⭐ 乾淨度: 尚無評分';
    const convenienceScoreText =
      toilet.avgConvenienceScore && toilet.avgConvenienceScore > 0
        ? `⭐ 便利度: ${toilet.avgConvenienceScore.toFixed(1)} / 5`
        : '⭐ 便利度: 尚無評分';

    const bodyContents: messagingApi.FlexComponent[] = [
      // 綜合評分區塊
      {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        contents: [
          {
            type: 'text',
            text: `${cleanScoreText} | ${convenienceScoreText}`,
            size: 'xs',
            color: '#F39C12',
            weight: 'bold',
          },
          {
            type: 'text',
            text: `總評論數: ${toilet.reviewCount || 0} 則`,
            size: 'xs',
            color: '#888888',
          },
        ],
      },
      {
        type: 'separator',
        margin: 'md',
      },
    ];

    if (!reviews || reviews.length === 0) {
      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        contents: [
          {
            type: 'text',
            text: '目前尚無任何評論，歡迎成為第一位留下評論的使用者！🚻',
            wrap: true,
            size: 'sm',
            color: '#666666',
          },
        ],
      });
    } else {
      // 顯示最新最多 3 則評論
      const displayReviews = reviews.slice(0, 3);
      displayReviews.forEach((review, index) => {
        const author = review.authorName || '路過公廁大師';
        const dateStr = review.createdAt
          ? new Date(review.createdAt).toISOString().split('T')[0]
          : '';

        let paperStatus = '';
        if (review.hasToiletPaper === true) {
          paperStatus = ' • 🧻 有衛生紙';
        } else if (review.hasToiletPaper === false) {
          paperStatus = ' • ❌ 無衛生紙';
        }

        const scoreSummary = `⭐ 乾淨度: ${review.cleanScore ?? '-'} / 5 | 便利度: ${review.convenienceScore ?? '-'}${paperStatus}`;

        bodyContents.push({
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          margin: index === 0 ? 'md' : 'lg',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              contents: [
                {
                  type: 'text',
                  text: author,
                  weight: 'bold',
                  size: 'sm',
                  color: '#333333',
                  flex: 1,
                },
                ...(dateStr
                  ? [
                    {
                      type: 'text' as const,
                      text: dateStr,
                      size: 'xxs' as const,
                      color: '#999999',
                      align: 'end' as const,
                      flex: 0,
                    },
                  ]
                  : []),
              ],
            },
            {
              type: 'text',
              text: scoreSummary,
              size: 'xs',
              color: '#888888',
            },
            ...(review.comment
              ? [
                {
                  type: 'text' as const,
                  text: `「${review.comment}」`,
                  wrap: true,
                  size: 'sm' as const,
                  color: '#444444',
                },
              ]
              : []),
          ],
        });
      });
    }

    return {
      type: 'flex',
      altText: `【${toiletName}】評價列表`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          paddingBottom: 'xs',
          contents: [
            {
              type: 'text',
              text: `💬【${toiletName}】評價一覽`,
              weight: 'bold',
              size: 'md',
              wrap: true,
              color: '#111111',
            },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: bodyContents,
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              color: '#1DB446',
              action: {
                type: 'uri',
                label: '🧭 Google Maps 導航',
                uri: navigationUrl,
              },
            },
          ],
        },
      },
    };
  }
}
