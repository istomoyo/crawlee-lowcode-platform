# Crawlee Low-Code Crawler

基于 Crawlee 的低代码爬虫平台
前端：Vue3 + Element Plus + TailwindCSS + Axios
后端：Nest.js + TypeORM + MySQL
全栈均使用 TypeScript

## ✨ 项目特点

-   低代码爬虫创建与管理
-   前后端分离架构
-   支持任务调度、日志、爬取结果保存
-   Nest.js 模块化 API
-   Vue3 + Element Plus UI 管理后台
-   Crawlee 驱动爬虫内核
-   可扩展到分布式爬虫

## 📦 技术栈

### 前端（frontend）

-   Vue 3 + Vite
-   TypeScript
-   Element Plus
-   TailwindCSS
-   Axios
-   Pinia

### 后端（backend）

-   Nest.js
-   TypeORM
-   MySQL
-   Crawlee
-   Node.js + TypeScript

## 📂 项目结构建议

    project-root  
    ├── frontend/  
    │   ├── src/  
    │   ├── vite.config.ts  
    │   └── package.json  
    │  
    ├── backend/  
    │   ├── src/  
    │   ├── tsconfig.json  
    │   └── package.json  
    │  
    ├── docs/  
    │   └── api.md  
    │
    └── README.md

## 🚀 本地运行

### 前端运行

``` bash
cd frontend
npm install
npm dev
```

### 后端运行

``` bash
cd backend
npm install
npm run start:dev
```

## ⚙️ 环境变量

在 backend 中创建 `.env`：

    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=root
    DB_PASS=123456
    DB_NAME=crawler

## 🕷 Crawlee 示例任务

``` ts
import { PlaywrightCrawler } from "crawlee";

const crawler = new PlaywrightCrawler({
    async requestHandler({ page, request, log }) {
        log.info(`Visiting: ${request.url()}`);
        const title = await page.title();
        console.log("Page title:", title);
    },
});

await crawler.run(["https://example.com"]);
```

## 📜 LICENSE

MIT
