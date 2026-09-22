import { Test, TestingModule } from '@nestjs/testing';
import { ToiletsController } from './toilets.controller';
import { ToiletsService } from './toilets.service';
import { ConfigService } from '@nestjs/config';

describe('ToiletsController', () => {
  let controller: ToiletsController;

  const mockToiletsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findNearby: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ToiletsController],
      providers: [
        {
          provide: ToiletsService,
          useValue: mockToiletsService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<ToiletsController>(ToiletsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call toiletsService.create', async () => {
      const dto = {
        name: 'Public Toilet',
        address: 'Main St',
        location: { type: 'Point', coordinates: [121.5, 25.0] },
      };
      mockToiletsService.create.mockResolvedValue({ id: '1', ...dto });

      const res = await controller.create(dto, 'user1');
      expect(res).toBeDefined();
      expect(mockToiletsService.create).toHaveBeenCalledWith(dto, 'user1');
    });
  });

  describe('findAll', () => {
    it('should call toiletsService.findAll', async () => {
      const query = { page: 1, limit: 10 };
      mockToiletsService.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      });

      const res = await controller.findAll(query);
      expect(res).toBeDefined();
      expect(mockToiletsService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findNearby', () => {
    it('should call toiletsService.findNearby', async () => {
      const query = { lat: 25.0, lng: 121.5 };
      mockToiletsService.findNearby.mockResolvedValue([]);

      const res = await controller.findNearby(query);
      expect(res).toBeDefined();
      expect(mockToiletsService.findNearby).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('should call toiletsService.findOne', async () => {
      mockToiletsService.findOne.mockResolvedValue({ id: '123' });

      const res = await controller.findOne('123');
      expect(res).toEqual({ id: '123' });
      expect(mockToiletsService.findOne).toHaveBeenCalledWith('123');
    });
  });

  describe('update', () => {
    it('should call toiletsService.update', async () => {
      const updateDto = { name: 'New Name' };
      mockToiletsService.update.mockResolvedValue({ id: '123', ...updateDto });

      const res = await controller.update('123', updateDto);
      expect(res).toEqual({ id: '123', ...updateDto });
      expect(mockToiletsService.update).toHaveBeenCalledWith('123', updateDto);
    });
  });

  describe('remove', () => {
    it('should call toiletsService.remove', async () => {
      mockToiletsService.remove.mockResolvedValue({ message: 'Deleted' });

      const res = await controller.remove('123');
      expect(res).toEqual({ message: 'Deleted' });
      expect(mockToiletsService.remove).toHaveBeenCalledWith('123');
    });
  });
});
