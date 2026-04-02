import request from "./request";
import type { TaskItem } from "@/types/task";

// =======================
// 页面截图
// =======================
export interface ScreenshotRes {
  url: string;
  screenshotBase64: string;
}

export function previewScreenshotApi(data: {
  url: string;
}): Promise<ScreenshotRes> {
  return request.post("/api/task/preview-screenshot", data);
}

// =======================
// 列表自动识别
// =======================
export function listPreviewApi(data: {
  url: string;
  targetAspectRatio?: number;
  tolerance?: number;
}): Promise<any> {
  return request.post("/api/task/list-preview", data);
}

// =======================
// XPath 解析（文本 / 图片 / 链接）
// =======================
export interface XpathParseText {
  xpath: string;
  text: string;
  type: string; // 可选：title / text 等
  tag: string;
}

export interface XpathParseImage {
  xpath: string;
  src: string;
}

export interface XpathParseLink {
  xpath: string;
  href: string;
}

export interface XpathParseItems {
  baseXpath: string;
  texts: XpathParseText[];
  images: XpathParseImage[];
  links: XpathParseLink[];
}

export interface XpathParseRes {
  count: number;
  items: XpathParseItems; // ✅ 对象，不是数组
}
export function xpathParseApi(data: {
  url: string;
  xpath: string;
  contentFormat?: "text" | "html" | "markdown" | "smart";
}): Promise<XpathParseRes> {
  return request.post("/api/task/xpath-parse", data);
}


// =======================
// XPath 匹配结果（只返回数量 + 文本样例）
// =======================
export interface XpathMatchRes {
  count: number;
  samples: string[];
}

export function xpathMatchApi(data: {
  url: string;
  xpath: string;
}): Promise<XpathMatchRes> {
  return request.post("/api/task/xpath-match", data);
}

export function jsPathParseApi(data:{
  url: string;
  jsPath: string;
  waitSelector?: string;
  contentFormat?: "text" | "html" | "markdown" | "smart";
}): Promise<XpathParseRes> {
  return request.post("/api/task/jspath-parse", data);
}


// =======================
// XPath 解析所有结果（返回数组）
// =======================
export interface XpathParseAllRes {
  count: number;
  items: XpathParseItems[];
}

export function xpathParseAllApi(data: {
  url: string;
  xpath: string;
}): Promise<XpathParseAllRes> {
  return request.post("/api/task/xpath-parse-all", data);
}

// =======================
// Crawlee 爬虫任务执行
// =======================

// 页面交互配置：用于支持「先输入关键词」与「页面内筛选控件」两种场景
export interface PageFilterCondition {
  id: number;
  label: string;
  actionType: "click" | "select";
  selectorType: "xpath" | "jsPath";
  selector: string;
  value?: string;
}

export interface PageInteractionConfig {
  searchEnabled: boolean;
  searchInputType: "xpath" | "jsPath";
  searchInputSelector: string;
  searchKeywordMode: "fixed" | "dynamic";
  searchKeywordValue: string;
  searchSubmitType: "enter" | "click";
  searchSubmitSelector: string;
  filters: PageFilterCondition[];
}

export interface PreActionConfig {
  type: "click" | "wait_for_selector" | "wait_for_timeout";
  selectorType?: "xpath" | "css";
  selector?: string;
  timeout?: number;
}

// 结果过滤：在爬取完成后按字段值丢弃不符合条件的记录
export type ResultFilterOperator =
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "eq"
  | "contains"
  | "not_contains";

export interface ResultFilterRule {
  field: string;
  operator: ResultFilterOperator;
  value: string;
}

export interface CrawleeTaskConfig {
  crawlerType: "playwright" | "cheerio" | "puppeteer";
  urls: string[];
  maxRequestsPerCrawl?: number;
  maxConcurrency?: number;
  // 基础选择器：用于定位列表项（支持 XPath 或 CSS / JSPath）
  baseSelector?: string;
  // 最大提取记录数（所有分页合计）
  maxItems?: number;
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  waitForSelector?: string;
  waitForTimeout?: number;
  navigationTimeout?: number;
  requestInterval?: number;
  maxRetries?: number;
  scrollEnabled?: boolean;
  scrollDistance?: number;
  scrollDelay?: number;
  maxScrollDistance?: number;
  // 基于“下一页”按钮的分页配置（可选）
  // 当前实现：每一页会先按 scrollEnabled 滚动，再根据 nextPageSelector 翻页，最多 maxPages 页
  nextPageSelector?: string;
  maxPages?: number;
  selectors?: SelectorConfig[];
  /** 嵌套提取：详情页内列表（如评论）支持独立分页/滚动，最多 3 层 */
  nestedContexts?: NestedExtractContext[];
  userAgent?: string;
  proxyUrl?: string;
  datasetId?: string;
  keyValueStoreId?: string;
  // 页面交互配置（可选）
  interaction?: PageInteractionConfig;
  // 提取前动作（可选）
  preActions?: PreActionConfig[];
  // 结果过滤规则（可选）
  resultFilters?: ResultFilterRule[];
  // 自定义 JS 处理代码（可选），对每条记录执行
  // 代码将作为函数体执行，入参为 item，必须 return：
  // - 返回对象：作为新的 item
  // - 返回 null/undefined/false：丢弃该条数据
  customItemProcessorCode?: string;
  // 结果筛选：自定义布尔函数（可选），入参 item，true 保留 false 丢弃
  customFilterCode?: string;
}

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

export interface SelectorConfig {
  name: string;
  selector: string;
  type: "text" | "link" | "image";
  multiple?: boolean;
  required?: boolean;
  contentFormat?: "text" | "html" | "markdown" | "smart";
  detailBaseSelector?: string;
  // 对该字段取值后的 JS 处理，入参 value，需 return 新值
  customTransformCode?: string;
  // Optional: used for navigating to child pages via an associated link
  // (e.g., when a value on a list item points to a detail page)
  parentLink?: string;
}

export interface ExecuteTaskReq {
  taskId?: string;
  taskName?: string;
  url?: string;
  config?: CrawleeTaskConfig;
  overrideConfig?: Partial<CrawleeTaskConfig>;
}

export interface ExecuteTaskRes {
  executionId: number;
  status: 'queued' | 'running' | 'success' | 'failed';
  message: string;
  queueStatus: {
    queueLength: number;
    isProcessing: boolean;
    queuedTasks: {
      taskId: number;
      executionId: number;
    }[];
  };
}

export function executeTaskApi(data: ExecuteTaskReq): Promise<ExecuteTaskRes> {
  return request.post("/api/task/execute", data);
}

// =======================
// 获取爬虫引擎状态
// =======================
export interface EngineStatusRes {
  queueLength: number;
  isProcessing: boolean;
  queuedTasks: {
    taskId: number;
    executionId: number;
  }[];
}

export function getEngineStatusApi(): Promise<EngineStatusRes> {
  return request.get("/api/task/engine-status");
}

// =======================
// 获取任务列表
// =======================
// 导入统一的TaskItem类型
export type { TaskItem } from "@/types/task";

export interface TaskListRes {
  data: TaskItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function getTaskListApi(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<TaskListRes> {
  return request.get("/api/task/list", { params });
}

// =======================
// 删除任务
// =======================
export function deleteTaskApi(taskData: { name: string; url: string }): Promise<{ message: string }> {
  return request.delete('/api/task', { data: taskData });
}

// =======================
// 获取执行结果
// =======================
export function getExecutionResultApi(executionId: number): Promise<{
  executionId: number;
  taskId: number;
  taskName: string;
  status: string;
  resultCount: number;
  results: any[];
  createdAt: string;
}> {
  return request.get(`/api/task/execution-result/${executionId}`);
}

// =======================
// 获取统计数据
// =======================
export interface StatisticsData {
  totalTasks: number;
  successTasks: number;
  runningTasks: number;
  failedTasks: number;
  successRate: number;
  trendData: Array<{
    day: string;
    success: number;
    failed: number;
    total: number;
  }>;
  successRateData: Array<{
    day: string;
    rate: number;
  }>;
  dataDistribution: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  timeDistribution: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  taskTypeDistribution: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  recentExecutions: Array<{
    id: number;
    taskName: string;
    url: string;
    status: string;
    resultCount: number;
    createdAt: string;
  }>;
}

export function getStatisticsApi(): Promise<StatisticsData> {
  return request.get('/api/task/statistics');
}

// =======================
// 打包执行结果
// =======================
export interface PackageResultReq {
  packageConfig: {
    structure?: {
      images?: string;
      files?: string;
      texts?: string;
      data?: string;
    };
    download?: {
      images?: boolean;
      files?: boolean;
      texts?: boolean;
      maxFileSize?: number;
      timeout?: number;
    };
    fieldMapping?: {
      imageFields?: string[];
      fileFields?: string[];
      textFields?: string[];
    };
  };
}

export interface PackageResultRes {
  message: string;
  packagePath: string;
}

export function packageResultApi(executionId: number, packageConfig: PackageResultReq['packageConfig']): Promise<PackageResultRes> {
  return request.post(`/api/task/package-result/${executionId}`, { packageConfig });
}
