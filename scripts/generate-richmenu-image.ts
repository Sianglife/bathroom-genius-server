import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

/**
 * 簡易無依賴 PNG 編碼器 (支援 Node.js 原生 zlib)
 */
function createPngBuffer(
  width: number,
  height: number,
  pixelCallback: (x: number, y: number) => [number, number, number, number],
): Buffer {
  // 每行: 1 byte filter type (0) + width * 4 bytes (RGBA)
  const rowStride = 1 + width * 4;
  const rawData = Buffer.alloc(rowStride * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelCallback(x, y);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  // Deflate compressed IDAT
  const compressedData = zlib.deflateSync(rawData, { level: 9 });

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression method
  ihdrData[11] = 0; // Filter method
  ihdrData[12] = 0; // Interlace method
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT Chunk
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = data.length;
  const chunk = Buffer.alloc(8 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crcTarget = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcValue = calculateCrc32(crcTarget);
  chunk.writeUInt32BE(crcValue, 8 + length);
  return chunk;
}

// CRC32 計算器
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

function calculateCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 繪製高質感 Rich Menu 圖檔 (2500 x 843)
 */
export function generateRichMenuImage(outputPath: string): void {
  const width = 2500;
  const height = 843;

  const buffer = createPngBuffer(width, height, (x, y) => {
    // 1. 背景現代漸層：深海藍綠 (#042F2E) 到 活潑碧藍 (#0284C7)
    const tX = x / width;
    const tY = y / height;
    const t = 0.6 * tX + 0.4 * tY;

    // 起始色: RGB(6, 78, 59) #064E3B (深翡翠綠)
    // 結束色: RGB(14, 116, 144) #0E7490 (青藍色)
    let r = Math.round(6 + t * (14 - 6));
    let g = Math.round(78 + t * (116 - 78));
    let b = Math.round(59 + t * (144 - 59));

    // 2. 中間卡片按鈕區域 (邊界留白 x: 60..2440, y: 60..783)
    const cardX1 = 60;
    const cardX2 = width - 60;
    const cardY1 = 50;
    const cardY2 = height - 50;
    const radius = 40;

    const inCard = x >= cardX1 && x <= cardX2 && y >= cardY1 && y <= cardY2;

    if (inCard) {
      // 內層微光玻璃效果卡片
      const isCardBorder =
        x < cardX1 + 6 || x > cardX2 - 6 || y < cardY1 + 6 || y > cardY2 - 6;

      if (isCardBorder) {
        r = 56;
        g = 189;
        b = 248; // #38BDF8 亮青藍邊框
      } else {
        // 卡片內部漸層 (半透明白疊加)
        const innerT = (y - cardY1) / (cardY2 - cardY1);
        r = Math.min(255, Math.round(r * 0.75 + (innerT < 0.5 ? 40 : 20)));
        g = Math.min(255, Math.round(g * 0.75 + (innerT < 0.5 ? 90 : 60)));
        b = Math.min(255, Math.round(b * 0.75 + (innerT < 0.5 ? 120 : 80)));
      }

      // 3. 左側圓形圖示區域 (圓心: (320, 421), 半徑: 180)
      const iconCx = 320;
      const iconCy = 421;
      const distToIcon = Math.sqrt((x - iconCx) ** 2 + (y - iconCy) ** 2);
      if (distToIcon <= 180) {
        if (distToIcon >= 170) {
          // 圓形邊框光暈
          r = 255;
          g = 255;
          b = 255;
        } else {
          // 圓形內部亮青色
          const circleT = distToIcon / 170;
          r = Math.round(16 + circleT * 10);
          g = Math.round(185 + circleT * 20);
          b = Math.round(129 + circleT * 30); // 翠綠 #10B981
        }
      }

      // 4. 右側 CTA 按鈕區域 (x: 1780..2360, y: 260..580)
      const btnX1 = 1780;
      const btnX2 = 2360;
      const btnY1 = 260;
      const btnY2 = 580;
      if (x >= btnX1 && x <= btnX2 && y >= btnY1 && y <= btnY2) {
        const isBtnBorder =
          x < btnX1 + 4 || x > btnX2 - 4 || y < btnY1 + 4 || y > btnY2 - 4;
        if (isBtnBorder) {
          r = 255;
          g = 255;
          b = 255;
        } else {
          // 按鈕漸層橙黃色 #F59E0B -> #EF4444
          const btnT = (x - btnX1) / (btnX2 - btnX1);
          r = Math.round(245 + btnT * 10);
          g = Math.round(158 - btnT * 90);
          b = Math.round(11 + btnT * 57);
        }
      }
    }

    return [r, g, b, 255];
  });

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, buffer);
  console.log(
    `Rich Menu image successfully generated at: ${outputPath} (${buffer.length} bytes)`,
  );
}

// 若直接執行此檔案，生成圖片至預設路徑
if (require.main === module) {
  const defaultPath = path.resolve(
    __dirname,
    '../assets/richmenu/richmenu.png',
  );
  generateRichMenuImage(defaultPath);
}
