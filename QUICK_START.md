# 快速开始指南

## 🚀 启动项目

### 1. 配置环境变量

在 `backend/crawler` 目录下创建 `.env` 文件：

```bash
cd backend/crawler
# 复制示例配置（如果存在）
# 或参考 ENV_SETUP.md 创建
```

**最小配置**：
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=your_password
DB_NAME=crawlee_lowcode
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-secret-key-change-this
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173
```

### 2. 安装依赖（如果还没安装）

```bash
cd backend/crawler
npm install
```

### 3. 启动后端服务

```bash
npm run start:dev
```

### 4. 验证优化

#### 检查健康状态
```bash
curl http://localhost:3000/health
```

#### 查看 API 文档
打开浏览器访问：`http://localhost:3000/api`

#### 测试速率限制
快速连续请求登录接口，应该会收到 429 错误：
```bash
# 连续请求 6 次（超过 5 次限制）
for i in {1..6}; do curl -X POST http://localhost:3000/user/login -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"test123"}'; done
```

## 📚 新增功能说明

### 1. 健康检查接口

- **GET /health** - 完整健康检查（数据库、Redis、内存）
- **GET /health/ready** - 就绪检查（Kubernetes/Docker 使用）
- **GET /health/live** - 存活检查（Kubernetes/Docker 使用）

### 2. Swagger API 文档

访问 `http://localhost:3000/api` 查看完整的 API 文档，支持：
- 在线测试接口
- Bearer Token 认证
- Cookie 认证

### 3. 速率限制

- **全局限制**: 100 次/60 秒
- **登录接口**: 5 次/15 分钟
- **注册接口**: 3 次/10 分钟
- **验证码接口**: 5 次/分钟

超过限制会返回 `429 Too Many Requests` 错误。

### 4. 配置管理

所有配置通过环境变量管理，不再硬编码：
- 数据库配置
- Redis 配置
- JWT 配置
- CORS 配置
- 速率限制配置

## ⚠️ 常见问题

### 1. 启动失败：找不到环境变量

**解决**：确保在 `backend/crawler` 目录下创建了 `.env` 文件。

### 2. 429 错误（速率限制）

**解决**：这是正常的保护机制。如果开发时需要频繁测试，可以：
- 临时增加 `THROTTLE_LIMIT` 值
- 或等待限制时间窗口过期

### 3. CORS 错误

**解决**：检查 `.env` 文件中的 `ALLOWED_ORIGINS` 配置，确保包含前端地址。

### 4. 健康检查失败

**解决**：
- 确保 MySQL 和 Redis 服务正在运行
- 检查 `.env` 中的数据库和 Redis 配置

## 🔧 开发建议

1. **使用 Swagger 文档**：开发时多使用 Swagger UI 测试接口
2. **监控健康状态**：定期检查 `/health` 接口
3. **配置管理**：所有配置都通过环境变量，不要硬编码
4. **日志查看**：使用 NestJS Logger，避免使用 console.log

## 📖 更多文档

- `OPTIMIZATION_SUMMARY.md` - 优化总结
- `OPTIMIZATION_RECOMMENDATIONS.md` - 详细优化建议
- `IMPLEMENTATION_GUIDE.md` - 实施指南
- `ENV_SETUP.md` - 环境变量配置说明

