import * as fs from 'fs';
import * as path from 'path';
import { messagingApi } from '@line/bot-sdk';
import { DEFAULT_RICH_MENU_CONFIG } from '../src/modules/linebot/constants/richmenu.constant';
import { generateRichMenuImage } from './generate-richmenu-image';

/**
 * 簡易載入 .env 檔案輔助函式
 */
function loadEnv(): void {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex !== -1) {
        const key = trimmed.slice(0, equalsIndex).trim();
        const value = trimmed.slice(equalsIndex + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

async function main() {
  loadEnv();

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const args = process.argv.slice(2);
  const command = args[0] || 'create';

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (
    !channelAccessToken ||
    channelAccessToken === 'your_channel_access_token'
  ) {
    console.error(
      '❌ 錯誤：未在 backend/.env 中檢測到有效的 LINE_CHANNEL_ACCESS_TOKEN。',
    );
    console.error(
      '請先於 backend/.env 設定您的 LINE Channel Access Token 後再執行此腳本。',
    );
    console.error(
      '或者，您可以透過 LINE Official Account Manager 後台手動建立圖文選單。\n',
    );
    printHelp();
    process.exit(1);
  }

  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  const blobClient = new messagingApi.MessagingApiBlobClient({
    channelAccessToken,
  });

  const imagePath = path.resolve(__dirname, '../assets/richmenu/richmenu.png');

  switch (command) {
    case 'create': {
      console.log('🚀 開始建立「廁所達人」Rich Menu 圖文選單...');

      // 1. 若圖檔不存在，自動生成
      if (!fs.existsSync(imagePath)) {
        console.log('🖼️ 找不到 Rich Menu 圖檔，正在自動產生 2500x843 圖片...');
        generateRichMenuImage(imagePath);
      }

      // 2. 建立 Rich Menu
      console.log('1️⃣ 正在向 LINE Messaging API 註冊 Rich Menu 結構...');
      const createRes = await client.createRichMenu(DEFAULT_RICH_MENU_CONFIG);
      const richMenuId = createRes.richMenuId;
      console.log(`✅ Rich Menu 建立成功！ID: ${richMenuId}`);

      // 3. 上傳圖片
      console.log(`2️⃣ 正在上傳圖片至 Rich Menu (${imagePath})...`);
      const imageBuffer = fs.readFileSync(imagePath);
      const imageBlob = new Blob([imageBuffer], { type: 'image/png' });
      await blobClient.setRichMenuImage(richMenuId, imageBlob);
      console.log('✅ 圖片上傳成功！');

      // 4. 設定為所有使用者的預設選單
      console.log('3️⃣ 正在將此 Rich Menu 設定為全體用戶預設選單 (Default)...');
      await client.setDefaultRichMenu(richMenuId);
      console.log(
        '🎉 設定成功！全體使用者開啟官方帳號聊天室時，即可看到「找廁所」圖文選單！\n',
      );
      console.log(`📌 Rich Menu ID: ${richMenuId}`);
      break;
    }

    case 'list': {
      console.log('📋 正在查詢當前 Channel 下的所有 Rich Menu 清單...');
      const listRes = await client.getRichMenuList();
      const richMenus = listRes.richmenus || [];

      let defaultId: string | null = null;
      try {
        const defRes = await client.getDefaultRichMenuId();
        defaultId = defRes.richMenuId;
      } catch {
        defaultId = null;
      }

      if (richMenus.length === 0) {
        console.log('ℹ️ 目前尚無任何 Rich Menu。');
        return;
      }

      console.log(`\n共找到 ${richMenus.length} 個 Rich Menu：\n`);
      richMenus.forEach((menu, idx) => {
        const isDefault =
          menu.richMenuId === defaultId ? ' 🌟 (目前預設 Default)' : '';
        console.log(`[${idx + 1}] ID: ${menu.richMenuId}${isDefault}`);
        console.log(`    名稱: ${menu.name}`);
        console.log(`    底部列文字: ${menu.chatBarText}`);
        console.log(`    尺寸: ${menu.size?.width} x ${menu.size?.height}`);
        console.log(`    按鈕區域數: ${menu.areas?.length || 0}`);
        console.log('----------------------------------------------------');
      });
      break;
    }

    case 'delete': {
      const targetId = args[1];
      if (!targetId) {
        console.error(
          '❌ 請指定要刪除的 Rich Menu ID。例如: pnpm run linebot:richmenu delete richmenu-xxxx',
        );
        process.exit(1);
      }
      console.log(`🗑️ 正在刪除 Rich Menu (ID: ${targetId})...`);
      await client.deleteRichMenu(targetId);
      console.log(`✅ Rich Menu (${targetId}) 已成功刪除！`);
      break;
    }

    case 'set-default': {
      const targetId = args[1];
      if (!targetId) {
        console.error(
          '❌ 請指定要設為預設的 Rich Menu ID。例如: pnpm run linebot:richmenu set-default richmenu-xxxx',
        );
        process.exit(1);
      }
      console.log(`🌟 正在設定 Rich Menu (${targetId}) 為預設選單...`);
      await client.setDefaultRichMenu(targetId);
      console.log(`✅ Rich Menu (${targetId}) 已成功設為預設圖文選單！`);
      break;
    }

    case 'clear': {
      console.log('⚠️ 正在清空當前 Channel 下的所有 Rich Menu...');
      const listRes = await client.getRichMenuList();
      const richMenus = listRes.richmenus || [];
      if (richMenus.length === 0) {
        console.log('ℹ️ 目前尚無任何 Rich Menu，無須清理。');
        return;
      }
      for (const menu of richMenus) {
        await client.deleteRichMenu(menu.richMenuId);
        console.log(`🗑️ 已刪除: ${menu.richMenuId} (${menu.name})`);
      }
      console.log('✅ 已清空所有 Rich Menu！');
      break;
    }

    default: {
      console.error(`❌ 未知的指令: "${command}"\n`);
      printHelp();
      process.exit(1);
    }
  }
}

function printHelp() {
  console.log(`
廁所達人 LINE Bot - Rich Menu 圖文選單管理工具

使用方式:
  pnpm run linebot:richmenu [指令] [參數]

可用指令:
  create           建立 Rich Menu、上傳圖片並設為全體預設選單 (預設動作)
  list             列出當前 Channel 所有的 Rich Menu 與預設狀態
  set-default <id> 將指定 ID 的 Rich Menu 設為預設選單
  delete <id>      刪除指定 ID 的 Rich Menu
  clear            刪除當前 Channel 下的所有 Rich Menu
  help             顯示本使用說明
`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ 執行失敗:', err.message || err);
    if (err.response?.data) {
      console.error(
        'API 詳細回應:',
        JSON.stringify(err.response.data, null, 2),
      );
    }
    process.exit(1);
  });
}
