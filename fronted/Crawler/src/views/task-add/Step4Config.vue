<template>
  <el-card class="mt-6 p-4 flex flex-col h-full space-y-4">
    <div>
      <h3 class="font-bold text-lg">最终配置</h3>
      <p class="text-sm text-gray-500">配置爬虫的运行参数和高级选项</p>
    </div>

    <div class="flex-1 overflow-auto space-y-6">
      <!-- 基本设置 -->
      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><Setting /></el-icon>
            <span>基本设置</span>
          </div>
        </template>

        <el-form :model="config" label-width="120px" class="space-y-4">
          <el-form-item label="并发数">
            <el-input-number
              v-model="config.maxConcurrency"
              :min="1"
              :max="20"
              placeholder="5"
              class="w-32"
            />
            <span class="text-sm text-gray-500 ml-2">同时处理的请求数</span>
          </el-form-item>

          <el-form-item label="请求间隔(ms)">
            <el-input-number
              v-model="config.requestInterval"
              :min="0"
              :max="5000"
              :step="100"
              placeholder="1000"
              class="w-32"
            />
            <span class="text-sm text-gray-500 ml-2">每次请求之间的延时</span>
          </el-form-item>

          <el-form-item label="超时时间(s)">
            <el-input-number
              v-model="config.timeout"
              :min="10"
              :max="300"
              placeholder="30"
              class="w-32"
            />
            <span class="text-sm text-gray-500 ml-2">单个请求的超时时间</span>
          </el-form-item>

          <el-form-item label="最大重试次数">
            <el-input-number
              v-model="config.maxRetries"
              :min="0"
              :max="10"
              placeholder="3"
              class="w-32"
            />
            <span class="text-sm text-gray-500 ml-2">请求失败后的重试次数</span>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- Cookie 设置 -->
      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><Management /></el-icon>
            <span>Cookie 设置</span>
          </div>
        </template>

        <el-form :model="config" label-width="120px" class="space-y-4">
          <el-form-item label="是否需要 Cookie">
            <el-switch
              v-model="config.useCookie"
              active-text="是"
              inactive-text="否"
            />
          </el-form-item>

          <el-form-item v-if="config.useCookie" label="Cookie 内容">
            <el-input
              v-model="config.cookieString"
              type="textarea"
              :rows="4"
              placeholder="粘贴完整的 Cookie 字符串，例如：sessionid=abc123; userid=12345"
              class="font-mono text-sm"
            />
            <div class="text-xs text-gray-500 mt-1">
              <p>• 从浏览器开发者工具中复制完整的 Cookie 字符串</p>
              <p>• 格式：name1=value1; name2=value2; ...</p>
            </div>
          </el-form-item>

          <el-form-item v-if="config.useCookie" label="Cookie 域名">
            <el-input
              v-model="config.cookieDomain"
              placeholder="example.com"
              class="font-mono"
            />
            <span class="text-xs text-gray-500 ml-2">设置 Cookie 的有效域名</span>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 代理设置 -->
      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><Monitor /></el-icon>
            <span>代理设置</span>
          </div>
        </template>

        <el-form :model="config" label-width="120px" class="space-y-4">
          <el-form-item label="使用代理">
            <el-switch
              v-model="config.useProxy"
              active-text="是"
              inactive-text="否"
            />
          </el-form-item>

          <el-form-item v-if="config.useProxy" label="代理服务器">
            <el-input
              v-model="config.proxyUrl"
              placeholder="http://proxy.example.com:8080"
              class="font-mono"
            />
          </el-form-item>

          <el-form-item v-if="config.useProxy" label="代理认证">
            <el-input
              v-model="config.proxyAuth"
              placeholder="username:password"
              class="font-mono"
            />
            <span class="text-xs text-gray-500 ml-2">格式：用户名:密码</span>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 数据处理设置 -->
      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><DocumentCopy /></el-icon>
            <span>数据处理</span>
          </div>
        </template>

        <el-form :model="config" label-width="120px" class="space-y-4">
          <el-form-item label="去重处理">
            <el-switch
              v-model="config.removeDuplicates"
              active-text="启用"
              inactive-text="禁用"
            />
            <span class="text-sm text-gray-500 ml-2">自动移除重复数据</span>
          </el-form-item>

          <el-form-item label="数据验证">
            <el-switch
              v-model="config.enableValidation"
              active-text="启用"
              inactive-text="禁用"
            />
            <span class="text-sm text-gray-500 ml-2">对爬取数据进行基本验证</span>
          </el-form-item>


          <el-form-item label="文件名模板">
            <el-input
              v-model="config.filenameTemplate"
              placeholder="results_{timestamp}"
              class="font-mono"
            />
            <div class="text-xs text-gray-500 mt-1">
              <p>• 支持变量：{timestamp}, {date}, {name}</p>
              <p>• 例如：data_{date}_{name}.json</p>
            </div>
          </el-form-item>

          <el-form-item label="自定义 JS 处理">
            <el-input
              v-model="config.customItemProcessorCode"
              type="textarea"
              :rows="6"
              placeholder="// 可选：对每条 item 进行自定义处理\n// item 为当前一条数据对象，必须 return：\n// - 返回对象：作为新的 item\n// - 返回 null/undefined/false：丢弃该条数据\n// 示例：只保留播放量 >= 10000 的视频\n// const play = Number((item['播放量'] || '0').replace(/[^0-9]/g, ''));\n// if (play < 10000) return null;\n// item['标题'] = (item['标题'] || '').trim();\n// return item;"
              class="font-mono text-xs"
            />
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 结果筛选（按字段值过滤记录） -->
      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><DocumentCopy /></el-icon>
            <span>结果筛选（字段值条件）</span>
          </div>
        </template>

        <div class="text-xs text-gray-500 mb-3">
          例如：爬取 B 站首页视频时，可以设置「播放量 ≥ 某个值」「标题包含关键词」「UP 主名称不为空」等条件，不满足条件的整条数据会被丢弃。
        </div>

        <el-form :model="config" label-width="120px" class="space-y-4">
          <el-form-item label="自定义布尔函数">
            <el-input
              v-model="config.customFilterCode"
              type="textarea"
              :rows="3"
              placeholder="return (Number((item['播放量']||'0').replace(/\D/g,'')) || 0) >= 10000;  // 入参 item，true 保留 false 丢弃，与上方规则同时生效"
              class="font-mono text-xs"
            />
            <div class="text-xs text-gray-500 mt-1">可选。与上方规则同时生效（规则 AND 本函数），入参 item，需 return 布尔值。</div>
          </el-form-item>

          <el-form-item label="筛选规则">
            <div class="w-full space-y-2">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm text-gray-500">
                  所有规则都会按「并且（AND）」关系组合，全部满足才保留该条数据。
                </span>
                <el-button size="small" type="primary" @click="addResultFilter">
                  新增规则
                </el-button>
              </div>

              <el-empty
                v-if="config.resultFilters.length === 0"
                description="暂未添加筛选规则"
                :image-size="60"
              />

              <el-card
                v-for="rule in config.resultFilters"
                :key="rule.id"
                class="mb-2"
                shadow="never"
                body-class="space-y-2"
              >
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                  <div>
                    <div class="text-xs text-gray-500 mb-1">字段</div>
                    <el-select
                      v-model="rule.field"
                      filterable
                      allow-create
                      default-first-option
                      placeholder="选择或输入字段名，如：播放量"
                      size="small"
                      class="w-full"
                    >
                      <el-option
                        v-for="name in fieldNameOptions"
                        :key="name"
                        :label="name"
                        :value="name"
                      />
                    </el-select>
                  </div>

                  <div>
                    <div class="text-xs text-gray-500 mb-1">条件</div>
                    <el-select
                      v-model="rule.operator"
                      size="small"
                      placeholder="选择条件类型"
                      class="w-full"
                    >
                      <el-option
                        v-for="op in operatorOptions"
                        :key="op.value"
                        :label="op.label"
                        :value="op.value"
                      />
                    </el-select>
                  </div>

                  <div class="flex items-center gap-2">
                    <div class="flex-1">
                      <div class="text-xs text-gray-500 mb-1">比较值</div>
                      <el-input
                        v-model="rule.value"
                        size="small"
                        placeholder="例如：10000 或 某关键词"
                      />
                    </div>
                    <el-button
                      type="danger"
                      size="small"
                      text
                      @click="removeResultFilter(rule.id)"
                    >
                      删除
                    </el-button>
                  </div>
                </div>
              </el-card>
            </div>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 页面交互（搜索与筛选） -->
      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><Tools /></el-icon>
            <span>页面交互（搜索与筛选）</span>
          </div>
        </template>

        <el-form
          :model="configInteraction"
          label-width="120px"
          class="space-y-4"
        >
          <!-- 搜索关键词 -->
          <el-form-item label="启用搜索">
            <el-switch
              v-model="configInteraction.searchEnabled"
              active-text="是"
              inactive-text="否"
            />
            <span class="text-sm text-gray-500 ml-2">
              适用于必须先在搜索框输入关键词才能看到列表数据的页面
            </span>
          </el-form-item>

          <template v-if="configInteraction.searchEnabled">
            <el-form-item label="输入框类型">
              <el-radio-group v-model="configInteraction.searchInputType">
                <el-radio value="xpath">XPath</el-radio>
                <el-radio value="jsPath">JSPath</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="输入框选择器">
              <el-input
                v-model="configInteraction.searchInputSelector"
                placeholder="//input[@name='q'] 或 document.querySelector('input[name=q]')"
                class="font-mono text-sm"
              />
            </el-form-item>

            <el-form-item label="关键词来源">
              <el-radio-group v-model="configInteraction.searchKeywordMode">
                <el-radio value="fixed">固定关键词</el-radio>
                <el-radio value="dynamic">动态（由后端/任务参数提供）</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item
              v-if="configInteraction.searchKeywordMode === 'fixed'"
              label="关键词值"
            >
              <el-input
                v-model="configInteraction.searchKeywordValue"
                placeholder="例如：手机壳"
              />
            </el-form-item>

            <el-form-item label="触发方式">
              <el-radio-group v-model="configInteraction.searchSubmitType">
                <el-radio value="enter">按回车</el-radio>
                <el-radio value="click">点击按钮</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item
              v-if="configInteraction.searchSubmitType === 'click'"
              label="按钮选择器"
            >
              <el-input
                v-model="configInteraction.searchSubmitSelector"
                placeholder="//button[@type='submit'] 或 document.querySelector('button.search')"
                class="font-mono text-sm"
              />
            </el-form-item>
          </template>

          <!-- 数据筛选 -->
          <el-form-item label="筛选条件">
            <div class="w-full space-y-2">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm text-gray-500">
                  可配置站内筛选条件，例如「只显示有货」、「价格区间」等
                </span>
                <el-button size="small" type="primary" @click="addFilter">
                  新增筛选条件
                </el-button>
              </div>

              <el-empty
                v-if="configInteraction.filters.length === 0"
                description="暂未添加筛选条件"
                :image-size="60"
              />

              <el-card
                v-for="filter in configInteraction.filters"
                :key="filter.id"
                class="mb-2"
                shadow="never"
                body-class="space-y-2"
              >
                <div class="flex justify-between items-center">
                  <el-input
                    v-model="filter.label"
                    size="small"
                    placeholder="筛选名称，例如：只显示有货"
                    class="mr-2"
                  />
                  <el-button
                    type="danger"
                    size="small"
                    text
                    @click="removeFilter(filter.id)"
                  >
                    删除
                  </el-button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <div class="text-xs text-gray-500 mb-1">操作类型</div>
                    <el-radio-group v-model="filter.actionType" size="small">
                      <el-radio value="click">点击触发</el-radio>
                      <el-radio value="select">选择值</el-radio>
                    </el-radio-group>
                  </div>

                  <div>
                    <div class="text-xs text-gray-500 mb-1">选择器类型</div>
                    <el-radio-group v-model="filter.selectorType" size="small">
                      <el-radio value="xpath">XPath</el-radio>
                      <el-radio value="jsPath">JSPath</el-radio>
                    </el-radio-group>
                  </div>
                </div>

                <div>
                  <div class="text-xs text-gray-500 mb-1">元素选择器</div>
                  <el-input
                    v-model="filter.selector"
                    size="small"
                    class="font-mono text-xs"
                    placeholder="//button[contains(., '只看有货')] 或 document.querySelector('#filter')"
                  />
                </div>

                <div v-if="filter.actionType === 'select'">
                  <div class="text-xs text-gray-500 mb-1">选择的值（可选）</div>
                  <el-input
                    v-model="filter.value"
                    size="small"
                    placeholder="例如：0-100 或 北京"
                  />
                </div>
              </el-card>
            </div>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 高级设置 -->
      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><Tools /></el-icon>
            <span>高级设置</span>
          </div>
        </template>

        <el-form :model="config" label-width="120px" class="space-y-4">
          <el-form-item label="浏览器设置">
            <div class="space-y-2">
              <el-checkbox v-model="config.headless">无头模式</el-checkbox>
              <el-checkbox v-model="config.disableImages">禁用图片加载</el-checkbox>
              <el-checkbox v-model="config.disableStyles">禁用样式加载</el-checkbox>
            </div>
          </el-form-item>

          <el-form-item label="User Agent">
            <el-input
              v-model="config.userAgent"
              placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
              class="font-mono text-sm"
            />
          </el-form-item>

          <el-form-item label="自定义 Headers">
            <el-input
              v-model="config.customHeaders"
              type="textarea"
              :rows="3"
              placeholder='{"Accept-Language": "zh-CN,zh;q=0.9", "Accept-Encoding": "gzip, deflate"}'
              class="font-mono text-sm"
            />
            <span class="text-xs text-gray-500 mt-1">JSON 格式的自定义请求头</span>
          </el-form-item>
        </el-form>
      </el-card>
    </div>

    <div class="flex justify-end gap-2 pt-4 border-t">
      <el-button @click="goBack">上一步</el-button>
      <el-button type="primary" @click="goNext">下一步</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { reactive, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useTaskFormStore } from "@/stores/taskForm";
import {
  Setting,
  Management,
  DocumentCopy,
  Tools,
} from "@element-plus/icons-vue";

const store = useTaskFormStore();
const router = useRouter();

let filterIdSeed = 1;
let resultFilterIdSeed = 1;

// 配置对象
const config = reactive({
  // 基本设置
  maxConcurrency: 5,
  requestInterval: 1000,
  timeout: 30,
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

  // 自定义 JS 处理
  customItemProcessorCode: "",

  // 结果筛选规则
  resultFilters: [] as any[],
  // 结果筛选：自定义布尔函数（可选）
  customFilterCode: "",

  // 页面交互（搜索与筛选）
  interaction: {
    searchEnabled: false,
    searchInputType: "xpath",
    searchInputSelector: "",
    searchKeywordMode: "fixed",
    searchKeywordValue: "",
    searchSubmitType: "enter",
    searchSubmitSelector: "",
    filters: [] as any[],
  },

  // 高级设置
  headless: true,
  disableImages: false,
  disableStyles: false,
  userAgent: "",
  customHeaders: "",
});

// 为了简化模板中的绑定，单独暴露一个引用
const configInteraction = config.interaction;

// 用于结果筛选的可选字段名（来自字段映射树）
const fieldNameOptions = computed(() => {
  const names: string[] = [];

  function visit(nodes: any[]) {
    for (const node of nodes) {
      if (node.type === "field" && node.label) {
        names.push(node.label);
      }
      if (node.children && node.children.length > 0) {
        visit(node.children);
      }
    }
  }

  visit(store.treeData as any[]);

  return Array.from(new Set(names));
});

const operatorOptions = [
  { label: "大于等于（数值）", value: "gte" },
  { label: "小于等于（数值）", value: "lte" },
  { label: "等于", value: "eq" },
  { label: "包含（字符串）", value: "contains" },
  { label: "不包含（字符串）", value: "not_contains" },
];

// 从 store 中恢复配置
onMounted(() => {
  if (store.crawlerConfig) {
    Object.assign(config, store.crawlerConfig);

    if (!(config as any).interaction) {
      (config as any).interaction = {
        searchEnabled: false,
        searchInputType: "xpath",
        searchInputSelector: "",
        searchKeywordMode: "fixed",
        searchKeywordValue: "",
        searchSubmitType: "enter",
        searchSubmitSelector: "",
        filters: [],
      };
    }
    if ((config as any).customFilterCode === undefined) {
      (config as any).customFilterCode = "";
    }

    const filters = (config as any).interaction.filters || [];
    if (filters.length > 0) {
      const maxId = Math.max(...filters.map((f: any) => f.id || 0), 0);
      filterIdSeed = maxId + 1;
    }

    const resultFilters = (config as any).resultFilters || [];
    if (resultFilters.length > 0) {
      const maxResultId = Math.max(
        ...resultFilters.map((f: any) => f.id || 0),
        0
      );
      resultFilterIdSeed = maxResultId + 1;
    }
  }
});

function addFilter() {
  configInteraction.filters.push({
    id: filterIdSeed++,
    label: "",
    actionType: "click",
    selectorType: "xpath",
    selector: "",
    value: "",
  });
}

function removeFilter(id: number) {
  const idx = configInteraction.filters.findIndex((f: any) => f.id === id);
  if (idx !== -1) {
    configInteraction.filters.splice(idx, 1);
  }
}

function addResultFilter() {
  (config.resultFilters as any[]).push({
    id: resultFilterIdSeed++,
    field: "",
    operator: "gte",
    value: "",
  });
}

function removeResultFilter(id: number) {
  const list = config.resultFilters as any[];
  const idx = list.findIndex((r: any) => r.id === id);
  if (idx !== -1) {
    list.splice(idx, 1);
  }
}

// 保存配置到 store
function saveConfig() {
  store.crawlerConfig = { ...(config as any) };
}

function goBack() {
  saveConfig();
  router.push("/crawleer/task-add/mapping");
}

function goNext() {
  saveConfig();
  router.push("/crawleer/task-add/preview");
}
</script>

<style scoped>
.font-mono {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}
</style>
