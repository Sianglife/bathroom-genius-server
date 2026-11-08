import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Toilet, ToiletDocument } from './schemas/toilet.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';
import { CreateToiletDto } from './dto/create-toilet.dto';
import { UpdateToiletDto } from './dto/update-toilet.dto';
import { QueryToiletDto } from './dto/query-toilet.dto';
import { NearbyToiletDto } from './dto/nearby-toilet.dto';

@Injectable()
export class ToiletsService {
  constructor(
    @InjectModel(Toilet.name)
    private readonly toiletModel: Model<ToiletDocument>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
  ) {}

  async create(
    createToiletDto: CreateToiletDto,
    createdBy?: string,
  ): Promise<Toilet> {
    const createdToilet = new this.toiletModel({
      ...createToiletDto,
      avgCleanScore: 0,
      avgConvenienceScore: 0,
      reviewCount: 0,
      createdBy,
    });
    return createdToilet.save();
  }

  async findAll(queryDto: QueryToiletDto): Promise<{
    data: Toilet[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      search,
      minCleanScore,
      minConvenienceScore,
      hasToiletPaper,
      isAccessible,
      tags,
      page = 1,
      limit = 10,
    } = queryDto;

    const filter: any = {};
    const andConditions: any[] = [];

    if (search) {
      const searchRegex = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      andConditions.push({
        $or: [
          { name: searchRegex },
          { address: searchRegex },
          { landmark: searchRegex },
          { note: searchRegex },
        ],
      });
    }

    // 評分為 0 / 無評分 (reviewCount === 0) 的廁所避開分數篩選，確保剛建立之廁所仍可被搜尋
    if (minCleanScore !== undefined) {
      andConditions.push({
        $or: [
          { avgCleanScore: { $gte: minCleanScore } },
          { avgCleanScore: 0 },
          { reviewCount: 0 },
        ],
      });
    }

    if (minConvenienceScore !== undefined) {
      andConditions.push({
        $or: [
          { avgConvenienceScore: { $gte: minConvenienceScore } },
          { avgConvenienceScore: 0 },
          { reviewCount: 0 },
        ],
      });
    }

    if (hasToiletPaper !== undefined) {
      filter.hasToiletPaper = hasToiletPaper;
    }

    if (isAccessible !== undefined) {
      filter.isAccessible = isAccessible;
    }

    if (tags && tags.length > 0) {
      filter.tags = { $in: tags };
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip))
      throw new BadRequestException('Page is too large');

    const [data, total] = await Promise.all([
      this.toiletModel
        .find(filter)
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.toiletModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  async findNearby(
    nearbyDto: NearbyToiletDto,
  ): Promise<{
    data: Toilet[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const {
      lat,
      lng,
      radius = 1000,
      minCleanScore,
      minConvenienceScore,
      search,
      hasToiletPaper,
      isAccessible,
      tags,
      limit = 10,
      page = 1,
    } = nearbyDto;

    const matchQuery: any = {};
    const andConditions: any[] = [];

    if (search) {
      const pattern = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      andConditions.push({
        $or: [
          { name: pattern },
          { address: pattern },
          { landmark: pattern },
          { note: pattern },
        ],
      });
    }

    // 評分為 0 / 無評分 (reviewCount === 0) 之廁所避開分數過濾條件
    if (minCleanScore !== undefined) {
      andConditions.push({
        $or: [
          { avgCleanScore: { $gte: minCleanScore } },
          { avgCleanScore: 0 },
          { reviewCount: 0 },
        ],
      });
    }

    if (minConvenienceScore !== undefined) {
      andConditions.push({
        $or: [
          { avgConvenienceScore: { $gte: minConvenienceScore } },
          { avgConvenienceScore: 0 },
          { reviewCount: 0 },
        ],
      });
    }

    if (hasToiletPaper !== undefined) {
      matchQuery.hasToiletPaper = hasToiletPaper;
    }

    if (isAccessible !== undefined) {
      matchQuery.isAccessible = isAccessible;
    }

    if (tags && tags.length > 0) {
      const tagsArray = Array.isArray(tags) ? tags : [tags];
      matchQuery.tags = { $in: tagsArray };
    }

    if (andConditions.length > 0) {
      matchQuery.$and = andConditions;
    }

    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip))
      throw new BadRequestException('Page is too large');
    const pipeline: any[] = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'distance',
          maxDistance: radius,
          spherical: true,
          query: matchQuery,
          key: 'location',
        },
      },
      { $sort: { distance: 1, _id: 1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'value' }],
        },
      },
    ];

    const [result] = await this.toiletModel
      .aggregate<{ data: Toilet[]; total: { value: number }[] }>(pipeline)
      .exec();
    const total = result?.total[0]?.value || 0;
    return {
      data: result?.data || [],
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  async findOne(id: string): Promise<Toilet> {
    const toilet = await this.toiletModel.findById(id).exec();
    if (!toilet) {
      throw new NotFoundException(`Toilet with ID '${id}' not found`);
    }
    return toilet;
  }

  async update(id: string, updateToiletDto: UpdateToiletDto): Promise<Toilet> {
    const updated = await this.toiletModel
      .findByIdAndUpdate(id, updateToiletDto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Toilet with ID '${id}' not found`);
    }
    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleted = await this.toiletModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Toilet with ID '${id}' not found`);
    }
    // 連帶刪除該廁所關聯的所有評論
    await this.reviewModel
      .deleteMany({ toiletId: new Types.ObjectId(id) })
      .exec();

    return { message: 'Toilet deleted successfully' };
  }
}
