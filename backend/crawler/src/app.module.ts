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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
