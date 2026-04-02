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
  requestInterval?: number; // 空值重试/请求间隔参考时间（毫秒）
  maxRetries?: number; // 请求与空值提取重试次数

  // 数据提取配置
  baseSelector?: string; // 基础选择器，用于定位数据项列表
  maxItems?: number; // 最大提取数据项数量

  // 滚动配置（用于懒加载）
  scrollEnabled?: boolean;
  scrollDistance?: number;
  scrollDelay?: number;
  maxScrollDistance?: number;

  // 分页配置（用于点击“下一页”按钮翻页）
  // 当前实现：每一页会先根据滚动配置完成懒加载，再使用 nextPageSelector 找到下一页链接或按钮，最多 maxPages 页
  nextPageSelector?: string;
  maxPages?: number;

  // 数据提取配置
  selectors?: SelectorConfig[];

  /** 嵌套提取上下文：详情页内的列表（如评论）支持独立分页/滚动，最多 3 层 */
  nestedContexts?: NestedExtractContext[];

  // 请求配置
  userAgent?: string;
  proxyUrl?: string;

  // 存储配置
  datasetId?: string; // Crawlee Dataset ID
  keyValueStoreId?: string; // Key-Value Store ID
  // 字段提取前动作（例如：先点击按钮再等待列表出现）
  preActions?: PreActionConfig[];

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

  // 自定义结果处理 JS 代码（可选）
  customItemProcessorCode?: string;
  // 结果筛选：自定义布尔函数（可选），入参 item，true 保留 false 丢弃
  customFilterCode?: string;
}

export interface PreActionConfig {
  type: 'click' | 'wait_for_selector' | 'wait_for_timeout';
  selectorType?: 'xpath' | 'css';
  selector?: string;
  timeout?: number;
}

export interface SelectorConfig {
  name: string;
  selector: string;
  type: 'text' | 'link' | 'image';
  contentFormat?: 'text' | 'html' | 'markdown' | 'smart';
  parentLink?: string;
  // 可选：当 parentLink 字段来自子页面列表时，指定该子页面列表项容器
  detailBaseSelector?: string;
  // 对该字段取值后的 JS 处理，入参 value，需 return 新值
  customTransformCode?: string;
}

/** 嵌套提取上下文：详情页内列表（如评论）支持独立分页/滚动 */
export interface NestedExtractContext {
  parentLink: string;
  baseSelector: string;
  listOutputKey?: string;
  scroll?: { maxScroll: number; waitTime: number; maxItems: number };
  next?: { selector: string; maxPages: number };
  selectors: SelectorConfig[];
  maxDepth?: number;
  preActions?: PreActionConfig[];
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
