import { messagingApi } from '@line/bot-sdk';

/**
 * 預設 Rich Menu 規格常數（半版緊湊型：2500 x 843）
 * 適用於手機聊天室，提供直覺的單鍵找廁所體驗，同時保留最大聊天室可讀空間
 */
export const DEFAULT_RICH_MENU_CONFIG: messagingApi.RichMenuRequest = {
  size: {
    width: 2500,
    height: 843,
  },
  selected: true,
  name: 'bathroom-genius-richmenu-compact',
  chatBarText: '🚻 找公廁 / 開啟選單',
  areas: [
    {
      bounds: {
        x: 0,
        y: 0,
        width: 2500,
        height: 843,
      },
      action: {
        type: 'message',
        text: '找廁所',
      },
    },
  ],
};

/**
 * 全版 Rich Menu 規格常數（標準全版：2500 x 1686）
 * 供需要更大版面視覺呈現時使用
 */
export const FULL_RICH_MENU_CONFIG: messagingApi.RichMenuRequest = {
  size: {
    width: 2500,
    height: 1686,
  },
  selected: true,
  name: 'bathroom-genius-richmenu-full',
  chatBarText: '🚻 找公廁 / 開啟選單',
  areas: [
    {
      bounds: {
        x: 0,
        y: 0,
        width: 2500,
        height: 1686,
      },
      action: {
        type: 'message',
        text: '找廁所',
      },
    },
  ],
};
