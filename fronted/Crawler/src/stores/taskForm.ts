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
  const crawlerConfig = reactive({
    // 基本设置
    maxConcurrency: 5,
    requestInterval: 1000,
    timeout: 60,
    maxRetries: 3,

    // Cookie 设置
    useCookie: false,
    cookieString: "",
    cookieDomain: "",

    // 代理设置
    useProxy: false,
    proxyUrl: "",
    proxyAuth: "",

    // 数据处理
    removeDuplicates: true,
    enableValidation: true,
    filenameTemplate: "results_{timestamp}",

    // 高级设置
    headless: true,
    disableImages: false,
    disableStyles: false,
    userAgent: "",
    customHeaders: ""
  });

  function buildConfig() {
    // 获取基础XPath
    const baseSelector = selectedItem.value?.xpath || selectedItem.value?.jsPath || '';

    // 转换treeData为selectors
    const selectors = convertTreeToSelectors(treeData, baseSelector);

    // 处理分页和滚动配置
    const paginationConfig = getPaginationConfig(treeData);

    const config: any = {
      crawlerType: 'playwright',
      urls: [form.url],
      maxRequestsPerCrawl: crawlerConfig.maxRequestsPerCrawl || 1,
      maxConcurrency: crawlerConfig.maxConcurrency,
      headless: crawlerConfig.headless,
      viewport: { width: 1920, height: 1080 },
      waitForTimeout: crawlerConfig.timeout * 1000,
      navigationTimeout: crawlerConfig.timeout * 1000,
      userAgent: crawlerConfig.userAgent || undefined,
      proxyUrl: crawlerConfig.useProxy ? crawlerConfig.proxyUrl : undefined,
      requestInterval: crawlerConfig.requestInterval,
      maxRetries: crawlerConfig.maxRetries,
      useCookie: crawlerConfig.useCookie,
      cookieString: crawlerConfig.cookieString,
      cookieDomain: crawlerConfig.cookieDomain,
      proxyAuth: crawlerConfig.proxyAuth,
      removeDuplicates: crawlerConfig.removeDuplicates,
      enableValidation: crawlerConfig.enableValidation,
      filenameTemplate: crawlerConfig.filenameTemplate,
      disableImages: crawlerConfig.disableImages,
      disableStyles: crawlerConfig.disableStyles,
      customHeaders: crawlerConfig.customHeaders,
      ...paginationConfig,
      selectors,
    };

    // 如果有基础选择器，添加到配置中
    if (baseSelector) {
      config.baseSelector = baseSelector;
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
  ): Array<{
    name: string;
    selector: string;
    type: string;
    contentFormat?: 'text' | 'html' | 'markdown' | 'smart';
    parentLink?: string; // 父链接URL，子节点应在此链接页面上执行
  }> {
    const selectors = [];

    for (const node of nodes) {
      if (node.type === 'field' || node.type === 'image' || node.type === 'link') {
        let selector = node.selector || node.jsPath || '';

        const selectorConfig: any = {
          name: node.label,
          selector,
          type: node.type === 'field' ? 'text' :
                node.type === 'link' ? 'link' : 'image',
        };

        // 文本字段带上内容格式配置，供后端爬虫使用
        if (node.type === 'field' && node.contentFormat) {
          selectorConfig.contentFormat = node.contentFormat;
        }

        // 只有子节点才需要设置 parentLink，link 类型的节点本身不需要 parentLink
        if (parentLinkUrl) {
          // 如果有父链接URL（表示这是链接的子节点），添加到配置中
          selectorConfig.parentLink = parentLinkUrl;
        }

        selectors.push(selectorConfig);
      }

      // 递归处理子节点
      if (node.children && node.children.length > 0) {
        // 确定子节点的父链接URL
        let childParentLinkUrl = parentLinkUrl; // 默认继承当前父链接

        // 如果当前节点是链接节点，使用其名称作为子节点的父链接标识符
        // 这样在后端处理时可以动态获取实际的链接值
        if (node.type === 'link') {
          childParentLinkUrl = node.label; // 使用链接节点的名称
        }
        // 注意：这里我们不传递undefined，如果没有找到链接URL就保持父级的URL
        // 这样可以处理多层嵌套的情况

        selectors.push(...convertTreeToSelectors(node.children, baseSelector, childParentLinkUrl));
      }
    }

    return selectors;
  }

  function resetForm() {
    form.name = "";
    form.url = "";
    selectedItem.value = null;
    treeData.length = 0;
    siteType.value = null;
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
