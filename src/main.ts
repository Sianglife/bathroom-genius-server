import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors();
  app.setGlobalPrefix('api');

  // 配置全域 ValidationPipe 驗證機制
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自動剔除未在 DTO 定義的屬性
      forbidNonWhitelisted: true, // 傳入未定義屬性時報錯 400
      transform: true, // 自動轉型（例如 query params 轉 number/boolean）
    }),
  );

  // 配置全域 Exception Filter
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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
