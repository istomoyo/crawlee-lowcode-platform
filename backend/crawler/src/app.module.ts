import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
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

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root', // 改成你的用户名
      password: '', // 改成你的密码
      database: 'crawlee_lowcode',
      autoLoadEntities: true, // 自动加载实体
      synchronize: true, // 自动生成表（开发用）
    }),
    UserModule,
    TaskModule,
    ExecutionModule,
    ResultModule,
    RedisModule,
    AuthModule,
    MulterModule.register({
      storage: diskStorage({
        destination: join(__dirname, '..', 'upload'),
        filename: (req, file, cb) => {
          const filename = `${Date.now()}-${file.originalname}`;
          cb(null, filename);
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
