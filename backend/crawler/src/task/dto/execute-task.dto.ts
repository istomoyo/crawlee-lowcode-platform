import { IsObject, IsOptional, IsString, IsUrl } from 'class-validator';

export type ResultFilterOperator =
  | 'is_empty'
  | 'is_not_empty'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'contains'
  | 'not_contains';

export type ResultFilterMode = 'operator' | 'function';

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

export type TaskMode = 'simple' | 'behavior';

export interface PreActionConfig {
  type: 'click' | 'type' | 'wait_for_selector' | 'wait_for_timeout';
  selector?: string;
  value?: string;
  timeout?: number;
}

export interface SelectorConfig {
  name: string;
  selector: string;
  type: 'text' | 'link' | 'image';
  contentFormat?: 'text' | 'html' | 'markdown' | 'smart';
  parentLink?: string;
  detailBaseSelector?: string;
  customTransformCode?: string;
  preActions?: PreActionConfig[];
}

export interface NestedSelectorConfig {
  name: string;
  selector: string;
  type: 'text' | 'link' | 'image';
  contentFormat?: 'text' | 'html' | 'markdown' | 'smart';
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

export type BehaviorStepType =
  | 'open'
  | 'click'
  | 'type'
  | 'wait'
  | 'extract'
  | 'scroll'
  | 'loop'
  | 'condition'
  | 'customJS';

export type BehaviorExtractType =
  | 'text'
  | 'html'
  | 'markdown'
  | 'link'
  | 'image'
  | 'attribute';

export type BehaviorWaitUntil =
  | 'visible'
  | 'attached'
  | 'hidden'
  | 'networkidle'
  | 'timeout';

export type BehaviorLoopMode = 'elements' | 'times';

export type BehaviorConditionType =
  | 'exists'
  | 'not_exists'
  | 'text_contains'
  | 'customJS';

export interface BehaviorStep {
  id?: string;
  name?: string;
  type: BehaviorStepType;
  selector?: string;
  children?: BehaviorStep[];
  elseChildren?: BehaviorStep[];
  url?: string;
  value?: string;
  timeout?: number;
  waitUntil?: BehaviorWaitUntil;
  waitAfter?: number;
  field?: string;
  extractType?: BehaviorExtractType;
  attribute?: string;
  loopMode?: BehaviorLoopMode;
  maxLoops?: number;
  outputKey?: string;
  conditionType?: BehaviorConditionType;
  conditionValue?: string;
  code?: string;
}

export interface CrawleeTaskConfig {
  taskMode?: TaskMode;
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
  requestInterval?: number;
  maxRetries?: number;
  useCookie?: boolean;
  cookieString?: string;
  cookieDomain?: string;
  cookieCredentialId?: number;
  baseSelector?: string;
  maxItems?: number;
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
  behaviorSteps?: BehaviorStep[];
  resultFilters?: ResultFilterRule[];
  notification?: TaskNotificationConfig;
  outputFormat?: 'json' | 'packaged';
  packageConfig?: {
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
  };
}

export class ExecuteTaskDto {
  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  taskName?: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsObject()
  config?: CrawleeTaskConfig;

  @IsOptional()
  @IsObject()
  overrideConfig?: Partial<CrawleeTaskConfig>;
}
