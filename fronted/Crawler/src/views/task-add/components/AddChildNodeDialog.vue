<template>
  <el-dialog
    :model-value="visible"
    title="添加子节点"
    width="760px"
    :close-on-click-modal="false"
    @update:model-value="handleUpdateVisible"
  >
    <div class="space-y-6">
      <div>
        <h4 class="mb-3 font-bold text-gray-800">选择配置方式</h4>
        <el-radio-group v-model="configMode" size="large">
          <el-radio-button value="auto">自动识别</el-radio-button>
          <el-radio-button value="custom">手动输入 XPath</el-radio-button>
        </el-radio-group>
      </div>

      <div
        v-if="parentNode?.type === 'link' && resolvedTargetUrl"
        class="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800"
      >
        当前会使用这个链接字段的示例链接页做分析：
        <div class="mt-1 break-all font-medium text-blue-900">{{ resolvedTargetUrl }}</div>
        <div class="mt-1">
          如果这个链接字段混合了不同类型的链接，当前示例页里的 XPath 不一定能直接泛化到所有链接页。
        </div>
      </div>

      <div v-if="configMode === 'auto'" class="rounded-lg border bg-blue-50 p-4">
        <h5 class="mb-3 font-semibold text-blue-800">
          {{ parentNode?.type === "link" ? "自动识别详情页层级结构" : "自动识别列表结构" }}
        </h5>
        <p class="mb-4 text-sm text-gray-600">
          系统会分析当前页面并给出一组候选 XPath，选中后会直接生成这一层的字段、图片和链接。
        </p>

        <div v-if="!autoRecognitionDone" class="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">目标宽高比</label>
            <el-input-number
              v-model="targetAspectRatio"
              :min="0.1"
              :max="10"
              :step="0.1"
              :precision="2"
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
              size="small"
              class="w-full"
            />
          </div>
        </div>

        <div v-if="!autoRecognitionDone" class="mb-4">
          <el-button
            type="primary"
            size="small"
            :loading="recognitionLoading"
            @click="startAutoRecognition"
          >
            <el-icon class="mr-1"><Search /></el-icon>
            开始自动识别
          </el-button>
        </div>

        <div v-if="autoRecognitionDone && listItems.length > 0">
          <p class="mb-3 text-sm text-gray-600">请选择一个适合作为当前层基准范围的 XPath。</p>
          <div class="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto md:grid-cols-3">
            <el-card
              v-for="(item, index) in listItems"
              :key="index"
              :class="[
                'cursor-pointer transition-all duration-200 hover:shadow-md',
                selectedIndex === index ? 'bg-blue-50 ring-2 ring-blue-500' : 'hover:bg-gray-50',
              ]"
              @click="selectAuto(index)"
            >
              <template #header>
                <div class="flex items-center justify-between">
                  <span class="truncate text-sm font-medium">候选 {{ index + 1 }}</span>
                  <el-tag size="small" type="info">{{ item.matchCount }} 项</el-tag>
                </div>
              </template>
              <div class="p-2">
                <img
                  :src="`data:image/png;base64,${item.base64}`"
                  class="mb-2 h-24 w-full rounded border object-contain"
                  alt="结构预览"
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
          <p class="text-gray-600">未找到合适的结构</p>
          <p class="mt-1 text-sm text-gray-500">建议切换到手动输入 XPath</p>
        </div>

        <div v-if="recognitionLoading" class="py-8 text-center">
          <el-icon class="is-loading" style="font-size: 48px"><Loading /></el-icon>
          <p class="mt-3 text-gray-600">正在分析页面结构...</p>
        </div>
      </div>

      <div v-if="configMode === 'custom'" class="rounded-lg border bg-green-50 p-4">
        <h5 class="mb-3 font-semibold text-green-800">手动输入 XPath</h5>
        <p class="mb-4 text-sm text-gray-600">
          请直接填写当前层的 XPath。系统会在编辑阶段验证它是否真的命中到这一层。
        </p>

        <div>
          <label class="mb-2 block text-sm font-medium text-gray-700">
            XPath 选择器
            <el-tooltip
              content="例如 //article 或 //div[contains(@class,'item')]"
              placement="top"
            >
              <el-icon class="ml-1 cursor-help text-gray-400"><InfoFilled /></el-icon>
            </el-tooltip>
          </label>
          <el-input
            v-model="customXpath"
            placeholder="//article | //div[contains(@class, 'item')] | //li[contains(@class, 'post')]"
            clearable
            size="small"
          />
          <p class="mt-1 text-xs text-gray-500">
            如果这里填写的是详情页里的列表项容器 XPath，确认后会直接识别并添加当前层字段。
          </p>
          <div
            v-if="resolvedXpathScopeHint"
            class="mt-3 rounded bg-emerald-50 p-3 text-xs text-emerald-800"
          >
            <div class="flex items-center gap-2">
              <span>当前 XPath 作用域</span>
              <el-tag size="small" :type="resolvedXpathScopeHint.tagType">
                {{ resolvedXpathScopeHint.label }}
              </el-tag>
            </div>
            <div class="mt-1">{{ resolvedXpathScopeHint.description }}</div>
          </div>
        </div>
      </div>

      <div class="rounded-lg border bg-white p-4">
        <label class="mb-2 block text-sm font-medium text-gray-700">内容类型</label>
        <el-select
          v-model="selectedXpathType"
          placeholder="请选择当前 XPath 对应的数据类型"
          class="w-full"
        >
          <el-option
            v-for="type in xpathContentTypes"
            :key="type.value"
            :label="type.label"
            :value="type.value"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="font-medium">{{ type.label }}</div>
                <div class="text-xs text-gray-500">{{ type.description }}</div>
              </div>
              <el-tag size="small" :type="type.value === 'article' ? 'success' : 'info'">
                {{ type.defaultFormat === "markdown" ? "Markdown" : "XPath 解析" }}
              </el-tag>
            </div>
          </el-option>
        </el-select>
        <div v-if="selectedTypeMeta" class="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
          {{ selectedTypeMeta.description }}
        </div>
      </div>

      <div v-if="resolvedXpath" class="border-t pt-4">
        <h6 class="mb-2 font-medium text-gray-800">当前配置</h6>
        <div class="rounded bg-gray-50 p-3">
          <div class="text-sm text-green-600">
            <el-icon class="mr-1"><Check /></el-icon>
            XPath: {{ resolvedXpath }}
          </div>
          <div v-if="selectedTypeMeta" class="mt-2 text-xs text-gray-500">
            类型：{{ selectedTypeMeta.label }}
          </div>
          <div
            v-if="parentNode?.type === 'link'"
            class="mt-2 rounded bg-blue-50 p-2 text-xs text-blue-700"
          >
            这是链接节点的子层配置。保存后，这个链接层也可以单独配置抓取前动作。
          </div>
        </div>
      </div>

    </div>

    <template #footer>
      <div class="flex items-center justify-between">
        <div class="text-sm text-gray-500">
          <span v-if="!selectedXpathType">请先选择内容类型</span>
          <span v-else-if="!resolvedXpath">请先选择或填写 XPath</span>
          <span v-else class="text-green-600">配置完成，可以添加子节点</span>
        </div>
        <div class="space-x-2">
          <el-button @click="handleClose">取消</el-button>
          <el-button
            type="primary"
            :disabled="!canConfirm || loading"
            :loading="loading"
            @click="confirmAddChildNode"
          >
            <el-icon class="mr-1"><Plus /></el-icon>
            确认添加
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  Check,
  InfoFilled,
  Loading,
  Plus,
  Search,
} from "@element-plus/icons-vue";
import {
  listPreviewApi,
  xpathMatchApi,
  xpathParseApi,
} from "@/api/task";
import { buildTaskCookiePayload, useTaskFormStore } from "@/stores/taskForm";

interface Props {
  visible: boolean;
  parentNode: any;
  pageUrl?: string;
}

const props = defineProps<Props>();

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "confirm", payload: { children: any[]; detailBaseSelector?: string }): void;
}

const emit = defineEmits<Emits>();

const store = useTaskFormStore();

const listItems = ref<any[]>([]);
const selectedIndex = ref(-1);
const selectedXpath = ref("");
const recognitionLoading = ref(false);
const autoRecognitionDone = ref(false);
const targetAspectRatio = ref(1.0);
const tolerance = ref(0.3);

const customXpath = ref("");
const selectedXpathType = ref("");
const configMode = ref<"auto" | "custom">("custom");
const loading = ref(false);

interface XPathContentType {
  value: "article" | "list";
  label: string;
  description: string;
  defaultFormat: "markdown" | "text";
}

interface PreviewChild {
  id: number;
  type: "field" | "image" | "link";
  label: string;
  selector: string;
  samples: string[];
  contentFormat?: "text" | "html" | "markdown" | "smart";
  imgSrc?: string;
  children?: any[];
  hasChildren?: boolean;
  preActions?: any[];
}

const xpathContentTypes: XPathContentType[] = [
  {
    value: "article",
    label: "文章内容",
    description: "直接把当前 XPath 对应的内容按正文处理，并转成 Markdown。",
    defaultFormat: "markdown",
  },
  {
    value: "list",
    label: "列表项容器",
    description: "把当前 XPath 视为这一层的数据项容器，再自动识别其中的字段、图片和链接。",
    defaultFormat: "text",
  },
];

const resolvedXpath = computed(() =>
  configMode.value === "auto"
    ? selectedXpath.value.trim()
    : customXpath.value.trim(),
);

const resolvedTargetUrl = computed(() => {
  const targetUrl = props.pageUrl || store.form.url;
  return String(targetUrl || "").trim();
});

const selectedTypeMeta = computed(() =>
  xpathContentTypes.find((item) => item.value === selectedXpathType.value),
);

const resolvedXpathScopeHint = computed(() =>
  getXPathScopeHint(resolvedXpath.value),
);

const canConfirm = computed(
  () =>
    Boolean(
      selectedXpathType.value &&
        resolvedXpath.value,
    ),
);

function createUniqueChildLabel(
  baseLabel: string,
  children: Array<{ label?: string }>,
) {
  const normalizedBase = String(baseLabel || "").trim() || "字段";
  const usedLabels = new Set(
    children
      .map((child) => String(child?.label || "").trim())
      .filter(Boolean),
  );

  if (!usedLabels.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  while (usedLabels.has(`${normalizedBase}_${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedBase}_${suffix}`;
}

function createTextChildLabel(
  textItem: { text?: string },
  children: Array<{ label?: string }>,
) {
  const sampleText = String(textItem?.text || "").replace(/\s+/g, " ").trim();
  const baseLabel =
    sampleText && sampleText.length <= 24 && !/^https?:\/\//i.test(sampleText)
      ? sampleText
      : "文本字段";
  return createUniqueChildLabel(baseLabel, children);
}

function createImageChildLabel(children: Array<{ label?: string }>) {
  return createUniqueChildLabel("图片", children);
}

function createLinkChildLabel(children: Array<{ label?: string }>) {
  return createUniqueChildLabel("链接地址", children);
}

function detectContentType(input: string): XPathContentType["value"] | null {
  const normalized = input.trim();
  if (!normalized) {
    return null;
  }

  const articlePatterns = [
    /article/i,
    /content/i,
    /post/i,
    /entry/i,
    /main/i,
    /section/i,
  ];
  if (articlePatterns.some((pattern) => pattern.test(normalized))) {
    return "article";
  }

  const listPatterns = [/li/i, /item/i, /list/i, /card/i];
  if (listPatterns.some((pattern) => pattern.test(normalized))) {
    return "list";
  }

  return null;
}

function normalizeXPathExpression(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.startsWith("xpath=")
    ? normalized.slice("xpath=".length).trim()
    : normalized;
}

function getXPathScopeHint(selector?: string | null) {
  const expression = normalizeXPathExpression(selector);
  if (!expression) {
    return null;
  }

  if (expression.startsWith("./") || expression.startsWith(".//")) {
    return {
      label: "当前层容器",
      tagType: "success" as const,
      description:
        "以 `./` 或 `.//` 开头时，会基于当前列表项或当前层容器匹配。给这一层手动补字段时，通常优先使用这种写法。",
    };
  }

  return {
    label: "当前页面",
    tagType: "info" as const,
    description:
      "以 `//`、`/` 等开头时，会基于当前页面根节点匹配，不会自动限制在当前层容器内。只有要取页面公共区域时再使用。",
  };
}

function resetState() {
  listItems.value = [];
  selectedIndex.value = -1;
  selectedXpath.value = "";
  recognitionLoading.value = false;
  autoRecognitionDone.value = false;
  customXpath.value = "";
  selectedXpathType.value = "";
  configMode.value = "custom";
  loading.value = false;
}

function buildPreviewChildrenFromItems(items: any): PreviewChild[] {
  const children: PreviewChild[] = [];

  items.texts?.forEach((textItem: any) => {
    children.push({
      id: Date.now() + Math.random(),
      type: "field",
      label: createTextChildLabel(textItem, children),
      selector: textItem.xpath,
      samples: textItem.text ? [textItem.text] : [],
      contentFormat: "text",
    });
  });

  items.images?.forEach((imageItem: any) => {
    children.push({
      id: Date.now() + Math.random(),
      type: "image",
      label: createImageChildLabel(children),
      selector: imageItem.xpath,
      imgSrc: imageItem.src,
      samples: imageItem.src ? [imageItem.src] : [],
    });
  });

  items.links?.forEach((linkItem: any) => {
    children.push({
      id: Date.now() + Math.random(),
      type: "link",
      label: createLinkChildLabel(children),
      selector: linkItem.xpath,
      samples: linkItem.href ? [linkItem.href] : [],
      children: [],
      hasChildren: true,
      preActions: [],
    });
  });

  return children;
}

function toEmittedChild(child: PreviewChild) {
  return {
    id: child.id,
    type: child.type,
    label: child.label,
    selector: child.selector,
    samples: child.samples,
    contentFormat: child.contentFormat,
    imgSrc: child.imgSrc,
    children: child.type === "link" ? [] : child.children,
    hasChildren: child.type === "link",
    preActions: child.type === "link" ? [] : undefined,
  };
}

async function startAutoRecognition() {
  const targetUrl = props.pageUrl || store.form.url;
  if (!targetUrl) {
    ElMessage.error("无法获取当前页面 URL");
    return;
  }

  recognitionLoading.value = true;
  try {
    const res = await listPreviewApi({
      url: targetUrl,
      targetAspectRatio: targetAspectRatio.value,
      tolerance: tolerance.value,
      ...buildTaskCookiePayload(store.crawlerConfig),
    });

    listItems.value = res;
    autoRecognitionDone.value = true;
    selectedIndex.value = -1;
    selectedXpath.value = "";

    if (res.length === 0) {
      ElMessage.warning("未找到合适的结构，请调整参数或改为手动输入 XPath");
      return;
    }

    ElMessage.success(`找到 ${res.length} 个候选结构`);
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : "自动识别失败，请检查页面地址或稍后重试",
    );
    console.error("Auto recognition error:", error);
  } finally {
    recognitionLoading.value = false;
  }
}

function selectAuto(index: number) {
  const item = listItems.value[index];
  if (!item) {
    return;
  }

  selectedIndex.value = index;
  selectedXpath.value = item.xpath;
  customXpath.value = "";

  if (!selectedXpathType.value) {
    selectedXpathType.value = detectContentType(item.xpath) || "list";
  }
}

watch(customXpath, (value) => {
  if (!value) return;

  selectedIndex.value = -1;
  selectedXpath.value = "";

  if (!selectedXpathType.value) {
    selectedXpathType.value = detectContentType(value) || "list";
  }
});

watch(configMode, (mode) => {
  if (mode === "auto") {
    customXpath.value = "";
    return;
  }

  selectedIndex.value = -1;
  selectedXpath.value = "";
});

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      resetState();
    }
  },
);

async function confirmAddChildNode() {
  if (!props.parentNode) {
    return;
  }

  const validXpath = resolvedXpath.value;
  if (!validXpath) {
    ElMessage.error("请先填写或选择 XPath");
    return;
  }

  if (!selectedXpathType.value) {
    ElMessage.error("请先选择内容类型");
    return;
  }

  const targetUrl = props.pageUrl || store.form.url;
  if (!targetUrl) {
    ElMessage.error("当前页面 URL 为空");
    return;
  }

  try {
    loading.value = true;

    if (selectedXpathType.value === "article") {
      const nodeLabel =
        validXpath.length > 36
          ? `文章内容 (${validXpath.slice(0, 36)}...)`
          : `文章内容 (${validXpath})`;

      emit("confirm", {
        children: [
          {
            id: Date.now() + Math.random(),
            type: "field",
            label: nodeLabel,
            selector: validXpath,
            samples: [],
            contentFormat: "markdown",
          },
        ],
      });

      ElMessage.success("已添加文章内容节点");
      handleClose();
      return;
    }

    const res = await xpathParseApi({
      url: targetUrl,
      xpath: validXpath,
      contentFormat: "text",
      ...buildTaskCookiePayload(store.crawlerConfig),
    });

    if (!res?.items) {
      const matchRes = await xpathMatchApi({
        url: targetUrl,
        xpath: validXpath,
        ...buildTaskCookiePayload(store.crawlerConfig),
      }).catch(() => null);

      if (
        matchRes?.count &&
        props.parentNode?.type === "link" &&
        selectedXpathType.value === "list"
      ) {
        emit("confirm", {
          children: [],
          detailBaseSelector: validXpath,
        });
        ElMessage.warning(
          `XPath 在当前链接页命中了 ${matchRes.count} 个节点，但暂未自动识别出字段；已先保存为当前层列表容器，请继续手动添加字段。`,
        );
        handleClose();
        return;
      }

      if (matchRes?.count) {
        throw new Error(
          `XPath 在当前页面命中了 ${matchRes.count} 个节点，但未识别出可提取字段。请确认是否选中了纯容器节点。`,
        );
      }
      throw new Error("未找到可提取的内容");
    }

    const children = buildPreviewChildrenFromItems(res.items).map((child) =>
      toEmittedChild(child),
    );

    if (children.length === 0) {
      throw new Error("未识别出可添加的字段、图片或链接");
    }

    emit("confirm", {
      children,
      detailBaseSelector:
        props.parentNode?.type === "link" && selectedXpathType.value === "list"
          ? validXpath
          : undefined,
    });

    ElMessage.success("已添加子节点");
    handleClose();
  } catch (error: any) {
    console.error("Add child node error:", error);
    ElMessage.error(error?.message || "添加子节点失败");
  } finally {
    loading.value = false;
  }
}

function handleUpdateVisible(value: boolean) {
  if (!value) {
    resetState();
  }

  emit("update:visible", value);
}

function handleClose() {
  emit("update:visible", false);
}
</script>
