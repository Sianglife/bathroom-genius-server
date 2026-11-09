import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { Review } from './schemas/review.schema';
import { Toilet } from '../toilets/schemas/toilet.schema';

describe('ReviewsService', () => {
  let service: ReviewsService;
  const actor = {
    id: '507f1f77bcf86cd799439033',
    displayName: 'Author',
    role: 'user' as const,
  };

  const mockReviewInstance = function (dto: any) {
    this.data = dto;
    this.save = jest
      .fn()
      .mockResolvedValue({ _id: '507f1f77bcf86cd799439022', ...dto });
  };

  const mockReviewModel: any = mockReviewInstance;
  mockReviewModel.findOne = jest.fn();
  mockReviewModel.find = jest.fn();
  mockReviewModel.findById = jest.fn();
  mockReviewModel.findByIdAndUpdate = jest.fn();
  mockReviewModel.findByIdAndDelete = jest.fn();
  mockReviewModel.findOneAndUpdate = jest.fn();
  mockReviewModel.findOneAndDelete = jest.fn();
  mockReviewModel.exists = jest.fn();
  mockReviewModel.countDocuments = jest.fn();
  mockReviewModel.deleteMany = jest.fn();
  mockReviewModel.aggregate = jest.fn();

  const mockToiletModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: getModelToken(Review.name),
          useValue: mockReviewModel,
        },
        {
          provide: getModelToken(Toilet.name),
          useValue: mockToiletModel,
        },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a review and trigger score update if toilet exists', async () => {
      mockToiletModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' }),
      });
      mockToiletModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });
      mockReviewModel.aggregate.mockResolvedValue([
        {
          _id: '507f1f77bcf86cd799439011',
          reviewCount: 1,
          avgCleanScore: 4.5,
          avgConvenienceScore: 4.0,
        },
      ]);

      const res = await service.create('507f1f77bcf86cd799439011', {
        cleanScore: 5,
        convenienceScore: 4,
        comment: 'Very clean',
      });

      expect(res).toBeDefined();
      expect(mockToiletModel.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should throw NotFoundException if toilet does not exist', async () => {
      mockToiletModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.create('507f1f77bcf86cd799439011', { comment: 'Nice' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if score and comment are both missing', async () => {
      await expect(
        service.create('507f1f77bcf86cd799439011', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findByToiletId', () => {
    it('should return paginated review list if toilet exists', async () => {
      mockToiletModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' }),
      });
      mockReviewModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([{ comment: 'Good' }]),
            }),
          }),
        }),
      });
      mockReviewModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const res = await service.findByToiletId('507f1f77bcf86cd799439011', {
        page: 1,
        limit: 10,
      });
      expect(res.data).toHaveLength(1);
      expect(res.total).toBe(1);
    });
  });

  describe('update', () => {
    it('should update review and recalculate toilet scores', async () => {
      const mockUpdatedReview = {
        _id: '507f1f77bcf86cd799439022',
        toiletId: { toString: () => '507f1f77bcf86cd799439011' },
        comment: 'Updated',
      };
      mockReviewModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValue({
            revision: 0,
            toObject: () => ({ comment: 'Original' }),
          }),
      });
      mockReviewModel.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockUpdatedReview),
      });
      mockReviewModel.aggregate.mockResolvedValue([]);
      mockToiletModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      const res = await service.update(
        '507f1f77bcf86cd799439022',
        {
          comment: 'Updated',
        },
        actor,
      );
      expect(res).toEqual({
        ...mockUpdatedReview,
        hasToiletPaper: null,
        canEdit: false,
      });
    });

    it('should throw NotFoundException if review not found', async () => {
      mockReviewModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValue({
            revision: 0,
            toObject: () => ({ comment: 'Original' }),
          }),
      });
      mockReviewModel.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });
      mockReviewModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });
      mockReviewModel.exists.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.update(
          '507f1f77bcf86cd799439022',
          { comment: 'Updated' },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete review and update toilet scores', async () => {
      const mockDeletedReview = {
        _id: '507f1f77bcf86cd799439022',
        toiletId: { toString: () => '507f1f77bcf86cd799439011' },
      };
      mockReviewModel.findOneAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDeletedReview),
      });
      mockReviewModel.aggregate.mockResolvedValue([]);
      mockToiletModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      const res = await service.remove('507f1f77bcf86cd799439022', actor);
      expect(res).toEqual({ message: 'Review deleted successfully' });
    });
  });
});
