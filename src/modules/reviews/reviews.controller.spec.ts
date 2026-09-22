import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

describe('ReviewsController', () => {
  let controller: ReviewsController;

  const mockReviewsService = {
    create: jest.fn(),
    findByToiletId: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [
        {
          provide: ReviewsService,
          useValue: mockReviewsService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<ReviewsController>(ReviewsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call reviewsService.create', async () => {
      const dto = { cleanScore: 5, comment: 'Great' };
      mockReviewsService.create.mockResolvedValue({ _id: 'r1', ...dto });

      const res = await controller.create(
        '507f1f77bcf86cd799439011',
        dto,
        'user123',
      );
      expect(res).toBeDefined();
      expect(mockReviewsService.create).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        dto,
        'user123',
      );
    });
  });

  describe('findByToiletId', () => {
    it('should call reviewsService.findByToiletId', async () => {
      const query = { page: 1, limit: 10 };
      mockReviewsService.findByToiletId.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      });

      const res = await controller.findByToiletId(
        '507f1f77bcf86cd799439011',
        query,
      );
      expect(res).toBeDefined();
      expect(mockReviewsService.findByToiletId).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        query,
      );
    });
  });

  describe('update', () => {
    it('should call reviewsService.update', async () => {
      const dto = { comment: 'Updated' };
      mockReviewsService.update.mockResolvedValue({ _id: 'r1', ...dto });

      const res = await controller.update('507f1f77bcf86cd799439011', dto);
      expect(res).toBeDefined();
      expect(mockReviewsService.update).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        dto,
      );
    });
  });

  describe('remove', () => {
    it('should call reviewsService.remove', async () => {
      mockReviewsService.remove.mockResolvedValue({
        message: 'Review deleted successfully',
      });

      const res = await controller.remove('507f1f77bcf86cd799439011');
      expect(res).toEqual({ message: 'Review deleted successfully' });
      expect(mockReviewsService.remove).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
      );
    });
  });
});
