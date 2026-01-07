# 实施指南 - 快速优化步骤

## 第一步：配置管理优化（使用 @nestjs/config）

### 1. 安装依赖
```bash
cd backend/crawler
npm install @nestjs/config
```

### 2. 创建配置模块
创建 `src/config/configuration.ts`:
```typescript
export default () => ({
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'crawlee_lowcode',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: parseInt(process.env.JWT_EXPIRES_IN, 10) || 86400,
  },
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  cors: {
    origins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  },
});
```

### 3. 更新 app.module.ts
```typescript
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
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
    // ... 其他模块
  ],
})
```

### 4. 更新 Redis 模块
```typescript
// redis/redis.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
```

---

## 第二步：添加 API 速率限制

### 1. 安装依赖
```bash
npm install @nestjs/throttler
```

### 2. 更新 app.module.ts
```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: parseInt(process.env.THROTTLE_TTL, 10) || 60,
      limit: parseInt(process.env.THROTTLE_LIMIT, 10) || 100,
    }),
    // ... 其他模块
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
```

### 3. 在控制器中使用
```typescript
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  @Throttle(5, 60) // 5次/分钟
  @Post('login')
  async login() {
    // ...
  }
}
```

---

## 第三步：添加健康检查接口

### 1. 创建健康检查控制器
创建 `src/health/health.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';
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
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 150 * 1024 * 1024),
      async () => {
        try {
          await this.redis.ping();
          return { redis: { status: 'up' } };
        } catch (error) {
          return { redis: { status: 'down', message: error.message } };
        }
      },
    ]);
  }
}
```

### 2. 安装依赖
```bash
npm install @nestjs/terminus
```

---

## 第四步：清理敏感日志

### 更新 jwt.strategy.ts
```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {
    // 移除敏感信息日志
    // console.log('JWT_SECRET in strategy = ', process.env.JWT_SECRET);
    this.logger.log('JwtStrategy initialized');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    // 移除详细日志，只记录必要信息
    this.logger.debug(`Validating token for user: ${payload.id}`);

    const { id, loginToken } = payload;
    const latest = await this.redis.get(`user:token:${id}`);

    if (latest === null) {
      throw new UnauthorizedException('未授权，请登录');
    }

    if (latest !== loginToken) {
      throw new UnauthorizedException('你的账号已在另一设备登录');
    }

    return {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };
  }
}
```

---

## 第五步：优化 CORS 配置

### 更新 main.ts
```typescript
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // 优化 CORS 配置
  app.enableCors({
    origin: configService.get('cors.origins'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ... 其他配置
}
```

---

## 第六步：添加 Swagger API 文档

### 1. 安装依赖
```bash
npm install @nestjs/swagger swagger-ui-express
```

### 2. 更新 main.ts
```typescript
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Swagger 配置
  const config = new DocumentBuilder()
    .setTitle('Crawlee Low-Code Platform API')
    .setDescription('基于 Crawlee 的低代码爬虫平台 API 文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // ... 其他配置
}
```

### 3. 在控制器中使用装饰器
```typescript
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('任务管理')
@Controller('task')
export class TaskController {
  @ApiOperation({ summary: '创建任务' })
  @ApiResponse({ status: 201, description: '任务创建成功' })
  @Post()
  async create() {
    // ...
  }
}
```

---

## 第七步：Docker 化

### 创建 backend/crawler/Dockerfile
```dockerfile
# 多阶段构建
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm ci

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 生产镜像
FROM node:20-alpine

WORKDIR /app

# 只复制必要的文件
COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main"]
```

### 创建 docker-compose.yml（根目录）
```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASS}
      MYSQL_DATABASE: ${DB_NAME}
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./backend/crawler
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      DB_HOST: mysql
      REDIS_HOST: redis
    depends_on:
      - mysql
      - redis
    volumes:
      - ./backend/crawler/uploads:/app/uploads
      - ./backend/crawler/storage:/app/storage

  frontend:
    build:
      context: ./fronted/Crawler
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    depends_on:
      - backend

volumes:
  mysql_data:
```

---

## 第八步：任务调度系统（使用 Bull Queue）

### 1. 安装依赖
```bash
npm install @nestjs/bull bull
npm install -D @types/bull
```

### 2. 创建任务调度模块
```typescript
// task-scheduler/task-scheduler.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TaskSchedulerService } from './task-scheduler.service';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      },
    }),
    BullModule.registerQueue({
      name: 'task-queue',
    }),
  ],
  providers: [TaskSchedulerService],
  exports: [TaskSchedulerService],
})
export class TaskSchedulerModule {}
```

---

## 优先级实施顺序

1. **立即实施**（安全相关）
   - ✅ 配置管理优化
   - ✅ CORS 配置优化
   - ✅ 清理敏感日志
   - ✅ API 速率限制

2. **本周完成**
   - ✅ 健康检查接口
   - ✅ Swagger API 文档
   - ✅ Docker 化

3. **本月完成**
   - ✅ 任务调度系统
   - ✅ 监控和告警
   - ✅ 日志系统优化

4. **后续优化**
   - ✅ 缓存策略优化
   - ✅ 性能优化
   - ✅ 功能增强

