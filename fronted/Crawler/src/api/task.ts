import request from "./request";

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
}): Promise<XpathMatchRes> {
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
export interface CrawleeTaskConfig {
  crawlerType: 'playwright' | 'cheerio' | 'puppeteer';
  urls: string[];
  maxRequestsPerCrawl?: number;
  maxConcurrency?: number;
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  waitForSelector?: string;
  waitForTimeout?: number;
  navigationTimeout?: number;
  scrollEnabled?: boolean;
  scrollDistance?: number;
  scrollDelay?: number;
  maxScrollDistance?: number;
  selectors?: SelectorConfig[];
  userAgent?: string;
  proxyUrl?: string;
  datasetId?: string;
  keyValueStoreId?: string;
}

export interface SelectorConfig {
  name: string;
  selector: string;
  type: 'text' | 'link' | 'image';
  multiple?: boolean;
  required?: boolean;
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
export interface TaskItem {
  name: string;
  url: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  progress: number;
  lastExecutionTime: string | null;
  createdAt: string;
  endTime: string | null;
  screenshotPath?: string;
  latestExecution: {
    status: string;
    log: string;
    startTime: string;
    endTime: string | null;
    resultPath?: string;
  } | null;
}

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