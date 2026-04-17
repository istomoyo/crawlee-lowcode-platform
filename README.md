# Crawlee Low-Code Platform

基于 `NestJS + TypeORM + MySQL + Redis + Crawlee + Playwright` 的低代码爬虫平台。
前端使用 `Vue 3 + Vite + Pinia + Element Plus + Tailwind CSS`。

当前仓库只保留项目根目录这一份 `README.md` 作为统一说明入口。
本文按 `2026-04-09` 的代码状态整理。

## 项目目标

这个项目的目标不是让用户手写爬虫脚本，而是通过可视化方式完成：

- 任务创建与编辑
- 列表结构识别
- 字段映射
- 结果预览与执行
- 结果筛选、下载与打包
- 平台公告与通用配置
- 管理后台运维

## 当前已实现的核心能力

### 1. 账户与权限

- 用户注册、登录、JWT 鉴权、会话校验
- 普通用户 / 管理员角色区分
- 用户资料维护、头像上传、密码修改
- 前端路由守卫与登录态初始化

### 2. 任务配置与执行

- 五步式任务配置流程
  - 基本信息
  - 页面结构选择
  - 字段映射
  - 执行参数配置
  - JSON 预览与执行
- 当前任务向导统一为 `XPath` 采集模式
- 前端向导按结构选择、字段树、运行参数与 JSON 预览组织，不再保留浏览器行为流分支
- 简单模式支持页面截图拾取元素并回填列表根 XPath
- 支持文本、链接、图片、分页、滚动、详情页、嵌套列表
- 支持 `text` / `html` / `markdown` / `smart` 内容格式
- 支持页面前置动作 `preActions`
- 支持 Cookie、并发、超时、重试等执行参数
- 任务列表支持继续编辑、复制配置、快速执行、删除

### 3. 详情页多结果与下载打包

- 详情页子字段在单个 XPath 命中多个结果时，结果 JSON 会输出为数组
- 打包下载模块可衔接数组型链接字段
- 支持打包结果为 ZIP
- 支持下载策略
  - `direct`
  - `browser`
  - `auto`
- 支持“先进入详情页，再触发下载”的页面化下载流程

### 4. 结果筛选与通知

- 字段级条件筛选
  - 判空
  - 相等 / 不等
  - 包含 / 不包含
  - 数值比较
- 支持自定义筛选函数 `functionCode`
- 支持任务成功 / 失败邮件通知
- 支持通知中附带部分结果预览

### 5. 任务模板

本轮新增：

- 后端新增任务模板实体与接口
- 支持把已有任务保存为模板
- 支持模板列表、模板详情、模板编辑、模板删除
- 支持模板分类、分类筛选与分类复用
- 前端任务列表新增“模板中心”
- 支持将模板重新载入到任务向导中继续编辑
- 任务编辑已接入配置回灌，不再只是占位按钮
- 兼容历史上带 `config` 外壳的旧配置结构

### 6. 平台通用能力

- 平台公告配置与前台公告横幅
- 系统名称 / 简介统一对外展示
- 响应式基础布局与登录页视觉优化
- 任务列表与后台页面的界面风格统一

### 7. 管理后台

已可用页面：

- 用户管理
- 任务监控
- 系统日志
- 系统设置

当前能力包括：

- 用户查询、创建、编辑、删除、启用、禁用
- 任务运行状态查看、最近执行记录查看、停止任务
- 系统日志筛选、清空、前端导出
- 系统设置维护
  - 基础信息
  - 公告配置
  - 爬虫默认参数
  - 存储清理策略
  - 安全设置
  - 邮件参数

### 8. 操作日志与审计

本轮增强：

- 任务模板的创建、更新、删除会写入统一系统日志
- 管理后台日志页新增按模块筛选
- 可直接筛选 `task-template` 模块追踪模板操作

## 技术栈

### 后端

- NestJS 11
- TypeORM
- MySQL
- Redis
- Crawlee
- Playwright
- Swagger
- Terminus

### 前端

- Vue 3
- Vite
- TypeScript
- Pinia
- Vue Router
- Element Plus
- Tailwind CSS
- ECharts

## 目录结构

```text
.
├─ backend/
│  └─ crawler/
│     ├─ src/
│     │  ├─ admin/
│     │  ├─ auth/
│     │  ├─ execution/
│     │  ├─ health/
│     │  ├─ mail/
│     │  ├─ result/
│     │  ├─ task/
│     │  └─ user/
│     └─ package.json
├─ fronted/
│  └─ Crawler/
│     ├─ src/
│     │  ├─ api/
│     │  ├─ components/
│     │  ├─ layouts/
│     │  ├─ router/
│     │  ├─ stores/
│     │  └─ views/
│     └─ package.json
└─ README.md
```

## 本地运行

### 环境准备

- Node.js 20+
- MySQL
- Redis

### 启动后端

```bash
cd backend/crawler
npm install
npm run start:dev
```

常用命令：

```bash
npm run build
npm test
```

### 启动前端

```bash
cd fronted/Crawler
npm install
npm run dev
```

常用命令：

```bash
npm run build
```

### 默认访问地址

- 前端开发地址：`http://localhost:5173`
- 后端 Swagger：`http://localhost:3000/api`
- 后端健康检查：`http://localhost:3000/health`

## 最小环境变量

请在 `backend/crawler` 目录下创建 `.env`，至少包含：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=your_password
DB_NAME=crawlee_lowcode

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=86400

PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173

THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

可选常用项：

```env
MAX_FILE_SIZE=10485760
UPLOAD_DEST=./uploads
CRAWLER_MAX_CONCURRENCY=5
CRAWLER_MAX_REQUESTS_PER_CRAWL=100
CRAWLER_HEADLESS=true
LOG_LEVEL=debug
```

## 最近一次已验证通过

以下命令已在当前工作区通过：

```bash
cd backend/crawler
npm test -- task-template.service.spec.ts --runInBand
npm run build

cd ../../fronted/Crawler
npm run build
npm run test:smoke
```

## 当前仍建议继续优化的方向

### 高优先级

1. 继续清理存量乱码、历史注释噪音与文案不一致问题。
2. 为任务模板、任务执行、打包下载补更多自动化测试。
3. 继续收缩历史兼容逻辑与冗余代码。

### 中优先级

1. 给模板增加共享范围、团队模板或公共模板能力。
2. 把日志导出升级为后端文件导出。
3. 进一步优化前端大包体积，尤其是 `element-plus` 与 `echarts`。

### 低优先级

1. 统一部分目录与命名历史遗留，例如 `fronted` 拼写。
2. 补充部署文档、运维文档与管理员使用手册。

## 当前结论

项目已经不是原型空壳，而是具备真实任务配置、执行、结果处理、下载打包、公告展示和后台管理能力的可运行系统。

当前最值得继续投入的方向，不再是“有没有功能”，而是：

- 提升代码可维护性
- 提升测试覆盖率
- 继续清理历史遗留
- 在稳定基础上继续扩展平台通用能力

## 2026-04 Frontend Notes

- Frontend smoke tests are available in `fronted/Crawler` via `npm run test:smoke`.
- Before running smoke tests:
  - start the backend at `http://127.0.0.1:3000`
  - start the frontend at `http://127.0.0.1:5173` or set `SMOKE_BASE_URL`
  - copy `fronted/Crawler/.env.smoke.example` into your local shell environment
  - provide `SMOKE_USER_EMAIL` and `SMOKE_USER_PASSWORD`
- Current smoke coverage includes:
  - Cookie credential center create, update, preview match, and delete flow
  - task builder auto-suggest and one-click apply for saved Cookie credentials by domain
- The sidebar now exposes a single task creation entry point:
  - XPath oriented task creation
- For simple list extraction, the top-level result count should follow the first-level list item count. Nested detail-page collections should stay attached to each parent item as array properties in the JSON result, and child arrays are not truncated by the top-level `maxItems` setting unless a nested limit is configured explicitly.
- Backend regression coverage for this result-shape rule is available in `backend/crawler/src/task/crawlee-engine.service.spec.ts`.
- User registration still requires email verification. The current flow is:
  - request captcha
  - send email code
  - submit `/api/user/register` with the verification code
