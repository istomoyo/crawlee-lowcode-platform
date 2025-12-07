import { Module, Global } from '@nestjs/common';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useValue: new Redis({ host: 'localhost', port: 6379 }),
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
