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

          <el-form-item label="输出格式">
            <el-radio-group v-model="config.outputFormat">
              <el-radio label="json">JSON</el-radio>
              <el-radio label="csv">CSV</el-radio>
              <el-radio label="excel">Excel</el-radio>
            </el-radio-group>
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
import { ref, reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useTaskFormStore } from "@/stores/taskForm";
import {
  Setting,
  Management,
  DocumentCopy,
  Tools
} from "@element-plus/icons-vue";

const store = useTaskFormStore();
const router = useRouter();

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

  // 高级设置
  headless: true,
  disableImages: false,
  disableStyles: false,
  userAgent: "",
  customHeaders: ""
});

// 从 store 中恢复配置
onMounted(() => {
  if (store.crawlerConfig) {
    Object.assign(config, store.crawlerConfig);
  }
});

// 保存配置到 store
function saveConfig() {
  store.crawlerConfig = { ...config };
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
