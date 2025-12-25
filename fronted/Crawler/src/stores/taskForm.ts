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
    outputFormat: "json",
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
      maxRequestsPerCrawl: 1,
      maxConcurrency: crawlerConfig.maxConcurrency,
      headless: crawlerConfig.headless,
      viewport: { width: 1920, height: 1080 },
      waitForTimeout: crawlerConfig.timeout * 1000, // 转换为毫秒
      navigationTimeout: crawlerConfig.timeout * 1000,
      userAgent: crawlerConfig.userAgent || undefined,
      proxyUrl: crawlerConfig.useProxy ? crawlerConfig.proxyUrl : undefined,
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

  function convertTreeToSelectors(nodes: TreeNode[], baseSelector?: string): Array<{
    name: string;
    selector: string;
    type: string;
  }> {
    const selectors = [];

    for (const node of nodes) {
      if (node.type === 'field' || node.type === 'image' || node.type === 'link') {
        let selector = node.selector || node.jsPath || '';

        // 如果有基础选择器，保持相对XPath不变，让后端处理
        // 前端不再预先组合路径，后端会使用baseSelector找到列表项，然后在每个项内使用相对路径查找字段

        selectors.push({
          name: node.label,
          selector,
          type: node.type === 'field' ? 'text' :
                node.type === 'link' ? 'link' : 'image',
        });
      }

      // 递归处理子节点
      if (node.children && node.children.length > 0) {
        selectors.push(...convertTreeToSelectors(node.children, baseSelector));
      }
    }

    return selectors;
  }

  function resetForm() {
    form.name = "";
    form.url = "";
    selectedItem.value = null;
    treeData.length = 0;
  }

  return {
    form,
    selectedItem,
    treeData,
    crawlerConfig,
    buildConfig,
    resetForm,
  };
});
