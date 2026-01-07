/**
 * 健康检查控制器示例
 * 
 * 使用步骤：
 * 1. npm install @nestjs/terminus
 * 2. 创建 health.module.ts 并导入此控制器
 * 3. 在 app.module.ts 中导入 HealthModule
 * 
 * 访问：GET /health
 */

import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // 数据库健康检查
      () => this.db.pingCheck('database'),
      
      // 内存健康检查
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024), // 150MB
      () => this.memory.checkRSS('memory_rss', 150 * 1024 * 1024), // 150MB
      
      // Redis 健康检查
      async () => {
        try {
          const result = await this.redis.ping();
          return {
            redis: {
              status: result === 'PONG' ? 'up' : 'down',
            },
          };
        } catch (error) {
          return {
            redis: {
              status: 'down',
              message: error.message,
            },
          };
        }
      },
    ]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    // 就绪检查：确保所有关键服务可用
    return this.health.check([
      () => this.db.pingCheck('database'),
      async () => {
        try {
          await this.redis.ping();
          return { redis: { status: 'up' } };
        } catch (error) {
          throw new Error(`Redis is not ready: ${error.message}`);
        }
      },
    ]);
  }

  @Get('live')
  liveness() {
    // 存活检查：服务是否在运行
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}

