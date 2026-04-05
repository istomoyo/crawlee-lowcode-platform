//fronted\Crawler\src\stores\taskForm.ts

import { defineStore } from "pinia";
import { reactive, ref } from "vue";

interface TreeNode {
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
  /** 仅当作为链接子节点时：嵌套列表的容器选择器（如评论列表每项的容器） */
  listBaseSelector?: string;
  /** 嵌套列表输出字段名，默认 "items" */
  listOutputKey?: string;
  // 可选：字段内容格式（由字段映射步骤设置）
  contentFormat?: "text" | "html" | "markdown" | "smart";
  // 可选：对该字段取值后的 JS 处理，入参 value，需 return 新值
  customTransformCode?: string;
  // 该层提取前动作（用于 link 子层的 next/scroll 节点）
  preActions?: PreActionConfig[];
  // 当节点类型为 link 时，指定其跳转后页面中“当前层列表项”的根选择器
  detailBaseSelector?: string;
}

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
  // 搜索关键词场景
  searchEnabled: boolean;
  searchInputType: "xpath" | "jsPath";
  searchInputSelector: string;
  searchKeywordMode: "fixed" | "dynamic";
  searchKeywordValue: string;
  searchSubmitType: "enter" | "click";
  searchSubmitSelector: string;
  // 数据筛选场景
  filters: PageFilterCondition[];
}

export interface PreActionConfig {
  type: "click" | "wait_for_selector" | "wait_for_timeout";
  selectorType?: "xpath" | "css";
  selector?: string;
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
};

type NestedContextItem = {
  parentLink: string;
  baseSelector: string;
  listOutputKey?: string;
  scroll?: { maxScroll: number; waitTime: number; maxItems: number };
  next?: { selector: string; maxPages: number };
  selectors: SelectorItem[];
  maxDepth?: number;
  preActions?: PreActionConfig[];
};

// 结果过滤：在爬取完成后按字段值丢弃不符合条件的记录
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

export interface CrawlerConfigState {
  maxRequestsPerCrawl: number;
  maxConcurrency: number;
  requestInterval: number;
  timeout: number;
  maxRetries: number;
  useCookie: boolean;
  cookieString: string;
  cookieDomain: string;
  resultFilters: ResultFilterRule[];
  notification: TaskNotificationConfig;
  preActions: PreActionConfig[];
}

export function createDefaultCrawlerConfig(): CrawlerConfigState {
  return {
    maxRequestsPerCrawl: 100,
    maxConcurrency: 5,
    requestInterval: 1000,
    timeout: 60,
    maxRetries: 3,
    useCookie: false,
    cookieString: "",
    cookieDomain: "",
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

function normalizeResultFilterRules(rules: unknown): ResultFilterRule[] {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules
    .map((rule, index) => {
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
        return null;
      }

      if (mode === "function") {
        if (!functionCode) {
          return null;
        }

        return {
          id: Number(current.id) || index + 1,
          field,
          mode,
          functionCode,
          value,
        } as ResultFilterRule;
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
        return null;
      }

      return {
        id: Number(current.id) || index + 1,
        field,
        mode,
        operator,
        value,
      } as ResultFilterRule;
    })
    .filter((rule): rule is ResultFilterRule => Boolean(rule));
}

export function normalizeCrawlerConfig(
  input?: Partial<CrawlerConfigState> | Record<string, any>
): CrawlerConfigState {
  const defaults = createDefaultCrawlerConfig();
  const raw = (input || {}) as Partial<CrawlerConfigState> & Record<string, any>;

  return {
    maxRequestsPerCrawl: Math.max(
      1,
      Number(raw.maxRequestsPerCrawl ?? defaults.maxRequestsPerCrawl) ||
        defaults.maxRequestsPerCrawl
    ),
    maxConcurrency: Math.max(
      1,
      Number(raw.maxConcurrency ?? defaults.maxConcurrency) ||
        defaults.maxConcurrency
    ),
    requestInterval: Math.max(
      0,
      Number(raw.requestInterval ?? defaults.requestInterval) ||
        defaults.requestInterval
    ),
    timeout: Math.max(
      10,
      Number(raw.timeout ?? defaults.timeout) || defaults.timeout
    ),
    maxRetries: Math.max(
      0,
      Number(raw.maxRetries ?? defaults.maxRetries) || defaults.maxRetries
    ),
    useCookie: Boolean(raw.useCookie),
    cookieString: String(raw.cookieString ?? defaults.cookieString).trim(),
    cookieDomain: String(raw.cookieDomain ?? defaults.cookieDomain).trim(),
    resultFilters: normalizeResultFilterRules(raw.resultFilters),
    notification: {
      enabled: Boolean(raw.notification?.enabled),
      onSuccess:
        typeof raw.notification?.onSuccess === "boolean"
          ? raw.notification.onSuccess
          : true,
      onFailure:
        typeof raw.notification?.onFailure === "boolean"
          ? raw.notification.onFailure
          : true,
      previewCount: Math.max(
        0,
        Math.min(
          10,
          Number(raw.notification?.previewCount ?? defaults.notification.previewCount) ||
            defaults.notification.previewCount
        )
      ),
    },
    preActions: Array.isArray(raw.preActions)
      ? [...raw.preActions]
      : defaults.preActions,
  };
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

  // 网站类型配置
  const siteType = ref<{
    value: string;
    label: string;
    icon: string;
    description: string;
    strategy: string;
    defaultContentFormat: "text" | "html" | "markdown" | "smart";
    articleDetectionEnabled: boolean;
  } | null>(null);

  // 爬虫配置
  const crawlerConfig = reactive(createDefaultCrawlerConfig());

  /*
  const legacyCrawlerConfig = reactive({
    // 基本设置
    maxRequestsPerCrawl: 100,
    maxConcurrency: 5,
    requestInterval: 1000,
    timeout: 60,
    maxRetries: 3,

    // Cookie 设置
    useCookie: false,
    cookieString: "",
    cookieDomain: "",

    // 代理设置

    // 数据处理
    removeDuplicates: true,
    enableValidation: true,
    filenameTemplate: "results_{timestamp}",
    // 爬取结果过滤规则（按字段值过滤整条记录）
    resultFilters: [] as ResultFilterRule[],
    // 自定义 JS 处理代码（可选）
    customItemProcessorCode: "",
    // 结果筛选：自定义布尔函数（可选），入参 item，true 保留 false 丢弃
    customFilterCode: "",

    // 高级设置
    headless: true,
    disableImages: false,
    disableStyles: false,
    userAgent: "",
    customHeaders: "",

    // 页面交互（搜索与筛选）
    interaction: {
      searchEnabled: false,
      searchInputType: "xpath",
      searchInputSelector: "",
      searchKeywordMode: "fixed",
      searchKeywordValue: "",
      searchSubmitType: "enter",
      searchSubmitSelector: "",
      filters: [] as PageFilterCondition[],
    } as PageInteractionConfig,
    // Step3 field-mapping pre actions (e.g. click-to-load then wait)
    preActions: [] as PreActionConfig[],
  });
  */

  function buildConfig() {
    // 获取基础XPath
    const baseSelector = selectedItem.value?.xpath || selectedItem.value?.jsPath || '';

    // 转换treeData为selectors（含 page-level 与 list-level 分离，用于嵌套列表）
    const { selectors, nestedContexts } = convertTreeToSelectors(treeData, baseSelector);

    // 处理分页和滚动配置
    const paginationConfig = getPaginationConfig(treeData);

    const normalizedCrawlerConfig = normalizeCrawlerConfig(crawlerConfig as any);

    const config: any = {
      crawlerType: 'playwright',
      urls: [form.url],
      maxRequestsPerCrawl: normalizedCrawlerConfig.maxRequestsPerCrawl || 1,
      maxConcurrency: normalizedCrawlerConfig.maxConcurrency,
      waitForTimeout: normalizedCrawlerConfig.timeout * 1000,
      navigationTimeout: normalizedCrawlerConfig.timeout * 1000,
      requestInterval: normalizedCrawlerConfig.requestInterval,
      maxRetries: normalizedCrawlerConfig.maxRetries,
      useCookie: normalizedCrawlerConfig.useCookie,
      cookieString: normalizedCrawlerConfig.useCookie
        ? normalizedCrawlerConfig.cookieString
        : undefined,
      cookieDomain: normalizedCrawlerConfig.useCookie
        ? normalizedCrawlerConfig.cookieDomain || undefined
        : undefined,
      resultFilters: normalizedCrawlerConfig.resultFilters,
      notification: normalizedCrawlerConfig.notification.enabled
        ? normalizedCrawlerConfig.notification
        : undefined,
      preActions: normalizedCrawlerConfig.preActions,
      ...paginationConfig,
      selectors,
    };

    // 如果有基础选择器，添加到配置中
    if (baseSelector) {
      config.baseSelector = baseSelector;
    }

    // 嵌套提取上下文（详情页内的列表，如评论，最多 3 层）
    if (nestedContexts && nestedContexts.length > 0) {
      config.nestedContexts = nestedContexts;
    }

    return config;
  }

  function getPaginationConfig(nodes: TreeNode[]) {
    // 查找分页或滚动节点
    const paginationNode = nodes.find(node => node.type === 'next' || node.type === 'scroll');

    if (!paginationNode) {
      // 如果没有分页或滚动配置，返回默认滚动配置
      return {
        scrollEnabled: true,
        scrollDistance: 1000,
        scrollDelay: 2000,
        maxScrollDistance: 10000,
        maxItems: 100, // 默认最大数量
      };
    }

    if (paginationNode.type === 'next') {
      // 分页配置
      return {
        nextPageSelector: paginationNode.selector || paginationNode.jsPath,
        maxPages: paginationNode.maxPages || 10,
      };
    } else if (paginationNode.type === 'scroll') {
      // 滚动配置
      return {
        scrollEnabled: true,
        scrollDistance: 1000,
        scrollDelay: paginationNode.waitTime || 2000,
        maxScrollDistance: (paginationNode.maxScroll || 5) * 1000, // 转换为距离
        maxItems: paginationNode.maxItems || 100,
      };
    }

    return {};
  }

  function convertTreeToSelectors(
    nodes: TreeNode[],
    baseSelector?: string,
    parentLinkUrl?: string,
    parentDetailBaseSelector?: string,
  ): { selectors: SelectorItem[]; nestedContexts: NestedContextItem[] } {
    type SelItem = SelectorItem;
    const selectors: SelItem[] = [];
    const nestedContexts: NestedContextItem[] = [];

    function toSel(n: TreeNode, pl?: string, detailBaseSelector?: string): SelItem {
      const s: SelItem = { name: n.label, selector: n.selector || n.jsPath || '', type: n.type === 'field' ? 'text' : n.type === 'link' ? 'link' : 'image' };
      if (n.type === 'field' && n.contentFormat) s.contentFormat = n.contentFormat;
      if (n.customTransformCode) s.customTransformCode = n.customTransformCode;
      if (pl) s.parentLink = pl;
      if (detailBaseSelector) s.detailBaseSelector = detailBaseSelector;
      return s;
    }

    for (const node of nodes) {
      const currentDetailBaseSelector =
        node.type === 'link'
          ? node.detailBaseSelector || undefined
          : parentDetailBaseSelector;

      if (node.type === 'field' || node.type === 'image' || node.type === 'link') {
        selectors.push(toSel(node, parentLinkUrl, parentDetailBaseSelector));
      }

      if (node.children && node.children.length > 0) {
        const childParentLinkUrl = node.type === 'link' ? node.label : parentLinkUrl;
        if (node.type === 'link') {
          const pagNode = node.children.find((c) => (c.type === 'next' || c.type === 'scroll') && c.listBaseSelector) as TreeNode | undefined;
          if (pagNode && pagNode.listBaseSelector) {
            for (const c of node.children) {
              if (c === pagNode) break;
              if (c.type === 'field' || c.type === 'image' || c.type === 'link') selectors.push(toSel(c, childParentLinkUrl, currentDetailBaseSelector));
            }
            const listSels: SelItem[] = [];
            let after = false;
            for (const c of node.children) {
              if (c === pagNode) { after = true; continue; }
              if (!after || (c.type !== 'field' && c.type !== 'image' && c.type !== 'link')) continue;
              listSels.push(toSel(c));
            }
            const ctx: NestedContextItem = {
              parentLink: node.label,
              baseSelector: currentDetailBaseSelector || pagNode.listBaseSelector,
              listOutputKey: pagNode.listOutputKey || "items",
              selectors: listSels,
              maxDepth: 5,
              preActions: pagNode.preActions?.length ? [...pagNode.preActions] : undefined,
            };
            if (pagNode.type === 'scroll') ctx.scroll = { maxScroll: pagNode.maxScroll || 5, waitTime: pagNode.waitTime || 1000, maxItems: pagNode.maxItems || 100 };
            else if (pagNode.type === 'next') ctx.next = { selector: pagNode.selector || pagNode.jsPath || '', maxPages: pagNode.maxPages || 10 };
            nestedContexts.push(ctx);
          } else {
            const cr = convertTreeToSelectors(
              node.children,
              baseSelector,
              childParentLinkUrl,
              currentDetailBaseSelector,
            );
            selectors.push(...cr.selectors);
            nestedContexts.push(...cr.nestedContexts);
          }
        } else {
          const cr = convertTreeToSelectors(
            node.children,
            baseSelector,
            childParentLinkUrl,
            currentDetailBaseSelector,
          );
          selectors.push(...cr.selectors);
          nestedContexts.push(...cr.nestedContexts);
        }
      }
    }

    return { selectors, nestedContexts };
  }

  function resetForm() {
    form.name = "";
    form.url = "";
    selectedItem.value = null;
    treeData.length = 0;
    siteType.value = null;
    Object.assign(crawlerConfig, createDefaultCrawlerConfig());
  }

  return {
    form,
    selectedItem,
    treeData,
    siteType,
    crawlerConfig,
    buildConfig,
    resetForm,
  };
});
