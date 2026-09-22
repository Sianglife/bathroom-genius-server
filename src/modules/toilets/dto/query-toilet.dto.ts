import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryToiletDto {
  @ApiPropertyOptional({
    description: '關鍵字搜尋（比對名稱、地址、地標）',
    example: '公園',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: '最低平均乾淨度得分篩選 (1~5)',
    example: 3,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minCleanScore?: number;

  @ApiPropertyOptional({
    description: '最低平均便利度得分篩選 (1~5)',
    example: 3,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minConvenienceScore?: number;

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

  @ApiPropertyOptional({
    description: '分頁頁數 (預設 1)',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: '每頁筆數 (預設 10，最大 100)',
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
