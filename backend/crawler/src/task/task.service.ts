import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as playwright from 'playwright';
import { randomUUID } from 'crypto';
import {
  PlaywrightCrawler,
  CheerioCrawler,
  Dataset,
  KeyValueStore,
  RequestQueue,
} from 'crawlee';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { Execution } from '../execution/entities/execution.entity';
import { CrawleeTaskConfig } from './dto/execute-task.dto';
import { CrawleeEngineService } from './crawlee-engine.service';
import { TaskGateway } from './task.gateway';
import { FilePackageService } from './file-package.service';
import {
  createPlaywrightCookies,
  getCookieMatchDomain,
  hasInlineCookieString,
  listUnsafeCustomJsFeatures,
  normalizeCookieDomain,
  sanitizeTaskConfig,
  shouldAttachCookieToUrl,
} from './task-config.utils';
import { formatHtmlFragment } from './content-extraction.utils';
import { NotificationService } from '../notification/notification.service';
import { isUnsafeCustomJsEnabled } from '../config/runtime-security';
import { TaskCookieCredentialService } from './task-cookie-credential.service';

// 默认“类真实浏览器”配置
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_VIEWPORT = { width: 1366, height: 768 };
const PREVIEW_NAVIGATION_TIMEOUT_MS = 45000;

/**
 * 创建带“拟真”设置的 Playwright Page
 * - 自定义 UA / 语言 / 时区
 * - 关闭 webdriver 痕迹
 * - 允许后续补充 headers / cookies
 */
async function createStealthPage(headless = true) {
  const browser = await playwright.chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    viewport: DEFAULT_VIEWPORT,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    ignoreHTTPSErrors: true,
    geolocation: { longitude: 116.397, latitude: 39.917 },
    permissions: ['geolocation'],
  });

  // 注入常见反自动化补丁
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh', 'en-US', 'en'],
    });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
  });

  const page = await context.newPage();
  return { browser, page };
}

export function getMissingPlaywrightBrowserMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (!message.includes("Executable doesn't exist")) {
    return null;
  }

  return '预览浏览器未安装，请在 backend/crawler 目录运行 npx playwright install chromium 后重试';
}

export function isRelativeScopedXPath(selector: string): boolean {
  const normalized = String(selector || '').trim();
  if (!normalized) {
    return false;
  }

  const expression = normalized.startsWith('xpath=')
    ? normalized.slice('xpath='.length).trim()
    : normalized;

  return expression.startsWith('./') || expression.startsWith('.//');
}

export interface ResultItem {
  xpath: string;
  matchCount: number;
  base64: string;
}

interface Candidate {
  handle: playwright.ElementHandle<HTMLElement | SVGElement>;
  css: string;
  area: number;
  aspectRatio: number;
  childCount: number;
  tagTypes: Set<string>;
  hasImage: boolean;
}

export interface NodeItem {
  xpath: string;
  text?: string;
  tag?: string;
  href?: string;
  src?: string;
}

export interface ParseResult {
  basePath: string;
  texts: NodeItem[];
  images: NodeItem[];
  links: NodeItem[];
}

export interface XpathValidationListItem {
  index: number;
  matchCount: number;
  values: string[];
  signatures: string[];
}

export interface XpathValidationResult {
  scope: 'page' | 'list';
  status: 'stable' | 'partial' | 'ambiguous' | 'missing' | 'empty_base';
  count?: number;
  samples?: string[];
  baseCount?: number;
  sampledBaseCount?: number;
  matchedItemCount?: number;
  zeroMatchCount?: number;
  multiMatchCount?: number;
  maxMatchCount?: number;
  counts?: number[];
  signatureSamples?: string[];
  items?: XpathValidationListItem[];
}

export interface BrowserPickerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserPickerSelection {
  primaryXpath: string;
  candidateXpaths: string[];
  absolutePrimaryXpath: string;
  absoluteCandidateXpaths: string[];
  relativePrimaryXpath?: string;
  relativeCandidateXpaths: string[];
  scopeMatched: boolean;
  tagName: string;
  textPreview: string;
  attributes: {
    id?: string;
    className?: string;
    name?: string;
  };
  rect: BrowserPickerRect;
}

export interface BrowserPickerSnapshot {
  sessionId: string;
  screenshotBase64: string;
  pageUrl: string;
  title: string;
  viewport: {
    width: number;
    height: number;
  };
  selected: BrowserPickerSelection | null;
}

interface BrowserPickerSession {
  id: string;
  browser: playwright.Browser;
  page: playwright.Page;
  viewport: {
    width: number;
    height: number;
  };
  createdAt: number;
  touchedAt: number;
  selected: BrowserPickerSelection | null;
}

type TaskCookieAccessOptions = Pick<
  CrawleeTaskConfig,
  'useCookie' | 'cookieString' | 'cookieDomain' | 'cookieCredentialId'
>;

function xpathPreviewDomHelpersFactory() {
  const EXACT_ATTRIBUTE_PRIORITY = [
    'data-testid',
    'data-test',
    'data-qa',
    'data-cy',
    'data-ga4-label',
    'data-role',
    'aria-label',
    'aria-current',
    'aria-selected',
    'role',
    'title',
    'name',
    'type',
  ];
  const GENERIC_CLASS_TOKENS = new Set([
    'active',
    'selected',
    'current',
    'open',
    'close',
    'show',
    'hide',
    'hover',
    'focus',
    'disabled',
    'enabled',
    'checked',
    'unchecked',
    'visited',
  ]);

  function evaluateXPathAll(xpath: string, contextNode: Document | Element) {
    if (!xpath) {
      return [] as Element[];
    }

    const scope =
      (contextNode as Element | null)?.ownerDocument ||
      (contextNode as Document) ||
      document;
    const snapshot = scope.evaluate(
      xpath,
      contextNode || document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );

    const nodes: Element[] = [];
    for (let i = 0; i < snapshot.snapshotLength; i += 1) {
      const node = snapshot.snapshotItem(i);
      if (node && node.nodeType === Node.ELEMENT_NODE) {
        nodes.push(node as Element);
      }
    }
    return nodes;
  }

  function quoteXPathLiteral(value: string) {
    const normalized = String(value ?? '');
    if (!normalized.includes("'")) {
      return `'${normalized}'`;
    }
    if (!normalized.includes('"')) {
      return `"${normalized}"`;
    }
    return `concat(${normalized
      .split("'")
      .map((part) => `'${part}'`)
      .join(`, "'", `)})`;
  }

  function dedupe<T>(values: T[]) {
    return [...new Set(values.filter(Boolean))];
  }

  function looksDynamicValue(name: string, rawValue: string) {
    const value = String(rawValue ?? '').trim();
    if (!value) {
      return true;
    }

    if (name === 'src') {
      return false;
    }

    if (value.length > 120) {
      return true;
    }

    if (/^\d+$/.test(value)) {
      return true;
    }

    if (/^[a-f0-9]{8,}$/i.test(value)) {
      return true;
    }

    const digitCount = (value.match(/\d/g) || []).length;
    return digitCount > 0 && digitCount / value.length > 0.45;
  }

  function looksDynamicSegment(value: string) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return true;
    }

    return (
      /^\d+$/.test(normalized) ||
      /^[a-f0-9]{6,}$/i.test(normalized) ||
      /\d{3,}/.test(normalized)
    );
  }

  function isUsefulClassToken(token: string) {
    if (!token || token.length < 3) {
      return false;
    }

    if (!/^[A-Za-z][\w-]*$/.test(token)) {
      return false;
    }

    if (GENERIC_CLASS_TOKENS.has(token.toLowerCase())) {
      return false;
    }

    return !/\d{4,}/.test(token) && !/[A-Fa-f0-9]{8,}/.test(token);
  }

  function getClassPredicates(element: Element) {
    const className = element.getAttribute('class') || '';
    return className
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(isUsefulClassToken)
      .slice(0, 2)
      .map(
        (token: string) =>
          `contains(concat(' ', normalize-space(@class), ' '), ${quoteXPathLiteral(` ${token} `)})`,
      );
  }

  function buildUrlPatterns(attrName: string, rawValue: string) {
    const value = String(rawValue ?? '').trim();
    if (!value) {
      return [] as Array<{ predicate: string; score: number }>;
    }

    try {
      const url = new URL(value, window.location.href);
      const patterns: Array<{ predicate: string; score: number }> = [];
      const segments = url.pathname.split('/').filter(Boolean);

      if (segments.length > 0) {
        patterns.push({
          predicate: `contains(@${attrName}, ${quoteXPathLiteral(`/${segments[0]}/`)})`,
          score: 72,
        });
      }

      if (segments.length > 1 && !looksDynamicSegment(segments[1])) {
        patterns.push({
          predicate: `contains(@${attrName}, ${quoteXPathLiteral(`/${segments[0]}/${segments[1]}`)})`,
          score: 78,
        });
      }

      if (url.origin && url.origin !== window.location.origin) {
        patterns.push({
          predicate: `contains(@${attrName}, ${quoteXPathLiteral(url.origin)})`,
          score: 55,
        });
      }

      return patterns;
    } catch (error) {
      return [] as Array<{ predicate: string; score: number }>;
    }
  }

  function getPreferredAttributeCandidates(element: Element) {
    const candidates: Array<{ predicate: string; score: number }> = [];
    const seen = new Set();
    const tagName = element.tagName.toLowerCase();
    const attributes = Array.from(element.attributes || []) as Attr[];

    function pushCandidate(predicate: string, score: number) {
      if (!predicate || seen.has(predicate)) {
        return;
      }
      seen.add(predicate);
      candidates.push({ predicate, score });
    }

    for (const attributeName of EXACT_ATTRIBUTE_PRIORITY) {
      const attributeValue = element.getAttribute(attributeName);
      if (attributeValue && !looksDynamicValue(attributeName, attributeValue)) {
        pushCandidate(
          `@${attributeName}=${quoteXPathLiteral(attributeValue.trim())}`,
          96,
        );
      }
    }

    const dataAttributes = attributes
      .filter((attribute: Attr) => attribute.name.startsWith('data-'))
      .sort((left: Attr, right: Attr) => {
        const leftIndex = EXACT_ATTRIBUTE_PRIORITY.indexOf(left.name);
        const rightIndex = EXACT_ATTRIBUTE_PRIORITY.indexOf(right.name);
        return (
          (leftIndex === -1 ? 999 : leftIndex) -
          (rightIndex === -1 ? 999 : rightIndex)
        );
      });

    for (const attribute of dataAttributes) {
      if (!looksDynamicValue(attribute.name, attribute.value)) {
        pushCandidate(
          `@${attribute.name}=${quoteXPathLiteral(attribute.value.trim())}`,
          90,
        );
      }
    }

    if (tagName === 'img') {
      for (const pattern of buildUrlPatterns(
        'src',
        element.getAttribute('src') ||
          element.getAttribute('data-src') ||
          (element as HTMLImageElement).src,
      )) {
        pushCandidate(pattern.predicate, pattern.score - 5);
      }
    }

    for (const predicate of getClassPredicates(element)) {
      pushCandidate(predicate, 44);
    }

    return candidates.sort(
      (left, right) =>
        right.score - left.score || left.predicate.length - right.predicate.length,
    );
  }

  function buildFallbackSegment(parent: Element, element: Element) {
    const tagName = element.tagName.toLowerCase();
    const sameTagSiblings = (Array.from(parent.children) as Element[]).filter(
      (child: Element) => child.tagName === element.tagName,
    );

    if (sameTagSiblings.length <= 1) {
      return tagName;
    }

    return `${tagName}[${sameTagSiblings.indexOf(element) + 1}]`;
  }

  function buildSegmentOptions(parent: Element, element: Element) {
    const options: Array<{ segment: string; score: number; matchCount: number }> = [];
    const seen = new Set();
    const tagName = element.tagName.toLowerCase();
    const candidates = getPreferredAttributeCandidates(element);

    function pushOption(segment: string, score: number) {
      if (!segment || seen.has(segment)) {
        return;
      }

      const matches = evaluateXPathAll(`./${segment}`, parent);
      if (!matches.length || !matches.includes(element)) {
        return;
      }

      seen.add(segment);
      options.push({ segment, score, matchCount: matches.length });
    }

    for (const candidate of candidates.slice(0, 6)) {
      pushOption(`${tagName}[${candidate.predicate}]`, candidate.score);
    }

    for (let i = 0; i < Math.min(candidates.length, 4); i += 1) {
      for (let j = i + 1; j < Math.min(candidates.length, 4); j += 1) {
        pushOption(
          `${tagName}[${candidates[i].predicate} and ${candidates[j].predicate}]`,
          candidates[i].score + candidates[j].score + 12,
        );
      }
    }

    for (const candidate of candidates.slice(0, 3)) {
      const filteredMatches = evaluateXPathAll(
        `./${tagName}[${candidate.predicate}]`,
        parent,
      );
      const index = filteredMatches.indexOf(element);
      if (filteredMatches.length > 1 && index !== -1) {
        pushOption(
          `${tagName}[${candidate.predicate}][${index + 1}]`,
          candidate.score - 12,
        );
      }
    }

    pushOption(buildFallbackSegment(parent, element), 10);

    return options
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.matchCount - right.matchCount ||
          left.segment.length - right.segment.length,
      )
      .slice(0, 4);
  }

  function getElementValue(element: Element) {
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'a') {
      return String(
        element.getAttribute('href') ||
          (element as HTMLAnchorElement).href ||
          '',
      ).trim();
    }

    if (tagName === 'img') {
      return String(
        element.getAttribute('src') ||
          element.getAttribute('data-src') ||
          (element as HTMLImageElement).src ||
          '',
      ).trim();
    }

    return String(element.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  function validateRelativeXPath(baseElements: Element[], relativeXPath: string) {
    const sampledBaseElements = baseElements.slice(0, 12);
    const items = sampledBaseElements.map((baseElement, index) => {
      const matches = evaluateXPathAll(relativeXPath, baseElement);
      return {
        index,
        matchCount: matches.length,
        values: dedupe(matches.map((match: Element) => getElementValue(match)).filter(Boolean)).slice(
          0,
          3,
        ),
        signatures: [],
      };
    });

    const counts = items.map((item) => item.matchCount);
    const zeroMatchCount = counts.filter((count) => count === 0).length;
    const multiMatchCount = counts.filter((count) => count > 1).length;
    const matchedItemCount = counts.filter((count) => count > 0).length;
    const signatureSamples: string[] = [];

    let status = 'stable';
    if (sampledBaseElements.length === 0) {
      status = 'empty_base';
    } else if (matchedItemCount === 0) {
      status = 'missing';
    } else if (multiMatchCount > 0) {
      status = 'ambiguous';
    } else if (zeroMatchCount > 0) {
      status = 'partial';
    }

    return {
      scope: 'list',
      status,
      baseCount: baseElements.length,
      sampledBaseCount: sampledBaseElements.length,
      matchedItemCount,
      zeroMatchCount,
      multiMatchCount,
      maxMatchCount: counts.length > 0 ? Math.max(...counts) : 0,
      counts,
      signatureSamples,
      items: items.slice(0, 8),
    };
  }

  function scoreRelativeXPath(
    baseElements: Element[],
    sampleBase: Element,
    target: Element,
    relativeXPath: string,
  ) {
    const sampleMatches = evaluateXPathAll(relativeXPath, sampleBase);
    if (sampleMatches.length !== 1 || sampleMatches[0] !== target) {
      return Number.NEGATIVE_INFINITY;
    }

    const validation = validateRelativeXPath(baseElements, relativeXPath);
    const indexCount = (relativeXPath.match(/\[\d+\]/g) || []).length;

    let score = (validation.matchedItemCount || 0) * 24;
    score -= (validation.zeroMatchCount || 0) * 8;
    score -= (validation.multiMatchCount || 0) * 40;
    score -= indexCount * 2;
    score -= relativeXPath.includes('.//') ? 20 : 0;
    score += relativeXPath.includes('@') ? 14 : 0;
    score -= relativeXPath.length * 0.02;

    return score;
  }

  function buildRelativeXPath(
    baseElement: Element,
    targetElement: Element,
    peerBaseElements?: Element[],
  ) {
    if (!baseElement || !targetElement) {
      return './self::*';
    }

    if (baseElement === targetElement) {
      return './self::*';
    }

    const chain: Array<{ parent: Element; element: Element }> = [];
    let current = targetElement;
    while (current && current !== baseElement) {
      if (!current.parentElement) {
        break;
      }
      chain.unshift({ parent: current.parentElement, element: current });
      current = current.parentElement;
    }

    if (current !== baseElement || chain.length === 0) {
      return './self::*';
    }

    // Prefer the old positional strategy so every list item follows the same
    // DOM-structure-based path, instead of inferring attribute-heavy XPath.
    return `./${chain
      .map((step) => buildFallbackSegment(step.parent, step.element))
      .join('/')}`;
  }

  return {
    evaluateXPathAll,
    buildRelativeXPath,
    validateRelativeXPath,
    getElementValue,
  };
}

@Injectable()
export class TaskService implements OnModuleDestroy {
  private readonly logger = new Logger(TaskService.name);
  private readonly browserPickerSessionTtlMs = 10 * 60 * 1000;
  private readonly executionRuntimeCookieTtlMs = 12 * 60 * 60 * 1000;
  private readonly browserPickerSessions = new Map<string, BrowserPickerSession>();

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    private readonly crawleeEngineService: CrawleeEngineService,
    private readonly taskGateway: TaskGateway,
    private readonly filePackageService: FilePackageService,
    private readonly taskCookieCredentialService: TaskCookieCredentialService,
    private readonly notificationService: NotificationService,
  ) {}

  async onModuleDestroy() {
    await this.closeAllBrowserPickerSessions();
  }

  private getCompactViewportScreenshotOptions(): playwright.PageScreenshotOptions {
    return {
      fullPage: false,
      type: 'jpeg',
      quality: 72,
      scale: 'css',
      animations: 'disabled',
      caret: 'hide',
    };
  }

  private async injectXpathPreviewHelpers(page: playwright.Page) {
    const helperSource = xpathPreviewDomHelpersFactory.toString();
    await page.addInitScript({
      content: `window.__taskXpathPreviewHelpersFactory = ${helperSource};`,
    });
    await page
      .evaluate((source) => {
        const win = window as any;
        if (typeof win.__taskXpathPreviewHelpersFactory !== 'function') {
          win.__taskXpathPreviewHelpersFactory = (0, eval)(`(${source})`);
        }
      }, helperSource)
      .catch(() => undefined);
  }

  private createTaskOperationError(
    error: unknown,
    fallbackMessage: string,
    options: {
      allowMissingBrowserHint?: boolean;
    } = {},
  ): HttpException {
    if (options.allowMissingBrowserHint) {
      const missingBrowserMessage = getMissingPlaywrightBrowserMessage(error);
      if (missingBrowserMessage) {
        return new ServiceUnavailableException(missingBrowserMessage);
      }
    }

    if (error instanceof HttpException) {
      return error;
    }

    return new InternalServerErrorException(fallbackMessage);
  }

  private parseTaskConfig(
    rawConfig?: string | null,
    allowInlineCookieString = true,
  ): Partial<CrawleeTaskConfig> {
    if (!rawConfig) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawConfig);
      if (parsed?.config && typeof parsed.config === 'object') {
        return sanitizeTaskConfig(parsed.config, { allowInlineCookieString });
      }

      return sanitizeTaskConfig(parsed, { allowInlineCookieString });
    } catch (error) {
      this.logger.warn(
        `解析任务配置失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {};
    }
  }

  private serializeTaskConfig(
    config?: Partial<CrawleeTaskConfig> | Record<string, unknown> | null,
  ): string {
    return JSON.stringify(config || {});
  }

  private async maybePersistRedactedTaskConfig(
    task: Task | undefined,
    runtimeConfig?: Partial<CrawleeTaskConfig> | null,
  ) {
    if (!task?.id || !runtimeConfig || !hasInlineCookieString(runtimeConfig)) {
      return;
    }

    const redactedConfig = sanitizeTaskConfig(runtimeConfig, {
      allowInlineCookieString: false,
    });
    const serializedRedactedConfig = this.serializeTaskConfig(redactedConfig);

    if (serializedRedactedConfig === String(task.config || '{}')) {
      return;
    }

    await this.taskRepository.update(task.id, {
      config: serializedRedactedConfig,
    });
    task.config = serializedRedactedConfig;
  }

  private async storeExecutionRuntimeCookie(
    executionId: number,
    config: TaskCookieAccessOptions,
  ) {
    const cookieString = String(config.cookieString ?? '').trim();
    if (!config.useCookie || !cookieString || config.cookieCredentialId) {
      return;
    }

    const sealedCookie = this.taskCookieCredentialService.sealCookieString(
      cookieString,
    );

    await this.executionRepository.update(executionId, {
      runtimeCookieEncrypted: sealedCookie.encryptedCookie,
      runtimeCookieIv: sealedCookie.iv,
      runtimeCookieAuthTag: sealedCookie.authTag,
      runtimeCookieDomain: normalizeCookieDomain(config.cookieDomain) || null,
      runtimeCookieExpiresAt: new Date(
        Date.now() + this.executionRuntimeCookieTtlMs,
      ),
    });
  }

  private resolveExecutionRuntimeCookie(
    execution?: Execution | null,
  ): TaskCookieAccessOptions {
    if (
      !execution?.runtimeCookieEncrypted ||
      !execution.runtimeCookieIv ||
      !execution.runtimeCookieAuthTag
    ) {
      return { useCookie: false };
    }

    if (
      execution.runtimeCookieExpiresAt &&
      execution.runtimeCookieExpiresAt.getTime() <= Date.now()
    ) {
      return { useCookie: false };
    }

    try {
      return {
        useCookie: true,
        cookieString: this.taskCookieCredentialService.openSealedCookie({
          encryptedCookie: execution.runtimeCookieEncrypted,
          iv: execution.runtimeCookieIv,
          authTag: execution.runtimeCookieAuthTag,
        }),
        cookieDomain: execution.runtimeCookieDomain || undefined,
      };
    } catch (error) {
      this.logger.warn(
        `解析执行期 Cookie 快照失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { useCookie: false };
    }
  }

  private async resolveTaskCookieOptions(
    userId: number | undefined,
    cookieOptions?: TaskCookieAccessOptions,
  ): Promise<TaskCookieAccessOptions> {
    const cookieString = String(cookieOptions?.cookieString ?? '').trim();

    if (!cookieOptions?.useCookie) {
      return {
        useCookie: false,
        cookieDomain: cookieOptions?.cookieDomain,
      };
    }

    if (cookieString) {
      return {
        useCookie: true,
        cookieString,
        cookieDomain: cookieOptions?.cookieDomain,
        cookieCredentialId: cookieOptions?.cookieCredentialId,
      };
    }

    const cookieCredentialId = Number(cookieOptions?.cookieCredentialId);
    if (!Number.isInteger(cookieCredentialId) || cookieCredentialId <= 0) {
      return {
        useCookie: false,
        cookieDomain: cookieOptions?.cookieDomain,
      };
    }

    if (!userId) {
      throw new BadRequestException('缺少用户上下文，无法解析 Cookie 凭证');
    }

    const resolvedCredential =
      await this.taskCookieCredentialService.resolveCredentialCookie(
        userId,
        cookieCredentialId,
      );

    return {
      useCookie: true,
      cookieString: resolvedCredential.cookieString,
      cookieDomain:
        resolvedCredential.cookieDomain || cookieOptions?.cookieDomain,
      cookieCredentialId,
    };
  }

  private async resolveTaskRuntimeConfig(
    config: CrawleeTaskConfig,
    userId?: number,
    fallbackUrl?: string,
  ): Promise<CrawleeTaskConfig> {
    const resolvedCookieOptions = await this.resolveTaskCookieOptions(
      userId,
      config,
    );

    return sanitizeTaskConfig({
      ...config,
      urls:
        Array.isArray(config.urls) && config.urls.length > 0
          ? config.urls
          : fallbackUrl
            ? [fallbackUrl]
            : [],
      ...resolvedCookieOptions,
    }) as CrawleeTaskConfig;
  }

  private async applyTaskCookiesToPage(
    page: playwright.Page,
    targetUrl: string,
    cookieOptions?: TaskCookieAccessOptions,
  ) {
    const cookieString = String(cookieOptions?.cookieString ?? '').trim();

    if (!cookieOptions?.useCookie || !cookieString) {
      return;
    }

    if (
      !shouldAttachCookieToUrl(
        targetUrl,
        cookieOptions.cookieDomain,
        targetUrl,
      )
    ) {
      this.logger.warn(`预览阶段跳过跨域 Cookie 注入: ${targetUrl}`);
      return;
    }

    const cookies = createPlaywrightCookies(
      cookieString,
      targetUrl,
      cookieOptions.cookieDomain,
    );

    if (cookies.length === 0) {
      return;
    }

    try {
      await page.context().addCookies(
        cookies as unknown as Parameters<playwright.BrowserContext['addCookies']>[0],
      );
    } catch (error) {
      this.logger.warn(
        `预览阶段应用 Cookie 失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async capturePreviewScreenshot(
    url: string,
    cookieOptions?: TaskCookieAccessOptions,
    userId?: number,
  ): Promise<string> {
    if (!/^https?:\/\//.test(url)) {
      throw new BadRequestException('URL 格式不正确');
    }

    let browser;
    try {
      const stealth = await createStealthPage(true);
      browser = stealth.browser;
      const page = stealth.page;

      await this.injectXpathPreviewHelpers(page);
      const resolvedCookieOptions = await this.resolveTaskCookieOptions(
        userId,
        cookieOptions,
      );
      await this.applyTaskCookiesToPage(page, url, resolvedCookieOptions);
      await this.navigatePreviewPage(page, url);

      const buffer = await page.screenshot(
        this.getCompactViewportScreenshotOptions(),
      );
      return buffer.toString('base64');
    } catch (e) {
      this.logger.error('截图失败', e);
      throw this.createTaskOperationError(e, '截图失败', {
        allowMissingBrowserHint: true,
      });
    } finally {
      if (browser) await browser.close();
    }
  }

  private async closeAllBrowserPickerSessions() {
    const sessions = [...this.browserPickerSessions.values()];
    this.browserPickerSessions.clear();
    await Promise.all(
      sessions.map(async (session) => {
        await session.browser.close().catch(() => undefined);
      }),
    );
  }

  private async cleanupExpiredBrowserPickerSessions() {
    const now = Date.now();
    const expiredSessions = [...this.browserPickerSessions.values()].filter(
      (session) => now - session.touchedAt > this.browserPickerSessionTtlMs,
    );

    for (const session of expiredSessions) {
      this.browserPickerSessions.delete(session.id);
      await session.browser.close().catch(() => undefined);
    }
  }

  private touchBrowserPickerSession(session: BrowserPickerSession) {
    session.touchedAt = Date.now();
  }

  private async requireBrowserPickerSession(sessionId: string) {
    await this.cleanupExpiredBrowserPickerSessions();
    const session = this.browserPickerSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('拾取会话不存在或已过期');
    }

    this.touchBrowserPickerSession(session);
    return session;
  }

  private async buildBrowserPickerSnapshot(
    session: BrowserPickerSession,
  ): Promise<BrowserPickerSnapshot> {
    const screenshot = await session.page.screenshot(
      this.getCompactViewportScreenshotOptions(),
    );
    const title = await session.page.title().catch(() => '');

    return {
      sessionId: session.id,
      screenshotBase64: `data:image/jpeg;base64,${screenshot.toString('base64')}`,
      pageUrl: session.page.url(),
      title,
      viewport: session.viewport,
      selected: session.selected,
    };
  }

  private async waitForPickerPageSettled(page: playwright.Page) {
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => undefined);
    await page.waitForTimeout(250).catch(() => undefined);
  }

  private async waitForPreviewPageSettled(
    page: playwright.Page,
    waitSelector?: string,
  ) {
    await page.waitForTimeout(2000).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    if (waitSelector) {
      await page.waitForSelector(waitSelector, { timeout: 5000 }).catch(() => undefined);
    }

    await page.waitForTimeout(1000).catch(() => undefined);
  }

  private isPreviewNavigationTimeout(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /page\.goto: Timeout/i.test(message) || /Timeout \d+ms exceeded/i.test(message);
  }

  private async navigatePreviewPage(
    page: playwright.Page,
    url: string,
    waitSelector?: string,
  ) {
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: PREVIEW_NAVIGATION_TIMEOUT_MS,
      });
    } catch (error) {
      if (!this.isPreviewNavigationTimeout(error)) {
        throw error;
      }

      const currentUrl = page.url();
      const hasNavigated =
        currentUrl &&
        currentUrl !== 'about:blank' &&
        currentUrl !== 'chrome-error://chromewebdata/';

      this.logger.warn(
        `Preview navigation timed out for ${url}; currentUrl=${currentUrl || 'unknown'}, attempting relaxed recovery`,
      );

      if (!hasNavigated) {
        await page.goto(url, {
          waitUntil: 'commit',
          timeout: PREVIEW_NAVIGATION_TIMEOUT_MS,
        });
      }
    }

    await this.waitForPreviewPageSettled(page, waitSelector);
  }

  async createBrowserPickerSession(url: string): Promise<BrowserPickerSnapshot> {
    if (!/^https?:\/\//.test(url)) {
      throw new BadRequestException('URL 格式不正确');
    }

    await this.cleanupExpiredBrowserPickerSessions();

    const stealth = await createStealthPage(true);
    const session: BrowserPickerSession = {
      id: randomUUID(),
      browser: stealth.browser,
      page: stealth.page,
      viewport: { ...DEFAULT_VIEWPORT },
      createdAt: Date.now(),
      touchedAt: Date.now(),
      selected: null,
    };

    try {
      await this.navigatePreviewPage(stealth.page, url);
      this.browserPickerSessions.set(session.id, session);
      return this.buildBrowserPickerSnapshot(session);
    } catch (error) {
      await stealth.browser.close().catch(() => undefined);
      this.logger.error('创建浏览器拾取会话失败', error);
      throw new InternalServerErrorException('创建浏览器拾取会话失败');
    }
  }

  async refreshBrowserPickerSession(sessionId: string) {
    const session = await this.requireBrowserPickerSession(sessionId);
    session.selected = null;
    await this.waitForPickerPageSettled(session.page);
    return this.buildBrowserPickerSnapshot(session);
  }

  async closeBrowserPickerSession(sessionId: string) {
    const session = this.browserPickerSessions.get(sessionId);
    if (!session) {
      return { success: true };
    }

    this.browserPickerSessions.delete(sessionId);
    await session.browser.close().catch(() => undefined);
    return { success: true };
  }

  async pickBrowserPickerElement(
    sessionId: string,
    xRatio: number,
    yRatio: number,
    scopeChain: string[] = [],
  ) {
    const session = await this.requireBrowserPickerSession(sessionId);
    const x = Math.max(
      0,
      Math.min(session.viewport.width - 1, Math.round(xRatio * session.viewport.width)),
    );
    const y = Math.max(
      0,
      Math.min(session.viewport.height - 1, Math.round(yRatio * session.viewport.height)),
    );

    const normalizedScopeChain = scopeChain
      .map((selector) => String(selector || '').trim())
      .filter(Boolean);

    const selection = await session.page.evaluate(({ x, y, scopeChain }) => {
      const choosePreferredElement = (element: Element | null) => {
        let current = element as HTMLElement | null;
        const wrapperTags = new Set([
          'span',
          'strong',
          'em',
          'i',
          'b',
          'small',
          'svg',
          'path',
          'use',
        ]);

        while (current?.parentElement) {
          const rect = current.getBoundingClientRect();
          const tagName = current.tagName.toLowerCase();
          const isInteractive =
            current.matches(
              'a,button,input,textarea,select,label,[role="button"],[role="link"],[onclick]',
            ) || current.tabIndex >= 0;

          if (
            rect.width >= 12 &&
            rect.height >= 12 &&
            (!wrapperTags.has(tagName) || isInteractive)
          ) {
            return current;
          }

          current = current.parentElement;
        }

        return (element as HTMLElement | null) || null;
      };

      const normalizeXPath = (selector: string, scoped = false) => {
        let normalized = selector.trim();
        if (normalized.startsWith('xpath=')) {
          normalized = normalized.slice(6);
        }

        if (scoped && normalized.startsWith('//')) {
          return `.${normalized}`;
        }

        if (!scoped && normalized.startsWith('.//')) {
          return normalized.slice(1);
        }

        return normalized;
      };

      const quoteXPathLiteral = (value: string) => {
        if (!value.includes("'")) {
          return `'${value}'`;
        }
        if (!value.includes('"')) {
          return `"${value}"`;
        }

        return `concat(${value
          .split("'")
          .map((part, index) => {
            if (index === 0) {
              return `'${part}'`;
            }
            if (!part) {
              return `"'"`;
            }
            return `"'",'${part}'`;
          })
          .join(',')})`;
      };

      const xpathCount = (xpath: string, contextNode: Node = document) => {
        try {
          return document.evaluate(
            `count(${xpath})`,
            contextNode,
            null,
            XPathResult.NUMBER_TYPE,
            null,
          ).numberValue;
        } catch {
          return Number.POSITIVE_INFINITY;
        }
      };

      const evaluateXPathElements = (
        selector: string,
        contextNode: Node = document,
        scoped = false,
      ) => {
        try {
          const xpath = normalizeXPath(selector, scoped);
          if (!xpath) {
            return [] as Element[];
          }

          const snapshot = document.evaluate(
            xpath,
            contextNode,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null,
          );
          const elements: Element[] = [];
          for (let index = 0; index < snapshot.snapshotLength; index += 1) {
            const node = snapshot.snapshotItem(index);
            if (node && node.nodeType === Node.ELEMENT_NODE) {
              elements.push(node as Element);
            }
          }
          return elements;
        } catch {
          return [] as Element[];
        }
      };

      const resolveScopeElements = (selectors: string[]) => {
        if (!selectors.length) {
          return [] as Element[];
        }

        let contexts: Node[] = [document];
        for (const selector of selectors) {
          const nextContexts: Element[] = [];
          const seen = new Set<Element>();

          for (const contextNode of contexts) {
            const scoped = contextNode.nodeType !== Node.DOCUMENT_NODE;
            const matched = evaluateXPathElements(selector, contextNode, scoped);
            for (const element of matched) {
              if (!seen.has(element)) {
                seen.add(element);
                nextContexts.push(element);
              }
            }
          }

          if (!nextContexts.length) {
            return [] as Element[];
          }

          contexts = nextContexts;
        }

        return contexts.filter(
          (node): node is Element => node.nodeType === Node.ELEMENT_NODE,
        );
      };

      const buildAbsoluteXPath = (element: Element) => {
        const parts: string[] = [];
        let current: Element | null = element;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
          const tagName = current.tagName.toLowerCase();
          let index = 1;
          let sibling = current.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === current.tagName) {
              index += 1;
            }
            sibling = sibling.previousElementSibling;
          }
          parts.unshift(`${tagName}[${index}]`);
          current = current.parentElement;
        }

        return `/${parts.join('/')}`;
      };

      const buildRelativeXPath = (element: Element, scopeRoot: Element) => {
        if (element === scopeRoot) {
          return './self::*';
        }

        const parts: string[] = [];
        let current: Element | null = element;

        while (current && current !== scopeRoot && current.nodeType === Node.ELEMENT_NODE) {
          const tagName = current.tagName.toLowerCase();
          let index = 1;
          let sibling = current.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === current.tagName) {
              index += 1;
            }
            sibling = sibling.previousElementSibling;
          }
          parts.unshift(`${tagName}[${index}]`);
          current = current.parentElement;
        }

        if (current !== scopeRoot) {
          return null;
        }

        return `./${parts.join('/')}`;
      };

      const buildTextCandidate = (
        element: Element,
        scopeRoot?: Element,
      ) => {
        const tagName = element.tagName.toLowerCase();
        const text = (
          'innerText' in element
            ? (element as HTMLElement).innerText
            : element.textContent || ''
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80);

        if (!text || text.length > 40) {
          return null;
        }

        if (scopeRoot) {
          const xpath =
            element === scopeRoot
              ? `.[self::${tagName} and normalize-space(.)=${quoteXPathLiteral(text)}]`
              : `.//${tagName}[normalize-space(.)=${quoteXPathLiteral(text)}]`;
          return xpathCount(xpath, scopeRoot) === 1 ? xpath : null;
        }

        const xpath = `//${tagName}[normalize-space(.)=${quoteXPathLiteral(text)}]`;
        return xpathCount(xpath) === 1 ? xpath : null;
      };

      const buildClassCandidate = (
        element: Element,
        scopeRoot?: Element,
      ) => {
        const tagName = element.tagName.toLowerCase();
        const classNames = Array.from(element.classList)
          .map((item) => item.trim())
          .filter((item) => item.length >= 3 && item.length <= 40)
          .slice(0, 2);

        if (classNames.length === 0) {
          return null;
        }

        const clauses = classNames.map(
          (className) =>
            `contains(concat(' ', normalize-space(@class), ' '), ' ${className} ')`,
        );

        if (scopeRoot) {
          const xpath =
            element === scopeRoot
              ? `.[self::${tagName} and ${clauses.join(' and ')}]`
              : `.//${tagName}[${clauses.join(' and ')}]`;
          return xpathCount(xpath, scopeRoot) === 1 ? xpath : null;
        }

        const xpath = `//${tagName}[${clauses.join(' and ')}]`;
        return xpathCount(xpath) === 1 ? xpath : null;
      };

      const buildAttributeCandidate = (
        element: Element,
        attributeName: string,
        scopeRoot?: Element,
      ) => {
        const value = element.getAttribute(attributeName)?.trim();
        if (!value) {
          return null;
        }

        if (scopeRoot) {
          const xpath =
            element === scopeRoot
              ? `.[@${attributeName}=${quoteXPathLiteral(value)}]`
              : `.//*[@${attributeName}=${quoteXPathLiteral(value)}]`;
          return xpathCount(xpath, scopeRoot) === 1 ? xpath : null;
        }

        const xpath = `//*[@${attributeName}=${quoteXPathLiteral(value)}]`;
        return xpathCount(xpath) === 1 ? xpath : null;
      };

      const findClosestScopeRoot = (element: Element, candidates: Element[]) => {
        if (!candidates.length) {
          return null;
        }

        const candidateSet = new Set(candidates);
        let current: Element | null = element;
        while (current) {
          if (candidateSet.has(current)) {
            return current;
          }
          current = current.parentElement;
        }

        return null;
      };

      const element = choosePreferredElement(document.elementFromPoint(x, y));
      if (!element) {
        return null;
      }

      const absoluteCandidates: string[] = [];
      const pushAbsoluteCandidate = (xpath: string | null) => {
        if (!xpath || absoluteCandidates.includes(xpath)) {
          return;
        }
        absoluteCandidates.push(xpath);
      };

      pushAbsoluteCandidate(buildAttributeCandidate(element, 'id'));
      pushAbsoluteCandidate(buildAttributeCandidate(element, 'data-testid'));
      pushAbsoluteCandidate(buildAttributeCandidate(element, 'name'));
      pushAbsoluteCandidate(buildTextCandidate(element));
      pushAbsoluteCandidate(buildClassCandidate(element));

      const absoluteXPath = buildAbsoluteXPath(element);
      pushAbsoluteCandidate(absoluteXPath);

      const scopeRoot = findClosestScopeRoot(
        element,
        resolveScopeElements(scopeChain),
      );

      const relativeCandidates: string[] = [];
      const pushRelativeCandidate = (xpath: string | null) => {
        if (!xpath || relativeCandidates.includes(xpath)) {
          return;
        }
        relativeCandidates.push(xpath);
      };

      if (scopeRoot) {
        pushRelativeCandidate(buildAttributeCandidate(element, 'id', scopeRoot));
        pushRelativeCandidate(buildAttributeCandidate(element, 'data-testid', scopeRoot));
        pushRelativeCandidate(buildAttributeCandidate(element, 'name', scopeRoot));
        pushRelativeCandidate(buildTextCandidate(element, scopeRoot));
        pushRelativeCandidate(buildClassCandidate(element, scopeRoot));
        pushRelativeCandidate(buildRelativeXPath(element, scopeRoot));
      }

      const rect = element.getBoundingClientRect();
      const textPreview = (
        'innerText' in element
          ? (element as HTMLElement).innerText
          : (element as Element).textContent || ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);

      const absolutePrimaryXpath = absoluteCandidates[0] || absoluteXPath;
      const relativePrimaryXpath = relativeCandidates[0] || undefined;
      const recommendedCandidates = relativeCandidates.length
        ? relativeCandidates
        : absoluteCandidates;

      return {
        primaryXpath: relativePrimaryXpath || absolutePrimaryXpath,
        candidateXpaths: recommendedCandidates,
        absolutePrimaryXpath,
        absoluteCandidateXpaths: absoluteCandidates,
        relativePrimaryXpath,
        relativeCandidateXpaths: relativeCandidates,
        scopeMatched: Boolean(scopeRoot),
        tagName: element.tagName.toLowerCase(),
        textPreview,
        attributes: {
          id: element.getAttribute('id') || undefined,
          className: element.getAttribute('class') || undefined,
          name: element.getAttribute('name') || undefined,
        },
        rect: {
          x: Math.max(0, rect.left),
          y: Math.max(0, rect.top),
          width: Math.max(0, rect.width),
          height: Math.max(0, rect.height),
        },
      };
    }, { x, y, scopeChain: normalizedScopeChain });

    session.selected = selection;

    return {
      sessionId: session.id,
      pageUrl: session.page.url(),
      title: await session.page.title().catch(() => ''),
      viewport: session.viewport,
      selected: selection,
    };
  }

  async performBrowserPickerAction(
    sessionId: string,
    action: 'refresh' | 'back' | 'click' | 'scroll_down',
    amount?: number,
  ) {
    const session = await this.requireBrowserPickerSession(sessionId);

    if (action === 'refresh') {
      await session.page.reload({
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await this.waitForPickerPageSettled(session.page);
      session.selected = null;
      return this.buildBrowserPickerSnapshot(session);
    }

    if (action === 'back') {
      await session.page
        .goBack({
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        })
        .catch(() => undefined);
      await this.waitForPickerPageSettled(session.page);
      session.selected = null;
      return this.buildBrowserPickerSnapshot(session);
    }

    if (action === 'scroll_down') {
      await session.page.mouse.wheel(
        0,
        Math.max(200, Math.min(amount || 900, 4000)),
      );
      await session.page.waitForTimeout(350);
      session.selected = null;
      return this.buildBrowserPickerSnapshot(session);
    }

    if (!session.selected?.primaryXpath) {
      throw new BadRequestException('请先选择一个元素');
    }

    const targetXpath =
      session.selected.absolutePrimaryXpath || session.selected.primaryXpath;
    const target = session.page.locator(`xpath=${targetXpath}`).first();
    await target.scrollIntoViewIfNeeded().catch(() => undefined);
    await target.waitFor({ state: 'visible', timeout: 5000 });
    await target.click({ timeout: 5000 });
    await this.waitForPickerPageSettled(session.page);
    session.selected = null;
    return this.buildBrowserPickerSnapshot(session);
  }

  /**
   * 返回页面最有代表性的前 4 个元素，供预览
   */
  async captureListItemsByXpath(
    url: string,
    maxItems = 3,
    minArea = 1000,
    maxArea = 500000,
    targetAspectRatio = 1,
    tolerance = 0.3,
    cookieOptions?: TaskCookieAccessOptions,
    userId?: number,
  ): Promise<ResultItem[]> {
    if (!/^https?:\/\//.test(url)) {
      throw new BadRequestException('URL 格式不正确');
    }

    let browser: playwright.Browser | undefined;

    try {
      const stealth = await createStealthPage(true);
      browser = stealth.browser;
      const page = stealth.page;

      const resolvedCookieOptions = await this.resolveTaskCookieOptions(
        userId,
        cookieOptions,
      );
      await this.applyTaskCookiesToPage(page, url, resolvedCookieOptions);
      await this.navigatePreviewPage(page, url);

      const scrollStep = 1000;
      const maxScrollDistance = 8000;
      let scrolled = 0;

      while (scrolled < maxScrollDistance) {
        await page.mouse.wheel(0, scrollStep);
        scrolled += scrollStep;
        await page.waitForTimeout(1000);
      }

      const elements = await page.$$('body *');

      type Candidate = {
        handle: playwright.ElementHandle<HTMLElement>;
        xpath: string;
        area: number;
        aspectRatio: number;
        childCount: number;
        tagTypeCount: number;
        hasImage: boolean;
      };

      const candidates: Candidate[] = [];

      for (const el of elements) {
        try {
          if (!(await el.isVisible())) continue;

          const box = await el.boundingBox();
          if (!box) continue;

          const area = box.width * box.height;
          if (area < minArea || area > maxArea) continue;

          const aspectRatio = box.width / box.height;
          if (
            aspectRatio < targetAspectRatio - tolerance ||
            aspectRatio > targetAspectRatio + tolerance
          )
            continue;

          const childCount = await el.evaluate(
            (node) => node.childElementCount,
          );
          if (childCount < 3) continue;

          const tagTypeCount = await el.evaluate((node) => {
            const tags = new Set<string>();
            node
              .querySelectorAll('*')
              .forEach((c) => tags.add(c.tagName.toLowerCase()));
            return tags.size;
          });
          if (tagTypeCount < 3) continue;

          const hasImage = await el.evaluate(
            (node) => !!node.querySelector('img'),
          );

          // const xpath = ...  // 移除这个重复声明


          // 检查父节点是否被该 xpath 命中，如果命中则持续增强 xpath 唯一性
          // 生成xpath工具，支持多策略
          const genXpath = async (el, mode = 0) => {
            return el.evaluate((node: HTMLElement, mode: number) => {
              const tag = node.tagName.toLowerCase();
              const classList = (node.className || '')
                .split(/\s+/)
                .filter(Boolean);
              // 语义关键词，优先挑最长且最特殊的 class 替换最近的"recent"这种误命中
              const keywordPattern = /(item|card|list|cell|box|entry|block)/i;
              const semanticClasses = classList.filter((c) =>
                keywordPattern.test(c),
              );
              // 按长度优先挑选
              const bestClass = semanticClasses.sort(
                (a, b) => b.length - a.length,
              )[0];
              if (mode === 0 && bestClass) {
                // 完整 class 匹配，且更精确分词，避免只命中片段
                return `//${tag}[contains(concat(' ', @class, ' '), ' ${bestClass} ')]`;
              }
              if ((mode === 0 || mode === 1) && classList.length > 0) {
                // 回退：兜底取第1个完整 class
                const c = classList[0];
                return `//${tag}[contains(concat(' ', @class, ' '), ' ${c} ')]`;
              }
              // mode 2: tag + nth-of-type
              if (node.parentElement) {
                const siblings = Array.from(node.parentElement.children).filter(
                  (s: Element) => s.tagName.toLowerCase() === tag,
                );
                if (siblings.length > 1) {
                  let idx = 1;
                  for (const sib of siblings) {
                    if (sib === node) break;
                    idx++;
                  }
                  return `//${tag}[${idx}]`;
                }
              }
              return `//${tag}`;
            }, mode);
          };

          // 生成parent的xpath
          const getParentXpath = async (el, mode = 0) => {
            return el.evaluate((node: HTMLElement, mode: number) => {
              const tag = node.tagName.toLowerCase();
              const classList = (node.className || '')
                .split(/\s+/)
                .filter(Boolean);
            const semanticClass = classList.find((c) =>
              /(item|card|list|cell|box|entry|block)/i.test(c),
            );
              if (mode === 0 && semanticClass) {
              return `//${tag}[contains(@class, '${semanticClass}')]`;
            }
              if ((mode === 0 || mode === 1) && classList.length > 0) {
              const c = classList[0].slice(0, 4);
              return `//${tag}[contains(@class, '${c}')]`;
            }
              if (node.parentElement) {
                const siblings = Array.from(node.parentElement.children).filter(
                  (s: Element) => s.tagName.toLowerCase() === tag,
                );
                if (siblings.length > 1) {
                  let idx = 1;
                  for (const sib of siblings) {
                    if (sib === node) break;
                    idx++;
                  }
                  return `//${tag}[${idx}]`;
                }
              }
            return `//${tag}`;
            }, mode);
          };

          let xpath = await genXpath(el, 0);
          let parentHandle = (await el.evaluateHandle(
            (node) => node.parentElement,
          )) as playwright.ElementHandle<HTMLElement>;
          let parentXpath = parentHandle
            ? await getParentXpath(parentHandle, 0)
            : '';
          let parentMatched = false,
            maxMode = 3,
            mode = 0;
          // 先查简单xpath是否撞父级，如果撞则 parentXpath+//+selfXpath
          while (parentHandle && mode < maxMode) {
            parentMatched = await parentHandle.evaluate((parent, xpath) => {
              if (!parent) return false;
              const r = document.evaluate(
                xpath,
                parent,
                null,
                XPathResult.ORDERED_NODE_ITERATOR_TYPE,
                null,
              );
              let node = r.iterateNext();
              while (node) {
                if (node === parent) {
                  return true;
                }
                node = r.iterateNext();
              }
              return false;
            }, xpath);
            if (!parentMatched) break;
            // 如果撞了，直接组合parentXpath与selfXpath:
            if (parentXpath && xpath) {
              xpath = parentXpath + '//' + xpath.replace(/^\//, '');
            } else {
              mode++;
              xpath = await genXpath(el, mode);
              parentXpath = await getParentXpath(parentHandle, mode);
            }
          }
          await parentHandle?.dispose();
            if (parentMatched) continue;

          candidates.push({
            handle: el as playwright.ElementHandle<HTMLElement>,
            xpath,
            area,
            aspectRatio,
            childCount,
            tagTypeCount,
            hasImage,
          });
        } catch {
          continue;
        }
      }

      const scored = candidates
        .map((c) => ({
          candidate: c,
          score:
            (c.hasImage ? 60 : 0) +
            c.childCount * 2 +
            c.tagTypeCount * 3 -
            Math.abs(targetAspectRatio - c.aspectRatio) * 10,
        }))
        .sort((a, b) => b.score - a.score);

      const results: ResultItem[] = [];
      const usedXpaths = new Set<string>();

      for (const { candidate } of scored) {
        if (results.length >= maxItems) break;

        const xpath = candidate.xpath;
        if (usedXpaths.has(xpath)) continue;

        const matchCount = await page.locator(`xpath=${xpath}`).count();

        if (matchCount < 3 || matchCount > 200) continue;

        try {
          await candidate.handle.scrollIntoViewIfNeeded();
          const buffer = await candidate.handle.screenshot({ type: 'png' });

          results.push({
            xpath,
            matchCount,
            base64: buffer.toString('base64'),
          });

          usedXpaths.add(xpath);
        } catch {
          continue;
        }
      }

      return results;
    } catch (err) {
      this.logger.error('列表结构分析失败', err);
      throw this.createTaskOperationError(err, '列表结构分析失败', {
        allowMissingBrowserHint: true,
      });
    } finally {
      if (browser) await browser.close();
    }
  }

  async parseByXpath(
    url: string,
    xpath: string,
    waitSelector?: string,
    contentFormat: 'text' | 'html' | 'markdown' | 'smart' = 'text',
    cookieOptions?: TaskCookieAccessOptions,
    userId?: number,
  ) {
    if (
      waitSelector &&
      ['text', 'html', 'markdown', 'smart'].includes(waitSelector) &&
      contentFormat === 'text'
    ) {
      contentFormat = waitSelector as 'text' | 'html' | 'markdown' | 'smart';
      waitSelector = undefined;
    }

    this.logger.debug(`parseByXpath called with contentFormat: ${contentFormat}`);

    let browser: playwright.Browser | null = null;

    try {
      const stealth = await createStealthPage(true);
      browser = stealth.browser;
      const page = stealth.page;

      const resolvedCookieOptions = await this.resolveTaskCookieOptions(
        userId,
        cookieOptions,
      );
      await this.applyTaskCookiesToPage(page, url, resolvedCookieOptions);
      this.logger.debug(`Navigating to: ${url}`);
      await this.navigatePreviewPage(page, url, waitSelector);

      if (contentFormat === 'markdown' || contentFormat === 'smart') {
        const htmlPayload = await page.evaluate(({ xpath }) => {
          const firstElement = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue as HTMLElement | null;

          if (!firstElement) {
            return null;
          }

          return {
            tag: firstElement.tagName.toLowerCase(),
            html: firstElement.outerHTML || firstElement.innerHTML || '',
          };
        }, { xpath });

        if (!htmlPayload?.html) {
          return { count: 0, items: null };
        }

        const markdown = formatHtmlFragment(
          htmlPayload.html,
          contentFormat,
          page.url(),
        );

        if (!markdown) {
          return { count: 0, items: null };
        }

        return {
          count: 1,
          items: {
            basePath: xpath,
            texts: [
              {
                xpath,
                text: markdown,
                tag: htmlPayload.tag,
              },
            ],
            images: [],
            links: [],
          },
        };
      }

      // 添加调试信息
      const pageInfo = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        const articleElements = document.querySelectorAll('article');
        const postElements = document.querySelectorAll('[id="post"]');

        return {
          totalElements: allElements.length,
          articleCount: articleElements.length,
          postElementCount: postElements.length,
          bodyHTML: document.body ? document.body.innerHTML.substring(0, 500) : 'No body',
          title: document.title,
          url: window.location.href
        };
      });

      this.logger.debug('Page info:', pageInfo);

      const pageContentFormat =
        contentFormat as 'text' | 'html' | 'markdown' | 'smart';

      const helperSource = xpathPreviewDomHelpersFactory.toString();
      const result = await page.evaluate(({ xpath, contentFormat, helperSource }) => {
        const win = window as any;
        if (typeof win.__taskXpathPreviewHelpersFactory !== 'function') {
          win.__taskXpathPreviewHelpersFactory = (0, eval)(`(${helperSource})`);
        }
        const helpers = win.__taskXpathPreviewHelpersFactory();

        function isCssLike(text: string) {
          const t = text.trim();
          if (!t) return false;
          const hasBraces = /{[^}]*}/.test(t);
          const hasCssProp =
            /(color|font|margin|padding|display|position|width|height|background|border)\s*:/i.test(
              t,
            );
          const startsSelector = /^[.#][\w-]+\s*[{:]/.test(t);
          const manySemicolons = t.split(';').length >= 3;
          return (
            hasBraces || (hasCssProp && (startsSelector || manySemicolons))
          );
        }

        // 使用 turndown 进行 markdown 转换
        function convertElementToMarkdown(element: HTMLElement): string {
          // 检查 turndown 是否已加载
          if (typeof (window as any).TurndownService === 'undefined') {
            console.error('TurndownService is not available');
            // 降级到简单文本提取
            return element.textContent?.trim() || '';
          }

          try {
            const turndownService = new (window as any).TurndownService({
              headingStyle: 'atx',
              codeBlockStyle: 'fenced',
              bulletListMarker: '-',
              emDelimiter: '*',
              strongDelimiter: '**',
            });

            // 转换 HTML 为 Markdown
            const markdown = turndownService.turndown(element.outerHTML || element.innerHTML);
            return markdown.trim();
          } catch (error) {
            console.error('Markdown conversion error:', error);
            // 降级到简单文本提取
            return element.textContent?.trim() || '';
          }
        }

        // 如果是markdown格式，直接转换第一个匹配的元素
        if (contentFormat === 'markdown') {
          // 浏览器端日志，保留用于调试
          if (typeof console !== 'undefined') {
            console.log(`Looking for markdown content with XPath: ${xpath}`);
          }

          const firstElement = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue as HTMLElement | null;

          // 浏览器端日志，保留用于调试
          if (typeof console !== 'undefined') {
            console.log(`Markdown XPath result:`, firstElement ? firstElement.tagName : 'null');
          }

          if (!firstElement) {
            return null;
          }

          const markdownContent = convertElementToMarkdown(firstElement);
          if (!markdownContent || isCssLike(markdownContent)) {
            return null;
          }

          return {
            xpath: xpath,
            texts: [{
              xpath: xpath,
              text: markdownContent,
              tag: firstElement.tagName.toLowerCase(),
            }],
            images: [],
            links: [],
          };
        }

        // 普通处理逻辑
        // 浏览器端日志，保留用于调试
        if (typeof console !== 'undefined') {
          console.log(`Looking for elements with XPath: ${xpath}`);
        }

        const matchedElements = helpers.evaluateXPathAll(xpath, document) as HTMLElement[];
        let currentIndex = 0;
        let el = matchedElements[currentIndex] || null;
        // 浏览器端日志，保留用于调试
        if (typeof console !== 'undefined') {
          console.log(`First XPath result:`, el ? el.tagName : 'null');
        }

        const candidateResults: Array<{
          xpath: string;
          texts: any[];
          images: any[];
          links: any[];
          score: number;
        }> = [];

        function getSuspiciousLinkPenalty(href: string): number {
          if (!href) return 0;

          try {
            const target = new URL(href, window.location.href);
            const host = target.hostname.toLowerCase();
            const path = target.pathname.toLowerCase();
            let penalty = 0;

            if (/^(cm|ad|ads|track|tracker)\./i.test(host)) {
              penalty += 35;
            }

            if (
              /(advert|promotion|promo|track|tracker|landing|jump)/i.test(
                `${host}${path}`,
              )
            ) {
              penalty += 20;
            }

            if (target.origin !== window.location.origin) {
              penalty += 10;
            }

            return penalty;
          } catch {
            return 0;
          }
        }

        function scoreCandidate(
          texts: any[],
          images: any[],
          links: any[],
        ): number {
          const richTexts = texts.filter(
            (item) => String(item?.text || '').trim().length >= 6,
          ).length;
          const uniqueLinkCount = new Set(
            links.map((item) => String(item?.href || '').trim()).filter(Boolean),
          ).size;
          const suspiciousPenalty = links.reduce(
            (sum, item) => sum + getSuspiciousLinkPenalty(String(item?.href || '')),
            0,
          );

          let score =
            Math.min(texts.length, 8) * 8 +
            Math.min(richTexts, 6) * 6 +
            Math.min(images.length, 4) * 12 +
            Math.min(uniqueLinkCount, 4) * 6;

          if (images.length > 0 && uniqueLinkCount > 0) {
            score += 18;
          }

          if (richTexts > 0 && uniqueLinkCount > 0) {
            score += 12;
          }

          if (texts.length === 0 && images.length === 0 && uniqueLinkCount === 1) {
            score -= 80;
          }

          return score - suspiciousPenalty;
        }

        while (el) {
          const texts: any[] = [];
          const images: any[] = [];
          const links: any[] = [];

          const tagName = el.tagName.toLowerCase();
          const basePath =
            el.children.length === 0
              ? xpath
              : helpers.buildRelativeXPath(document.body, el, matchedElements);
          const selfPath = './self::*';

          // 智能检测内容类型
          function detectContentType(element: HTMLElement): 'article' | 'list' | 'mixed' | 'simple' {
            const text = element.textContent?.trim() || '';
            const wordCount = text.split(/\s+/).length;

            // 检查是否包含典型的文章结构
            const hasHeadings = element.querySelectorAll('h1, h2, h3, h4, h5, h6').length > 0;
            const hasParagraphs = element.querySelectorAll('p').length > 2;
            const hasArticleTags = element.tagName.toLowerCase() === 'article' ||
                                  element.closest('article') !== null;
            const hasContentClass = /\b(content|post|article|entry|text)\b/i.test(element.className);

            if ((hasHeadings && hasParagraphs) || hasArticleTags || hasContentClass || wordCount > 100) {
              return 'article';
            }

            // 检查是否为列表
            const hasListItems = element.querySelectorAll('li').length > 2;
            if (hasListItems) {
              return 'list';
            }

            // 检查是否包含多种内容类型
            const hasImages = element.querySelectorAll('img').length > 0;
            const hasLinks = element.querySelectorAll('a').length > 1;
            if (hasImages || hasLinks) {
              return 'mixed';
            }

            return 'simple';
          }


          // 原有的简单HTML到Markdown转换
          function convertHtmlToMarkdown(html: string): string {
            return html
              .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
              .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
              .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
              .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
              .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n')
              .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n')
              .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
              .replace(/<br[^>]*\/?>/gi, '\n')
              .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
              .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
              .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
              .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
              .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
              .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
              .replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1')
              .replace(/<ol[^>]*>(.*?)<\/ol>/gi, '$1')
              .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
              .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n')
              .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n')
              .replace(/<[^>]+>/g, '')
              .trim();
          }

          // 节点自身文本
          let selfText: string | null = null;
          const contentType = detectContentType(el);

          if (contentFormat === 'text') {
            selfText = el.textContent?.trim() || null;
          } else if (contentFormat === 'html') {
            selfText = el.innerHTML?.trim() || null;
          } else if (contentFormat === 'smart') {
            // 智能提取模式 - 根据内容类型自动选择最佳格式
            if (contentType === 'article') {
              selfText = convertElementToMarkdown(el);
            } else if (contentType === 'list') {
              // 对于列表，使用Markdown列表格式
              selfText = convertElementToMarkdown(el);
            } else {
              // 对于简单内容，使用纯文本
              selfText = el.textContent?.trim() || null;
            }
          }
          if (selfText && !isCssLike(selfText)) {
            texts.push({
              xpath: selfPath,
              text: selfText,
              tag: tagName,
            });
          }

          // 节点自身链接
          if (tagName === 'a' && (el as HTMLAnchorElement).href) {
            links.push({
              xpath: selfPath,
              href: (el as HTMLAnchorElement).href,
            });
          }

          // 节点自身图片
          if (tagName === 'img' && (el as HTMLImageElement).src) {
            images.push({
              xpath: selfPath,
              src: (el as HTMLImageElement).src,
            });
          }

          // 遍历子节点
          if (el.children.length > 0) {
            el.querySelectorAll('*').forEach((child) => {
              const tag = child.tagName.toLowerCase();
              const isUiControl =
                tag === 'button' ||
                child.getAttribute('role') === 'button' ||
                child.closest('button') ||
                child.hasAttribute('tabindex');
              if (isUiControl) return;

              if (tag === 'img' && (child as HTMLImageElement).src) {
                images.push({
                  xpath: helpers.buildRelativeXPath(el!, child, matchedElements),
                  src: (child as HTMLImageElement).src,
                });
              }

              if (tag === 'a' && (child as HTMLAnchorElement).href) {
                links.push({
                  xpath: helpers.buildRelativeXPath(el!, child, matchedElements),
                  href: (child as HTMLAnchorElement).href,
                });
              }

              if (child.children.length === 0) {
                const t = child.textContent?.trim();
                if (t && t.length >= 1 && !isCssLike(t)) {
                  texts.push({
                    xpath: helpers.buildRelativeXPath(el!, child, matchedElements),
                    text: t,
                    tag,
                  });
                }
              }
            });
          }

          const hasCollectedContent =
            texts.length > 0 || images.length > 0 || links.length > 0;

          // 命中节点自身或其子节点里只要有任意可提取内容，就视为有效匹配
          if (!hasCollectedContent) {
            currentIndex += 1;
            el = matchedElements[currentIndex] || null;
            continue;
          }

          candidateResults.push({
            xpath: basePath,
            texts,
            images,
            links,
            score: scoreCandidate(texts, images, links),
          });

          currentIndex += 1;
          el = matchedElements[currentIndex] || null;
        }

        if (candidateResults.length === 0) {
          return null;
        }

        candidateResults.sort((left, right) => right.score - left.score);
        return {
          xpath: candidateResults[0].xpath,
          texts: candidateResults[0].texts,
          images: candidateResults[0].images,
          links: candidateResults[0].links,
        };
      }, { xpath, contentFormat: pageContentFormat, helperSource });

      if (!result) return { count: 0, items: null };
      return { count: 1, items: result };
    } catch (e) {
      this.logger.error('XPath 解析失败', e);
      throw this.createTaskOperationError(e, 'XPath 解析失败', {
        allowMissingBrowserHint: true,
      });
    } finally {
      if (browser) await browser.close();
    }
  }

  async matchByXpath(
    url: string,
    xpath: string,
    cookieOptions?: TaskCookieAccessOptions,
    userId?: number,
  ) {
    let browser: playwright.Browser | null = null;

    try {
      const stealth = await createStealthPage(true);
      browser = stealth.browser;
      const page = stealth.page;

      const resolvedCookieOptions = await this.resolveTaskCookieOptions(
        userId,
        cookieOptions,
      );
      await this.applyTaskCookiesToPage(page, url, resolvedCookieOptions);
      await this.navigatePreviewPage(page, url);

      return await page.evaluate((xp) => {
        const snapshot = document.evaluate(
          xp,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );

        const texts: string[] = [];

        for (let i = 0; i < snapshot.snapshotLength; i++) {
          const node = snapshot.snapshotItem(i) as HTMLElement;
          const text = node?.textContent?.trim();
          if (text) texts.push(text);
        }

        return {
          count: snapshot.snapshotLength,
          samples: texts.slice(0, 10),
        };
      }, xpath);
    } catch (e) {
      this.logger.error('XPath 匹配失败', e);
      throw this.createTaskOperationError(e, 'XPath 匹配失败', {
        allowMissingBrowserHint: true,
      });
    } finally {
      if (browser) await browser.close();
    }
  }

  async validateXpath(
    url: string,
    xpath: string,
    baseXpath?: string,
    sampleMode: 'list' | 'example' = 'list',
    cookieOptions?: TaskCookieAccessOptions,
    userId?: number,
  ): Promise<XpathValidationResult> {
    let browser: playwright.Browser | null = null;

    try {
      const stealth = await createStealthPage(true);
      browser = stealth.browser;
      const page = stealth.page;

      await this.injectXpathPreviewHelpers(page);
      const resolvedCookieOptions = await this.resolveTaskCookieOptions(
        userId,
        cookieOptions,
      );
      await this.applyTaskCookiesToPage(page, url, resolvedCookieOptions);
      await this.navigatePreviewPage(page, url);

      const helperSource = xpathPreviewDomHelpersFactory.toString();
      const relativeScoped = isRelativeScopedXPath(xpath);
      return await page.evaluate(({ xpath, baseXpath, sampleMode, helperSource, relativeScoped }) => {
        const win = window as any;
        if (typeof win.__taskXpathPreviewHelpersFactory !== 'function') {
          win.__taskXpathPreviewHelpersFactory = (0, eval)(`(${helperSource})`);
        }
        const helpers = win.__taskXpathPreviewHelpersFactory();

        if (baseXpath && relativeScoped) {
          const baseElements = helpers.evaluateXPathAll(baseXpath, document);
          if (sampleMode === 'example') {
            const exampleBaseElement = baseElements[0];
            if (!exampleBaseElement) {
              return {
                scope: 'list',
                status: 'empty_base',
                baseCount: 0,
                sampledBaseCount: 0,
                matchedItemCount: 0,
                zeroMatchCount: 0,
                multiMatchCount: 0,
                maxMatchCount: 0,
                counts: [],
                signatureSamples: [],
                items: [],
              };
            }

            const matches = helpers.evaluateXPathAll(xpath, exampleBaseElement);
            const exampleItem = {
              index: 0,
              matchCount: matches.length,
              values: [...new Set(matches.map((match: Element) => helpers.getElementValue(match)).filter(Boolean))].slice(
                0,
                3,
              ),
              signatures: [],
            };

            return {
              scope: 'list',
              status:
                exampleItem.matchCount === 0
                  ? 'missing'
                  : exampleItem.matchCount === 1
                    ? 'stable'
                    : 'ambiguous',
              baseCount: baseElements.length,
              sampledBaseCount: 1,
              matchedItemCount: exampleItem.matchCount > 0 ? 1 : 0,
              zeroMatchCount: exampleItem.matchCount === 0 ? 1 : 0,
              multiMatchCount: exampleItem.matchCount > 1 ? 1 : 0,
              maxMatchCount: exampleItem.matchCount,
              counts: [exampleItem.matchCount],
              signatureSamples: exampleItem.signatures,
              items: [exampleItem],
            };
          }
          return helpers.validateRelativeXPath(baseElements, xpath);
        }

        const matches = helpers.evaluateXPathAll(xpath, document);
        const samples = [...new Set(matches.map((match: Element) => helpers.getElementValue(match)).filter(Boolean))].slice(
          0,
          10,
        );
        const signatureSamples: string[] = [];

        return {
          scope: 'page',
          status:
            matches.length === 0
              ? 'missing'
              : matches.length === 1
                ? 'stable'
                : 'ambiguous',
          count: matches.length,
          samples,
          signatureSamples,
        };
      }, { xpath, baseXpath, sampleMode, helperSource, relativeScoped });
    } catch (e) {
      this.logger.error('XPath 校验失败', e);
      throw this.createTaskOperationError(e, 'XPath 校验失败', {
        allowMissingBrowserHint: true,
      });
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * 提取 XPath 命中的所有基础节点及其子内容
   */
  async parseByXpathAll(
    url: string,
    xpath: string,
    cookieOptions?: TaskCookieAccessOptions,
    userId?: number,
  ) {
    let browser: playwright.Browser | null = null;

    try {
      const stealth = await createStealthPage(true);
      browser = stealth.browser;
      const page = stealth.page;

      await this.injectXpathPreviewHelpers(page);
      const resolvedCookieOptions = await this.resolveTaskCookieOptions(
        userId,
        cookieOptions,
      );
      await this.applyTaskCookiesToPage(page, url, resolvedCookieOptions);
      await this.navigatePreviewPage(page, url);

      const helperSource = xpathPreviewDomHelpersFactory.toString();
      const result = await page.evaluate(({ xpath, helperSource }) => {
        const win = window as any;
        if (typeof win.__taskXpathPreviewHelpersFactory !== 'function') {
          win.__taskXpathPreviewHelpersFactory = (0, eval)(`(${helperSource})`);
        }
        const helpers = win.__taskXpathPreviewHelpersFactory();
        const elements = helpers.evaluateXPathAll(xpath, document) as HTMLElement[];

        const items = elements.map((baseEl: HTMLElement) => {
          const texts: any[] = [];
          const images: any[] = [];
          const links: any[] = [];

          baseEl.querySelectorAll('*').forEach((el) => {
            const tag = el.tagName.toLowerCase();

            // 排除 UI 控件
            const isUiControl =
              tag === 'button' ||
              el.getAttribute('role') === 'button' ||
              el.closest('button') ||
              el.hasAttribute('tabindex');
            if (isUiControl) return;

            // 图片
            if (tag === 'img' && (el as HTMLImageElement).src) {
              images.push({
                xpath: helpers.buildRelativeXPath(baseEl, el, elements),
                src: (el as HTMLImageElement).src,
              });
            }

            // 链接
            if (tag === 'a' && (el as HTMLAnchorElement).href) {
              links.push({
                xpath: helpers.buildRelativeXPath(baseEl, el, elements),
                href: (el as HTMLAnchorElement).href,
              });
            }

            // 文本（没有子元素）
            if (el.children.length === 0) {
              const text = el.textContent?.trim();
              if (text && text.length >= 1) {
                texts.push({
                  xpath: helpers.buildRelativeXPath(baseEl, el, elements),
                  text,
                  tag,
                });
              }
            }
          });

          return {
            xpath: helpers.buildRelativeXPath(document.body, baseEl, elements),
            texts,
            images,
            links,
          };
        });

        return items;
      }, { xpath, helperSource });

      return {
        count: result.length,
        items: result,
      };
    } catch (e) {
      this.logger.error('XPath 解析全部节点失败', e);
      throw this.createTaskOperationError(e, 'XPath 解析失败', {
        allowMissingBrowserHint: true,
      });
    } finally {
      if (browser) await browser.close();
    }
  }

  async executeTaskByCrawlee(
    taskId?: string,
    taskName?: string,
    url?: string,
    customConfig?: CrawleeTaskConfig,
    overrideConfig?: Partial<CrawleeTaskConfig>,
    userId?: number,
  ) {
    let task;
    const runtimeCustomConfig = customConfig
      ? (sanitizeTaskConfig(customConfig, {
          allowInlineCookieString: true,
        }) as CrawleeTaskConfig)
      : undefined;
    const persistedCustomConfig = runtimeCustomConfig
      ? (sanitizeTaskConfig(runtimeCustomConfig, {
          allowInlineCookieString: false,
        }) as CrawleeTaskConfig)
      : undefined;

    this.ensureUnsafeCustomJsAllowed(runtimeCustomConfig, '任务配置');

    if (taskId) {
      // 使用现有任务
      task = await this.taskRepository.findOne({
        where: { id: parseInt(taskId) },
        relations: ['user'],
      });
      if (!task) {
        throw new BadRequestException('任务不存在');
      }
      // 检查任务是否属于当前用户
      if (task.user.id !== userId) {
        throw new BadRequestException('无权限访问此任务');
      }
    } else {
      // 创建新任务
      if (!taskName || !url) {
        throw new BadRequestException('创建新任务需要提供任务名称和URL');
      }

      const newTask = this.taskRepository.create({
        name: taskName,
        url: url,
        config: persistedCustomConfig
          ? this.serializeTaskConfig(persistedCustomConfig)
          : '{}',
        status: 'pending',
        userId,
        user: { id: userId } as any, // 关联当前用户
      });
      task = await this.taskRepository.save(newTask);

      // 广播新任务创建消息
      this.taskGateway.broadcastTaskCreated({
        id: task.id,
        name: task.name,
        url: task.url,
        status: task.status,
        progress: 0,
        folder: task.folder || null,
        tags: task.tags || [],
        isFavorite: Boolean(task.isFavorite),
        lastExecutionTime: null,
        createdAt: task.createdAt.toISOString(),
        endTime: task.endTime?.toISOString() || null,
        latestExecution: null,
      }, task.userId ?? userId);
    }

    // 创建执行记录
    const execution = this.executionRepository.create({
      task,
      taskId: task.id,
      status: 'running',
      log: '开始执行任务...',
    });
    await this.executionRepository.save(execution);

    try {
      // 解析配置
      let config: CrawleeTaskConfig;
      if (runtimeCustomConfig) {
        config = runtimeCustomConfig;
      } else if (task.config) {
        config = this.parseTaskConfig(task.config, true) as CrawleeTaskConfig;
        await this.maybePersistRedactedTaskConfig(task, config);
      } else {
        throw new BadRequestException('任务配置为空');
      }

      // 应用覆盖配置
      if (overrideConfig) {
        config = { ...config, ...overrideConfig };
      }

      config = sanitizeTaskConfig(config, {
        allowInlineCookieString: true,
      }) as CrawleeTaskConfig;
      this.ensureUnsafeCustomJsAllowed(config, '任务配置');
      config = await this.resolveTaskRuntimeConfig(
        config,
        task.userId ?? userId,
        task.url,
      );

      // 补齐默认配置，默认使用 PlaywrightCrawler
      const defaultConfig: CrawleeTaskConfig = {
        crawlerType: 'playwright', // 默认使用 PlaywrightCrawler
        urls: [task.url],
        maxRequestsPerCrawl: 1,
        maxConcurrency: 1,
        headless: true,
        viewport: { width: 1920, height: 1080 },
        scrollEnabled: false,
        scrollDistance: 1000,
        scrollDelay: 1000,
        maxScrollDistance: 10000,
        useCookie: false,
        resultFilters: [],
      };

      config = { ...defaultConfig, ...config };
      await this.storeExecutionRuntimeCookie(execution.id, config);

      // 将任务添加到Crawlee引擎队列
      await this.crawleeEngineService.addTaskToQueue({
        taskId: task.id,
        executionId: execution.id,
        config,
      });

      return {
        executionId: execution.id,
        status: 'queued',
        message: '任务已添加到爬虫队列，等待执行',
        queueStatus: this.crawleeEngineService.getQueueStatus(),
      };
    } catch (error) {
      // 更新执行状态为失败
      execution.status = 'failed';
      execution.log = `执行失败: ${error.message}`;
      await this.executionRepository.save(execution);

      await this.notificationService.createTaskExecutionNotification({
        userId,
        taskId: task.id,
        taskName: task.name,
        executionId: execution.id,
        status: 'failed',
        log: execution.log,
      });

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(`任务执行失败: ${error.message}`);
    }
  }

  /**
   * 获取爬虫引擎状态
   */
  getCrawlerEngineStatus() {
    return this.crawleeEngineService.getQueueStatus();
  }

  /**
   * 根据状态和执行日志推断任务进度
   */
  private calculateProgress(status: string, log?: string): number {
    if (status === 'success') {
      return 100;
    }

    if (status === 'failed') {
      return 0;
    }

    if (status === 'pending') {
      return 0;
    }

    if (status === 'stopping') {
      if (log) {
        const percentMatch = log.match(/(\d+)%/);
        if (percentMatch) {
          return Math.max(80, Math.min(parseInt(percentMatch[1]), 99));
        }
      }

      return 95;
    }

    if (status === 'running') {
      // 尝试从日志中解析进度
      if (log) {
        // 查找类似 "已处理 50/100 个请求" 的模式
        const progressMatch = log.match(/已处理\s*(\d+)\/(\d+)/);
        if (progressMatch) {
          const current = parseInt(progressMatch[1]);
          const total = parseInt(progressMatch[2]);
          if (total > 0) {
            return Math.round((current / total) * 100);
          }
        }

        // 查找类似 "处理中... 75%" 的模式
        const percentMatch = log.match(/(\d+)%/);
        if (percentMatch) {
          return Math.min(parseInt(percentMatch[1]), 95); // 最高95%，留5%给完成
        }
      }

      // 默认运行中进度
      return 50;
    }

    return 0;
  }

  async deleteTask(taskId: number, userId: number) {
    // 检查任务是否存在且属于当前用户
    const task = await this.taskRepository.findOne({
      where: { id: taskId, user: { id: userId } },
    });

    if (!task) {
      throw new BadRequestException('任务不存在或无权限访问');
    }

    return this.removeTaskAndArtifacts(task, userId);
  }

  async deleteTaskByNameAndUrl(taskName: string, taskUrl: string, userId: number) {
    // 检查任务是否存在且属于当前用户
    const task = await this.taskRepository.findOne({
      where: {
        name: taskName,
        url: taskUrl,
        user: { id: userId }
      },
    });

    if (!task) {
      throw new BadRequestException('任务不存在或无权限访问');
    }

    return this.removeTaskAndArtifacts(task, userId);
  }

  private async removeTaskAndArtifacts(task: Task, userId: number) {
    const fs = require('fs').promises;

    const executions = await this.executionRepository.find({
      where: { taskId: task.id },
      select: ['id', 'resultPath'],
    });

    for (const execution of executions) {
      if (!execution.resultPath) {
        continue;
      }

      try {
        await fs.unlink(execution.resultPath);
        this.logger.log(`删除结果文件: ${execution.resultPath}`);
      } catch (error) {
        this.logger.warn(`删除结果文件失败: ${execution.resultPath}`, error);
      }
    }

    if (task.screenshotPath) {
      const screenshotFullPath = `uploads/${task.screenshotPath}`;
      try {
        await fs.unlink(screenshotFullPath);
        this.logger.log(`删除截图文件: ${screenshotFullPath}`);
      } catch (error) {
        this.logger.warn(`删除截图文件失败: ${screenshotFullPath}`, error);
      }
    }

    await this.executionRepository.delete({ taskId: task.id });
    await this.taskRepository.delete(task.id);

    this.taskGateway.broadcastTaskDeleted(task.id, task.name, task.url, userId);

    return { message: '任务删除成功' };
  }

  async updateTaskOrganization(
    taskId: number,
    userId: number,
    organization: {
      folder?: string | null;
      tags?: string[];
      isFavorite?: boolean;
    },
  ) {
    const task = await this.taskRepository.findOne({
      where: { id: taskId, userId },
    });

    if (!task) {
      throw new BadRequestException('任务不存在或无权限访问');
    }

    if (Object.prototype.hasOwnProperty.call(organization, 'folder')) {
      task.folder = this.normalizeFolder(organization.folder);
    }

    if (Object.prototype.hasOwnProperty.call(organization, 'tags')) {
      task.tags = this.normalizeTags(organization.tags);
    }

    if (typeof organization.isFavorite === 'boolean') {
      task.isFavorite = organization.isFavorite;
    }

    const savedTask = await this.taskRepository.save(task);

    return {
      id: savedTask.id,
      folder: savedTask.folder || null,
      tags: savedTask.tags || [],
      isFavorite: Boolean(savedTask.isFavorite),
    };
  }

  async getTaskOrganizationOptions(userId: number) {
    const tasks = await this.taskRepository.find({
      where: { userId },
      select: ['id', 'folder', 'tags', 'isFavorite'],
    });

    const folders = Array.from(
      new Set(
        tasks
          .map((task) => this.normalizeFolder(task.folder))
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'));

    const tags = Array.from(
      new Set(
        tasks.flatMap((task) => this.normalizeTags(task.tags)),
      ),
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'));

    return {
      folders,
      tags,
      favoriteCount: tasks.filter((task) => task.isFavorite).length,
    };
  }

  async getWorkspaceOverview(userId: number) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const queueStatus = this.crawleeEngineService.getQueueStatus();

    const [
      totalTasks,
      successTasks,
      failedTasks,
      runningTasks,
      todayExecutions,
      todaySuccessExecutions,
      todayFailedExecutions,
      recentFailedExecutions,
      pendingExceptions,
      organizationOptions,
    ] = await Promise.all([
      this.taskRepository.count({ where: { userId } }),
      this.taskRepository.count({ where: { userId, status: 'success' } }),
      this.taskRepository.count({ where: { userId, status: 'failed' } }),
      this.taskRepository
        .createQueryBuilder('task')
        .where('task.userId = :userId', { userId })
        .andWhere('task.status IN (:...statuses)', {
          statuses: ['running', 'stopping'],
        })
        .getCount(),
      this.executionRepository
        .createQueryBuilder('execution')
        .leftJoin('execution.task', 'task')
        .where('task.userId = :userId', { userId })
        .andWhere('execution.startTime >= :todayStart', { todayStart })
        .andWhere('execution.startTime < :tomorrowStart', { tomorrowStart })
        .getCount(),
      this.executionRepository
        .createQueryBuilder('execution')
        .leftJoin('execution.task', 'task')
        .where('task.userId = :userId', { userId })
        .andWhere('execution.status = :status', { status: 'success' })
        .andWhere('execution.startTime >= :todayStart', { todayStart })
        .andWhere('execution.startTime < :tomorrowStart', { tomorrowStart })
        .getCount(),
      this.executionRepository
        .createQueryBuilder('execution')
        .leftJoin('execution.task', 'task')
        .where('task.userId = :userId', { userId })
        .andWhere('execution.status = :status', { status: 'failed' })
        .andWhere('execution.startTime >= :todayStart', { todayStart })
        .andWhere('execution.startTime < :tomorrowStart', { tomorrowStart })
        .getCount(),
      this.executionRepository
        .createQueryBuilder('execution')
        .leftJoinAndSelect('execution.task', 'task')
        .where('task.userId = :userId', { userId })
        .andWhere('execution.status = :status', { status: 'failed' })
        .orderBy('execution.startTime', 'DESC')
        .take(5)
        .getMany(),
      this.notificationService.getPendingExceptions(userId, 5),
      this.getTaskOrganizationOptions(userId),
    ]);

    return {
      runtime: {
        totalTasks,
        runningTasks,
        successTasks,
        failedTasks,
        queueLength: queueStatus.queueLength,
        isProcessing: queueStatus.isProcessing,
        queuedTasks: queueStatus.queuedTasks,
      },
      today: {
        executions: todayExecutions,
        success: todaySuccessExecutions,
        failed: todayFailedExecutions,
      },
      recentFailedTasks: recentFailedExecutions.map((execution) => ({
        executionId: execution.id,
        taskId: execution.taskId,
        taskName: execution.task?.name || `任务 #${execution.taskId}`,
        taskUrl: execution.task?.url || '',
        log: execution.log || '',
        startTime: execution.startTime,
        endTime: execution.endTime,
      })),
      pendingExceptions,
      organization: {
        folders: organizationOptions.folders.length,
        tags: organizationOptions.tags.length,
        favorites: organizationOptions.favoriteCount,
      },
    };
  }

  async getTaskList(
    userId: number,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      folder?: string;
      tag?: string;
      favoriteOnly?: boolean;
    },
  ) {
    const {
      page = 1,
      limit = 10,
      search,
      folder,
      tag,
      favoriteOnly,
    } = options;
    const skip = (page - 1) * limit;

    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId })
      .orderBy('task.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (search) {
      queryBuilder.andWhere(
        '(task.name LIKE :search OR task.url LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (folder) {
      queryBuilder.andWhere('task.folder = :folder', { folder });
    }

    if (tag) {
      const tagPattern = `%\"${tag.replace(/"/g, '\\"')}\"%`;
      queryBuilder.andWhere('task.tags LIKE :tagPattern', { tagPattern });
    }

    if (favoriteOnly) {
      queryBuilder.andWhere('task.isFavorite = :isFavorite', { isFavorite: true });
    }

    const [tasks, total] = await queryBuilder.getManyAndCount();

    const taskIds = tasks.map(task => task.id);
    let latestExecutions: any[] = [];
    if (taskIds.length > 0) {
      latestExecutions = await this.executionRepository
        .createQueryBuilder('execution')
        .where('execution.taskId IN (:...taskIds)', { taskIds })
        .orderBy('execution.startTime', 'DESC')
        .getMany();
    }

    const executionsByTaskId = new Map<number, typeof latestExecutions[0]>();
    for (const execution of latestExecutions) {
      if (!executionsByTaskId.has(execution.taskId)) {
        executionsByTaskId.set(execution.taskId, execution);
      }
    }

    const taskList = tasks.map(task => {
      const latestExecution = executionsByTaskId.get(task.id);

      let status = task.status;
      let progress = 0;
      let lastExecutionTime: Date | null = null;

      if (latestExecution) {
        status = latestExecution.status;
        lastExecutionTime = latestExecution.startTime;
        progress = this.calculateProgress(status, latestExecution.log);
      }

      return {
        id: task.id,
        name: task.name,
        url: task.url,
        status,
        progress,
        config: task.config
          ? this.serializeTaskConfig(this.parseTaskConfig(task.config, false))
          : undefined,
        script: task.script,
        folder: task.folder || null,
        tags: task.tags || [],
        isFavorite: Boolean(task.isFavorite),
        lastExecutionTime,
        createdAt: task.createdAt,
        endTime: task.endTime,
        screenshotPath: task.screenshotPath,
        latestExecution: latestExecution ? {
          id: latestExecution.id,
          status: latestExecution.status,
          log: latestExecution.log,
          startTime: latestExecution.startTime,
          endTime: latestExecution.endTime,
          resultPath: latestExecution.resultPath,
        } : null,
      };
    });

    return {
      data: taskList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        folder: folder || null,
        tag: tag || null,
        favoriteOnly: Boolean(favoriteOnly),
      },
    };
  }

  async getExecutionResult(executionId: number, userId: number) {
    // 获取执行记录
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
      relations: ['task', 'task.user'],
    });

    if (!execution) {
      throw new BadRequestException('执行记录不存在');
    }

    // 检查任务是否属于当前用户
    if (execution.task.user?.id !== userId) {
      throw new BadRequestException('无权限访问此执行结果');
    }

    // 如果有结果文件路径，读取文件内容
    if (execution.resultPath) {
      const fs = require('fs').promises;
      try {
        const fileContent = await fs.readFile(execution.resultPath, 'utf-8');
        const results = JSON.parse(fileContent);
        return {
          executionId: execution.id,
          taskId: execution.task.id,
          taskName: execution.task.name,
          status: execution.status,
          resultCount: results.length,
          results,
          createdAt: execution.startTime,
        };
      } catch (error) {
        throw new InternalServerErrorException('读取结果文件失败');
      }
    }

    return {
      executionId: execution.id,
      taskId: execution.task.id,
      taskName: execution.task.name,
      status: execution.status,
      resultCount: 0,
      results: [],
      createdAt: execution.startTime,
    };
  }

  /**
   * 根据执行结果JSON文件进行打包
   */
  async packageExecutionResult(
    executionId: number,
    userId: number,
    packageConfig: any,
  ): Promise<string> {
    // 获取执行记录
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
      relations: ['task', 'task.user'],
    });

    if (!execution) {
      throw new BadRequestException('执行记录不存在');
    }

    // 检查任务是否属于当前用户
    if (execution.task.user?.id !== userId) {
      throw new BadRequestException('无权限访问此执行结果');
    }

    // 检查是否有结果文件
    if (!execution.resultPath) {
      throw new BadRequestException('执行结果不存在，无法打包');
    }

    // 检查结果文件是否为JSON
    if (!execution.resultPath.toLowerCase().endsWith('.json')) {
      throw new BadRequestException('只能打包JSON格式的执行结果');
    }

    const fs = require('fs').promises;
    
    try {
      // 读取JSON结果文件
      const fileContent = await fs.readFile(execution.resultPath, 'utf-8');
      const results = JSON.parse(fileContent);

      if (!Array.isArray(results) || results.length === 0) {
        throw new BadRequestException('结果数据为空，无法打包');
      }

      // 生成打包文件路径
      const path = require('path');
      const timestamp = Date.now();
      const packageFilename = `task_${execution.task.id}_exec_${executionId}_package_${timestamp}.zip`;
      const packagePath = `uploads/results/${packageFilename}`;

      // 确保目录存在
      const packageDir = path.dirname(packagePath);
      await fs.mkdir(packageDir, { recursive: true });

      let taskConfig = this.parseTaskConfig(
        execution.task.config,
        false,
      ) as Partial<CrawleeTaskConfig>;
      const executionRuntimeCookie = this.resolveExecutionRuntimeCookie(execution);

      if (executionRuntimeCookie.useCookie && !taskConfig.cookieCredentialId) {
        taskConfig = {
          ...taskConfig,
          ...executionRuntimeCookie,
        };
      }

      if (taskConfig.useCookie && !taskConfig.cookieString) {
        taskConfig = await this.resolveTaskRuntimeConfig(
          taskConfig as CrawleeTaskConfig,
          userId,
          execution.task.url,
        );
      }

      // 调用打包服务
      await this.filePackageService.packageDataFromJson(
        results,
        packageConfig,
        packagePath,
        execution.task.id,
        executionId,
        {
          useCookie: Boolean(taskConfig.useCookie && taskConfig.cookieString),
          cookieString: taskConfig.cookieString,
          cookieDomain:
            taskConfig.cookieDomain ||
            getCookieMatchDomain(taskConfig, execution.task.url),
          fallbackUrl: execution.task.url,
        },
      );

      return packagePath;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(`打包失败: ${error.message}`);
    }
  }

  async getStatistics(userId: number) {
    try {
      this.logger.debug(`开始获取用户统计数据，userId: ${userId}`);

      // 获取用户的所有任务
      const tasks = await this.taskRepository.find({
        where: { user: { id: userId } },
        relations: ['user'],
      });
      this.logger.debug(`获取到任务数量: ${tasks.length}`);

      // 获取用户的所有执行记录
      const executions = await this.executionRepository
        .createQueryBuilder('execution')
        .leftJoinAndSelect('execution.task', 'task')
        .leftJoinAndSelect('task.user', 'user')
        .where('user.id = :userId', { userId })
        .orderBy('execution.startTime', 'DESC')
        .getMany();
      this.logger.debug(`获取到执行记录数量: ${executions.length}`);

      // 计算基础统计
      const totalTasks = tasks.length;
      const successTasks = tasks.filter(task => task.status === 'success').length;
      const runningTasks = tasks.filter(task => ['running', 'stopping'].includes(task.status)).length;
      const failedTasks = tasks.filter(task => task.status === 'failed').length;
      const successRate = totalTasks > 0 ? Math.round((successTasks / totalTasks) * 100) : 0;

      // 生成趋势数据（最近7天）
      const trendData = this.generateTrendData(executions);

      // 生成成功率趋势数据
      const successRateData = this.generateSuccessRateData(executions);

      // 生成数据量分布（异步读取文件）
      const dataDistribution = await this.generateDataDistribution(executions);

      // 生成执行时间分布
      const timeDistribution = this.generateTimeDistribution(executions);

      // 生成任务类型分布
      const taskTypeDistribution = this.generateTaskTypeDistribution(tasks);

      // 获取最近执行记录 - 添加安全检查，使用真实数据量
      const recentExecutions = await Promise.all(
        executions.slice(0, 10).map(async (execution) => {
          // 确保 execution.task 存在
          if (!execution.task) {
            this.logger.warn(`Execution ${execution.id} has no associated task`);
            return null;
          }

          // 从结果文件读取真实数据量
          const resultCount = await this.getResultCount(execution.resultPath);

          return {
            id: execution.id,
            taskName: execution.task.name || '未知任务',
            url: execution.task.url || '',
            status: execution.status || 'unknown',
            resultCount: resultCount,
            createdAt: execution.startTime ? execution.startTime.toISOString() : new Date().toISOString(),
          };
        })
      );
      const filteredRecentExecutions = recentExecutions.filter(Boolean); // 过滤掉 null 值

      return {
        totalTasks,
        successTasks,
        runningTasks,
        failedTasks,
        successRate,
        trendData,
        successRateData,
        dataDistribution,
        timeDistribution,
        taskTypeDistribution,
        recentExecutions: filteredRecentExecutions,
      };
    } catch (error) {
      this.logger.error('获取统计数据失败', error);
      throw new InternalServerErrorException(`获取统计数据失败: ${error.message}`);
    }
  }

  private generateTrendData(executions: any[]) {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // 设置为当天的00:00:00
    
    // 生成最近7天的日期
    const dailyStats: Array<{ day: string; success: number; failed: number; total: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // 格式化日期为 "MM-DD" 格式
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${month}-${day}`;
      
      // 筛选当天的执行记录
      const dayExecutions = executions.filter(exec => {
        if (!exec.startTime) return false;
        try {
          const execDate = new Date(exec.startTime);
          execDate.setHours(0, 0, 0, 0);
          return execDate.getTime() === date.getTime();
        } catch (error) {
          this.logger.warn(`Invalid startTime for execution: ${exec.id}, ${exec.startTime}`);
          return false;
        }
      });

      dailyStats.push({
        day: dateStr,
        success: dayExecutions.filter(exec => exec.status === 'success').length,
        failed: dayExecutions.filter(exec => exec.status === 'failed').length,
        total: dayExecutions.length,
      });
    }

    return dailyStats;
  }

  private generateSuccessRateData(executions: any[]) {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // 设置为当天的00:00:00
    
    // 生成最近7天的日期
    const successRateData: Array<{ day: string; rate: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // 格式化日期为 "MM-DD" 格式
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${month}-${day}`;
      
      // 筛选当天的执行记录
      const dayExecutions = executions.filter(exec => {
        if (!exec.startTime) return false;
        try {
          const execDate = new Date(exec.startTime);
          execDate.setHours(0, 0, 0, 0);
          return execDate.getTime() === date.getTime();
        } catch (error) {
          return false;
        }
      });

      const successCount = dayExecutions.filter(exec => exec.status === 'success').length;
      const totalCount = dayExecutions.length;
      const rate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

      successRateData.push({
        day: dateStr,
        rate,
      });
    }

    return successRateData;
  }

  private async generateDataDistribution(executions: any[]) {
    // 异步读取所有执行记录的数据量
    const counts = await Promise.all(
      executions.map(exec => this.getResultCount(exec.resultPath))
    );

    const distribution = counts.reduce((acc, count) => {
      if (count === 0) return acc;
      else if (count <= 100) acc.small++;
      else if (count <= 1000) acc.medium++;
      else acc.large++;
      return acc;
    }, { small: 0, medium: 0, large: 0 });

    return [
      { name: '小数据量(0-100)', value: distribution.small, color: '#3B82F6' },
      { name: '中数据量(100-1000)', value: distribution.medium, color: '#10B981' },
      { name: '大数据量(1000+)', value: distribution.large, color: '#F59E0B' },
    ].filter(item => item.value > 0);
  }

  private generateTimeDistribution(executions: any[]) {
    const distribution = executions.reduce((acc, exec) => {
      if (!exec.startTime || !exec.endTime) return acc;

      try {
        const startTime = new Date(exec.startTime);
        const endTime = new Date(exec.endTime);

        // 确保日期有效
        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return acc;

        const duration = endTime.getTime() - startTime.getTime();
        const seconds = duration / 1000;

        if (seconds <= 30) acc.fast++;
        else if (seconds <= 120) acc.medium++;
        else if (seconds <= 600) acc.slow++;
        else acc.verySlow++;
      } catch (error) {
        this.logger.warn(`Failed to calculate duration for execution: ${exec.id}`, error);
        // 跳过这个执行记录
      }

      return acc;
    }, { fast: 0, medium: 0, slow: 0, verySlow: 0 });

    return [
      { name: '快速(<30s)', value: distribution.fast, color: '#10B981' },
      { name: '中等(30s-2min)', value: distribution.medium, color: '#3B82F6' },
      { name: '较慢(2-10min)', value: distribution.slow, color: '#F59E0B' },
      { name: '很慢(10min+)', value: distribution.verySlow, color: '#EF4444' },
    ].filter(item => item.value > 0);
  }

  private generateTaskTypeDistribution(tasks: any[]) {
    const distribution = tasks.reduce((acc, task) => {
      let crawlerType = 'playwright'; // 默认值

      if (task.config) {
        try {
          const config = JSON.parse(task.config);
          crawlerType = config.crawlerType || 'playwright';
        } catch (error) {
          this.logger.warn(`Failed to parse task config: ${task.id}`, error);
          // 使用默认值
        }
      }

      if (crawlerType === 'playwright') acc.playwright++;
      else if (crawlerType === 'cheerio') acc.cheerio++;
      else if (crawlerType === 'puppeteer') acc.puppeteer++;
      else acc.other++;

      return acc;
    }, { playwright: 0, cheerio: 0, puppeteer: 0, other: 0 });

    return [
      { name: '网页爬取', value: distribution.playwright, color: '#3B82F6' },
      { name: 'API接口', value: distribution.cheerio, color: '#10B981' },
      { name: '文件下载', value: distribution.puppeteer, color: '#F59E0B' },
      { name: '其他', value: distribution.other, color: '#8B5CF6' },
    ].filter(item => item.value > 0);
  }

  private normalizeFolder(folder?: string | null) {
    const normalized = String(folder ?? '').trim();
    return normalized || null;
  }

  private normalizeTags(tags?: string[] | null) {
    if (!Array.isArray(tags)) {
      return [];
    }

    return Array.from(
      new Set(
        tags
          .map((tag) => String(tag ?? '').trim())
          .filter(Boolean),
      ),
    ).slice(0, 12);
  }

  private async getResultCount(resultPath: string | null): Promise<number> {
    if (!resultPath) return 0;

    try {
      const fs = require('fs').promises;
      const fileContent = await fs.readFile(resultPath, 'utf-8');
      const results = JSON.parse(fileContent);
      return Array.isArray(results) ? results.length : 0;
    } catch (error) {
      this.logger.warn(`读取结果文件失败 ${resultPath}`, error);
      return 0;
    }
  }

  private getResultCountFromLog(log: string): number {
    if (!log) return 0;

    // 从日志中提取结果数量（作为后备方案）
    const countMatch = log.match(/(\d+)\s*条数据|(\d+)\s*results?|(\d+)\s*items?/i);
    if (countMatch) {
      return parseInt(countMatch[1] || countMatch[2] || countMatch[3] || '0') || 0;
    }

    return 0;
  }

  private ensureUnsafeCustomJsAllowed(
    config:
      | Partial<CrawleeTaskConfig>
      | Record<string, unknown>
      | null
      | undefined,
    sourceLabel: string,
  ) {
    const unsafeFeatures = listUnsafeCustomJsFeatures(config);
    if (unsafeFeatures.length === 0 || isUnsafeCustomJsEnabled()) {
      return;
    }

    throw new BadRequestException(
      `${sourceLabel}包含 ${unsafeFeatures.join('、')}，当前服务器已禁用自定义 JS。若确认部署环境可信，请显式设置 ALLOW_UNSAFE_CUSTOM_JS=true。`,
    );
  }
}
