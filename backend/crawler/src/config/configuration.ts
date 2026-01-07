/**
 * 应用配置
 * 从环境变量读取配置，提供默认值
 */
export default () => ({
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'crawlee_lowcode',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN ? parseInt(process.env.JWT_EXPIRES_IN, 10) : 86400,
  },
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  cors: {
    origins: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:5173',
      'http://localhost:3000',
    ],
  },
  throttle: {
    ttl: process.env.THROTTLE_TTL ? parseInt(process.env.THROTTLE_TTL, 10) : 60,
    limit: process.env.THROTTLE_LIMIT ? parseInt(process.env.THROTTLE_LIMIT, 10) : 100,
  },
  upload: {
    maxFileSize: process.env.MAX_FILE_SIZE ? parseInt(process.env.MAX_FILE_SIZE, 10) : 10485760, // 10MB
    destination: process.env.UPLOAD_DEST || './uploads',
  },
  crawler: {
    maxConcurrency: process.env.CRAWLER_MAX_CONCURRENCY ? parseInt(process.env.CRAWLER_MAX_CONCURRENCY, 10) : 5,
    maxRequestsPerCrawl: process.env.CRAWLER_MAX_REQUESTS_PER_CRAWL ? parseInt(process.env.CRAWLER_MAX_REQUESTS_PER_CRAWL, 10) : 100,
    headless: process.env.CRAWLER_HEADLESS !== 'false',
  },
});

