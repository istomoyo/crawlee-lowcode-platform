<template>
  <el-card class="mt-6 p-4 flex flex-col h-full space-y-4">
    <div>
      <h3 class="font-bold text-lg">最终配置</h3>
      <p class="text-sm text-gray-500">
        设置任务运行参数、Cookie、结果筛选规则，以及执行完成后的邮件通知。
      </p>
    </div>

    <div class="flex-1 overflow-auto space-y-6">
      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><Setting /></el-icon>
            <span>基础设置</span>
          </div>
        </template>

        <el-form :model="config" label-width="120px" class="space-y-4">
          <el-form-item label="并发数">
            <el-input-number
              v-model="config.maxConcurrency"
              :min="1"
              :max="20"
              class="w-32"
            />
            <span class="text-sm text-gray-500 ml-2">同一时间并行处理的请求数量</span>
          </el-form-item>

          <el-form-item label="请求间隔(ms)">
            <el-input-number
              v-model="config.requestInterval"
              :min="0"
              :max="10000"
              :step="100"
              class="w-32"
            />
            <span class="text-sm text-gray-500 ml-2">每次请求和重试前的等待时间</span>
          </el-form-item>

          <el-form-item label="超时时间(s)">
            <el-input-number
              v-model="config.timeout"
              :min="10"
              :max="300"
              class="w-32"
            />
            <span class="text-sm text-gray-500 ml-2">页面导航和元素等待超时时间</span>
          </el-form-item>

          <el-form-item label="最大重试次数">
            <el-input-number
              v-model="config.maxRetries"
              :min="0"
              :max="10"
              class="w-32"
            />
            <span class="text-sm text-gray-500 ml-2">请求失败或字段为空时的重试次数</span>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><Management /></el-icon>
            <span>Cookie 设置</span>
          </div>
        </template>

        <el-form :model="config" label-width="120px" class="space-y-4">
          <el-form-item label="启用 Cookie">
            <el-switch
              v-model="config.useCookie"
              active-text="启用"
              inactive-text="关闭"
            />
            <span class="text-sm text-gray-500 ml-2">
              详情页访问和后续打包下载都会复用这里配置的 Cookie
            </span>
          </el-form-item>

          <template v-if="config.useCookie">
            <el-form-item label="Cookie 内容">
              <el-input
                v-model="config.cookieString"
                type="textarea"
                :rows="4"
                placeholder="例如：sessionid=abc123; token=xyz456"
                class="font-mono text-sm"
              />
              <div class="text-xs text-gray-500 mt-1">
                直接粘贴浏览器请求头中的整段 Cookie 即可，格式为
                `name1=value1; name2=value2`
              </div>
            </el-form-item>

            <el-form-item label="Cookie 域名">
              <el-input
                v-model="config.cookieDomain"
                placeholder="留空时自动使用任务 URL 域名，例如 example.com"
                class="font-mono"
              />
              <span class="text-xs text-gray-500 ml-2">
                用于限制 Cookie 发送范围，资源打包下载时也会按这个域名匹配
              </span>
            </el-form-item>
          </template>
        </el-form>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><DocumentCopy /></el-icon>
            <span>结果筛选（字段值条件）</span>
          </div>
        </template>

        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="text-sm text-gray-600">
                所有规则按 AND 生效，只有满足全部规则的记录才会被保留。
              </div>
              <div class="text-xs text-gray-500 mt-1">
                支持普通比较模式，也支持为单个字段编写自定义 bool 函数。
              </div>
            </div>
            <el-button size="small" type="primary" @click="addResultFilter">
              新增规则
            </el-button>
          </div>

          <el-empty
            v-if="config.resultFilters.length === 0"
            description="暂未添加筛选规则"
            :image-size="60"
          />

          <div v-else class="space-y-3">
            <el-card
              v-for="rule in config.resultFilters"
              :key="rule.id"
              shadow="never"
              body-class="space-y-3"
            >
              <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <div class="text-xs text-gray-500 mb-1">字段名</div>
                  <el-select
                    v-model="rule.field"
                    filterable
                    allow-create
                    default-first-option
                    placeholder="例如：标题 / 播放量"
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
                  <div class="text-xs text-gray-500 mb-1">模式</div>
                  <el-select
                    v-model="rule.mode"
                    placeholder="选择模式"
                    class="w-full"
                  >
                    <el-option
                      v-for="option in ruleModeOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                    />
                  </el-select>
                </div>

                <div v-if="rule.mode !== 'function'">
                  <div class="text-xs text-gray-500 mb-1">条件</div>
                  <el-select
                    v-model="rule.operator"
                    placeholder="选择条件"
                    class="w-full"
                  >
                    <el-option
                      v-for="option in operatorOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                    />
                  </el-select>
                </div>

                <div v-if="rule.mode !== 'function'">
                  <div class="text-xs text-gray-500 mb-1">比较值</div>
                  <el-input
                    v-if="needsValue(rule.operator || 'contains')"
                    v-model="rule.value"
                    placeholder="例如：10000 / 关键词"
                  />
                  <div
                    v-else
                    class="h-8 px-3 rounded border border-dashed border-gray-300 text-xs text-gray-500 flex items-center"
                  >
                    当前条件不需要填写比较值
                  </div>
                </div>
              </div>

              <div v-if="rule.mode === 'function'" class="space-y-2">
                <div class="text-xs text-gray-500">
                  可用参数：`value`、`item`、`field`、`helpers`。请在代码中
                  `return true` 或 `return false`。
                </div>
                <el-input
                  v-model="rule.functionCode"
                  type="textarea"
                  :rows="4"
                  class="font-mono text-xs"
                  placeholder="return helpers.hasValue(value) && helpers.toNumber(value) >= 10000;"
                />
                <div class="text-xs text-gray-500">
                  helpers 可用：`text()`、`toNumber()`、`hasValue()`、`includes()`、`matches()`、`length()`
                </div>
              </div>

              <div class="flex justify-end">
                <el-button
                  type="danger"
                  size="small"
                  text
                  @click="removeResultFilter(rule.id)"
                >
                  删除规则
                </el-button>
              </div>
            </el-card>
          </div>
        </div>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><Bell /></el-icon>
            <span>任务结果邮件通知</span>
          </div>
        </template>

        <el-form :model="config.notification" label-width="140px" class="space-y-4">
          <el-form-item label="启用邮件通知">
            <el-switch
              v-model="config.notification.enabled"
              active-text="启用"
              inactive-text="关闭"
            />
            <span class="text-sm text-gray-500 ml-2">
              依赖系统设置中的 SMTP 配置，邮件发送给任务所属用户
            </span>
          </el-form-item>

          <template v-if="config.notification.enabled">
            <el-form-item label="成功时通知">
              <el-switch v-model="config.notification.onSuccess" />
            </el-form-item>

            <el-form-item label="失败时通知">
              <el-switch v-model="config.notification.onFailure" />
            </el-form-item>

            <el-form-item label="预览条数">
              <el-input-number
                v-model="config.notification.previewCount"
                :min="0"
                :max="10"
                class="w-32"
              />
              <span class="text-sm text-gray-500 ml-2">
                成功邮件中附带前 N 条结果预览，填 0 表示不附带预览
              </span>
            </el-form-item>
          </template>
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
import { computed, onMounted, reactive } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  Setting,
  Management,
  DocumentCopy,
  Bell,
} from "@element-plus/icons-vue";
import {
  useTaskFormStore,
  normalizeCrawlerConfig,
  type ResultFilterMode,
  type ResultFilterOperator,
  type ResultFilterRule,
  type TaskNotificationConfig,
} from "@/stores/taskForm";

type Step4ConfigState = {
  maxConcurrency: number;
  requestInterval: number;
  timeout: number;
  maxRetries: number;
  useCookie: boolean;
  cookieString: string;
  cookieDomain: string;
  resultFilters: ResultFilterRule[];
  notification: TaskNotificationConfig;
};

const store = useTaskFormStore();
const router = useRouter();

let resultFilterIdSeed = 1;

const config = reactive<Step4ConfigState>({
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
});

const operatorOptions: Array<{ label: string; value: ResultFilterOperator }> = [
  { label: "为空", value: "is_empty" },
  { label: "不为空", value: "is_not_empty" },
  { label: "大于", value: "gt" },
  { label: "大于等于", value: "gte" },
  { label: "小于", value: "lt" },
  { label: "小于等于", value: "lte" },
  { label: "等于", value: "eq" },
  { label: "不等于", value: "neq" },
  { label: "包含", value: "contains" },
  { label: "不包含", value: "not_contains" },
];

const ruleModeOptions: Array<{ label: string; value: ResultFilterMode }> = [
  { label: "条件比较", value: "operator" },
  { label: "Bool 函数", value: "function" },
];

const fieldNameOptions = computed(() => {
  const names: string[] = [];

  const visit = (nodes: any[]) => {
    for (const node of nodes) {
      if (["field", "image", "link"].includes(node.type) && node.label) {
        names.push(node.label);
      }
      if (node.children?.length) {
        visit(node.children);
      }
    }
  };

  visit(store.treeData as any[]);
  return Array.from(new Set(names));
});

onMounted(() => {
  const restored = normalizeCrawlerConfig(store.crawlerConfig as any);

  config.maxConcurrency = restored.maxConcurrency;
  config.requestInterval = restored.requestInterval;
  config.timeout = restored.timeout;
  config.maxRetries = restored.maxRetries;
  config.useCookie = restored.useCookie;
  config.cookieString = restored.cookieString;
  config.cookieDomain = restored.cookieDomain;
  config.resultFilters = restored.resultFilters.map((rule) => ({
    ...rule,
    mode: rule.mode || (rule.functionCode ? "function" : "operator"),
  }));
  config.notification = {
    ...restored.notification,
  };

  if (config.resultFilters.length > 0) {
    resultFilterIdSeed =
      Math.max(...config.resultFilters.map((rule) => rule.id || 0), 0) + 1;
  }
});

function needsValue(operator: ResultFilterOperator) {
  return operator !== "is_empty" && operator !== "is_not_empty";
}

function addResultFilter() {
  config.resultFilters.push({
    id: resultFilterIdSeed++,
    field: "",
    mode: "operator",
    operator: "contains",
    value: "",
    functionCode: "",
  });
}

function removeResultFilter(id: number) {
  const index = config.resultFilters.findIndex((rule) => rule.id === id);
  if (index !== -1) {
    config.resultFilters.splice(index, 1);
  }
}

function validateConfig() {
  if (config.useCookie && !config.cookieString.trim()) {
    ElMessage.error("启用 Cookie 后必须填写 Cookie 内容");
    return false;
  }

  const invalidRule = config.resultFilters.find((rule) => {
    if (!rule.field.trim()) {
      return true;
    }

    if (rule.mode === "function") {
      return !String(rule.functionCode ?? "").trim();
    }

    if (!rule.operator) {
      return true;
    }

    if (needsValue(rule.operator) && !String(rule.value ?? "").trim()) {
      return true;
    }

    return false;
  });

  if (invalidRule) {
    ElMessage.error("结果筛选规则未填写完整，请检查字段、模式和规则内容");
    return false;
  }

  if (
    config.notification.enabled &&
    !config.notification.onSuccess &&
    !config.notification.onFailure
  ) {
    ElMessage.error("启用邮件通知后，至少选择成功或失败中的一种通知时机");
    return false;
  }

  return true;
}

function saveConfig() {
  Object.assign(
    store.crawlerConfig,
    normalizeCrawlerConfig({
      ...(store.crawlerConfig as any),
      ...config,
      notification: {
        enabled: config.notification.enabled,
        onSuccess: config.notification.onSuccess,
        onFailure: config.notification.onFailure,
        previewCount: config.notification.previewCount,
      },
      resultFilters: config.resultFilters.map((rule) => ({
        ...rule,
        field: rule.field.trim(),
        mode: rule.mode || "operator",
        operator: rule.mode === "function" ? undefined : rule.operator,
        value:
          rule.mode === "function" ? "" : String(rule.value ?? "").trim(),
        functionCode:
          rule.mode === "function"
            ? String(rule.functionCode ?? "").trim()
            : "",
      })),
    }),
  );
}

function goBack() {
  saveConfig();
  router.push("/crawleer/task-add/mapping");
}

function goNext() {
  if (!validateConfig()) {
    return;
  }

  saveConfig();
  router.push("/crawleer/task-add/preview");
}
</script>

<style scoped>
.font-mono {
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
}
</style>
