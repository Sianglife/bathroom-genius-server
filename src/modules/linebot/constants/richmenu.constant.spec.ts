import {
  DEFAULT_RICH_MENU_CONFIG,
  FULL_RICH_MENU_CONFIG,
} from './richmenu.constant';

describe('Rich Menu Constants', () => {
  describe('DEFAULT_RICH_MENU_CONFIG', () => {
    it('should have valid dimensions for LINE Rich Menu specifications', () => {
      expect(DEFAULT_RICH_MENU_CONFIG.size).toBeDefined();
      const { width, height } = DEFAULT_RICH_MENU_CONFIG.size!;

      expect(width).toBe(2500);
      expect(height).toBe(843);
      expect(width).toBeGreaterThanOrEqual(800);
      expect(width).toBeLessThanOrEqual(2500);
      expect(height).toBeGreaterThanOrEqual(250);
      expect(height).toBeLessThanOrEqual(1686);

      const aspectRatio = width! / height!;
      expect(aspectRatio).toBeGreaterThanOrEqual(1.45);
    });

    it('should have chatBarText with length <= 14 characters', () => {
      expect(DEFAULT_RICH_MENU_CONFIG.chatBarText).toBeDefined();
      expect(DEFAULT_RICH_MENU_CONFIG.chatBarText!.length).toBeLessThanOrEqual(
        14,
      );
      expect(DEFAULT_RICH_MENU_CONFIG.chatBarText).toContain('找公廁');
    });

    it('should have selected set to true by default', () => {
      expect(DEFAULT_RICH_MENU_CONFIG.selected).toBe(true);
    });

    it('should have valid action areas matching size bounds', () => {
      expect(DEFAULT_RICH_MENU_CONFIG.areas).toBeDefined();
      expect(DEFAULT_RICH_MENU_CONFIG.areas!.length).toBe(1);

      const area = DEFAULT_RICH_MENU_CONFIG.areas![0];
      expect(area.bounds).toEqual({
        x: 0,
        y: 0,
        width: 2500,
        height: 843,
      });

      expect(area.action).toEqual({
        type: 'message',
        text: '找廁所',
      });
    });
  });

  describe('FULL_RICH_MENU_CONFIG', () => {
    it('should have valid full-size dimensions', () => {
      expect(FULL_RICH_MENU_CONFIG.size).toBeDefined();
      const { width, height } = FULL_RICH_MENU_CONFIG.size!;

      expect(width).toBe(2500);
      expect(height).toBe(1686);
      expect(width).toBeGreaterThanOrEqual(800);
      expect(width).toBeLessThanOrEqual(2500);
      expect(height).toBeGreaterThanOrEqual(250);
      expect(height).toBeLessThanOrEqual(1686);

      const aspectRatio = width! / height!;
      expect(aspectRatio).toBeGreaterThanOrEqual(1.45);
    });

    it('should cover the entire 2500x1686 area with "找廁所" action', () => {
      expect(FULL_RICH_MENU_CONFIG.areas).toBeDefined();
      expect(FULL_RICH_MENU_CONFIG.areas![0].bounds).toEqual({
        x: 0,
        y: 0,
        width: 2500,
        height: 1686,
      });
      expect(FULL_RICH_MENU_CONFIG.areas![0].action).toEqual({
        type: 'message',
        text: '找廁所',
      });
    });
  });

  describe('Rich Menu Image Asset', () => {
    it('should have a valid richmenu.png file in assets directory with correct size and dimensions', () => {
      const fs = require('fs');
      const path = require('path');
      const imagePath = path.resolve(
        __dirname,
        '../../../../assets/richmenu/richmenu.png',
      );

      expect(fs.existsSync(imagePath)).toBe(true);

      const stats = fs.statSync(imagePath);
      // 檔案大小必須小於 1MB (1,048,576 bytes)
      expect(stats.size).toBeLessThan(1024 * 1024);
      expect(stats.size).toBeGreaterThan(0);

      const buffer = fs.readFileSync(imagePath);
      // PNG Signature check: 0x89, 0x50, 0x4E, 0x47
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);

      // Read width and height from IHDR chunk (offset 16 and 20)
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);

      expect(width).toBe(2500);
      expect(height).toBe(843);
    });
  });
});
