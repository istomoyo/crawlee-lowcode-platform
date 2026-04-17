import {
  BehaviorStep,
  BehaviorStepType,
  CrawleeTaskConfig,
  NestedExtractContext,
  NestedSelectorConfig,
  ResultFilterMode,
  ResultFilterOperator,
  ResultFilterRule,
  SelectorConfig,
  TaskNotificationConfig,
} from './dto/execute-task.dto';
import { isUnsafeCustomJsEnabled } from '../config/runtime-security';

const LEGACY_STEP4_KEYS = [
  'name',
  'url',
  'config',
  'script',
  'useProxy',
  'proxyAuth',
  'removeDuplicates',
  'enableValidation',
  'filenameTemplate',
  'disableImages',
  'disableStyles',
  'customHeaders',
  'customItemProcessorCode',
  'customFilterCode',
  'interaction',
  'headless',
  'userAgent',
  'proxyUrl',
] as const;

const FILTER_OPERATORS: ResultFilterOperator[] = [
  'is_empty',
  'is_not_empty',
  'gt',
  'gte',
  'lt',
  'lte',
  'eq',
  'neq',
  'contains',
  'not_contains',
];

const FILTER_MODES: ResultFilterMode[] = ['operator', 'function'];
const BEHAVIOR_STEP_TYPES: BehaviorStepType[] = [
  'open',
  'click',
  'type',
  'wait',
  'extract',
  'scroll',
  'loop',
  'condition',
  'customJS',
];

export interface SanitizeTaskConfigOptions {
  allowInlineCookieString?: boolean;
}

export function sanitizeTaskConfig(
  config?: Partial<CrawleeTaskConfig> | Record<string, any> | null,
  options: SanitizeTaskConfigOptions = {},
): Partial<CrawleeTaskConfig> {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const allowInlineCookieString = options.allowInlineCookieString !== false;
  const nextConfig: Record<string, any> = { ...config };

  for (const key of LEGACY_STEP4_KEYS) {
    delete nextConfig[key];
  }

  const cookieString = allowInlineCookieString
    ? String(config.cookieString ?? '').trim()
    : '';
  const cookieCredentialId = normalizePositiveInt(config.cookieCredentialId);
  nextConfig.useCookie = Boolean(
    config.useCookie &&
      ((allowInlineCookieString && cookieString) || cookieCredentialId),
  );
  nextConfig.cookieString =
    nextConfig.useCookie && allowInlineCookieString && cookieString
      ? cookieString
      : undefined;
  nextConfig.cookieDomain = nextConfig.useCookie
    ? normalizeCookieDomain(config.cookieDomain)
    : undefined;
  nextConfig.cookieCredentialId = nextConfig.useCookie
    ? cookieCredentialId
    : undefined;
  // Front-end has removed advanced behavior-task editing. Legacy payloads are
  // normalized back to the simple XPath flow to keep execution behavior stable.
  nextConfig.taskMode = 'simple';
  nextConfig.preActions = sanitizePreActions(config.preActions);
  nextConfig.selectors = sanitizeSelectorConfigs(config.selectors);
  nextConfig.nestedContexts = sanitizeNestedContexts(config.nestedContexts);
  nextConfig.behaviorSteps = [];
  nextConfig.resultFilters = sanitizeResultFilters(config.resultFilters);
  nextConfig.notification = sanitizeTaskNotification(config.notification);

  return nextConfig as Partial<CrawleeTaskConfig>;
}

export function hasInlineCookieString(
  config?: Partial<CrawleeTaskConfig> | Record<string, any> | null,
): boolean {
  return Boolean(String(config?.cookieString ?? '').trim());
}

export function listUnsafeCustomJsFeatures(
  config?: Partial<CrawleeTaskConfig> | Record<string, any> | null,
): string[] {
  if (!config || typeof config !== 'object') {
    return [];
  }

  const features = new Set<string>();
  const rawConfig = config as Partial<CrawleeTaskConfig> & Record<string, unknown>;

  if (
    Array.isArray(rawConfig.resultFilters) &&
    rawConfig.resultFilters.some((rule) =>
      String((rule as ResultFilterRule)?.functionCode ?? '').trim(),
    )
  ) {
    features.add('结果筛选 JS 函数');
  }

  collectSelectorCustomJs(rawConfig.selectors, features);

  if (Array.isArray(rawConfig.nestedContexts)) {
    for (const context of rawConfig.nestedContexts as NestedExtractContext[]) {
      collectSelectorCustomJs(context?.selectors, features);
    }
  }

  collectBehaviorCustomJs(rawConfig.behaviorSteps, features);

  return Array.from(features);
}

function sanitizePreActions(actions: unknown) {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions.reduce<
    Array<{
      type: 'click' | 'type' | 'wait_for_selector' | 'wait_for_timeout';
      selector?: string;
      value?: string;
      timeout?: number;
    }>
  >((result, action) => {
    const current = (action || {}) as Record<string, unknown>;
    const type = String(current.type || '').trim();

    if (
      type !== 'click' &&
      type !== 'type' &&
      type !== 'wait_for_selector' &&
      type !== 'wait_for_timeout'
    ) {
      return result;
    }

    const selector = String(current.selector ?? '').trim();
    const timeout = Number(current.timeout);
    result.push({
      type,
      selector: selector || undefined,
      value: type === 'type' ? String(current.value ?? '') : undefined,
      timeout: Number.isFinite(timeout) ? timeout : undefined,
    });
    return result;
  }, []);
}

function sanitizeSelectorConfigs(selectors: unknown): SelectorConfig[] {
  if (!Array.isArray(selectors)) {
    return [];
  }

  return selectors.reduce<SelectorConfig[]>((result, selector) => {
    const current = (selector || {}) as Partial<SelectorConfig>;
    const name = String(current.name ?? '').trim();
    const selectorValue = String(current.selector ?? '').trim();
    const type = current.type;

    if (
      !name ||
      !selectorValue ||
      (type !== 'text' && type !== 'link' && type !== 'image')
    ) {
      return result;
    }

    result.push({
      name,
      selector: selectorValue,
      type,
      contentFormat:
        current.contentFormat === 'html' ||
        current.contentFormat === 'markdown' ||
        current.contentFormat === 'smart'
          ? current.contentFormat
          : current.contentFormat === 'text'
            ? 'text'
            : undefined,
      detailBaseSelector: String(current.detailBaseSelector ?? '').trim() || undefined,
      customTransformCode:
        String(current.customTransformCode ?? '').trim() || undefined,
      parentLink: String(current.parentLink ?? '').trim() || undefined,
      preActions: sanitizePreActions(current.preActions),
    });

    return result;
  }, []);
}

function stripDetailBaseSelector(selectors: SelectorConfig[]): SelectorConfig[] {
  return selectors.map((selector) => ({
    ...selector,
    parentLink: undefined,
    detailBaseSelector: undefined,
  }));
}

function sanitizeNestedContexts(contexts: unknown): NestedExtractContext[] {
  if (!Array.isArray(contexts)) {
    return [];
  }

  return contexts.reduce<NestedExtractContext[]>((result, context) => {
    const current = (context || {}) as Partial<NestedExtractContext>;
    const parentLink = String(current.parentLink ?? '').trim();
    const baseSelector = String(current.baseSelector ?? '').trim();

    if (!parentLink || !baseSelector) {
      return result;
    }

    const sanitizedSelectors = stripDetailBaseSelector(
      sanitizeSelectorConfigs(current.selectors),
    ) as NestedSelectorConfig[];
    const nextSelector = String(current.next?.selector ?? '').trim();
    const nextMaxPages = normalizePositiveInt(current.next?.maxPages);
    const maxDepth = normalizePositiveInt(current.maxDepth);
    const maxScroll = normalizePositiveInt(current.scroll?.maxScroll);
    const waitTime = normalizePositiveInt(current.scroll?.waitTime);
    const maxItems = normalizePositiveInt(current.scroll?.maxItems);

    result.push({
      parentLink,
      baseSelector,
      listOutputKey: String(current.listOutputKey ?? '').trim() || undefined,
      selectors: sanitizedSelectors,
      maxDepth,
      preActions: sanitizePreActions(current.preActions),
      next:
        nextSelector && nextMaxPages
          ? {
              selector: nextSelector,
              maxPages: nextMaxPages,
            }
          : undefined,
      scroll:
        maxScroll && waitTime && maxItems
          ? {
              maxScroll,
              waitTime,
              maxItems,
            }
          : undefined,
    });

    return result;
  }, []);
}

export function sanitizeBehaviorSteps(steps: unknown): BehaviorStep[] {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps.reduce<BehaviorStep[]>((result, step, index) => {
    const sanitized = sanitizeBehaviorStep(step, index);
    if (sanitized) {
      result.push(sanitized);
    }
    return result;
  }, []);
}

function sanitizeBehaviorStep(
  step: unknown,
  index: number,
): BehaviorStep | null {
  if (!step || typeof step !== 'object') {
    return null;
  }

  const current = step as Record<string, unknown>;
  const type = String(current.type || '').trim() as BehaviorStepType;
  if (!BEHAVIOR_STEP_TYPES.includes(type)) {
    return null;
  }

  const selector = String(current.selector ?? '').trim();
  const name = String(current.name ?? '').trim();
  const field = String(current.field ?? '').trim();
  const url = String(current.url ?? '').trim();
  const value = String(current.value ?? '').trim();
  const waitUntil = String(current.waitUntil ?? '').trim();
  const extractType = String(current.extractType ?? '').trim();
  const attribute = String(current.attribute ?? '').trim();
  const loopMode = String(current.loopMode ?? '').trim();
  const outputKey = String(current.outputKey ?? '').trim();
  const conditionType = String(current.conditionType ?? '').trim();
  const conditionValue = String(current.conditionValue ?? '').trim();
  const code = String(current.code ?? '').trim();
  const timeout = Number(current.timeout);
  const waitAfter = Number(current.waitAfter);
  const maxLoops = Number(current.maxLoops);

  return {
    id: String(current.id ?? `${type}-${index + 1}`).trim() || `${type}-${index + 1}`,
    name: name || undefined,
    type,
    selector: selector || undefined,
    children: sanitizeBehaviorSteps(current.children),
    elseChildren: sanitizeBehaviorSteps(current.elseChildren),
    url: url || undefined,
    value: value || undefined,
    timeout: Number.isFinite(timeout) ? timeout : undefined,
    waitUntil:
      waitUntil === 'visible' ||
      waitUntil === 'attached' ||
      waitUntil === 'hidden' ||
      waitUntil === 'networkidle' ||
      waitUntil === 'timeout'
        ? waitUntil
        : type === 'wait'
          ? 'visible'
        : undefined,
    waitAfter: Number.isFinite(waitAfter) ? waitAfter : undefined,
    field: field || undefined,
    extractType:
      extractType === 'text' ||
      extractType === 'html' ||
      extractType === 'markdown' ||
      extractType === 'link' ||
      extractType === 'image' ||
      extractType === 'attribute'
        ? extractType
        : undefined,
    attribute: attribute || undefined,
    loopMode:
      loopMode === 'elements' || loopMode === 'times'
        ? loopMode
        : type === 'loop'
          ? 'elements'
        : undefined,
    maxLoops:
      Number.isFinite(maxLoops) && maxLoops > 0
        ? Math.floor(maxLoops)
        : undefined,
    outputKey: outputKey || undefined,
    conditionType:
      conditionType === 'exists' ||
      conditionType === 'not_exists' ||
      conditionType === 'text_contains' ||
      conditionType === 'customJS'
        ? conditionType
        : type === 'condition'
          ? 'exists'
        : undefined,
    conditionValue: conditionValue || undefined,
    code: code || undefined,
  };
}

export function sanitizeResultFilters(rules: unknown): ResultFilterRule[] {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules.reduce<ResultFilterRule[]>((result, rule) => {
    const current = (rule || {}) as Partial<ResultFilterRule>;
    const field = String(current.field || '').trim();
    const mode =
      current.mode && FILTER_MODES.includes(current.mode)
        ? current.mode
        : current.functionCode
          ? 'function'
          : 'operator';
    const operator = current.operator;
    const value = String(current.value ?? '').trim();
    const functionCode = String(current.functionCode ?? '').trim();

    if (!field) {
      return result;
    }

    if (mode === 'function') {
      if (functionCode) {
        result.push({
          field,
          mode,
          functionCode,
        });
      }
      return result;
    }

    if (!operator || !FILTER_OPERATORS.includes(operator)) {
      return result;
    }

    result.push({
      field,
      mode,
      operator,
      value,
    });
    return result;
  }, []);
}

export function sanitizeTaskNotification(
  notification: unknown,
): TaskNotificationConfig | undefined {
  if (!notification || typeof notification !== 'object') {
    return undefined;
  }

  const current = notification as Partial<TaskNotificationConfig>;

  return {
    enabled: Boolean(current.enabled),
    onSuccess:
      typeof current.onSuccess === 'boolean' ? current.onSuccess : true,
    onFailure:
      typeof current.onFailure === 'boolean' ? current.onFailure : true,
    previewCount: Math.max(
      0,
      Math.min(10, Number(current.previewCount ?? 3) || 3),
    ),
  };
}

export function normalizeCookieDomain(
  cookieDomain?: string | null,
): string | undefined {
  const raw = String(cookieDomain ?? '').trim();
  if (!raw) {
    return undefined;
  }

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw
      .replace(/^[a-z]+:\/\//i, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '')
      .replace(/^\./, '')
      .toLowerCase();
  }
}

function normalizePositiveInt(value: unknown): number | undefined {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return undefined;
  }

  return numericValue;
}

export function getCookieMatchDomain(
  config?: Partial<Pick<CrawleeTaskConfig, 'cookieDomain' | 'urls'>> | null,
  fallbackUrl?: string,
): string | undefined {
  const configuredDomain = normalizeCookieDomain(config?.cookieDomain);
  if (configuredDomain) {
    return configuredDomain;
  }

  const candidateUrl = config?.urls?.[0] || fallbackUrl;
  if (!candidateUrl) {
    return undefined;
  }

  try {
    return new URL(candidateUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function shouldAttachCookieToUrl(
  targetUrl: string,
  cookieDomain?: string,
  fallbackUrl?: string,
): boolean {
  const matchedDomain = getCookieMatchDomain(
    cookieDomain ? { cookieDomain, urls: [] } : undefined,
    fallbackUrl,
  );
  if (!matchedDomain) {
    return false;
  }

  try {
    const targetHost = new URL(targetUrl).hostname.toLowerCase();
    return (
      targetHost === matchedDomain ||
      targetHost.endsWith(`.${matchedDomain}`)
    );
  } catch {
    return false;
  }
}

export function parseCookieString(
  cookieString?: string | null,
): Array<{ name: string; value: string }> {
  if (!cookieString) {
    return [];
  }

  return cookieString
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) {
        return null;
      }

      return {
        name: part.slice(0, separatorIndex).trim(),
        value: part.slice(separatorIndex + 1).trim(),
      };
    })
    .filter(
      (item): item is { name: string; value: string } =>
        Boolean(item?.name),
    );
}

export function buildCookieHeader(
  cookieString?: string | null,
  targetUrl?: string,
  cookieDomain?: string,
  fallbackUrl?: string,
): string | undefined {
  const cookies = parseCookieString(cookieString);
  if (cookies.length === 0) {
    return undefined;
  }

  if (
    targetUrl &&
    !shouldAttachCookieToUrl(targetUrl, cookieDomain, fallbackUrl)
  ) {
    return undefined;
  }

  return cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
}

export function createPlaywrightCookies(
  cookieString: string,
  targetUrl: string,
  cookieDomain?: string,
): Array<Record<string, any>> {
  const cookies = parseCookieString(cookieString);
  if (cookies.length === 0) {
    return [];
  }

  const normalizedDomain = normalizeCookieDomain(cookieDomain);

  try {
    const url = new URL(targetUrl);
    const origin = `${url.protocol}//${url.host}`;

    return cookies.map(({ name, value }) =>
      normalizedDomain
        ? {
            name,
            value,
            domain: normalizedDomain,
            path: '/',
            secure: url.protocol === 'https:',
          }
        : {
            name,
            value,
            url: origin,
          },
    );
  } catch {
    return [];
  }
}

export function itemMatchesResultFilters(
  item: Record<string, any>,
  filters?: ResultFilterRule[],
): boolean {
  if (!filters?.length) {
    return true;
  }

  return filters.every((filter) => evaluateResultFilter(item, filter));
}

function evaluateResultFilter(
  item: Record<string, any>,
  filter: ResultFilterRule,
): boolean {
  const fieldValue = getFieldValue(item, filter.field);
  if ((filter.mode || 'operator') === 'function') {
    return evaluateResultFilterFunction(item, filter, fieldValue);
  }

  const normalizedText = normalizeComparableText(fieldValue);
  const expectedText = normalizeComparableText(filter.value);
  const fieldNumber = toComparableNumber(fieldValue);
  const expectedNumber = toComparableNumber(filter.value);

  switch (filter.operator) {
    case 'is_empty':
      return !hasMeaningfulValue(fieldValue);
    case 'is_not_empty':
      return hasMeaningfulValue(fieldValue);
    case 'contains':
      return normalizedText.includes(expectedText);
    case 'not_contains':
      return !normalizedText.includes(expectedText);
    case 'eq':
      if (fieldNumber !== null && expectedNumber !== null) {
        return fieldNumber === expectedNumber;
      }
      return normalizedText === expectedText;
    case 'neq':
      if (fieldNumber !== null && expectedNumber !== null) {
        return fieldNumber !== expectedNumber;
      }
      return normalizedText !== expectedText;
    case 'gt':
      return compareValues(fieldNumber, expectedNumber, normalizedText, expectedText) > 0;
    case 'gte':
      return compareValues(fieldNumber, expectedNumber, normalizedText, expectedText) >= 0;
    case 'lt':
      return compareValues(fieldNumber, expectedNumber, normalizedText, expectedText) < 0;
    case 'lte':
      return compareValues(fieldNumber, expectedNumber, normalizedText, expectedText) <= 0;
    default:
      return true;
  }
}

function evaluateResultFilterFunction(
  item: Record<string, any>,
  filter: ResultFilterRule,
  fieldValue: unknown,
): boolean {
  const functionCode = String(filter.functionCode ?? '').trim();
  if (!functionCode) {
    return false;
  }

  if (!isUnsafeCustomJsEnabled()) {
    throw new Error(
      'Custom JavaScript result filters are disabled by server policy.',
    );
  }

  try {
    const runner = new Function(
      'value',
      'item',
      'field',
      'helpers',
      `"use strict";\n${functionCode}`,
    );

    return Boolean(
      runner(fieldValue, item, filter.field, createResultFilterHelpers()),
    );
  } catch {
    return false;
  }
}

function compareValues(
  fieldNumber: number | null,
  expectedNumber: number | null,
  fieldText: string,
  expectedText: string,
): number {
  if (fieldNumber !== null && expectedNumber !== null) {
    return fieldNumber - expectedNumber;
  }

  return fieldText.localeCompare(expectedText, 'zh-CN', {
    sensitivity: 'base',
    numeric: true,
  });
}

function getFieldValue(item: Record<string, any>, field: string): unknown {
  if (Object.prototype.hasOwnProperty.call(item, field)) {
    return item[field];
  }

  return field.split('.').reduce<unknown>((current, segment) => {
    if (!segment) {
      return current;
    }

    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, item);
}

function normalizeComparableText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeComparableText(item)).join(' ').trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim().toLowerCase();
}

function createResultFilterHelpers() {
  return {
    text: normalizeComparableText,
    toNumber: toComparableNumber,
    hasValue: hasMeaningfulValue,
    includes: (input: unknown, expected: unknown) =>
      normalizeComparableText(input).includes(normalizeComparableText(expected)),
    matches: (input: unknown, pattern: string, flags = 'i') => {
      try {
        return new RegExp(pattern, flags).test(String(input ?? ''));
      } catch {
        return false;
      }
    },
    length: (input: unknown) => {
      if (Array.isArray(input) || typeof input === 'string') {
        return input.length;
      }

      if (input && typeof input === 'object') {
        return Object.keys(input).length;
      }

      return 0;
    },
  };
}

function collectSelectorCustomJs(
  selectors: unknown,
  features: Set<string>,
) {
  if (!Array.isArray(selectors)) {
    return;
  }

  if (
    selectors.some((selector) =>
      String((selector as SelectorConfig)?.customTransformCode ?? '').trim(),
    )
  ) {
    features.add('字段自定义处理 JS');
  }
}

function collectBehaviorCustomJs(
  steps: unknown,
  features: Set<string>,
) {
  if (!Array.isArray(steps)) {
    return;
  }

  for (const step of steps as BehaviorStep[]) {
    const code = String(step?.code ?? '').trim();

    if (
      (step?.type === 'customJS' && code) ||
      (step?.conditionType === 'customJS' && code)
    ) {
      features.add('行为流自定义 JS');
    }

    collectBehaviorCustomJs(step?.children, features);
    collectBehaviorCustomJs(step?.elseChildren, features);
  }
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized !== '' && normalized !== 'null' && normalized !== 'undefined';
  }

  return true;
}

function toComparableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  let text = value.trim().toLowerCase();
  if (!text) {
    return null;
  }

  let multiplier = 1;

  if (text.endsWith('%')) {
    text = text.slice(0, -1);
  }

  if (text.endsWith('万')) {
    multiplier = 10_000;
    text = text.slice(0, -1);
  } else if (text.endsWith('亿')) {
    multiplier = 100_000_000;
    text = text.slice(0, -1);
  } else if (text.endsWith('k')) {
    multiplier = 1_000;
    text = text.slice(0, -1);
  } else if (text.endsWith('m')) {
    multiplier = 1_000_000;
    text = text.slice(0, -1);
  } else if (text.endsWith('b')) {
    multiplier = 1_000_000_000;
    text = text.slice(0, -1);
  }

  const cleaned = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned[0]);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric * multiplier;
}
