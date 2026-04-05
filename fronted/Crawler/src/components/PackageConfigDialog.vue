<template>
  <el-dialog
    v-model="dialogVisible"
    title="打包下载配置"
    width="920px"
    :close-on-click-modal="false"
    class="package-config-dialog"
  >
    <div v-if="results.length > 0" class="space-y-4">
      <el-card shadow="never">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-1">
            <div class="text-base font-semibold text-slate-800">字段选择</div>
            <div class="text-sm text-slate-500">
              共 {{ fieldKeys.length }} 个字段，已选择 {{ selectedFields.length }} 个
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <el-button size="small" @click="resetTemplates">恢复默认模板</el-button>
            <el-button size="small" text @click="selectAllFields">全选</el-button>
            <el-button size="small" text @click="deselectAllFields">全不选</el-button>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
          <span class="legend-chip">
            <span class="legend-dot bg-emerald-500" />
            图片
          </span>
          <span class="legend-chip">
            <span class="legend-dot bg-amber-500" />
            链接
          </span>
          <span class="legend-chip">
            <span class="legend-dot bg-sky-500" />
            文本
          </span>
          <span class="legend-chip">点击右侧标签可切换字段类型</span>
        </div>

        <div class="field-list mt-4">
          <div v-for="field in fieldKeys" :key="field" class="field-row">
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <el-checkbox v-model="selectedFields" :value="field" />
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium text-slate-800">{{ field }}</div>
                <div class="truncate text-xs text-slate-500">
                  {{ getFieldPreview(field) }}
                </div>
              </div>
            </div>

            <el-tag
              :type="getFieldTagType(field)"
              size="small"
              class="cursor-pointer select-none"
              @click="toggleFieldType(field)"
            >
              {{ getFieldTypeLabel(getFieldType(field)) }}
            </el-tag>
          </div>
        </div>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <el-icon><FolderOpened /></el-icon>
              <span>文件结构</span>
            </div>
            <el-tag type="info" effect="plain">
              占位符：{index} {fieldName} {ext} {timestamp} {date}
            </el-tag>
          </div>
        </template>

        <div class="space-y-4">
          <div class="space-y-2">
            <div class="text-sm font-medium text-slate-700">图片文件</div>
            <div class="flex gap-2">
              <el-input
                v-model="packageConfig.structure.images"
                placeholder="images/{index}_{fieldName}.{ext}"
                class="font-mono"
              />
              <el-dropdown
                trigger="click"
                @command="(field: string) => insertField('images', field)"
              >
                <el-button type="primary" plain>
                  <el-icon class="mr-1"><Plus /></el-icon>
                  插入字段
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="field in fieldKeys"
                      :key="field"
                      :command="field"
                    >
                      {{ field }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-sm font-medium text-slate-700">链接文件</div>
            <div class="flex gap-2">
              <el-input
                v-model="packageConfig.structure.files"
                placeholder="files/{index}_{fieldName}.{ext}"
                class="font-mono"
              />
              <el-dropdown
                trigger="click"
                @command="(field: string) => insertField('files', field)"
              >
                <el-button type="primary" plain>
                  <el-icon class="mr-1"><Plus /></el-icon>
                  插入字段
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="field in fieldKeys"
                      :key="field"
                      :command="field"
                    >
                      {{ field }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-sm font-medium text-slate-700">文本文件</div>
            <div class="flex gap-2">
              <el-input
                v-model="packageConfig.structure.texts"
                placeholder="texts/{index}_{fieldName}.txt"
                class="font-mono"
              />
              <el-dropdown
                trigger="click"
                @command="(field: string) => insertField('texts', field)"
              >
                <el-button type="primary" plain>
                  <el-icon class="mr-1"><Plus /></el-icon>
                  插入字段
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="field in fieldKeys"
                      :key="field"
                      :command="field"
                    >
                      {{ field }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-sm font-medium text-slate-700">数据 JSON</div>
            <el-input
              v-model="packageConfig.structure.data"
              placeholder="data.json（留空则不额外生成 JSON 文件）"
              class="font-mono"
            />
          </div>
        </div>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><Tools /></el-icon>
            <span>高级设置</span>
          </div>
        </template>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="setting-box md:col-span-2">
            <div class="text-sm font-medium text-slate-700">下载策略</div>
            <div class="mt-2">
              <el-select v-model="packageConfig.download.strategy" class="w-full">
                <el-option
                  label="智能模式：直连失败后回退浏览器下载"
                  value="auto"
                />
                <el-option label="普通模式：直连下载" value="direct" />
                <el-option label="严格模式：浏览器下载" value="browser" />
              </el-select>
            </div>
            <div class="mt-2 text-xs leading-6 text-slate-500">
              智能模式会先尝试直连；遇到防盗链、鉴权或风控失败时，再自动回退到页面内点击、打开新页并监听响应流的浏览器下载流程。
            </div>
          </div>

          <div
            v-if="packageConfig.download.strategy !== 'direct'"
            class="setting-box md:col-span-2"
          >
            <div class="text-sm font-medium text-slate-700">严格模式入口页</div>
            <div class="mt-2">
              <el-select
                v-model="packageConfig.download.browserFlow.detailPageField"
                clearable
                filterable
                class="w-full"
                placeholder="可选：先访问此字段对应的详情页 URL，再触发下载"
              >
                <el-option
                  v-for="field in detailPageFieldOptions"
                  :key="field"
                  :label="field"
                  :value="field"
                />
              </el-select>
            </div>

            <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <el-input
                v-model="packageConfig.download.browserFlow.detailPageWaitSelector"
                placeholder="可选：等待详情页稳定，如 .article-main"
              />
              <div class="flex items-center gap-3">
                <el-input-number
                  v-model="packageConfig.download.browserFlow.detailPageWaitTimeout"
                  :min="1"
                  :max="60"
                  :step="1"
                  class="w-full"
                />
                <span class="text-sm text-slate-500">秒</span>
              </div>
            </div>

            <div class="mt-2 text-xs leading-6 text-slate-500">
              选择后，浏览器下载会先打开该字段对应的详情页 URL，再在页面上下文中发起目标文件请求，更适合详情页签名、登录态校验和严风控场景。
            </div>
          </div>

          <div class="setting-box">
            <div class="text-sm font-medium text-slate-700">最大文件大小</div>
            <div class="mt-2 flex items-center gap-3">
              <el-input-number
                v-model="packageConfig.download.maxFileSize"
                :min="1"
                :max="100"
                :step="1"
              />
              <span class="text-sm text-slate-500">MB</span>
            </div>
          </div>

          <div class="setting-box">
            <div class="text-sm font-medium text-slate-700">下载超时</div>
            <div class="mt-2 flex items-center gap-3">
              <el-input-number
                v-model="packageConfig.download.timeout"
                :min="5"
                :max="300"
                :step="5"
              />
              <span class="text-sm text-slate-500">秒</span>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <div v-else class="py-8 text-center text-gray-500">
      <el-icon size="48" class="mb-2"><Warning /></el-icon>
      <p>没有可打包的数据</p>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="packaging" @click="handlePackage">
          <el-icon class="mr-1"><Box /></el-icon>
          开始打包
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  Box,
  FolderOpened,
  Plus,
  Tools,
  Warning,
} from "@element-plus/icons-vue";
import { packageResultApi, type PackageResultRes } from "@/api/task";

interface Props {
  visible: boolean;
  results: any[];
  executionId?: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:visible", visible: boolean): void;
  (e: "package-complete", packagePath: string): void;
}>();

const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit("update:visible", value),
});

const packaging = ref(false);
const selectedFields = ref<string[]>([]);
const fieldTypeMap = reactive<Record<string, "image" | "file" | "text">>({});

const defaultStructure = {
  images: "images/{index}_{fieldName}.{ext}",
  files: "files/{index}_{fieldName}.{ext}",
  texts: "texts/{index}_{fieldName}.txt",
  data: "",
};

const packageConfig = reactive({
  structure: { ...defaultStructure },
  download: {
    images: true,
    files: true,
    texts: true,
    maxFileSize: 10,
    timeout: 30,
    strategy: "auto" as "direct" | "browser" | "auto",
    browserFlow: {
      detailPageField: "",
      detailPageWaitSelector: "",
      detailPageWaitTimeout: 8,
    },
  },
  fieldMapping: {} as {
    imageFields?: string[];
    fileFields?: string[];
    textFields?: string[];
  },
});

const fieldKeys = computed(() => {
  if (!props.results?.length) {
    return [];
  }

  const keys = new Set<string>();
  props.results.forEach((item) => {
    Object.keys(item || {}).forEach((key) => keys.add(key));
  });
  return Array.from(keys);
});

const detailPageFieldOptions = computed(() =>
  fieldKeys.value.filter((field) => {
    const sample = props.results?.find((item) => item?.[field])?.[field];
    return typeof sample === "string";
  }),
);

watch(
  () => props.results,
  () => {
    selectedFields.value = props.results?.length ? [...fieldKeys.value] : [];

    Object.keys(fieldTypeMap).forEach((key) => {
      if (!fieldKeys.value.includes(key)) {
        delete fieldTypeMap[key];
      }
    });
  },
  { immediate: true, deep: true },
);

function resetTemplates() {
  packageConfig.structure.images = defaultStructure.images;
  packageConfig.structure.files = defaultStructure.files;
  packageConfig.structure.texts = defaultStructure.texts;
  packageConfig.structure.data = defaultStructure.data;
}

function selectAllFields() {
  selectedFields.value = [...fieldKeys.value];
}

function deselectAllFields() {
  selectedFields.value = [];
}

function getFieldPreview(fieldName: string) {
  const sample = props.results?.find((item) => item?.[fieldName] !== undefined)?.[fieldName];

  if (sample === null || sample === undefined || sample === "") {
    return "暂无示例值";
  }

  if (typeof sample === "string") {
    return sample.length > 80 ? `${sample.slice(0, 80)}...` : sample;
  }

  try {
    return JSON.stringify(sample);
  } catch {
    return String(sample);
  }
}

function isLikelyImageUrl(value: string) {
  const lowerValue = value.toLowerCase();

  if (lowerValue.startsWith("data:image/")) {
    return true;
  }

  if (lowerValue.includes("pximg.net")) {
    return true;
  }

  return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|avif)(?=($|[?#@&]))/.test(
    lowerValue,
  );
}

function detectFieldType(fieldName: string): "image" | "file" | "text" {
  if (fieldTypeMap[fieldName]) {
    return fieldTypeMap[fieldName];
  }

  const sampleItem = props.results.find((item) => item?.[fieldName]);
  if (!sampleItem) {
    return "text";
  }

  const value = sampleItem[fieldName];
  if (typeof value === "string") {
    const isLink =
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("//");

    if (isLikelyImageUrl(value)) {
      return "image";
    }

    if (isLink) {
      return "file";
    }
  }

  return "text";
}

function getFieldType(fieldName: string) {
  return detectFieldType(fieldName);
}

function toggleFieldType(fieldName: string) {
  const currentType = getFieldType(fieldName);
  fieldTypeMap[fieldName] =
    currentType === "image"
      ? "file"
      : currentType === "file"
        ? "text"
        : "image";
}

function getFieldTypeLabel(type: "image" | "file" | "text") {
  switch (type) {
    case "image":
      return "图片";
    case "file":
      return "链接";
    default:
      return "文本";
  }
}

function getFieldTagType(fieldName: string) {
  const type = getFieldType(fieldName);
  if (type === "image") {
    return "success";
  }
  if (type === "file") {
    return "warning";
  }
  return "info";
}

function insertField(type: "images" | "files" | "texts", fieldName: string) {
  const placeholder = `{${fieldName}}`;
  const currentValue = packageConfig.structure[type] || "";

  if (!currentValue) {
    packageConfig.structure[type] =
      type === "texts"
        ? `texts/${placeholder}.txt`
        : `${type}/${placeholder}.{ext}`;
  } else {
    packageConfig.structure[type] = `${currentValue}${placeholder}`;
  }

  ElMessage.success(`已插入字段 {${fieldName}}`);
}

function buildBrowserFlowConfig() {
  const detailPageField =
    packageConfig.download.browserFlow.detailPageField.trim();

  if (!detailPageField) {
    return undefined;
  }

  const detailPageWaitSelector =
    packageConfig.download.browserFlow.detailPageWaitSelector.trim();

  return {
    detailPageField,
    detailPageWaitSelector: detailPageWaitSelector || undefined,
    detailPageWaitTimeout:
      packageConfig.download.browserFlow.detailPageWaitTimeout * 1000,
  };
}

async function handlePackage() {
  if (!props.executionId) {
    ElMessage.error("执行 ID 不存在");
    return;
  }

  if (selectedFields.value.length === 0) {
    ElMessage.warning("请至少选择一个字段");
    return;
  }

  try {
    packaging.value = true;

    const imageFields: string[] = [];
    const fileFields: string[] = [];
    const textFields: string[] = [];

    selectedFields.value.forEach((field) => {
      const type = fieldTypeMap[field] || detectFieldType(field);
      if (type === "image") {
        imageFields.push(field);
      } else if (type === "file") {
        fileFields.push(field);
      } else {
        textFields.push(field);
      }
    });

    const requestConfig = {
      structure: packageConfig.structure,
      download: {
        images: imageFields.length > 0,
        files: fileFields.length > 0,
        texts: textFields.length > 0,
        maxFileSize: packageConfig.download.maxFileSize * 1024 * 1024,
        timeout: packageConfig.download.timeout * 1000,
        strategy: packageConfig.download.strategy,
        browserFlow: buildBrowserFlowConfig(),
      },
      fieldMapping: {
        imageFields,
        fileFields,
        textFields,
      },
    };

    const result: PackageResultRes = await packageResultApi(
      props.executionId,
      requestConfig,
    );

    ElMessage.success("打包成功");
    emit("package-complete", result.packagePath);
    dialogVisible.value = false;
  } catch (error: any) {
    ElMessage.error(`打包失败: ${error.message || "未知错误"}`);
  } finally {
    packaging.value = false;
  }
}
</script>

<style scoped>
.package-config-dialog :deep(.el-dialog__body) {
  padding-top: 12px;
}

.field-list {
  display: grid;
  gap: 10px;
  max-height: 320px;
  overflow: auto;
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.field-row:hover {
  border-color: #cbd5e1;
  transform: translateY(-1px);
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #f8fafc;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
}

.setting-box {
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
}

.font-mono {
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
}
</style>
