import {
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LineLoginDto {
  @ApiProperty({
    description:
      'LIFF ID token，後端向 LINE 驗證；不可傳入自行解碼的使用者資料',
  })
  @IsString()
  @Length(1, 10000)
  idToken: string;
}

export class LineStartDto {
  @ApiPropertyOptional({ example: '/me/reviews' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  returnTo?: string;
}

export class LineCallbackDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  state: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  error?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error_description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  friendship_status_changed?: string;
}
