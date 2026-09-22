import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NearbyToiletDto {
  /**
   * 緯度 Latitude (-90 ~ 90)
   */
  @ApiProperty({
    description: '緯度 Latitude (-90 ~ 90)',
    example: 25.033,
    minimum: -90,
    maximum: 90,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  /**
   * 經度 Longitude (-180 ~ 180)
   */
  @ApiProperty({
    description: '經度 Longitude (-180 ~ 180)',
    example: 121.5354,
    minimum: -180,
    maximum: 180,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  /**
   * 搜尋半徑 (單位: 公尺，預設 1000m，最大 10000m)
   */
  @ApiPropertyOptional({
    description: '搜尋半徑 (單位: 公尺，預設 1000m，最大 10000m)',
    example: 1000,
    default: 1000,
    minimum: 1,
    maximum: 10000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10000)
  radius?: number = 1000;

  /**
   * 最低乾淨評分 (1~5，預設 3)
   */
  @ApiPropertyOptional({
    description: '最低平均乾淨度得分篩選 (1~5，預設 3)',
    example: 3,
    default: 3,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minCleanScore?: number = 3;

  /**
   * 最低便利評分 (1~5，預設 3)
   */
  @ApiPropertyOptional({
    description: '最低平均便利度得分篩選 (1~5，預設 3)',
    example: 3,
    default: 3,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minConvenienceScore?: number = 3;

  /**
   * 衛生紙條件篩選：
   * - true: 僅篩選有衛生紙的廁所
   * - false: 僅篩選無衛生紙的廁所
   * - 不傳 (undefined): 有無皆可 (不限制)
   */
  @ApiPropertyOptional({
    description:
      '是否提供衛生紙篩選 (true: 僅有衛生紙, false: 僅無衛生紙, 未提供: 不限)',
    example: true,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  hasToiletPaper?: boolean;

  /**
   * 無障礙設施條件篩選：
   * - true: 僅篩選有無障礙設施的廁所
   * - false: 僅篩選無設置無障礙設施的廁所
   * - 不傳 (undefined): 有無皆可 (不限制)
   */
  @ApiPropertyOptional({
    description:
      '是否具備無障礙設施篩選 (true: 僅有無障礙, false: 僅無設置無障礙, 未提供: 不限)',
    example: true,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isAccessible?: boolean;

  @ApiPropertyOptional({
    description: '標籤篩選 (逗號分隔字串或陣列，例如 24h,親子)',
    example: ['24h', '親子'],
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map((v) => v.trim());
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /**
   * 最多推薦回傳筆數上限 (預設 10 筆)
   */
  @ApiPropertyOptional({
    description: '最多推薦回傳筆數上限 (預設 10，最大 100)',
    example: 10,
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
