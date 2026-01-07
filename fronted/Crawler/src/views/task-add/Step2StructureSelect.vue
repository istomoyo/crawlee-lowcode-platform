<template>
  <el-card class="mt-6 p-4 flex flex-col h-full">
    <!-- loading -->
    <div v-if="loading" class="text-center h-full">
      <svg
        class="mx-auto size-8 animate-spin text-indigo-600"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="mt-4">Loading...</p>
    </div>

    <!-- 内容 -->
    <div v-else class="flex-1 overflow-auto space-y-6">
      <!-- 配置方式选择 -->
      <div>
        <h3 class="font-bold mb-3">选择配置方式</h3>
        <el-radio-group v-model="configMode" size="large" class="mb-4">
          <el-radio-button value="auto">自动识别</el-radio-button>
          <el-radio-button value="custom">自定义配置</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 自动识别模式 -->
      <div v-if="configMode === 'auto'">
        <div class="border rounded-lg p-4 bg-blue-50">
          <h4 class="font-semibold mb-3 text-blue-800">自动识别列表项</h4>

          <!-- 识别参数设置 -->
          <div class="grid grid-cols-2 gap-4 mb-4" v-if="!autoRecognitionDone">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">目标长宽比</label>
              <el-input-number
                v-model="targetAspectRatio"
                :min="0.1"
                :max="10"
                :step="0.1"
                :precision="2"
                placeholder="1.0"
                size="small"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">允许误差</label>
              <el-input-number
                v-model="tolerance"
                :min="0.01"
                :max="2"
                :step="0.01"
                :precision="2"
                placeholder="0.3"
                size="small"
                class="w-full"
              />
            </div>
          </div>

          <!-- 开始识别按钮 -->
          <div class="mb-4" v-if="!autoRecognitionDone">
            <el-button
              type="primary"
              :loading="loading"
              @click="startAutoRecognition"
              size="small"
            >
              <el-icon class="mr-1"><Search /></el-icon>
              开始自动识别
            </el-button>
          </div>

          <!-- 识别结果 -->
          <div v-if="autoRecognitionDone && listItems.length > 0">
            <p class="text-sm text-gray-600 mb-3">找到 {{ listItems.length }} 个可能的列表项，请选择最合适的：</p>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
              <el-card
                v-for="(item, index) in listItems"
                :key="index"
                :class="[
                  'cursor-pointer transition-all duration-200 hover:shadow-md',
                  selectedType === 'auto' && selectedIndex === index ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50',
                ]"
                @click="selectAuto(index)"
              >
                <template #header>
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium truncate flex-1">选项 {{ index + 1 }}</span>
                    <el-tag size="small" type="info">{{ item.matchCount }} 个</el-tag>
                  </div>
                </template>
                <div class="p-2">
                  <img
                    :src="'data:image/png;base64,' + item.base64"
                    class="w-full h-24 object-contain rounded border mb-2"
                    alt="列表项预览"
                  />
                  <p class="text-xs text-gray-500 truncate" :title="item.xpath">{{ item.xpath }}</p>
                </div>
              </el-card>
            </div>
          </div>

          <!-- 无识别结果 -->
          <div v-else-if="autoRecognitionDone && listItems.length === 0" class="text-center py-8">
            <el-icon size="48" class="text-gray-400 mb-2"><InfoFilled /></el-icon>
            <p class="text-gray-600">未找到合适的列表项</p>
            <p class="text-sm text-gray-500 mt-1">建议切换到自定义配置模式</p>
          </div>

          <!-- 加载状态 -->
          <div v-if="loading" class="text-center py-8">
            <el-icon class="is-loading" style="font-size: 48px;"><Loading /></el-icon>
            <p class="text-gray-600 mt-3">正在分析页面结构...</p>
          </div>
        </div>
      </div>

      <!-- 自定义配置模式 -->
      <div v-if="configMode === 'custom'">
        <div class="border rounded-lg p-4 bg-green-50">
          <h4 class="font-semibold mb-3 text-green-800">自定义配置</h4>
          <p class="text-sm text-gray-600 mb-4">直接输入XPath或JSPath来指定要爬取的数据列表位置</p>

          <div class="space-y-4">
            <!-- XPath配置 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                XPath选择器
                <el-tooltip content="使用XPath语法定位列表容器，例如：//div[@class='list'] | //ul[@class='items']" placement="top">
                  <el-icon class="ml-1 text-gray-400 cursor-help"><InfoFilled /></el-icon>
                </el-tooltip>
              </label>
              <el-input
                v-model="customXpath"
                placeholder="//div[@class='list'] | //ul[@class='items'] | //div[contains(@class, 'container')]"
                clearable
                size="small"
                @focus="selectCustomXpath"
              />
              <p class="text-xs text-gray-500 mt-1">用于选择包含列表项的容器元素</p>
            </div>

            <!-- JSPath配置 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                JSPath选择器
                <el-tooltip content="使用JavaScript代码定位列表容器，例如：document.querySelector('.content')" placement="top">
                  <el-icon class="ml-1 text-gray-400 cursor-help"><InfoFilled /></el-icon>
                </el-tooltip>
              </label>
              <el-input
                v-model="customJsPath"
                placeholder="document.querySelector('.main-content') | document.getElementById('list-container')"
                clearable
                size="small"
                @focus="selectCustomJsPath"
              />
              <p class="text-xs text-gray-500 mt-1">适用于复杂DOM结构或动态内容</p>
            </div>

            <!-- 配置提示 -->
            <el-alert
              title="配置说明"
              type="info"
              :closable="false"
              show-icon
              class="mt-4"
            >
              <template #description>
                <ul class="text-sm space-y-1">
                  <li>• XPath和JSPath只需填写其中之一</li>
                  <li>• 选择器应指向包含多个相似项的容器元素</li>
                  <li>• 可以使用浏览器的开发者工具获取准确的选择器</li>
                  <li>• 选择器将用于后续字段映射步骤</li>
                </ul>
              </template>
            </el-alert>
          </div>
        </div>
      </div>

      <!-- 当前选择状态 -->
      <div v-if="store.selectedItem && (store.selectedItem.xpath || store.selectedItem.jsPath)" class="border-t pt-4">
        <h5 class="font-medium text-gray-800 mb-2">当前配置</h5>
        <div class="bg-gray-50 rounded p-3">
          <div class="text-sm">
            <span v-if="selectedType === 'auto' && store.selectedItem.xpath" class="text-blue-600">
              <el-icon class="mr-1"><Check /></el-icon>
              自动识别: {{ store.selectedItem.xpath }}
            </span>
            <span v-else-if="store.selectedItem.xpath" class="text-green-600">
              <el-icon class="mr-1"><Check /></el-icon>
              XPath: {{ store.selectedItem.xpath }}
            </span>
            <span v-else-if="store.selectedItem.jsPath" class="text-purple-600">
              <el-icon class="mr-1"><Check /></el-icon>
              JSPath: {{ store.selectedItem.jsPath }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部按钮 -->
    <div class="mt-4 flex justify-end gap-2">
      <el-button @click="prevStep">上一步</el-button>
      <el-button
        type="primary"
        :disabled="!store.selectedItem"
        @click="nextStep"
      >
        下一步
      </el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { listPreviewApi } from "@/api/task";
import { useTaskFormStore } from "@/stores/taskForm";
import { ElMessageBox, ElMessage } from "element-plus";
import { Search, Check, InfoFilled, Loading } from "@element-plus/icons-vue";

interface ListItem {
  xpath: string;
  base64: string;
  selector: string;
  matchCount: number;
}

const router = useRouter();
const store = useTaskFormStore();

const loading = ref(false);
const listItems = reactive<ListItem[]>([]);
const selectedIndex = ref(-1);
const selectedType = ref<"auto" | "customXpath" | "customJsPath" | null>(null);
const customXpath = ref("");
const customJsPath = ref("");

// 配置模式相关
const configMode = ref<'auto' | 'custom'>('custom'); // 默认使用自定义配置
const autoRecognitionDone = ref(false);
const targetAspectRatio = ref(1.0);
const tolerance = ref(0.3);

// 开始自动识别
async function startAutoRecognition() {
  if (!store.form.url) {
    ElMessage.error("页面URL不能为空");
    return;
  }

  loading.value = true;
  try {
    const res = await listPreviewApi({
      url: store.form.url,
      targetAspectRatio: targetAspectRatio.value,
      tolerance: tolerance.value,
    });

    listItems.splice(0, listItems.length, ...res);
    autoRecognitionDone.value = true;
    selectedIndex.value = -1;

    if (res.length === 0) {
      ElMessage.warning("未找到合适的列表项，请调整参数或使用自定义配置");
    } else {
      ElMessage.success(`找到 ${res.length} 个可能的列表项`);
    }
  } catch (error) {
    ElMessage.error("自动识别失败，请检查参数设置");
    console.error("Auto recognition error:", error);
  } finally {
    loading.value = false;
  }
}

/* 选自动 */
function selectAuto(index: number) {
  selectedIndex.value = index;
  selectedType.value = "auto";
  customXpath.value = "";
  customJsPath.value = "";
  store.selectedItem = {
    xpath: listItems[index]!.xpath,
    base64: listItems[index]!.base64,
    jsPath: undefined,
  };
}

/* 选自定义 XPath */
function selectCustomXpath() {
  selectedIndex.value = -1;
  selectedType.value = "customXpath";
  customJsPath.value = "";
  store.selectedItem = {
    xpath: customXpath.value || "",
    base64: "",
    jsPath: undefined,
  };
}

/* 选自定义 JSPath */
function selectCustomJsPath() {
  selectedIndex.value = -1;
  selectedType.value = "customJsPath";
  customXpath.value = "";
  store.selectedItem = {
    xpath: "",
    base64: "",
    jsPath: customJsPath.value || "",
  };
}

// watch 保持独立更新
watch(customXpath, (val) => {
  if (val) {
    selectedType.value = "customXpath";
    customJsPath.value = "";
  }
  if (selectedType.value === "customXpath" && store.selectedItem) {
    store.selectedItem.xpath = val;
    store.selectedItem.jsPath = undefined;
  }
});

watch(customJsPath, (val) => {
  if (val) {
    selectedType.value = "customJsPath";
    customXpath.value = "";
  }
  if (selectedType.value === "customJsPath" && store.selectedItem) {
    store.selectedItem.jsPath = val;
    store.selectedItem.xpath = "";
  }
});

// 配置模式切换时重置状态
watch(configMode, (newMode) => {
  if (newMode === 'auto') {
    customXpath.value = "";
    customJsPath.value = "";
    selectedType.value = null;
    store.selectedItem = null;
    autoRecognitionDone.value = false;
    listItems.length = 0;
  } else {
    selectedIndex.value = -1;
  }
});

function prevStep() {
  router.back();
}

function nextStep() {
  router.push("/crawleer/task-add/mapping");
}

// 初始化时不强制执行自动识别，让用户选择配置方式
onMounted(() => {
  if (!store.form.url) {
    loading.value = false;
  }
});
</script>

<style scoped>
.el-card {
  height: 100%;
}
</style>
