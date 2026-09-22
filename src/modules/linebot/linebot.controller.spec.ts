import { Test, TestingModule } from '@nestjs/testing';
import { LinebotController } from './linebot.controller';
import { LinebotService } from './services/linebot.service';
import { LineSignatureGuard } from './guards/line-signature.guard';
import { ConfigService } from '@nestjs/config';
import { webhook } from '@line/bot-sdk';

describe('LinebotController', () => {
  let controller: LinebotController;
  let linebotService: LinebotService;

  const mockLinebotService = {
    handleEvents: jest.fn().mockResolvedValue(undefined),
  };

  const mockLineSignatureGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinebotController],
      providers: [
        {
          provide: LinebotService,
          useValue: mockLinebotService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock-secret'),
          },
        },
      ],
    })
      .overrideGuard(LineSignatureGuard)
      .useValue(mockLineSignatureGuard)
      .compile();

    controller = module.get<LinebotController>(LinebotController);
    linebotService = module.get<LinebotService>(LinebotService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle webhook events and return OK', async () => {
    const events = [
      {
        type: 'message',
        replyToken: 'test-token',
      } as webhook.Event,
    ];

    const result = await controller.handleWebhook({ events });

    expect(linebotService.handleEvents).toHaveBeenCalledWith(events);
    expect(result).toBe('OK');
  });

  it('should handle empty events array gracefully and return OK', async () => {
    const result = await controller.handleWebhook({ events: [] });

    expect(linebotService.handleEvents).not.toHaveBeenCalled();
    expect(result).toBe('OK');
  });
});
