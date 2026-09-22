import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LocationDto {
  @ApiProperty({
    description: 'GeoJSON 幾何類型，固定為 Point',
    example: 'Point',
    default: 'Point',
    enum: ['Point'],
  })
  @IsString()
  @IsEnum(['Point'])
  type: string = 'Point';

  /**
   * 座標數組：[lng, lat]
   * - coordinates[0]: 經度 Longitude (-180 ~ 180)
   * - coordinates[1]: 緯度 Latitude (-90 ~ 90)
   */
  @ApiProperty({
    description: '座標數組 [經度 lng, 緯度 lat]',
    example: [121.5354, 25.033],
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  coordinates: number[];
}

export class OpenInfoDto {
  @ApiPropertyOptional({
    description: '開放類型描述 (例如 24H、配合商場開放)',
    example: '24H',
  })
  @IsOptional()
  @IsString()
  openType?: string;

  @ApiPropertyOptional({
    description: '營業/開放時間字串 (例如 08:00 - 22:00)',
    example: '08:00 - 22:00',
  })
  @IsOptional()
  @IsString()
  hours?: string;
}

export class CreateToiletDto {
  @ApiProperty({
    description: '廁所名稱/地點說明',
    example: '大安森林公園 1 號公廁',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: '詳細地址或位置指引',
    example: '台北市大安區新生南路二段1號 (近信義路出口)',
  })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({
    description: 'GeoJSON 空間地理位置',
    type: () => LocationDto,
  })
  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @ApiPropertyOptional({
    description: '所在地標名稱',
    example: '大安森林公園',
  })
  @IsOptional()
  @IsString()
  landmark?: string;

  @ApiPropertyOptional({
    description: 'Google Map 地圖連結',
    example: 'https://maps.google.com/?q=25.033,121.5354',
  })
  @IsOptional()
  @IsString()
  googleMapUrl?: string;

  @ApiPropertyOptional({
    description: '開放時間資訊',
    type: () => OpenInfoDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OpenInfoDto)
  openInfo?: OpenInfoDto;

  /**
   * 是否提供衛生紙 (三態：true / false / null 未知)
   */
  @ApiPropertyOptional({
    description: '是否提供衛生紙 (true: 有, false: 無, null: 未知)',
    example: true,
    nullable: true,
  })
  @IsOptional()
  @IsBoolean()
  hasToiletPaper?: boolean | null;

  /**
   * 是否有無障礙設施 (三態：true / false / null 未知)
   */
  @ApiPropertyOptional({
    description: '是否有無障礙設施 (true: 有, false: 無, null: 未知)',
    example: true,
    nullable: true,
  })
  @IsOptional()
  @IsBoolean()
  isAccessible?: boolean | null;

  @ApiPropertyOptional({
    description: '特殊標籤 (例如 24h, 親子, 感應式, 無障礙)',
    example: ['24h', '親子', '無障礙'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: '備註說明',
    example: '靠近兒童遊戲區，設施乾淨定期清掃',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
