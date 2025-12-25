# Crawlee 任务执行接口使用说明

## 接口说明

新增的 `/task/execute` 接口支持基于 Crawlee 框架执行爬虫任务，通过任务配置 JSON 来控制爬虫行为。

## 请求格式

```typescript
POST /task/execute
{
  "taskId": "1",           // 任务ID，必填
  "config": {              // 任务配置，可选（如果不传则使用任务默认配置）
    "crawlerType": "playwright",  // 爬虫类型: playwright | cheerio | puppeteer
    "urls": ["https://example.com"], // 要爬取的URL列表
    "maxRequestsPerCrawl": 10,     // 最大请求数
    "maxConcurrency": 5,           // 最大并发数
    "headless": true,              // 是否无头模式
    "viewport": {                  // 视口大小
      "width": 1920,
      "height": 1080
    },
    "selectors": [                 // 数据提取选择器
      {
        "name": "title",           // 选择器名称
        "selector": "h1",          // CSS/XPath选择器
        "type": "text",            // 提取类型: text | html | attribute | count
        "attribute": "href",       // 当type为attribute时，指定属性名
        "multiple": false,         // 是否提取多个元素
        "required": true           // 是否必需
      }
    ]
  },
  "overrideConfig": {      // 覆盖配置，可选
    // 部分覆盖上述配置
  }
}
```

## 配置参数详解

### 基础配置
- `crawlerType`: 爬虫类型
  - `playwright`: 功能完整的浏览器，支持JavaScript渲染
  - `cheerio`: 轻量级HTML解析器，不支持JavaScript
  - `puppeteer`: 类似playwright，但使用puppeteer引擎
- `urls`: 要爬取的URL数组
- `maxRequestsPerCrawl`: 最大请求数限制
- `maxConcurrency`: 最大并发请求数

### 浏览器配置（Playwright/Puppeteer）
- `headless`: 是否无头模式
- `viewport`: 浏览器视口大小
- `userAgent`: 自定义User-Agent
- `proxyUrl`: 代理服务器URL

### 等待和超时配置
- `waitForSelector`: 等待特定选择器出现
- `waitForTimeout`: 等待超时时间（毫秒）
- `navigationTimeout`: 页面导航超时时间（毫秒）

### 滚动配置（处理懒加载）
- `scrollEnabled`: 是否启用滚动
- `scrollDistance`: 每次滚动距离
- `scrollDelay`: 滚动间隔时间
- `maxScrollDistance`: 最大滚动距离

### 数据提取配置
- `selectors`: 选择器配置数组
  - `name`: 字段名称
  - `selector`: CSS选择器或XPath表达式
  - `type`: 提取类型
    - `text`: 提取文本内容
    - `html`: 提取HTML内容
    - `attribute`: 提取属性值
    - `count`: 统计元素数量
  - `attribute`: 属性名（type为attribute时使用）
  - `multiple`: 是否提取多个值
  - `required`: 是否为必需字段

### 存储配置
- `datasetId`: Crawlee Dataset ID（可选）
- `keyValueStoreId`: Key-Value Store ID（可选）

## 响应格式

```typescript
{
  "executionId": 123,        // 执行记录ID
  "status": "success",       // 执行状态
  "result": {
    "processedRequests": 5,  // 处理的请求数
    "itemsCount": 5,         // 提取的数据条数
    "datasetId": "dataset_123", // 数据集ID
    "keyValueStoreId": "kv_123", // 键值存储ID
    "stats": {
      "requestsFinished": 5,
      "requestsFailed": 0,
      "retryHistogram": []
    }
  }
}
```

## 使用示例

### 基本网页数据提取
```json
{
  "taskId": "1",
  "config": {
    "crawlerType": "playwright",
    "urls": ["https://news.example.com"],
    "selectors": [
      {
        "name": "title",
        "selector": "h1.article-title",
        "type": "text",
        "required": true
      },
      {
        "name": "content",
        "selector": ".article-content",
        "type": "html"
      },
      {
        "name": "links",
        "selector": ".article-content a",
        "type": "attribute",
        "attribute": "href",
        "multiple": true
      }
    ]
  }
}
```

### 列表页面数据提取
```json
{
  "taskId": "2",
  "config": {
    "crawlerType": "playwright",
    "urls": ["https://products.example.com"],
    "scrollEnabled": true,
    "scrollDistance": 1000,
    "scrollDelay": 1000,
    "maxScrollDistance": 5000,
    "selectors": [
      {
        "name": "products",
        "selector": ".product-item",
        "type": "count"
      },
      {
        "name": "productNames",
        "selector": ".product-item .name",
        "type": "text",
        "multiple": true
      },
      {
        "name": "productPrices",
        "selector": ".product-item .price",
        "type": "text",
        "multiple": true
      }
    ]
  }
}
```

### 轻量级HTML解析
```json
{
  "taskId": "3",
  "config": {
    "crawlerType": "cheerio",
    "urls": ["https://static.example.com"],
    "selectors": [
      {
        "name": "headings",
        "selector": "h1, h2, h3",
        "type": "text",
        "multiple": true
      }
    ]
  }
}
```

## 错误处理

接口会返回详细的错误信息，包括：
- 任务不存在
- 配置解析失败
- 爬虫执行失败
- 数据提取失败（针对必需字段）

执行状态会记录在数据库中，可以通过执行ID查询详细日志。
