import {
  Injectable,
  ConflictException,
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
    user?: Principal,
  ) {
    if (typeof createReviewDto.comment === 'string')
      createReviewDto = {
        ...createReviewDto,
        comment: createReviewDto.comment.trim(),
      };
    this.validateContent(createReviewDto);

    const toilet = await this.toiletModel.findById(toiletId).exec();
    if (!toilet) {
      throw new NotFoundException(`Toilet with ID '${toiletId}' not found`);
    }

    const createdReview = new this.reviewModel({
      ...createReviewDto,
      toiletId: new Types.ObjectId(toiletId),
      authorName: user?.displayName || '路過公廁大師',
      isAnonymous: createReviewDto.isAnonymous ?? false,
      ownerId: user ? new Types.ObjectId(user.id) : undefined,
    });

    const savedReview = await createdReview.save();
    await this.updateToiletScoresAndCount(toiletId);

    return this.publicReview(savedReview, user);
  }

  async findByToiletId(
    toiletId: string,
    queryDto: QueryReviewDto,
    user?: Principal,
  ): Promise<{
    data: ReturnType<ReviewsService['publicReview']>[];
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
        .select('+ownerId')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.reviewModel.countDocuments(filter).exec(),
    ]);

    return {
      data: data.map((review) => this.publicReview(review, user)),
      total,
      page,
      limit,
    };
  }

  private validateContent(input: CreateReviewDto) {
    if (
      input.isAnonymous !== undefined &&
      typeof input.isAnonymous !== 'boolean'
    )
      throw new BadRequestException('isAnonymous must be a boolean');
    const comment =
      typeof input.comment === 'string' ? input.comment.trim() : '';
    if (comment.length > 1000)
      throw new BadRequestException('Comment must not exceed 1000 characters');
    if (
      input.cleanScore == null &&
      input.convenienceScore == null &&
      !comment
    ) {
      throw new BadRequestException(
        'At least one score or non-blank comment must be provided',
      );
    }
  }

  private publicReview(review: ReviewDocument, user?: Principal) {
    // Read ownership before serialization removes private fields.
    const canEdit =
      !!user &&
      (user.role === 'admin' ||
        (!!review.ownerId && String(review.ownerId) === user.id));
    const value =
      typeof review.toObject === 'function' ? review.toObject() : review;
    return {
      _id: value._id,
      toiletId: value.toiletId,
      cleanScore: value.cleanScore,
      convenienceScore: value.convenienceScore,
      hasToiletPaper: value.hasToiletPaper ?? null,
      comment: value.comment,
      authorName: value.isAnonymous === true ? '匿名使用者' : value.authorName,
      isAnonymous: value.isAnonymous,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      canEdit,
    };
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

  async update(id: string, updateReviewDto: UpdateReviewDto, user: Principal) {
    const filter = this.ownershipFilter(id, user);
    const current = await this.reviewModel
      .findOne(filter)
      .select('+ownerId')
      .exec();
    if (!current) return this.rejectMissingOrForbidden(id);
    const patch = { ...updateReviewDto };
    if (typeof patch.comment === 'string') patch.comment = patch.comment.trim();
    this.validateContent({ ...current.toObject(), ...patch });
    // Compare-and-swap prevents concurrent valid patches from leaving an empty review.
    const updatedReview = await this.reviewModel
      .findOneAndUpdate(
        {
          ...filter,
          $or: current.revision
            ? [{ revision: current.revision }]
            : [{ revision: 0 }, { revision: { $exists: false } }],
        },
        { $set: patch, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .select('+ownerId')
      .exec();
    if (!updatedReview)
      throw new ConflictException('Review changed; reload before retrying');

    await this.updateToiletScoresAndCount(updatedReview.toiletId.toString());

    return this.publicReview(updatedReview, user);
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
