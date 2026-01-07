import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { TaskModule } from './task/task.module';
import { ExecutionModule } from './execution/execution.module';
import { ResultModule } from './result/result.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { ServeStaticModule } from '@nestjs/serve-static';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import configuration from './config/configuration';

@Module({
  imports: [
    // 配置模块 - 必须最先导入
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    // 数据库配置
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        autoLoadEntities: true,
        synchronize: configService.get('server.nodeEnv') === 'development',
        dropSchema: false,
        extra: {
          connectionLimit: 10,
        },
      }),
      inject: [ConfigService],
    }),
    // 速率限制
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.get<number>('throttle.ttl') || 60,
            limit: configService.get<number>('throttle.limit') || 100,
          },
        ],
      }),
      inject: [ConfigService],
    }),
    UserModule,
    TaskModule,
    ExecutionModule,
    ResultModule,
    RedisModule,
    AuthModule,
    AdminModule,
    HealthModule,
    MulterModule.register({
      storage: diskStorage({
        destination: join(__dirname, '..', 'upload'),
        filename: (req, file, cb) => {
          const filename = `${Date.now()}-${file.originalname}`;
          cb(null, filename);
        },
      }),
    }),
    // 新增：静态目录，用于访问截图
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'screenshots'), // 截图根目录
      serveRoot: '/screenshots', // 前端访问前缀
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
