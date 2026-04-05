import {
  CrawleeTaskConfig,
  ResultFilterMode,
  ResultFilterOperator,
  ResultFilterRule,
  TaskNotificationConfig,
} from './dto/execute-task.dto';

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

export function sanitizeTaskConfig(
  config?: Partial<CrawleeTaskConfig> | Record<string, any> | null,
): Partial<CrawleeTaskConfig> {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const nextConfig: Record<string, any> = { ...config };

  for (const key of LEGACY_STEP4_KEYS) {
    delete nextConfig[key];
  }

  const cookieString = String(config.cookieString ?? '').trim();
  nextConfig.useCookie = Boolean(config.useCookie && cookieString);
  nextConfig.cookieString = nextConfig.useCookie ? cookieString : undefined;
  nextConfig.cookieDomain = normalizeCookieDomain(config.cookieDomain);
  nextConfig.resultFilters = sanitizeResultFilters(config.resultFilters);
  nextConfig.notification = sanitizeTaskNotification(config.notification);

  return nextConfig as Partial<CrawleeTaskConfig>;
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
