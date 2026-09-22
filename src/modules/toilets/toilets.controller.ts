import {
  Controller,
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
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ToiletsService } from './toilets.service';
import { CreateToiletDto } from './dto/create-toilet.dto';
import { UpdateToiletDto } from './dto/update-toilet.dto';
import { QueryToiletDto } from './dto/query-toilet.dto';
import { NearbyToiletDto } from './dto/nearby-toilet.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Toilets')
@ApiBearerAuth('bearer')
@Controller('toilets')
export class ToiletsController {
  constructor(private readonly toiletsService: ToiletsService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: '新增廁所資訊',
    description: '建立新廁所，支援匿名或登入使用者（預留 Token 認證）',
  })
  @ApiResponse({ status: 201, description: '成功建立廁所資訊' })
  @ApiResponse({ status: 400, description: '請求格式或欄位驗證錯誤' })
  create(
    @Body() createToiletDto: CreateToiletDto,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.toiletsService.create(createToiletDto, userId);
  }

  @Get()
  @ApiOperation({
    summary: '查詢廁所列表',
    description: '支援關鍵字搜尋、偏好條件篩選與分頁',
  })
  @ApiResponse({ status: 200, description: '成功取得廁所列表與分頁資訊' })
  @ApiResponse({ status: 400, description: '查詢參數格式錯誤' })
  findAll(@Query() queryToiletDto: QueryToiletDto) {
    return this.toiletsService.findAll(queryToiletDto);
  }

  @Get('nearby')
  @ApiOperation({
    summary: '依據經緯度推薦附近廁所',
    description: '依據經緯度座標與指定半徑推薦附近廁所，支援偏好條件篩選',
  })
  @ApiResponse({ status: 200, description: '成功取得附近廁所推薦列表' })
  @ApiResponse({ status: 400, description: '經緯度或篩選參數錯誤' })
  findNearby(@Query() nearbyToiletDto: NearbyToiletDto) {
    return this.toiletsService.findNearby(nearbyToiletDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: '取得單一廁所詳細資料',
    description: '依據 Toilet ID 查詢廁所詳細資料及評分統計',
  })
  @ApiParam({ name: 'id', description: 'Toilet Mongo ObjectID', type: String })
  @ApiResponse({ status: 200, description: '成功取得廁所詳細資訊' })
  @ApiResponse({ status: 400, description: '無效的 ObjectID 格式' })
  @ApiResponse({ status: 404, description: '找不到指定的廁所' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.toiletsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: '修改廁所資訊',
    description: '更新指定廁所的基礎資料或設備狀態',
  })
  @ApiParam({ name: 'id', description: 'Toilet Mongo ObjectID', type: String })
  @ApiResponse({ status: 200, description: '成功更新廁所資訊' })
  @ApiResponse({ status: 400, description: '請求格式或欄位驗證錯誤' })
  @ApiResponse({ status: 404, description: '找不到指定的廁所' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateToiletDto: UpdateToiletDto,
  ) {
    return this.toiletsService.update(id, updateToiletDto);
  }

  @Delete(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: '刪除廁所資訊',
    description: '刪除指定廁所及其關聯之所有評論資料',
  })
  @ApiParam({ name: 'id', description: 'Toilet Mongo ObjectID', type: String })
  @ApiResponse({ status: 200, description: '成功刪除廁所' })
  @ApiResponse({ status: 400, description: '無效的 ObjectID 格式' })
  @ApiResponse({ status: 404, description: '找不到指定的廁所' })
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.toiletsService.remove(id);
  }
}
