import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthConfig } from './modules/auth/auth.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const authConfig = app.get(AuthConfig);
  app.enableCors({ origin: authConfig.origin, credentials: true });
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
    .addCookieAuth(
      authConfig.cookieName,
      {
        type: 'apiKey',
        in: 'cookie',
        description: '登入 session；寫入另須 Origin 與 X-CSRF-Token',
      },
      'session',
    )
    .addTag('Auth', 'LINE 登入、session 與 CSRF')
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
