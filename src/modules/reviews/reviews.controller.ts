import {
  Controller,
  Header,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { PublicReviewDto, PublicReviewPageDto } from './dto/public-review.dto';
import { QueryReviewDto } from './dto/query-review.dto';
import {
  CsrfGuard,
  SessionAuthGuard,
  OptionalSessionAuthGuard,
} from '../auth/guards/session-auth.guard';
import type { Principal } from '../auth/auth.utils';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('toilets/:id/reviews')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @ApiCookieAuth('session')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({
    summary: '為指定廁所新增評論',
    description:
      '新增評論後自動重新計算關聯廁所的平均乾淨度、平均便利度得分與總評論數',
  })
  @ApiParam({ name: 'id', description: 'Toilet Mongo ObjectID', type: String })
  @ApiResponse({
    status: 201,
    description: '成功建立評論並連動更新評分',
    type: PublicReviewDto,
  })
  @ApiResponse({
    status: 400,
    description: '請求格式錯誤或未符合評分/評語二擇一規則',
  })
  @ApiResponse({ status: 404, description: '找不到指定的廁所' })
  create(
    @Param('id', ParseObjectIdPipe) toiletId: string,
    @Body() createReviewDto: CreateReviewDto,
    @CurrentUser() user: Principal,
  ) {
    return this.reviewsService.create(toiletId, createReviewDto, user);
  }

  @Get('toilets/:id/reviews')
  @UseGuards(OptionalSessionAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  @ApiOperation({
    summary: '查詢特定廁所的所有評論列表',
    description: '依據 Toilet ID 查詢評論列表，依建立時間降冪排序，支援分頁',
  })
  @ApiParam({ name: 'id', description: 'Toilet Mongo ObjectID', type: String })
  @ApiResponse({
    status: 200,
    description: '成功取得評論列表',
    type: PublicReviewPageDto,
  })
  @ApiResponse({ status: 400, description: '無效的 ObjectID 或查詢參數格式' })
  @ApiResponse({ status: 404, description: '找不到指定的廁所' })
  findByToiletId(
    @Param('id', ParseObjectIdPipe) toiletId: string,
    @Query() queryDto: QueryReviewDto,
    @CurrentUser() user?: Principal,
  ) {
    return this.reviewsService.findByToiletId(toiletId, queryDto, user);
  }

  @Patch('reviews/:id')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @ApiCookieAuth('session')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({
    summary: '修改特定評論',
    description: '更新評論內容或評分，並自動重新計算關聯廁所的平均評分',
  })
  @ApiParam({ name: 'id', description: 'Review Mongo ObjectID', type: String })
  @ApiResponse({
    status: 200,
    description: '成功更新評論並重新計算平均得分',
    type: PublicReviewDto,
  })
  @ApiResponse({ status: 400, description: '請求格式或欄位驗證錯誤' })
  @ApiResponse({ status: 404, description: '找不到指定的評論' })
  @ApiResponse({
    status: 409,
    description: '評論已被其他請求修改，請重新讀取後再試',
  })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateReviewDto: UpdateReviewDto,
    @CurrentUser() user: Principal,
  ) {
    return this.reviewsService.update(id, updateReviewDto, user);
  }

  @Delete('reviews/:id')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @ApiCookieAuth('session')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({
    summary: '刪除特定評論',
    description: '刪除指定評論，並自動重新計算關聯廁所的平均得分與總評論數',
  })
  @ApiParam({ name: 'id', description: 'Review Mongo ObjectID', type: String })
  @ApiResponse({ status: 200, description: '成功刪除評論並更新平均得分' })
  @ApiResponse({ status: 400, description: '無效的 ObjectID 格式' })
  @ApiResponse({ status: 404, description: '找不到指定的評論' })
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    return this.reviewsService.remove(id, user);
  }
}
