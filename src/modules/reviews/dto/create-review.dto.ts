import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidationOptions,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 自訂 Class 級別驗證器：確認「評分 (cleanScore / convenienceScore)」或「評語 (comment)」至少有填寫其中一項
 */
export function RequireScoreOrComment(validationOptions?: ValidationOptions) {
  return function (target: any) {
    registerDecorator({
      name: 'requireScoreOrComment',
      target: target,
      propertyName: '',
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          const dto = args.object as CreateReviewDto;
          const hasCleanScore =
            dto.cleanScore !== undefined && dto.cleanScore !== null;
          const hasConvenienceScore =
            dto.convenienceScore !== undefined && dto.convenienceScore !== null;
          const hasComment =
            typeof dto.comment === 'string' && dto.comment.trim().length > 0;

          return hasCleanScore || hasConvenienceScore || hasComment;
        },
        defaultMessage() {
          return "At least one of 'cleanScore', 'convenienceScore', or 'comment' must be provided.";
        },
      },
    });
  };
}

@RequireScoreOrComment()
export class CreateReviewDto {
  @ApiPropertyOptional({
    description: '乾淨度評分 (1~5，與評語至少二擇一填寫)',
    example: 4,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  cleanScore?: number;

  @ApiPropertyOptional({
    description: '便利度評分 (1~5，與評語至少二擇一填寫)',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  convenienceScore?: number;

  @ApiPropertyOptional({
    description: '現場衛生紙狀態回報 (true: 有衛生紙, false: 無衛生紙)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  hasToiletPaper?: boolean;

  @ApiPropertyOptional({
    description: '單一文本評論內容 (與評分至少二擇一填寫)',
    example: '環境維護得很乾淨，而且有附洗手乳與衛生紙！',
  })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({
    description: '評論者暱稱 (選填，預設為「訪客」或「路過公廁大師」)',
    example: '公廁鑑賞家',
  })
  @IsOptional()
  @IsString()
  authorName?: string;
}
