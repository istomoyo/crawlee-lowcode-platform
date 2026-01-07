import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // 启用WebSocket适配器
  app.useWebSocketAdapter(new IoAdapter(app));

  // 优化CORS配置
  app.enableCors({
    origin: configService.get('cors.origins'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 设置静态资源访问
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });

  // Swagger API 文档配置
  const config = new DocumentBuilder()
    .setTitle('Crawlee Low-Code Platform API')
    .setDescription('基于 Crawlee 的低代码爬虫平台 API 文档')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // 全局异常拦截器
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = configService.get('server.port');
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger API docs: http://localhost:${port}/api`);
}
bootstrap();
