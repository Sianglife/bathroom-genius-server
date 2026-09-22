import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

describe('Bathroom Genius API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    // 配置 Swagger OpenAPI 文件
    const config = new DocumentBuilder()
      .setTitle('廁所達人 (bathroom-genius) API')
      .setDescription('MVP 階段廁所搜尋、推薦、評分與評論後端服務 API 文件')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          in: 'header',
          description: '預留 Token 認證：請輸入 JWT Token',
        },
        'bearer',
      )
      .addTag('Health', '系統健康檢查')
      .addTag('Toilets', '廁所資料管理與附近推薦')
      .addTag('Reviews', '廁所評論與評分管理')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Check (/api/health)', () => {
    it('GET /api/health should return status ok and ISO timestamp', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('Swagger API Documentation (/docs & /docs-json)', () => {
    it('GET /docs should serve Swagger UI HTML page', async () => {
      const response = await request(app.getHttpServer())
        .get('/docs/')
        .expect(200);

      expect(response.text).toContain('Swagger UI');
      expect(response.headers['content-type']).toContain('text/html');
    });

    it('GET /docs-json should return valid OpenAPI specification with all MVP endpoints and Bearer Auth', async () => {
      const response = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);

      const spec = response.body;
      expect(spec).toHaveProperty('openapi');
      expect(spec.info.title).toBe('廁所達人 (bathroom-genius) API');
      expect(spec.info.version).toBe('1.0');

      // 驗證 Bearer Auth 安全性定義
      expect(spec.components?.securitySchemes).toHaveProperty('bearer');
      expect(spec.components.securitySchemes.bearer).toMatchObject({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      });

      // 驗證核心 API 端點皆有登錄在 OpenAPI paths
      const paths = Object.keys(spec.paths);
      expect(paths).toContain('/api/health');
      expect(paths).toContain('/api/toilets');
      expect(paths).toContain('/api/toilets/nearby');
      expect(paths).toContain('/api/toilets/{id}');
      expect(paths).toContain('/api/toilets/{id}/reviews');
      expect(paths).toContain('/api/reviews/{id}');

      // 驗證 Schemas / DTO 定義
      expect(spec.components.schemas).toHaveProperty('CreateToiletDto');
      expect(spec.components.schemas).toHaveProperty('CreateReviewDto');
    });
  });

  describe('Global Exception Filter', () => {
    it('GET /api/unknown-route should be caught by HttpExceptionFilter and return 404 formatted error', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/unknown-route')
        .expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        timestamp: expect.any(String),
        path: '/api/unknown-route',
        message: expect.any(String),
      });
    });
  });
});
