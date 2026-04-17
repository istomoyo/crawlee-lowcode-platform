import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import type {
  CrawleeTaskConfig,
  NestedExtractContext,
  NestedSelectorConfig,
  SelectorConfig,
} from "@/api/task";

export interface TreeNode {
  id: number;
  label: string;
  selector?: string;
  jsPath?: string;
  children?: TreeNode[];
  type: "field" | "image" | "link" | "next" | "scroll";
  samples?: string[];
  maxPages?: number;
  maxScroll?: number;
  waitTime?: number;
  maxItems?: number;
  listBaseSelector?: string;
  listOutputKey?: string;
  contentFormat?: "text" | "html" | "markdown" | "smart";
  customTransformCode?: string;
  preActions?: PreActionConfig[];
  detailBaseSelector?: string;
  hasChildren?: boolean;
  exampleMatchCount?: number | null;
}

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
  type: "click" | "type" | "wait_for_selector" | "wait_for_timeout";
  selectorType?: "xpath" | "css";
  selector?: string;
  value?: string;
  timeout?: number;
}

type SelectorItem = {
  name: string;
  selector: string;
  type: string;
  contentFormat?: "text" | "html" | "markdown" | "smart";
  parentLink?: string;
  detailBaseSelector?: string;
  customTransformCode?: string;
  preActions?: PreActionConfig[];
};

type NestedSelectorItem = NestedSelectorConfig;
type NestedContextItem = NestedExtractContext;

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
  id: number;
  field: string;
  mode?: ResultFilterMode;
  operator?: ResultFilterOperator;
  value?: string;
  functionCode?: string;
}

export interface TaskNotificationConfig {
  enabled: boolean;
  onSuccess: boolean;
  onFailure: boolean;
  previewCount: number;
}

export type CookieAccessMode = "temporary" | "credential";

export interface CrawlerConfigState {
  maxRequestsPerCrawl: number;
  maxConcurrency: number;
  requestInterval: number;
  timeout: number;
  maxRetries: number;
  useCookie: boolean;
  cookieMode: CookieAccessMode;
  cookieString: string;
  cookieDomain: string;
  cookieCredentialId: number | null;
  resultFilters: ResultFilterRule[];
  notification: TaskNotificationConfig;
  preActions: PreActionConfig[];
}

export type TaskDraftCookiePayload = {
  useCookie?: boolean;
  cookieString?: string;
  cookieDomain?: string;
  cookieCredentialId?: number;
};

type BuildTaskCookiePayloadOptions = {
  includeTemporaryCookieString?: boolean;
};

let nodeIdSeed = 1;

function nextNodeId() {
  return nodeIdSeed++;
}

function resetNodeIdSeed() {
  nodeIdSeed = 1;
}

export function createDefaultCrawlerConfig(): CrawlerConfigState {
  return {
    maxRequestsPerCrawl: 100,
    maxConcurrency: 5,
    requestInterval: 1000,
    timeout: 60,
    maxRetries: 3,
    useCookie: false,
    cookieMode: "temporary",
    cookieString: "",
    cookieDomain: "",
    cookieCredentialId: null,
    resultFilters: [],
    notification: {
      enabled: false,
      onSuccess: true,
      onFailure: true,
      previewCount: 3,
    },
    preActions: [],
  };
}

export function buildTaskCookiePayload(
  config?: Partial<
    Pick<
      CrawlerConfigState,
      "useCookie" | "cookieMode" | "cookieString" | "cookieDomain" | "cookieCredentialId"
    >
  >,
  options: BuildTaskCookiePayloadOptions = {},
): TaskDraftCookiePayload {
  if (!config?.useCookie) {
    return {};
  }

  const includeTemporaryCookieString =
    options.includeTemporaryCookieString !== false;
  const cookieMode = config.cookieMode === "credential" ? "credential" : "temporary";
  const cookieCredentialId = normalizePositiveInt(config.cookieCredentialId);
  if (cookieMode === "credential" && cookieCredentialId) {
    return {
      useCookie: true,
      cookieCredentialId,
    };
  }

  if (!includeTemporaryCookieString) {
    return {};
  }

  const cookieString = String(config?.cookieString ?? "").trim();
  if (!cookieString) {
    return {};
  }

  const cookieDomain = String(config?.cookieDomain ?? "").trim();
  return {
    useCookie: true,
    cookieString,
    cookieDomain: cookieDomain || undefined,
  };
}

function normalizePositiveInt(value: unknown): number | null {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function normalizePreActions(actions: unknown): PreActionConfig[] {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions.reduce<PreActionConfig[]>((result, action) => {
      const current = (action || {}) as Partial<PreActionConfig>;
      const type = current.type;
      if (
        type !== "click" &&
        type !== "type" &&
        type !== "wait_for_selector" &&
        type !== "wait_for_timeout"
      ) {
        return result;
      }

      result.push({
        type,
        selectorType:
          current.selectorType === "css" ? "css" : current.selector ? "xpath" : undefined,
        selector: normalizePreActionSelector(
          String(current.selector ?? "").trim() || undefined,
          current.selectorType === "css" ? "css" : current.selector ? "xpath" : undefined,
        ),
        value: type === "type" ? String(current.value ?? "") : undefined,
        timeout: Number.isFinite(Number(current.timeout))
          ? Number(current.timeout)
          : type === "wait_for_timeout"
            ? 1000
            : undefined,
      });

      return result;
    }, []);
}

function normalizeResultFilterRules(rules: unknown): ResultFilterRule[] {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules.reduce<ResultFilterRule[]>((result, rule, index) => {
      const current = (rule || {}) as Partial<ResultFilterRule>;
      const field = String(current.field || "").trim();
      const mode: ResultFilterMode =
        current.mode === "function" || current.functionCode
          ? "function"
          : "operator";
      const operator = current.operator;
      const value = String(current.value ?? "").trim();
      const functionCode = String(current.functionCode ?? "").trim();

      if (!field) {
        return result;
      }

      if (mode === "function") {
        if (!functionCode) {
          return result;
        }

        result.push({
          id: Number(current.id) || index + 1,
          field,
          mode,
          functionCode,
          value,
        });
        return result;
      }

      if (
        !operator ||
        ![
          "is_empty",
          "is_not_empty",
          "gt",
          "gte",
          "lt",
          "lte",
          "eq",
          "neq",
          "contains",
          "not_contains",
        ].includes(operator)
      ) {
        return result;
      }

      result.push({
        id: Number(current.id) || index + 1,
        field,
        mode,
        operator,
        value,
      });

      return result;
    }, []);
}

export function normalizeCrawlerConfig(
  input?: Partial<CrawlerConfigState> | Record<string, unknown>,
): CrawlerConfigState {
  const defaults = createDefaultCrawlerConfig();
  const raw = (input || {}) as Partial<CrawlerConfigState> &
    Record<string, unknown>;
  const cookieString = String(raw.cookieString ?? defaults.cookieString).trim();
  const cookieDomain = String(raw.cookieDomain ?? defaults.cookieDomain).trim();
  const cookieCredentialId = normalizePositiveInt(
    raw.cookieCredentialId ?? defaults.cookieCredentialId,
  );
  const cookieMode: CookieAccessMode =
    raw.cookieMode === "credential" || (!!cookieCredentialId && !cookieString)
      ? "credential"
      : "temporary";
  const useCookie = Boolean(raw.useCookie && (cookieString || cookieCredentialId));

  return {
    maxRequestsPerCrawl: Math.max(
      1,
      Number(raw.maxRequestsPerCrawl ?? defaults.maxRequestsPerCrawl) ||
        defaults.maxRequestsPerCrawl,
    ),
    maxConcurrency: Math.max(
      1,
      Number(raw.maxConcurrency ?? defaults.maxConcurrency) ||
        defaults.maxConcurrency,
    ),
    requestInterval: Math.max(
      0,
      Number(raw.requestInterval ?? defaults.requestInterval) ||
        defaults.requestInterval,
    ),
    timeout: Math.max(
      10,
      Number(raw.timeout ?? defaults.timeout) || defaults.timeout,
    ),
    maxRetries: Math.max(
      0,
      Number(raw.maxRetries ?? defaults.maxRetries) || defaults.maxRetries,
    ),
    useCookie,
    cookieMode,
    cookieString,
    cookieDomain,
    cookieCredentialId,
    resultFilters: normalizeResultFilterRules(raw.resultFilters),
    notification: {
      enabled: Boolean(raw.notification && (raw.notification as any).enabled),
      onSuccess:
        typeof (raw.notification as any)?.onSuccess === "boolean"
          ? Boolean((raw.notification as any).onSuccess)
          : true,
      onFailure:
        typeof (raw.notification as any)?.onFailure === "boolean"
          ? Boolean((raw.notification as any).onFailure)
          : true,
      previewCount: Math.max(
        0,
        Math.min(
          10,
          Number((raw.notification as any)?.previewCount ?? defaults.notification.previewCount) ||
            defaults.notification.previewCount,
        ),
      ),
    },
    preActions: normalizePreActions(raw.preActions),
  };
}

function cloneTreeNode(node: TreeNode): TreeNode {
  const normalizedSelector =
    node.type === "next"
      ? normalizePageScopedSelector(node.selector)
      : trimSelector(node.selector);

  return {
    ...node,
    id: nextNodeId(),
    selector: normalizedSelector,
    jsPath: String(node.jsPath ?? "").trim() || undefined,
    listBaseSelector: String(node.listBaseSelector ?? "").trim() || undefined,
    listOutputKey: String(node.listOutputKey ?? "").trim() || undefined,
    detailBaseSelector: String(node.detailBaseSelector ?? "").trim() || undefined,
    samples: Array.isArray(node.samples) ? [...node.samples] : [],
    preActions: normalizePreActions(node.preActions),
    children: Array.isArray(node.children)
      ? node.children.map((child) => cloneTreeNode(child))
      : node.type === "link"
        ? []
        : undefined,
    hasChildren: node.type === "link" ? true : Boolean(node.hasChildren),
  };
}

function mapSelectorTypeToNodeType(
  type: string,
): TreeNode["type"] | undefined {
  if (type === "link") return "link";
  if (type === "image") return "image";
  if (type === "text") return "field";
  return undefined;
}

function createNodeFromSelector(
  selector: SelectorConfig | NestedSelectorItem,
): TreeNode | null {
  const type = mapSelectorTypeToNodeType(selector.type);
  if (!type) {
    return null;
  }

  return {
    id: nextNodeId(),
    type,
    label: selector.name || (type === "link" ? "链接地址" : "字段"),
    selector: String(selector.selector ?? "").trim() || undefined,
    jsPath: undefined,
    samples: [],
    children: type === "link" ? [] : undefined,
    hasChildren: type === "link",
    contentFormat:
      type === "field"
        ? selector.contentFormat || "text"
        : undefined,
    detailBaseSelector:
      "detailBaseSelector" in selector
        ? selector.detailBaseSelector || undefined
        : undefined,
    customTransformCode: selector.customTransformCode || undefined,
    preActions: type === "link" ? normalizePreActions(selector.preActions) : undefined,
  };
}

function ensureLinkNode(
  rootNodes: TreeNode[],
  label: string,
  detailBaseSelector?: string,
  preActions?: PreActionConfig[],
): TreeNode {
  const normalizedLabel = String(label || "链接地址").trim() || "链接地址";
  const existing = rootNodes.find(
    (node) => node.type === "link" && node.label === normalizedLabel,
  );

  if (existing) {
    if (!existing.detailBaseSelector && detailBaseSelector) {
      existing.detailBaseSelector = detailBaseSelector;
    }
    if ((!existing.preActions || existing.preActions.length === 0) && preActions?.length) {
      existing.preActions = normalizePreActions(preActions);
    }
    existing.children ||= [];
    existing.hasChildren = true;
    return existing;
  }

  const created: TreeNode = {
    id: nextNodeId(),
    type: "link",
    label: normalizedLabel,
    selector: "",
    children: [],
    hasChildren: true,
    samples: [],
    detailBaseSelector: detailBaseSelector || undefined,
    preActions: normalizePreActions(preActions),
  };

  rootNodes.push(created);
  return created;
}

function hydrateTreeFromConfig(config?: Partial<CrawleeTaskConfig> | null) {
  const rootNodes: TreeNode[] = [];
  const selectors = Array.isArray(config?.selectors) ? config.selectors : [];
  const nestedContexts = Array.isArray(config?.nestedContexts)
    ? config.nestedContexts
    : [];

  for (const selector of selectors) {
    if (selector.parentLink) {
      continue;
    }

    const node = createNodeFromSelector(selector);
    if (node) {
      rootNodes.push(node);
    }
  }

  for (const selector of selectors) {
    if (!selector.parentLink) {
      continue;
    }

    const parent = ensureLinkNode(
      rootNodes,
      selector.parentLink || "链接地址",
      selector.detailBaseSelector,
      selector.preActions,
    );
    const child = createNodeFromSelector(selector);
    if (child) {
      parent.children ||= [];
      parent.children.push(child);
      parent.hasChildren = true;
    }
  }

  if (config?.nextPageSelector) {
    rootNodes.push({
      id: nextNodeId(),
      type: "next",
      label: "分页",
      selector: normalizePageScopedSelector(config.nextPageSelector),
      maxPages: Number(config.maxPages || 10),
      samples: [],
      preActions: undefined,
    });
  }

  if (config?.scrollEnabled) {
    rootNodes.push({
      id: nextNodeId(),
      type: "scroll",
      label: "滚动",
      selector: "",
      maxScroll: Math.max(
        1,
        Math.round(Number(config.maxScrollDistance || 5000) / 1000),
      ),
      waitTime: Number(config.scrollDelay || 1000),
      maxItems: Number(config.maxItems || 100),
      samples: [],
      preActions: undefined,
    });
  }

  for (const context of nestedContexts) {
    const parent = ensureLinkNode(
      rootNodes,
      context.parentLink,
      context.baseSelector || undefined,
      context.preActions,
    );
    parent.children ||= [];

    if (context.next) {
      parent.children.push({
        id: nextNodeId(),
        type: "next",
        label: "分页",
        selector: normalizePageScopedSelector(context.next.selector),
        maxPages: Number(context.next.maxPages || 10),
        listBaseSelector: context.baseSelector || undefined,
        listOutputKey: context.listOutputKey || "items",
        samples: [],
      });
    }

    if (context.scroll) {
      parent.children.push({
        id: nextNodeId(),
        type: "scroll",
        label: "滚动",
        selector: "",
        maxScroll: Number(context.scroll.maxScroll || 5),
        waitTime: Number(context.scroll.waitTime || 1000),
        maxItems: Number(context.scroll.maxItems || 100),
        listBaseSelector: context.baseSelector || undefined,
        listOutputKey: context.listOutputKey || "items",
        samples: [],
      });
    }

    for (const selector of context.selectors || []) {
      const child = createNodeFromSelector(selector);
      if (child) {
        parent.children.push(child);
      }
    }

    parent.hasChildren = true;
  }

  return rootNodes;
}
function trimSelector(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizePageScopedSelector(value?: string | null) {
  const normalized = trimSelector(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith(".//")) {
    return `//${normalized.slice(3)}`;
  }

  return normalized;
}

export function normalizePreActionSelector(
  selector?: string | null,
  selectorType?: "xpath" | "css",
) {
  const normalized = trimSelector(selector);
  if (!normalized) {
    return undefined;
  }

  if (selectorType === "css") {
    return normalized;
  }

  return normalizePageScopedSelector(normalized);
}

export const useTaskFormStore = defineStore("taskForm", () => {
  const form = reactive({
    name: "",
    url: "",
  });

  const selectedItem = ref<{
    xpath?: string;
    base64?: string;
    jsPath?: string;
  } | null>(null);

  const treeData = reactive<TreeNode[]>([]);

  const siteType = ref<{
    value: string;
    label: string;
    icon: string;
    description: string;
    strategy: string;
    defaultContentFormat: "text" | "html" | "markdown" | "smart";
    articleDetectionEnabled: boolean;
  } | null>(null);

  const crawlerConfig = reactive(createDefaultCrawlerConfig());

  function buildConfig(options: BuildTaskCookiePayloadOptions = {}) {
    const baseSelector =
      trimSelector(selectedItem.value?.xpath) || trimSelector(selectedItem.value?.jsPath) || "";
    const { selectors, nestedContexts } = convertTreeToSelectors(treeData, baseSelector);
    const paginationConfig = getPaginationConfig(treeData);
    const normalizedCrawlerConfig = normalizeCrawlerConfig(crawlerConfig as any);
    const cookiePayload = buildTaskCookiePayload(normalizedCrawlerConfig, options);

    const config: Record<string, unknown> = {
      taskMode: "simple",
      crawlerType: "playwright",
      urls: [form.url],
      maxRequestsPerCrawl: normalizedCrawlerConfig.maxRequestsPerCrawl || 1,
      maxConcurrency: normalizedCrawlerConfig.maxConcurrency,
      waitForTimeout: normalizedCrawlerConfig.timeout * 1000,
      navigationTimeout: normalizedCrawlerConfig.timeout * 1000,
      requestInterval: normalizedCrawlerConfig.requestInterval,
      maxRetries: normalizedCrawlerConfig.maxRetries,
      useCookie: Boolean(cookiePayload.useCookie),
      ...cookiePayload,
      resultFilters: normalizedCrawlerConfig.resultFilters,
      notification: normalizedCrawlerConfig.notification.enabled
        ? normalizedCrawlerConfig.notification
        : undefined,
      preActions: normalizedCrawlerConfig.preActions.map((action) => ({
        type: action.type,
        selector:
          action.type === "wait_for_timeout"
            ? undefined
            : normalizePreActionSelector(action.selector, action.selectorType),
        value: action.type === "type" ? String(action.value ?? "") : undefined,
        timeout: action.timeout,
      })),
      ...paginationConfig,
      selectors,
    };

    if (baseSelector) {
      config.baseSelector = baseSelector;
    }

    if (nestedContexts.length > 0) {
      config.nestedContexts = nestedContexts;
    }

    return config;
  }

  function getPaginationConfig(nodes: TreeNode[]) {
    const nextNode = nodes.find((node) => node.type === "next");
    const scrollNode = nodes.find((node) => node.type === "scroll");

    return {
      nextPageSelector:
        normalizePageScopedSelector(nextNode?.selector) ||
        normalizePageScopedSelector(nextNode?.jsPath),
      maxPages: nextNode?.maxPages || undefined,
      scrollEnabled: Boolean(scrollNode),
      scrollDistance: scrollNode ? 1000 : undefined,
      scrollDelay: scrollNode?.waitTime || undefined,
      maxScrollDistance: scrollNode ? (scrollNode.maxScroll || 5) * 1000 : undefined,
      maxItems: scrollNode?.maxItems || undefined,
    };
  }

  function createDefaultNestedOutputKey(label?: string) {
    const normalizedLabel = String(label ?? "")
      .trim()
      .replace(/\s+/g, "_");

    if (!normalizedLabel) {
      return "items";
    }

    return normalizedLabel.endsWith("_items")
      ? normalizedLabel
      : `${normalizedLabel}_items`;
  }

  function convertTreeToSelectors(
    nodes: TreeNode[],
    _baseSelector?: string,
    parentLinkLabel?: string,
    parentDetailBaseSelector?: string,
    parentPagePreActions?: PreActionConfig[],
  ): { selectors: SelectorItem[]; nestedContexts: NestedContextItem[] } {
    const selectors: SelectorItem[] = [];
    const nestedContexts: NestedContextItem[] = [];

    const toSelector = (
      node: TreeNode,
      currentParentLink?: string,
      detailBaseSelector?: string,
      pagePreActions?: PreActionConfig[],
    ): SelectorItem => {
      const normalizedPreActions =
        node.type === "link"
          ? normalizePreActions(node.preActions)
          : normalizePreActions(pagePreActions);

      return {
        name: node.label,
        selector: trimSelector(node.selector) || trimSelector(node.jsPath) || "",
        type:
          node.type === "field"
            ? "text"
            : node.type === "link"
              ? "link"
              : "image",
        contentFormat: node.type === "field" ? node.contentFormat : undefined,
        parentLink: currentParentLink,
        detailBaseSelector,
        customTransformCode: trimSelector(node.customTransformCode),
        preActions: normalizedPreActions.length ? normalizedPreActions : undefined,
      };
    };

    const toNestedSelector = (selector: SelectorItem): NestedSelectorItem => ({
      name: selector.name,
      selector: selector.selector,
      type: selector.type as NestedSelectorItem["type"],
      contentFormat: selector.contentFormat,
      customTransformCode: selector.customTransformCode,
      preActions: selector.preActions,
    });

    for (const node of nodes) {
      const currentDetailBaseSelector =
        node.type === "link"
          ? trimSelector(node.detailBaseSelector) || parentDetailBaseSelector
          : parentDetailBaseSelector;
      const currentPagePreActions =
        node.type === "link"
          ? normalizePreActions(node.preActions)
          : normalizePreActions(parentPagePreActions);

      const childNextNode =
        node.type === "link"
          ? node.children?.find((child) => child.type === "next")
          : undefined;
      const childScrollNode =
        node.type === "link"
          ? node.children?.find((child) => child.type === "scroll")
          : undefined;
      const hasNestedLinkChild = Boolean(
        node.type === "link" &&
          node.children?.some((child) => child.type === "link"),
      );
      const hasExtractableChild = Boolean(
        node.type === "link" &&
          node.children?.some(
            (child) =>
              child.type === "field" ||
              child.type === "image" ||
              child.type === "link",
          ),
      );
      const shouldExtractAsNestedCollection = Boolean(
        node.type === "link" &&
          trimSelector(currentDetailBaseSelector) &&
          hasExtractableChild,
      );

      if (node.type === "field" || node.type === "image" || node.type === "link") {
        selectors.push(
          toSelector(
            node,
            parentLinkLabel,
            parentDetailBaseSelector,
            currentPagePreActions,
          ),
        );
      }

      if (!node.children?.length) {
        continue;
      }

      const childParentLink =
        node.type === "link" ? node.label : parentLinkLabel;

      if (node.type === "link" && shouldExtractAsNestedCollection) {
        const nestedConverted = convertTreeToSelectors(
          node.children,
          _baseSelector,
          undefined,
          currentDetailBaseSelector,
          currentPagePreActions,
        );

        nestedContexts.push({
          parentLink: node.label,
          baseSelector: trimSelector(currentDetailBaseSelector) || "",
          listOutputKey: createDefaultNestedOutputKey(node.label),
          selectors: nestedConverted.selectors.map((selector) =>
            toNestedSelector(selector),
          ),
          maxDepth: 5,
          preActions: currentPagePreActions.length ? currentPagePreActions : undefined,
          next: childNextNode
            ? {
                selector:
                  normalizePageScopedSelector(childNextNode.selector) ||
                  normalizePageScopedSelector(childNextNode.jsPath) ||
                  "",
                maxPages: childNextNode.maxPages || 10,
              }
            : undefined,
          scroll: childScrollNode
            ? {
                maxScroll: childScrollNode.maxScroll || 5,
                waitTime: childScrollNode.waitTime || 1000,
                maxItems: childScrollNode.maxItems || 100,
              }
            : undefined,
        });
        nestedContexts.push(...nestedConverted.nestedContexts);
        continue;
      }

        const converted = convertTreeToSelectors(
          node.children,
          _baseSelector,
          childParentLink,
          currentDetailBaseSelector,
          currentPagePreActions,
        );
      selectors.push(...converted.selectors);
      nestedContexts.push(...converted.nestedContexts);
    }

    return { selectors, nestedContexts };
  }

  function resetForm() {
    form.name = "";
    form.url = "";
    selectedItem.value = null;
    treeData.splice(0, treeData.length);
    siteType.value = null;
    Object.assign(crawlerConfig, createDefaultCrawlerConfig());
    resetNodeIdSeed();
  }

  function startNewTask() {
    resetForm();
  }

  function applySerializedTaskConfig(payload: {
    name?: string;
    url?: string;
    config?: Partial<CrawleeTaskConfig> | Record<string, unknown> | null;
    script?: string;
  }) {
    resetForm();

    const incomingConfig = ((payload.config as any)?.config &&
    typeof (payload.config as any).config === "object"
      ? (payload.config as any).config
      : payload.config || {}) as Partial<CrawleeTaskConfig>;

    form.name =
      String(payload.name || (incomingConfig as any).name || "").trim();
    form.url =
      String(
        payload.url ||
          incomingConfig.urls?.[0] ||
          (incomingConfig as any).url ||
          "",
      ).trim();

    const baseSelector =
      trimSelector(incomingConfig.baseSelector) ||
      trimSelector((incomingConfig as any).xpath);

    if (baseSelector) {
      selectedItem.value = {
        xpath: baseSelector,
        base64: "",
      };
    }

    Object.assign(
      crawlerConfig,
      normalizeCrawlerConfig({
        ...incomingConfig,
        maxRequestsPerCrawl: incomingConfig.maxRequestsPerCrawl,
        maxConcurrency: incomingConfig.maxConcurrency,
        requestInterval: incomingConfig.requestInterval,
        timeout: Math.max(
          10,
          Math.round(
            Number(
              incomingConfig.waitForTimeout ||
                incomingConfig.navigationTimeout ||
                60000,
            ) / 1000,
          ) || 60,
        ),
        maxRetries: incomingConfig.maxRetries,
        useCookie: incomingConfig.useCookie,
        cookieMode: incomingConfig.cookieCredentialId ? "credential" : "temporary",
        cookieString: incomingConfig.cookieString,
        cookieDomain: incomingConfig.cookieDomain,
        cookieCredentialId: incomingConfig.cookieCredentialId,
        resultFilters: incomingConfig.resultFilters,
        notification: incomingConfig.notification,
        preActions: incomingConfig.preActions,
      }),
    );

    const restoredNodes = hydrateTreeFromConfig(incomingConfig);
    treeData.splice(0, treeData.length, ...restoredNodes.map(cloneTreeNode));
  }

  return {
    form,
    selectedItem,
    treeData,
    siteType,
    crawlerConfig,
    buildConfig,
    resetForm,
    startNewTask,
    applySerializedTaskConfig,
  };
});
