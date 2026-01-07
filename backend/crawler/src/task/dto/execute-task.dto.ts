import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

// Crawlee 爬虫配置接口
export interface CrawleeTaskConfig {
  // 爬虫类型
  crawlerType: 'playwright' | 'cheerio' | 'puppeteer';

  // 基础配置
  urls: string[]; // 要爬取的URL列表
  maxRequestsPerCrawl?: number; // 最大请求数
  maxConcurrency?: number; // 最大并发数

  // Playwright/Puppeteer 特有配置
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };

  // 等待和延迟配置
  waitForSelector?: string; // 等待选择器出现
  waitForTimeout?: number; // 等待超时时间
  navigationTimeout?: number; // 导航超时时间

  // 数据提取配置
  baseSelector?: string; // 基础选择器，用于定位数据项列表
  maxItems?: number; // 最大提取数据项数量

  // 滚动配置（用于懒加载）
  scrollEnabled?: boolean;
  scrollDistance?: number;
  scrollDelay?: number;
  maxScrollDistance?: number;

  // 数据提取配置
  selectors?: SelectorConfig[];

  // 请求配置
  userAgent?: string;
  proxyUrl?: string;

  // 存储配置
  datasetId?: string; // Crawlee Dataset ID
  keyValueStoreId?: string; // Key-Value Store ID

  // 输出格式配置
  outputFormat?: 'json' | 'packaged'; // 输出格式：json 或 packaged（打包压缩）
  
  // 打包模式配置（当outputFormat为packaged时使用）
  packageConfig?: {
    // 文件结构配置，支持变量：{fieldName}、{index}、{timestamp}
    // 例如："{name}/images/{imageField}.jpg" 或 "files/{index}_{title}.txt"
    structure?: {
      images?: string; // 图片文件结构，如："images/{index}_{imageField}.jpg"
      files?: string; // 文件结构（从link字段下载的文件），如："files/{index}_{linkField}"
      texts?: string; // 文本文件结构，如："texts/{index}_{textField}.txt"
      data?: string; // 数据JSON文件结构，如："data/{index}.json" 或 "data.json"（单文件）
    };
    // 下载配置
    download?: {
      images?: boolean; // 是否下载图片
      files?: boolean; // 是否下载文件（从link字段）
      texts?: boolean; // 是否将文本保存为文件
      maxFileSize?: number; // 最大文件大小（字节），默认10MB
      timeout?: number; // 下载超时时间（毫秒），默认30000
    };
  };
}

export interface SelectorConfig {
  name: string; // 选择器名称
  selector: string; // CSS/XPath选择器
  type: 'text' | 'link' | 'image'; // 提取类型：文本、链接、图像
  // 内容格式（仅对 text 类型有效）
  // text: 纯文本（默认）
  // html: 原始 HTML
  // markdown: 使用 Turndown 将 HTML 转为 Markdown
  // smart: 预留智能提取模式（暂时等同于 markdown 处理）
  contentFormat?: 'text' | 'html' | 'markdown' | 'smart';
  parentLink?: string; // 父链接URL，用于链接子节点，表示该选择器应在此链接页面上执行
}

export class ExecuteTaskDto {
  @IsOptional()
  @IsString()
  taskId?: string; // 任务ID，可选，不传则创建新任务

  @IsOptional()
  @IsString()
  taskName?: string; // 任务名称，用于创建新任务

  @IsOptional()
  @IsUrl()
  url?: string; // URL，用于创建新任务

  @IsOptional()
  @IsObject()
  config?: CrawleeTaskConfig; // 任务配置

  @IsOptional()
  @IsObject()
  overrideConfig?: Partial<CrawleeTaskConfig>; // 覆盖配置
}
