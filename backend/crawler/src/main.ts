import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser'; // ✅ 默认导入
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 启用WebSocket适配器
  app.useWebSocketAdapter(new IoAdapter(app));

  // 启用CORS
  app.enableCors({
    origin: true, // 在生产环境中应该更严格
    credentials: true,
  });

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动过滤未在 DTO 中定义的字段
      forbidNonWhitelisted: true, // 传入不存在字段会报错
      transform: true, // 自动类型转换（例如 string → number）
    }),
  );
  // 设置静态资源访问
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });

  // 全局响应拦截器
  // app.useGlobalInterceptors(new ResponseInterceptor());

  // 全局异常拦截器
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
