# 环境变量配置说明

## 创建 .env 文件

在 `backend/crawler` 目录下创建 `.env` 文件，参考以下配置：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=your_password
DB_NAME=crawlee_lowcode

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT 配置
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=86400

# 服务器配置
PORT=3000
NODE_ENV=development

# CORS 配置（生产环境请修改为具体域名，多个域名用逗号分隔）
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# 速率限制配置
THROTTLE_TTL=60
THROTTLE_LIMIT=100

# 文件上传配置
MAX_FILE_SIZE=10485760
UPLOAD_DEST=./uploads

# 爬虫配置
CRAWLER_MAX_CONCURRENCY=5
CRAWLER_MAX_REQUESTS_PER_CRAWL=100
CRAWLER_HEADLESS=true

# 日志配置（可选）
LOG_LEVEL=debug
```

## 重要提示

1. **JWT_SECRET**: 生产环境必须修改为强密码，建议使用随机生成的字符串
2. **DB_PASS**: 修改为你的数据库密码
3. **ALLOWED_ORIGINS**: 生产环境必须设置为实际的前端域名
4. **NODE_ENV**: 生产环境设置为 `production`

## 配置说明

- `THROTTLE_TTL`: 速率限制的时间窗口（秒）
- `THROTTLE_LIMIT`: 时间窗口内的最大请求数
- `CRAWLER_MAX_CONCURRENCY`: 爬虫最大并发数
- `CRAWLER_HEADLESS`: 是否使用无头模式（true/false）

