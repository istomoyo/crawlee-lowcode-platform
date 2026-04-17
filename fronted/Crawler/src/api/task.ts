import request from "./request";
import type { TaskItem } from "@/types/task";

export type { TaskItem } from "@/types/task";

export interface ScreenshotRes {
  url: string;
  screenshotBase64: string;
}

export interface TaskDebugCookiePayload {
  useCookie?: boolean;
  cookieString?: string;
  cookieDomain?: string;
  cookieCredentialId?: number;
}

export function previewScreenshotApi(data: {
  url: string;
} & TaskDebugCookiePayload): Promise<ScreenshotRes> {
  return request.post("/api/task/preview-screenshot", data);
}

export function listPreviewApi(data: {
  url: string;
  targetAspectRatio?: number;
  tolerance?: number;
} & TaskDebugCookiePayload): Promise<
 
  Array<{
    xpath: string;
    base64: string;
    selector: string;
    matchCount: number;
  }>
> {
  return request.post("/api/task/list-preview", data);
}

export interface XpathParseText {
  xpath: string;
  text: string;
  type: string;
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
  items: XpathParseItems;
}

export function xpathParseApi(data: {
  url: string;
  xpath: string;
  contentFormat?: "text" | "html" | "markdown" | "smart";
} & TaskDebugCookiePayload): Promise<XpathParseRes> {
  return request.post("/api/task/xpath-parse", data);
}

export interface XpathMatchRes {
  count: number;
  samples: string[];
}

export function xpathMatchApi(data: {
  url: string;
  xpath: string;
} & TaskDebugCookiePayload): Promise<XpathMatchRes> {
  return request.post("/api/task/xpath-match", data);
}

export interface XpathValidateListItem {
  index: number;
  matchCount: number;
  values: string[];
}

export interface XpathValidateRes {
  scope: "page" | "list";
  status: "stable" | "partial" | "ambiguous" | "missing" | "empty_base";
  count?: number;
  samples?: string[];
  baseCount?: number;
  sampledBaseCount?: number;
  matchedItemCount?: number;
  zeroMatchCount?: number;
  multiMatchCount?: number;
  maxMatchCount?: number;
  counts?: number[];
  items?: XpathValidateListItem[];
}

export function xpathValidateApi(data: {
  url: string;
  xpath: string;
  baseXpath?: string;
  sampleMode?: "list" | "example";
} & TaskDebugCookiePayload): Promise<XpathValidateRes> {
  return request.post("/api/task/xpath-validate", data);
}

export function jsPathParseApi(data: {
  url: string;
  jsPath: string;
  waitSelector?: string;
  contentFormat?: "text" | "html" | "markdown" | "smart";
} & TaskDebugCookiePayload): Promise<XpathParseRes> {
  const jsPath = String(data.jsPath || "").trim();

  if (jsPath.startsWith("/") || jsPath.startsWith(".//")) {
    return xpathParseApi({
      url: data.url,
      xpath: jsPath,
      contentFormat: data.contentFormat,
      useCookie: data.useCookie,
      cookieString: data.cookieString,
      cookieDomain: data.cookieDomain,
    });
  }

  return Promise.reject(
    new Error("当前后端仅支持 XPath 解析，请改用 XPath 选择器。"),
  );
}

export interface XpathParseAllRes {
  count: number;
  items: XpathParseItems[];
}

export function xpathParseAllApi(data: {
  url: string;
  xpath: string;
} & TaskDebugCookiePayload): Promise<XpathParseAllRes> {
  return request.post("/api/task/xpath-parse-all", data);
}

export interface PreActionConfig {
  type: "click" | "type" | "wait_for_selector" | "wait_for_timeout";
  selector?: string;
  value?: string;
  timeout?: number;
}

export type ResultFilterOperator =
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "eq"
  | "neq"
  | "contains"
  | "not_contains";

export type ResultFilterMode = "operator" | "function";

export interface ResultFilterRule {
  field: string;
  mode?: ResultFilterMode;
  operator?: ResultFilterOperator;
  value?: string;
  functionCode?: string;
}

export interface TaskNotificationConfig {
  enabled?: boolean;
  onSuccess?: boolean;
  onFailure?: boolean;
  previewCount?: number;
}

export type TaskMode = "simple";

export interface SelectorConfig {
  name: string;
  selector: string;
  type: "text" | "link" | "image";
  multiple?: boolean;
  required?: boolean;
  contentFormat?: "text" | "html" | "markdown" | "smart";
  detailBaseSelector?: string;
  customTransformCode?: string;
  parentLink?: string;
  preActions?: PreActionConfig[];
}

export interface NestedSelectorConfig {
  name: string;
  selector: string;
  type: "text" | "link" | "image";
  multiple?: boolean;
  required?: boolean;
  contentFormat?: "text" | "html" | "markdown" | "smart";
  customTransformCode?: string;
  preActions?: PreActionConfig[];
}

export interface NestedExtractContext {
  parentLink: string;
  baseSelector: string;
  listOutputKey?: string;
  scroll?: { maxScroll: number; waitTime: number; maxItems: number };
  next?: { selector: string; maxPages: number };
  selectors: NestedSelectorConfig[];
  maxDepth?: number;
  preActions?: PreActionConfig[];
}

export interface CrawleeTaskConfig {
  taskMode?: TaskMode;
  crawlerType: "playwright" | "cheerio" | "puppeteer";
  urls: string[];
  maxRequestsPerCrawl?: number;
  maxConcurrency?: number;
  baseSelector?: string;
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
  useCookie?: boolean;
  cookieString?: string;
  cookieDomain?: string;
  cookieCredentialId?: number;
  scrollEnabled?: boolean;
  scrollDistance?: number;
  scrollDelay?: number;
  maxScrollDistance?: number;
  nextPageSelector?: string;
  maxPages?: number;
  selectors?: SelectorConfig[];
  nestedContexts?: NestedExtractContext[];
  userAgent?: string;
  datasetId?: string;
  keyValueStoreId?: string;
  preActions?: PreActionConfig[];
  resultFilters?: ResultFilterRule[];
  notification?: TaskNotificationConfig;
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
  status: "queued" | "running" | "success" | "failed";
  message: string;
  queueStatus: {
    queueLength: number;
    isProcessing: boolean;
    queuedTasks: Array<{
      taskId: number;
      executionId: number;
      status?: "running" | "queued";
    }>;
  };
}

export function executeTaskApi(data: ExecuteTaskReq): Promise<ExecuteTaskRes> {
  return request.post("/api/task/execute", data);
}

export interface EngineStatusRes {
  queueLength: number;
  isProcessing: boolean;
  queuedTasks: Array<{
    taskId: number;
    executionId: number;
    status?: "running" | "queued";
  }>;
}

export function getEngineStatusApi(): Promise<EngineStatusRes> {
  return request.get("/api/task/engine-status");
}

export interface WorkspaceOverview {
  runtime: {
    totalTasks: number;
    runningTasks: number;
    successTasks: number;
    failedTasks: number;
    queueLength: number;
    isProcessing: boolean;
    queuedTasks: Array<{
      taskId: number;
      executionId: number;
      status?: "running" | "queued";
    }>;
  };
  today: {
    executions: number;
    success: number;
    failed: number;
  };
  recentFailedTasks: Array<{
    executionId: number;
    taskId: number;
    taskName: string;
    taskUrl: string;
    log: string;
    startTime: string;
    endTime: string | null;
  }>;
  pendingExceptions: Array<{
    id: number;
    type: string;
    level: "info" | "success" | "warning" | "error";
    title: string;
    content: string;
    link?: string;
    metadata?: Record<string, unknown>;
    isRead: boolean;
    readAt?: string | null;
    createdAt: string;
  }>;
  organization: {
    folders: number;
    tags: number;
    favorites: number;
  };
}

export function getWorkspaceOverviewApi(): Promise<WorkspaceOverview> {
  return request.get("/api/task/workspace-overview");
}

export interface TaskOrganizationOptions {
  folders: string[];
  tags: string[];
  favoriteCount: number;
}

export function getTaskOrganizationOptionsApi(): Promise<TaskOrganizationOptions> {
  return request.get("/api/task/organization-options");
}

export interface TaskListRes {
  data: TaskItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters?: {
    folder?: string | null;
    tag?: string | null;
    favoriteOnly?: boolean;
  };
}

export function getTaskListApi(params?: {
  page?: number;
  limit?: number;
  search?: string;
  folder?: string;
  tag?: string;
  favoriteOnly?: boolean;
}): Promise<TaskListRes> {
  return request.get("/api/task/list", { params });
}

export function updateTaskOrganizationApi(
  taskId: number,
  data: {
    folder?: string;
    tags?: string[];
    isFavorite?: boolean;
  },
): Promise<{
  id: number;
  folder: string | null;
  tags: string[];
  isFavorite: boolean;
}> {
  return request.put(`/api/task/${taskId}/organization`, data);
}

export interface TaskCookieCredentialSummary {
  id: number;
  name: string;
  cookieDomain: string;
  cookieCount: number;
  hasNotes: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: "active" | "expiring_soon" | "expired";
  isExpired: boolean;
  isExpiringSoon: boolean;
  isUsable: boolean;
  statusMessage: string;
}

export interface TaskCookieCredentialDetail extends TaskCookieCredentialSummary {
  notes: string;
}

export function getTaskCookieCredentialsApi(): Promise<TaskCookieCredentialSummary[]> {
  return request.get("/api/task/cookie-credentials");
}

export function getTaskCookieCredentialDetailApi(
  credentialId: number,
): Promise<TaskCookieCredentialDetail> {
  return request.get(`/api/task/cookie-credentials/${credentialId}`);
}

export function createTaskCookieCredentialApi(data: {
  name: string;
  cookieString: string;
  cookieDomain?: string;
  notes?: string;
  expiresAt?: string;
}): Promise<TaskCookieCredentialSummary> {
  return request.post("/api/task/cookie-credentials", data);
}

export function updateTaskCookieCredentialApi(
  credentialId: number,
  data: {
    name?: string;
    cookieString?: string;
    cookieDomain?: string;
    notes?: string;
    expiresAt?: string;
  },
): Promise<TaskCookieCredentialSummary> {
  return request.put(`/api/task/cookie-credentials/${credentialId}`, data);
}

export function deleteTaskCookieCredentialApi(
  credentialId: number,
): Promise<{ id: number; name: string }> {
  return request.delete(`/api/task/cookie-credentials/${credentialId}`);
}

export interface TaskTemplateSummary {
  id: number;
  name: string;
  description: string;
  category: string;
  sourceTaskId: number | null;
  sourceTaskName: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTemplateDetail extends TaskTemplateSummary {
  config: Record<string, unknown>;
  script: string;
}

export function getTaskTemplatesApi(params?: {
  search?: string;
  category?: string;
}): Promise<TaskTemplateSummary[]> {
  return request.get("/api/task/templates", { params });
}

export function getTaskTemplateCategoriesApi(): Promise<string[]> {
  return request.get("/api/task/template-categories");
}

export function getTaskTemplateDetailApi(
  templateId: number,
): Promise<TaskTemplateDetail> {
  return request.get(`/api/task/templates/${templateId}`);
}

export function createTaskTemplateApi(data: {
  name: string;
  description?: string;
  category?: string;
  url: string;
  taskName?: string;
  config: Record<string, unknown>;
  script?: string;
}): Promise<TaskTemplateSummary> {
  return request.post("/api/task/templates", data);
}

export function createTaskTemplateFromTaskApi(data: {
  taskId: number;
  name?: string;
  description?: string;
  category?: string;
}): Promise<TaskTemplateSummary> {
  return request.post("/api/task/templates/from-task", data);
}

export function updateTaskTemplateApi(
  templateId: number,
  data: {
    name?: string;
    description?: string;
    category?: string;
    url?: string;
    taskName?: string;
    config?: Record<string, unknown>;
    script?: string;
  },
): Promise<TaskTemplateSummary> {
  return request.put(`/api/task/templates/${templateId}`, data);
}

export function deleteTaskTemplateApi(
  templateId: number,
): Promise<{ id: number; name: string }> {
  return request.delete(`/api/task/templates/${templateId}`);
}

export function deleteTaskApi(taskData: {
  name: string;
  url: string;
}): Promise<{ message: string }> {
  return request.delete("/api/task", { data: taskData });
}

export function getExecutionResultApi(executionId: number): Promise<{
  executionId: number;
  taskId: number;
  taskName: string;
  status: string;
  resultCount: number;
  results: unknown[];
  createdAt: string;
}> {
  return request.get(`/api/task/execution-result/${executionId}`);
}

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
  return request.get("/api/task/statistics");
}

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
      strategy?: "direct" | "browser" | "auto";
      browserFlow?: {
        detailPageField?: string;
        detailPageWaitSelector?: string;
        detailPageWaitTimeout?: number;
      };
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

export function packageResultApi(
  executionId: number,
  packageConfig: PackageResultReq["packageConfig"],
): Promise<PackageResultRes> {
  return request.post(`/api/task/package-result/${executionId}`, {
    packageConfig,
  });
}
