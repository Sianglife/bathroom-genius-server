import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicReviewDto {
  @ApiProperty() _id: string;
  @ApiProperty() toiletId: string;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 5, nullable: true })
  cleanScore?: number | null;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 5, nullable: true })
  convenienceScore?: number | null;
  @ApiProperty({ type: Boolean, nullable: true }) hasToiletPaper:
    boolean | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  comment?: string | null;
  @ApiProperty({
    description: '已驗證帳號名稱、匿名使用者，或保留的舊評論名稱',
  })
  authorName: string;
  @ApiPropertyOptional({ description: '舊評論可能無此欄位' })
  isAnonymous?: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
  @ApiProperty({
    description: '目前 session 的作者或管理員可修改；寫入仍需權限與 CSRF 驗證',
  })
  canEdit: boolean;
}

export class PublicReviewPageDto {
  @ApiProperty({ type: [PublicReviewDto] }) data: PublicReviewDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
