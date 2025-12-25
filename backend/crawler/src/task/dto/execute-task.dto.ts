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
}

export interface SelectorConfig {
  name: string; // 选择器名称
  selector: string; // CSS/XPath选择器
  type: 'text' | 'link' | 'image'; // 提取类型：文本、链接、图像
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
