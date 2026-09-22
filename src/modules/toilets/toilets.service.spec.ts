import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { ToiletsService } from './toilets.service';
import { Toilet } from './schemas/toilet.schema';
import { Review } from '../reviews/schemas/review.schema';

describe('ToiletsService', () => {
  let service: ToiletsService;

  const mockToiletModel = function (dto: any) {
    this.data = dto;
    this.save = jest.fn().mockResolvedValue({ _id: 'mockId', ...dto });
  };

  mockToiletModel.find = jest.fn();
  mockToiletModel.findById = jest.fn();
  mockToiletModel.findByIdAndUpdate = jest.fn();
  mockToiletModel.findByIdAndDelete = jest.fn();
  mockToiletModel.countDocuments = jest.fn();
  mockToiletModel.aggregate = jest.fn();

  const mockReviewModel = {
    deleteMany: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToiletsService,
        {
          provide: getModelToken(Toilet.name),
          useValue: mockToiletModel,
        },
        {
          provide: getModelToken(Review.name),
          useValue: mockReviewModel,
        },
      ],
    }).compile();

    service = module.get<ToiletsService>(ToiletsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a toilet with default score 0 and createdBy if provided', async () => {
      const dto = {
        name: 'Daan Park Toilet',
        address: 'Daan Park, Taipei',
        location: { type: 'Point', coordinates: [121.5358, 25.0298] },
      };
      const result = await service.create(dto, 'user123');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('_id', 'mockId');
      expect(result).toHaveProperty('avgCleanScore', 0);
      expect(result).toHaveProperty('avgConvenienceScore', 0);
      expect(result).toHaveProperty('reviewCount', 0);
    });
  });

  describe('findAll', () => {
    it('should return paginated toilet results', async () => {
      const mockList = [{ name: 'Toilet 1' }];
      mockToiletModel.find.mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockList),
          }),
        }),
      });
      mockToiletModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const res = await service.findAll({
        search: 'Park',
        minCleanScore: 3,
        hasToiletPaper: true,
        page: 1,
        limit: 10,
      });

      expect(res.data).toEqual(mockList);
      expect(res.total).toBe(1);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(10);
    });
  });

  describe('findNearby', () => {
    it('should call aggregate with $geoNear pipeline and return results', async () => {
      const mockNearbyList = [{ name: 'Nearby Toilet', distance: 150 }];
      mockToiletModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockNearbyList),
      });

      const res = await service.findNearby({
        lat: 25.033,
        lng: 121.565,
        radius: 1000,
        minCleanScore: 3,
        minConvenienceScore: 3,
      });

      expect(res).toEqual(mockNearbyList);
      expect(mockToiletModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a toilet if found', async () => {
      const mockToilet = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Test Toilet',
      };
      mockToiletModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockToilet),
      });

      const res = await service.findOne('507f1f77bcf86cd799439011');
      expect(res).toEqual(mockToilet);
    });

    it('should throw NotFoundException if toilet not found', async () => {
      mockToiletModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne('507f1f77bcf86cd799439011')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update and return the toilet', async () => {
      const mockUpdated = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Updated Name',
      };
      mockToiletModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUpdated),
      });

      const res = await service.update('507f1f77bcf86cd799439011', {
        name: 'Updated Name',
      });
      expect(res).toEqual(mockUpdated);
    });

    it('should throw NotFoundException if update fails', async () => {
      mockToiletModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.update('507f1f77bcf86cd799439011', { name: 'Updated Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete and return success message', async () => {
      mockToiletModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' }),
      });

      const res = await service.remove('507f1f77bcf86cd799439011');
      expect(res).toEqual({ message: 'Toilet deleted successfully' });
    });

    it('should throw NotFoundException if delete fails', async () => {
      mockToiletModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.remove('507f1f77bcf86cd799439011')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
