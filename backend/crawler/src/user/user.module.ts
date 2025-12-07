  import { Module } from '@nestjs/common';
  import { UserService } from './user.service';
  import { UserController } from './user.controller';
  import { TypeOrmModule } from '@nestjs/typeorm';
  import { User } from './entities/user.entity';
  import { JwtModule } from '@nestjs/jwt';
  import Redis from 'ioredis';

  @Module({
    imports: [
      TypeOrmModule.forFeature([User]),
      JwtModule.register({
        secret: process.env.JWT_SECRET || 'your_jwt_secret',
        signOptions: { expiresIn: Number(process.env.JWT_EXPIRES_IN) || 24 * 60 * 60 },
      }),
    ],
    controllers: [UserController],
    providers: [
      UserService,
      {
        provide: 'REDIS_CLIENT',
        useValue: new Redis({ host: 'localhost', port: 6379 }),
      },
    ],
    exports: [UserService],
  })
  export class UserModule {}
