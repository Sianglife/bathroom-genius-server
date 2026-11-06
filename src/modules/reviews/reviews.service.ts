import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema';
import { Toilet, ToiletDocument } from '../toilets/schemas/toilet.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { QueryReviewDto } from './dto/query-review.dto';
import type { Principal } from '../auth/auth.utils';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Toilet.name)
    private readonly toiletModel: Model<ToiletDocument>,
  ) {}

  async create(
    toiletId: string,
    createReviewDto: CreateReviewDto,
    userId?: string,
  ): Promise<Review> {
    const hasCleanScore =
      createReviewDto.cleanScore !== undefined &&
      createReviewDto.cleanScore !== null;
    const hasConvenienceScore =
      createReviewDto.convenienceScore !== undefined &&
      createReviewDto.convenienceScore !== null;
    const hasComment =
      typeof createReviewDto.comment === 'string' &&
      createReviewDto.comment.trim().length > 0;

    if (!hasCleanScore && !hasConvenienceScore && !hasComment) {
      throw new BadRequestException(
        "At least one of 'cleanScore', 'convenienceScore', or 'comment' must be provided.",
      );
    }

    const toilet = await this.toiletModel.findById(toiletId).exec();
    if (!toilet) {
      throw new NotFoundException(`Toilet with ID '${toiletId}' not found`);
    }

    const createdReview = new this.reviewModel({
      ...createReviewDto,
      toiletId: new Types.ObjectId(toiletId),
      authorName: createReviewDto.authorName || '路過公廁大師',
      ownerId: userId ? new Types.ObjectId(userId) : undefined,
    });

    const savedReview = await createdReview.save();
    await this.updateToiletScoresAndCount(toiletId);

    return savedReview;
  }

  async findByToiletId(
    toiletId: string,
    queryDto: QueryReviewDto,
  ): Promise<{
    data: Review[];
    total: number;
    page: number;
    limit: number;
  }> {
    const toilet = await this.toiletModel.findById(toiletId).exec();
    if (!toilet) {
      throw new NotFoundException(`Toilet with ID '${toiletId}' not found`);
    }

    const { page = 1, limit = 10 } = queryDto;
    const skip = (page - 1) * limit;
    const filter = { toiletId: new Types.ObjectId(toiletId) };

    const [data, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.reviewModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  private ownershipFilter(id: string, user: Principal) {
    if (!user) throw new UnauthorizedException('Login required');
    return {
      _id: id,
      ...(user.role === 'admin'
        ? {}
        : { ownerId: new Types.ObjectId(user.id) }),
    };
  }

  private async rejectMissingOrForbidden(id: string): Promise<never> {
    if (await this.reviewModel.exists({ _id: id }).exec()) {
      throw new ForbiddenException(
        'Only the author or an administrator may change this review',
      );
    }
    throw new NotFoundException(`Review with ID '${id}' not found`);
  }

  async update(
    id: string,
    updateReviewDto: UpdateReviewDto,
    user: Principal,
  ): Promise<Review> {
    const updatedReview = await this.reviewModel
      .findOneAndUpdate(this.ownershipFilter(id, user), updateReviewDto, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!updatedReview) {
      return this.rejectMissingOrForbidden(id);
    }

    await this.updateToiletScoresAndCount(updatedReview.toiletId.toString());

    return updatedReview;
  }

  async remove(id: string, user: Principal): Promise<{ message: string }> {
    const deletedReview = await this.reviewModel
      .findOneAndDelete(this.ownershipFilter(id, user))
      .exec();

    if (!deletedReview) {
      return this.rejectMissingOrForbidden(id);
    }

    await this.updateToiletScoresAndCount(deletedReview.toiletId.toString());

    return { message: 'Review deleted successfully' };
  }

  async removeByToiletId(toiletId: string): Promise<void> {
    await this.reviewModel
      .deleteMany({ toiletId: new Types.ObjectId(toiletId) })
      .exec();
  }

  /**
   * 重新計算指定 Toilet 的平均乾淨度、平均便利度及總評論數
   */
  async updateToiletScoresAndCount(toiletId: string): Promise<void> {
    const toiletObjectId = new Types.ObjectId(toiletId);

    const stats = await this.reviewModel.aggregate([
      {
        $match: { toiletId: toiletObjectId },
      },
      {
        $group: {
          _id: '$toiletId',
          reviewCount: { $sum: 1 },
          avgCleanScore: { $avg: '$cleanScore' },
          avgConvenienceScore: { $avg: '$convenienceScore' },
        },
      },
    ]);

    let avgCleanScore = 0;
    let avgConvenienceScore = 0;
    let reviewCount = 0;

    if (stats.length > 0) {
      reviewCount = stats[0].reviewCount || 0;

      if (
        stats[0].avgCleanScore !== null &&
        stats[0].avgCleanScore !== undefined
      ) {
        avgCleanScore = Math.round(stats[0].avgCleanScore * 10) / 10;
      }

      if (
        stats[0].avgConvenienceScore !== null &&
        stats[0].avgConvenienceScore !== undefined
      ) {
        avgConvenienceScore =
          Math.round(stats[0].avgConvenienceScore * 10) / 10;
      }
    }

    await this.toiletModel
      .findByIdAndUpdate(toiletId, {
        avgCleanScore,
        avgConvenienceScore,
        reviewCount,
      })
      .exec();
  }
}
