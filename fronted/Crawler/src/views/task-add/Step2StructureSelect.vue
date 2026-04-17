<template>
  <el-card class="mt-6 flex h-full flex-col p-4">
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

    <div v-else class="flex-1 overflow-auto space-y-6">
      <div>
        <h3 class="mb-3 font-bold">选择配置方式</h3>
        <el-radio-group v-model="configMode" size="large" class="mb-4">
          <el-radio-button value="auto">自动识别</el-radio-button>
          <el-radio-button value="custom">手动输入 XPath</el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="configMode === 'auto'">
        <div class="rounded-lg border bg-blue-50 p-4">
          <h4 class="mb-3 font-semibold text-blue-800">自动识别列表容器</h4>

          <div v-if="!autoRecognitionDone" class="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">目标宽高比</label>
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
              <label class="mb-1 block text-sm font-medium text-gray-700">允许误差</label>
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

          <div v-if="!autoRecognitionDone" class="mb-4">
            <el-button
              type="primary"
              :loading="loading"
              size="small"
              @click="startAutoRecognition"
            >
              <el-icon class="mr-1"><Search /></el-icon>
              开始自动识别
            </el-button>
          </div>

          <div v-if="autoRecognitionDone && listItems.length > 0">
            <p class="mb-3 text-sm text-gray-600">
              找到 {{ listItems.length }} 个可能的列表容器，请选择最合适的一项。
            </p>
            <div class="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto md:grid-cols-3">
              <el-card
                v-for="(item, index) in listItems"
                :key="index"
                :class="[
                  'cursor-pointer transition-all duration-200 hover:shadow-md',
                  selectedType === 'auto' && selectedIndex === index
                    ? 'bg-blue-50 ring-2 ring-blue-500'
                    : 'hover:bg-gray-50',
                ]"
                @click="selectAuto(index)"
              >
                <template #header>
                  <div class="flex items-center justify-between">
                    <span class="truncate text-sm font-medium">候选 {{ index + 1 }}</span>
                    <el-tag size="small" type="info">{{ item.matchCount }} 个</el-tag>
                  </div>
                </template>
                <div class="p-2">
                  <img
                    :src="`data:image/png;base64,${item.base64}`"
                    class="mb-2 h-24 w-full rounded border object-contain"
                    alt="列表预览"
                  />
                  <p class="truncate text-xs text-gray-500" :title="item.xpath">{{ item.xpath }}</p>
                </div>
              </el-card>
            </div>
          </div>

          <div
            v-else-if="autoRecognitionDone && listItems.length === 0"
            class="py-8 text-center"
          >
            <el-icon size="48" class="mb-2 text-gray-400"><InfoFilled /></el-icon>
            <p class="text-gray-600">未找到合适的列表容器</p>
            <p class="mt-1 text-sm text-gray-500">建议切换到手动输入 XPath</p>
          </div>

          <div v-if="loading" class="py-8 text-center">
            <el-icon class="is-loading" style="font-size: 48px"><Loading /></el-icon>
            <p class="mt-3 text-gray-600">正在分析页面结构...</p>
          </div>
        </div>
      </div>

      <div v-if="configMode === 'custom'">
        <div class="rounded-lg border bg-green-50 p-4">
          <h4 class="mb-3 font-semibold text-green-800">手动输入 XPath</h4>
          <p class="mb-4 text-sm text-gray-600">
            系统已不再支持 JSPath。这里请直接填写列表容器的 XPath。
          </p>

          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700">
              XPath 选择器
              <el-tooltip
                content="用于定位包含多条列表项的容器，例如 //div[@class='list'] 或 //ul[@class='items']"
                placement="top"
              >
                <el-icon class="ml-1 cursor-help text-gray-400"><InfoFilled /></el-icon>
              </el-tooltip>
            </label>
            <el-input
              v-model="customXpath"
              placeholder="//div[@class='list'] | //ul[@class='items'] | //section[contains(@class, 'feed')]"
              clearable
              size="small"
              @focus="selectCustomXpath"
            />
            <p class="mt-1 text-xs text-gray-500">
              这个 XPath 应指向包含多条相似内容项的列表容器。
            </p>
          </div>

          <el-alert
            title="填写说明"
            type="info"
            :closable="false"
            show-icon
            class="mt-4"
          >
            <template #description>
              <ul class="space-y-1 text-sm">
                <li>只需要填写 XPath，不再需要 JSPath。</li>
                <li>选择器尽量命中重复的列表项区域，不要指向整页根节点。</li>
                <li>这个选择器会作为下一步字段识别和映射的基础范围。</li>
              </ul>
            </template>
          </el-alert>
        </div>
      </div>

      <div v-if="currentSelector" class="border-t pt-4">
        <h5 class="mb-2 font-medium text-gray-800">当前配置</h5>
        <div class="rounded bg-gray-50 p-3 text-sm text-green-600">
          <el-icon class="mr-1"><Check /></el-icon>
          XPath: {{ currentSelector }}
        </div>
      </div>
    </div>

    <div class="mt-4 flex justify-end gap-2">
      <el-button @click="prevStep">上一步</el-button>
      <el-button type="primary" :disabled="!currentSelector" @click="nextStep">
        下一步
      </el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { listPreviewApi } from "@/api/task";
import { buildTaskCookiePayload, useTaskFormStore } from "@/stores/taskForm";
import { ElMessage } from "element-plus";
import { Check, InfoFilled, Loading, Search } from "@element-plus/icons-vue";

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
const selectedType = ref<"auto" | "custom" | null>(null);
const customXpath = ref("");

const configMode = ref<"auto" | "custom">("custom");
const autoRecognitionDone = ref(false);
const targetAspectRatio = ref(1.0);
const tolerance = ref(0.3);

const currentSelector = computed(
  () => String(store.selectedItem?.xpath || store.selectedItem?.jsPath || "").trim(),
);

async function startAutoRecognition() {
  if (!store.form.url) {
    ElMessage.error("页面 URL 不能为空");
    return;
  }

  loading.value = true;
  try {
    const res = await listPreviewApi({
      url: store.form.url,
      targetAspectRatio: targetAspectRatio.value,
      tolerance: tolerance.value,
      ...buildTaskCookiePayload(store.crawlerConfig),
    });

    listItems.splice(0, listItems.length, ...res);
    autoRecognitionDone.value = true;
    selectedIndex.value = -1;

    if (res.length === 0) {
      ElMessage.warning("未找到合适的列表容器，请调整参数或改为手动输入 XPath");
      return;
    }

    ElMessage.success(`找到 ${res.length} 个可能的列表容器`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "自动识别失败，请检查页面地址或稍后重试");
    console.error("Auto recognition error:", error);
  } finally {
    loading.value = false;
  }
}

function selectAuto(index: number) {
  const currentItem = listItems[index];
  if (!currentItem) {
    return;
  }

  selectedIndex.value = index;
  selectedType.value = "auto";
  customXpath.value = "";
  store.selectedItem = {
    xpath: currentItem.xpath,
    base64: currentItem.base64,
    jsPath: undefined,
  };
}

function selectCustomXpath() {
  selectedIndex.value = -1;
  selectedType.value = "custom";
  if (!store.selectedItem) {
    store.selectedItem = {
      xpath: customXpath.value || "",
      base64: "",
      jsPath: undefined,
    };
    return;
  }

  store.selectedItem.xpath = customXpath.value || "";
  store.selectedItem.base64 = "";
  store.selectedItem.jsPath = undefined;
}

watch(customXpath, (value) => {
  if (value) {
    selectedType.value = "custom";
    selectedIndex.value = -1;
  }

  if (!store.selectedItem && value) {
    store.selectedItem = {
      xpath: value,
      base64: "",
      jsPath: undefined,
    };
    return;
  }

  if (selectedType.value === "custom" && store.selectedItem) {
    store.selectedItem.xpath = value;
    store.selectedItem.base64 = "";
    store.selectedItem.jsPath = undefined;
  }
});

watch(configMode, (mode) => {
  if (mode === "auto") {
    customXpath.value = "";
    selectedType.value = null;
    selectedIndex.value = -1;
    store.selectedItem = null;
    autoRecognitionDone.value = false;
    listItems.length = 0;
    return;
  }

  selectedIndex.value = -1;
});

function prevStep() {
  router.back();
}

function nextStep() {
  router.push("/crawleer/task-add/mapping");
}

onMounted(() => {
  const restoredSelector = String(store.selectedItem?.xpath || "").trim();
  if (restoredSelector) {
    customXpath.value = restoredSelector;
    selectedType.value = "custom";
  }
});
</script>

<style scoped>
.el-card {
  height: 100%;
}
</style>
