import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let healthController: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    healthController = module.get<HealthController>(HealthController);
  });

  it('should return status ok and a valid ISO timestamp', () => {
    const res = healthController.check();
    expect(res).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    });
    expect(new Date(res.timestamp).getTime()).not.toBeNaN();
  });
});
