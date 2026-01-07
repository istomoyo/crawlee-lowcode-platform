<template>
  <el-dialog
    :model-value="visible"
    title="添加子节点配置"
    width="800px"
    :close-on-click-modal="false"
    :before-close="handleClose"
    @update:model-value="handleUpdateVisible"
  >
    <div class="space-y-6">
      <!-- 配置方式选择 -->
      <div>
        <h4 class="font-bold mb-3 text-gray-800">选择配置方式</h4>
        <el-radio-group v-model="configMode" size="large" class="mb-4">
          <el-radio-button value="auto">自动识别</el-radio-button>
          <el-radio-button value="custom">自定义配置</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 自动识别模式 -->
      <div v-if="configMode === 'auto'">
        <div class="border rounded-lg p-4 bg-blue-50">
          <h5 class="font-semibold mb-3 text-blue-800">
            {{ parentNode?.type === 'link' ? '自动识别链接结构' : '自动识别列表项' }}
          </h5>

          <!-- 针对链接类型的特殊说明 -->
          <div v-if="parentNode?.type === 'link'" class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p class="text-sm text-yellow-800">
              <el-icon class="mr-1"><InfoFilled /></el-icon>
              您正在为链接字段配置子节点。系统将在当前页面分析链接的结构，请选择合适的XPath来提取链接相关的其他信息。
            </p>
          </div>

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
              :loading="recognitionLoading"
              @click="startAutoRecognition"
              size="small"
            >
              <el-icon class="mr-1"><Search /></el-icon>
              开始自动识别
            </el-button>
          </div>

          <!-- 识别结果 -->
          <div v-if="autoRecognitionDone && listItems.length > 0">
            <p class="text-sm text-gray-600 mb-3">
              {{ parentNode?.type === 'link' ? '找到以下可能的链接结构' : '找到以下可能的列表项' }}，请根据实际需求选择：
            </p>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
              <el-card
                v-for="(item, index) in listItems"
                :key="index"
                :class="[
                  'cursor-pointer transition-all duration-200 hover:shadow-md',
                  selectedIndex === index ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50',
                ]"
                @click="selectAuto(index)"
              >
                <template #header>
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium truncate flex-1">
                      {{ parentNode?.type === 'link' ? '链接结构' : '选项' }} {{ index + 1 }}
                    </span>
                    <el-tag size="mini" type="info">{{ item.matchCount }} 个匹配</el-tag>
                  </div>
                </template>
                <div class="p-2">
                  <img
                    :src="'data:image/png;base64,' + item.base64"
                    class="w-full h-24 object-contain rounded border mb-2"
                    alt="结构预览"
                  />
                  <p class="text-xs text-gray-500 truncate" :title="item.xpath">{{ item.xpath }}</p>
                </div>
              </el-card>
            </div>
          </div>

          <!-- 无识别结果 -->
          <div v-else-if="autoRecognitionDone && listItems.length === 0" class="text-center py-8">
            <el-icon size="48" class="text-gray-400 mb-2"><InfoFilled /></el-icon>
            <p class="text-gray-600">
              {{ parentNode?.type === 'link' ? '未找到合适的链接结构' : '未找到合适的列表项' }}
            </p>
            <p class="text-sm text-gray-500 mt-1">建议切换到自定义配置模式手动输入XPath</p>
          </div>

          <!-- 加载状态 -->
          <div v-if="recognitionLoading" class="text-center py-8">
            <el-spinner size="large" />
            <p class="text-gray-600 mt-3">
              {{ parentNode?.type === 'link' ? '正在分析链接结构...' : '正在分析页面结构...' }}
            </p>
          </div>
        </div>
      </div>

      <!-- 自定义配置模式 -->
      <div v-if="configMode === 'custom'">
        <div class="border rounded-lg p-4 bg-green-50">
          <h5 class="font-semibold mb-3 text-green-800">自定义配置</h5>
          <p class="text-sm text-gray-600 mb-4">直接输入XPath或JSPath来指定要爬取的数据位置</p>

          <div class="space-y-4">
            <!-- XPath配置 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                XPath选择器
                <el-tooltip content="使用XPath语法定位元素，例如：//div[@class='item']" placement="top">
                  <el-icon class="ml-1 text-gray-400 cursor-help"><InfoFilled /></el-icon>
                </el-tooltip>
              </label>
              <el-input
                v-model="customXpath"
                placeholder="//div[@class='item'] | //article | //li[contains(@class, 'post')]"
                clearable
                size="small"
              />
              <p class="text-xs text-gray-500 mt-1">用于选择页面中的多个相似元素</p>

              <!-- 内容类型选择器 -->
              <div class="mt-3">
                <label class="block text-sm font-medium text-gray-700 mb-2">内容类型</label>
                <div class="text-xs text-gray-500 mb-2">
                  选择处理方式：文章内容直接转换为Markdown，列表项通过标准XPath解析
                </div>
                <el-select
                  v-model="selectedXpathType"
                  placeholder="选择XPath指向的内容类型"
                  size="small"
                  clearable
                  class="w-full"
                >
                  <template #prefix>
                    <el-icon class="text-gray-400"><Document /></el-icon>
                  </template>
                  <el-option
                    v-for="type in xpathContentTypes"
                    :key="type.value"
                    :label="`${type.icon} ${type.label}`"
                    :value="type.value"
                  >
                    <div class="flex items-center">
                      <span class="mr-2">{{ type.icon }}</span>
                      <div class="flex-1">
                        <div class="font-medium flex items-center">
                          {{ type.label }}
                          <el-tag v-if="type.value === 'article'" size="mini" type="success" class="ml-2">Markdown</el-tag>
                          <el-tag v-else size="mini" type="info" class="ml-2">XPath解析</el-tag>
                        </div>
                        <div class="text-xs text-gray-500">{{ type.description }}</div>
                      </div>
                    </div>
                  </el-option>
                </el-select>
                <div v-if="selectedXpathType" class="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs">
                  <div class="flex items-center text-gray-700">
                    <el-icon class="mr-1"><InfoFilled /></el-icon>
                    <span>{{ xpathContentTypes.find(t => t.value === selectedXpathType)?.description }}</span>
                  </div>
                  <div class="mt-1 text-gray-600">
                    默认格式: {{ xpathContentTypes.find(t => t.value === selectedXpathType)?.defaultFormat === 'smart' ? '智能提取' : xpathContentTypes.find(t => t.value === selectedXpathType)?.defaultFormat }}
                  </div>
                </div>

                <!-- 智能提示 -->
                <div v-if="customXpath && detectContentType(customXpath)" class="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div class="flex items-start">
                    <el-icon class="text-blue-500 mr-2 mt-0.5"><InfoFilled /></el-icon>
                    <div class="flex-1">
                      <p class="text-sm text-blue-800 font-medium mb-1">
                        检测到可能是{{ xpathContentTypes.find(t => t.value === detectContentType(customXpath))?.label || '特定内容' }}
                      </p>
                      <p class="text-sm text-blue-700">
                        系统已自动选择相应的内容类型，您也可以手动修改。
                        <span v-if="detectContentType(customXpath) === 'article'" class="font-medium">将应用智能提取格式。</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- JSPath配置 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                JSPath选择器 (支持Shadow DOM)
                <el-tooltip placement="top" max-width="400px">
                  <template #content>
                    <div class="text-sm space-y-2">
                      <p class="font-semibold">标准选择器：</p>
                      <p class="text-blue-600">• document.querySelector('.item')</p>
                      <p class="text-blue-600">• document.querySelectorAll('.post')</p>

                      <p class="font-semibold mt-3">Shadow DOM穿透：</p>
                      <p class="text-green-600">• shadow:.host-element > .inner-item</p>
                      <p class="text-green-600">• shadow:.card::shadow .content</p>
                      <p class="text-green-600">• shadow:.modal::shadow::shadow .deep-content</p>

                      <p class="font-semibold mt-3">高级用法：</p>
                      <p class="text-purple-600">• custom:() => { /* 任意JS逻辑 */ }</p>
                    </div>
                  </template>
                  <el-icon class="ml-1 text-gray-400 cursor-help"><InfoFilled /></el-icon>
                </el-tooltip>
              </label>

              <!-- JSPath类型选择 -->
              <el-radio-group v-model="jspathType" size="mini" class="mb-2">
                <el-radio-button value="standard">标准</el-radio-button>
                <el-radio-button value="shadow">Shadow DOM</el-radio-button>
                <el-radio-button value="custom">自定义JS</el-radio-button>
              </el-radio-group>

              <!-- 根据类型显示不同的输入框 -->
              <el-input
                v-if="jspathType === 'standard'"
                v-model="customJsPath"
                placeholder="document.querySelectorAll('.item')"
                clearable
                size="small"
              />

              <el-input
                v-if="jspathType === 'shadow'"
                v-model="customJsPath"
                placeholder=".host-element > .inner-item"
                clearable
                size="small"
              >
                <template #prepend>
                  <el-select v-model="shadowDepth" placeholder="层数" size="small" style="width: 70px">
                    <el-option label="1层" :value="1" />
                    <el-option label="2层" :value="2" />
                    <el-option label="3层" :value="3" />
                  </el-select>
                </template>
              </el-input>

              <el-input
                v-if="jspathType === 'custom'"
                v-model="customJsPath"
                placeholder="custom:() => document.querySelectorAll('.dynamic-content')"
                clearable
                size="small"
                type="textarea"
                :rows="3"
              />

              <p class="text-xs text-gray-500 mt-1">
                <span v-if="jspathType === 'standard'">标准DOM选择器，性能最好</span>
                <span v-if="jspathType === 'shadow'">专门为Shadow DOM设计，支持多层穿透</span>
                <span v-if="jspathType === 'custom'">执行任意JavaScript代码，最灵活</span>
              </p>
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
                  <li>• 配置将应用于当前链接元素，提取其子元素数据</li>
                  <li>• 可以使用浏览器的开发者工具获取准确的选择器</li>
                </ul>
              </template>
            </el-alert>
          </div>
        </div>
      </div>

      <!-- 当前选择状态 -->
      <div v-if="selectedXpath || customXpath || customJsPath" class="border-t pt-4">
        <h6 class="font-medium text-gray-800 mb-2">当前配置</h6>
        <div class="bg-gray-50 rounded p-3">
          <div class="text-sm">
            <span v-if="configMode === 'auto' && selectedXpath" class="text-blue-600">
              <el-icon class="mr-1"><Check /></el-icon>
              {{ parentNode?.type === 'link' ? '链接结构' : '自动识别' }}: {{ selectedXpath }}
            </span>
            <span v-else-if="customXpath" class="text-green-600">
              <el-icon class="mr-1"><Check /></el-icon>
              XPath: {{ customXpath }}
            </span>
            <span v-else-if="customJsPath" class="text-purple-600">
              <el-icon class="mr-1"><Check /></el-icon>
              JSPath: {{ customJsPath }}
            </span>
          </div>
          <!-- 显示选择的XPath类型 -->
          <div v-if="selectedXpathType" class="mt-2 p-2 bg-blue-50 rounded text-xs">
            <div class="flex items-center text-blue-700">
              <el-icon class="mr-1"><InfoFilled /></el-icon>
              <span>内容类型: {{ xpathContentTypes.find(t => t.value === selectedXpathType)?.icon }} {{ xpathContentTypes.find(t => t.value === selectedXpathType)?.label }}</span>
            </div>
            <div class="mt-1 text-blue-600">
              格式: {{ xpathContentTypes.find(t => t.value === selectedXpathType)?.defaultFormat === 'smart' ? '智能提取' : xpathContentTypes.find(t => t.value === selectedXpathType)?.defaultFormat }}
            </div>
          </div>
          <!-- 链接类型节点的特殊说明 -->
          <div v-if="parentNode?.type === 'link'" class="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
            <el-icon class="mr-1"><InfoFilled /></el-icon>
            此配置将从每个链接元素中提取子信息（如标题、描述等）
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-between items-center">
        <div class="text-sm text-gray-500">
          <span v-if="configMode === 'auto' && !autoRecognitionDone">请先配置参数并开始识别</span>
          <span v-else-if="configMode === 'auto' && autoRecognitionDone && !selectedXpath">
            {{ parentNode?.type === 'link' ? '请从链接结构中选择一项' : '请从识别结果中选择一项' }}
          </span>
          <span v-else-if="!selectedXpathType">
            请先选择内容类型（文章内容或列表项）
          </span>
          <span v-else-if="configMode === 'custom' && !customXpath && !effectiveJsPath">
            请填写XPath{{ jspathType === 'standard' ? '或JSPath' : jspathType === 'shadow' ? '或Shadow DOM选择器' : '或自定义JS代码' }}来定义{{ parentNode?.type === 'link' ? '链接的子信息提取规则' : '子节点提取规则' }}
          </span>
          <span v-else-if="canConfirm" class="text-green-600">
            配置完成，可以添加子节点了
          </span>
          <span v-else class="text-orange-600">
            请完成配置后再确认添加
          </span>
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
import { ref, computed, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Search, Check, Plus, InfoFilled, Document } from "@element-plus/icons-vue";
import { xpathParseApi, jsPathParseApi, listPreviewApi } from "@/api/task";
import { useTaskFormStore } from "@/stores/taskForm";

interface Props {
  visible: boolean;
  parentNode: any;
  pageUrl?: string;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm', children: any[]): void;
}

const emit = defineEmits<Emits>();

// 响应式数据
const store = useTaskFormStore();

// 自动识别相关
const listItems = ref<any[]>([]);
const selectedIndex = ref(-1);
const selectedXpath = ref("");
const recognitionLoading = ref(false);
const autoRecognitionDone = ref(false);
const targetAspectRatio = ref(1.0);
const tolerance = ref(0.3);

// 自定义配置相关
const customXpath = ref("");
const customJsPath = ref("");
const selectedXpathType = ref("");
const jspathType = ref<'standard' | 'shadow' | 'custom'>('standard');
const shadowDepth = ref(1);

// 配置模式
const configMode = ref<'auto' | 'custom'>('custom');

// 加载状态
const loading = ref(false);

// XPath内容类型配置
interface XPathContentType {
  value: string;
  label: string;
  icon: string;
  description: string;
  defaultFormat: "text" | "html" | "markdown" | "smart";
}

const xpathContentTypes: XPathContentType[] = [
  {
    value: "article",
    label: "文章内容",
    icon: "📝",
    description: "博客文章、正文内容、长文本 - 直接转换为Markdown格式",
    defaultFormat: "smart",
  },
  {
    value: "list",
    label: "列表项",
    icon: "📋",
    description: "列表项目、导航项 - 走标准XPath解析",
    defaultFormat: "text",
  },
];

// 计算属性
const canConfirm = computed(() => {
  // 必须选择内容类型
  if (!selectedXpathType.value) {
    return false;
  }

  if (configMode.value === 'auto') {
    return autoRecognitionDone.value && selectedXpath.value.trim() !== "";
  } else {
    const hasXpath = customXpath.value.trim() !== "";
    const hasJsPath = customJsPath.value.trim() !== "";
    return hasXpath || hasJsPath;
  }
});

const effectiveJsPath = computed(() => {
  const trimmedInput = customJsPath.value.trim();

  switch (jspathType.value) {
    case 'standard':
      return trimmedInput;
    case 'shadow':
      if (trimmedInput) {
        return convertShadowSelectorToJs(trimmedInput, shadowDepth.value);
      }
      return "";
    case 'custom':
      if (trimmedInput) {
        if (trimmedInput.startsWith('custom:')) {
          return trimmedInput.substring(7).trim();
        }
        return trimmedInput;
      }
      return "";
    default:
      return trimmedInput;
  }
});

// 检测XPath或文本内容类型
function detectContentType(input: string): string | null {
  if (!input) return null;

  // XPath检测模式 - 不同类型的内容模式
  const typePatterns = {
    article: [
      /article/i,
      /post/i,
      /content/i,
      /entry/i,
      /blog/i,
      /news/i,
      /story/i,
      /\bmain\b/i,
      /\bsection\b/i,
      /\bdiv\b.*\bcontent\b/i,
      /\bdiv\b.*\barticle\b/i,
      /\bdiv\b.*\bpost\b/i,
      /\bdiv\b.*\btext\b/i,
      /\bp\b.*\bcontent\b/i,
      /class.*content/i,
      /class.*article/i,
      /class.*post/i,
      /class.*text/i,
      /id.*content/i,
      /id.*article/i,
      /id.*post/i,
      // 更精确的模式
      /\/\/article/i,
      /\/\/div\[.*content.*\]/i,
      /\/\/section/i,
      /\/\/main/i
    ],
    list: [
      /li/i,
      /item/i,
      /list/i,
      /\bul\b/i,
      /\bol\b/i,
      /class.*item/i,
      /class.*list/i,
      /\/\/li/i,
      /\/\/div\[.*item.*\]/i
    ]
  };

  // 检查是否匹配不同类型的XPath模式
  for (const [type, patterns] of Object.entries(typePatterns)) {
    if (patterns.some((pattern: any) => pattern.test(input))) {
      return type;
    }
  }

  return null;
}

// 将Shadow DOM选择器转换为JavaScript代码
function convertShadowSelectorToJs(selector: string, depth: number): string {
  const cleanSelector = selector.replace(/^shadow:/, '');
  const parts = cleanSelector.split('::shadow').filter(p => p.trim());

  if (parts.length === 0 || !parts[0]) return "";

  let code = `(() => {
  let element = document.querySelector('${parts[0]!.trim()}');`;

  for (let i = 1; i < Math.min(parts.length, depth + 1); i++) {
    const part = parts[i];
    if (part && part.trim()) {
      code += `\n  if (element) element = element.shadowRoot?.querySelector('${part.trim()}');`;
    }
  }

  code += `\n  return element ? [element] : [];
})()`;

  return code;
}

// 开始自动识别
async function startAutoRecognition() {
  if (!store.form.url) {
    ElMessage.error("无法获取页面URL");
    return;
  }

  recognitionLoading.value = true;
  try {
    const res = await listPreviewApi({
      url: store.form.url,
      targetAspectRatio: targetAspectRatio.value,
      tolerance: tolerance.value,
    });

    listItems.value.splice(0, listItems.value.length, ...res);
    autoRecognitionDone.value = true;
    selectedIndex.value = -1;
    selectedXpath.value = "";

    if (res.length === 0) {
      ElMessage.warning("未找到合适的列表项，请调整参数或使用自定义配置");
    } else {
      ElMessage.success(`找到 ${res.length} 个可能的列表项`);
    }
  } catch (error) {
    ElMessage.error("自动识别失败，请检查参数设置");
    console.error("Auto recognition error:", error);
  } finally {
    recognitionLoading.value = false;
  }
}

// 选择自动识别的选项
function selectAuto(index: number) {
  selectedIndex.value = index;
  selectedXpath.value = listItems.value[index]!.xpath;
  customXpath.value = "";
  customJsPath.value = "";
}

// 输入自定义 XPath
watch(customXpath, (val) => {
  if (val) {
    selectedXpath.value = "";
    selectedIndex.value = -1;
    customJsPath.value = "";

    // 智能检测XPath类型并自动设置
    const detectedType = detectContentType(val.trim());
    console.log(`XPath: "${val.trim()}", 检测到的类型: ${detectedType}, 当前选择类型: "${selectedXpathType.value}"`);
    if (detectedType && !selectedXpathType.value) {
      selectedXpathType.value = detectedType;
      console.log(`自动设置为类型: ${detectedType}`);
    }
  }
});

// 自定义 JSPath 与 XPath 互斥优先
watch(customJsPath, (val) => {
  if (val) {
    selectedXpath.value = "";
    selectedIndex.value = -1;
    customXpath.value = "";
  }
});

// 配置模式切换时重置状态
watch(configMode, (newMode) => {
  if (newMode === 'auto') {
    customXpath.value = "";
    customJsPath.value = "";
    selectedXpathType.value = "";
  } else {
    selectedIndex.value = -1;
    selectedXpath.value = "";
    autoRecognitionDone.value = false;
    listItems.value.length = 0;
  }
});

// XPath类型选择变化时的提示
watch(selectedXpathType, (newType) => {
  if (newType) {
    const typeConfig = xpathContentTypes.find(t => t.value === newType);
    if (typeConfig) {
      if (newType === 'article') {
        ElMessage.info(`已选择"${typeConfig.label}"类型，将直接转换为Markdown格式（跳过XPath解析）`);
      } else {
        ElMessage.info(`已选择"${typeConfig.label}"类型，将使用标准XPath解析`);
      }
      console.log(`选择了XPath类型: ${typeConfig.label}`);
    }
  }
});

// 确认添加子节点
async function confirmAddChildNode() {
  if (!props.parentNode) {
    console.log('Validation failed: no parent node');
    return;
  }

  try {
    loading.value = true;
    let children: any[] = [];

    // 确定使用哪种解析方式和路径
    let useJsPath = false;
    let validPath = "";

    // 优先检查是否有有效的JSPath输入
    if (customJsPath.value.trim() !== "") {
      useJsPath = true;
      validPath = effectiveJsPath.value;
    }
    // 然后检查XPath（自动识别或自定义）
    else if (selectedXpath.value.trim() !== "") {
      validPath = selectedXpath.value;
    }
    else if (customXpath.value.trim() !== "") {
      validPath = customXpath.value;
    }

    // 如果XPath类型是文章内容，使用markdown格式
    const shouldUseMarkdown = selectedXpathType.value === 'article';
    const actualContentFormat = shouldUseMarkdown ? 'markdown' : 'text';

    // 对于文章内容类型，直接创建节点，不走API解析
    if (shouldUseMarkdown) {
      console.log("Processing article content type - direct creation without API call");

      // 创建文章内容节点
      const nodeLabel = `文章内容 (${validPath.length > 30 ? validPath.substring(0, 30) + "..." : validPath})`;

      children.push({
        id: Date.now() + Math.random(),
        type: "field",
        label: nodeLabel,
        selector: useJsPath ? "" : validPath,
        jsPath: useJsPath ? validPath : "",
        samples: [], // 不需要预览内容，直接使用XPath
        contentFormat: "markdown",
      });

      emit('confirm', children);
      ElMessage.success(`成功添加文章内容节点，将直接使用XPath转换为Markdown格式`);
      loading.value = false;
      return;
    }

    console.log('confirmAddChildNode:', {
      useJsPath,
      validPath,
      customJsPath: customJsPath.value,
      effectiveJsPath: effectiveJsPath.value,
      customXpath: customXpath.value,
      selectedXpath: selectedXpath.value,
      contentFormat: actualContentFormat,
      shouldUseMarkdown,
      selectedXpathType: selectedXpathType.value,
      configMode: configMode.value
    });

    if (!validPath) {
      console.log('Validation failed: no valid path');
      ElMessage.error("请填写XPath或JSPath");
      return;
    }

    // 验证必要参数
    // 确定目标URL
    const targetUrl = props.pageUrl || store.form.url;
    if (!targetUrl) {
      throw new Error("当前页面URL为空，请先在任务配置中设置要爬取的页面URL");
    }

    // 验证XPath/JSPath格式
    if (!validPath.trim()) {
      throw new Error("XPath或JSPath不能为空");
    }

    // 验证必须选择内容类型
    if (!selectedXpathType.value) {
      throw new Error("请先选择内容类型（文章内容或列表项）");
    }

    console.log(`调用${useJsPath ? 'JSPath' : 'XPath'}解析API...`);
    console.log(`目标URL: ${targetUrl}`);
    console.log(`${useJsPath ? 'JSPath' : 'XPath'}: ${validPath}`);

    console.log(`Making API call with contentFormat: ${actualContentFormat}`);

    let res: any;
    try {
      res = useJsPath
        ? await jsPathParseApi({
            url: targetUrl,
            jsPath: validPath,
            contentFormat: actualContentFormat,
          })
        : await xpathParseApi({
            url: targetUrl,
            xpath: validPath,
            contentFormat: actualContentFormat,
          });
    } catch (apiError: any) {
      console.error("API调用失败:", apiError);
      throw new Error(`API调用失败: ${apiError.message || '网络错误'}`);
    }

    console.log(`API call completed with contentFormat: ${actualContentFormat}`);

    console.log("API response:", res);

    // 检查响应是否有效
    if (!res) {
      throw new Error("API返回空响应");
    }

    if (res.code && res.code !== 200) {
      throw new Error(`API返回错误: ${res.message || '未知错误'}`);
    }

    // 检查API响应
    if (res.count === 0 || !res.items) {
      console.warn("API响应:", res);
      console.warn("XPath/JSPath:", validPath);
      console.warn("URL:", targetUrl);
      throw new Error("未找到匹配的元素，请检查XPath或JSPath选择器是否正确");
    }

    // 处理普通模式（列表项）的API响应
    const items = res.items;

    // 检查items是否有效
    if (typeof items !== 'object') {
      throw new Error("API返回数据格式错误");
    }

    // 确保有内容
    if ((!items.texts || items.texts.length === 0) &&
        (!items.images || items.images.length === 0) &&
        (!items.links || items.links.length === 0)) {
      throw new Error("未找到任何可提取的内容（文本、图片或链接）");
    }

    // 对于普通模式，确保有内容
    if ((!items.texts || items.texts.length === 0) &&
        (!items.images || items.images.length === 0) &&
        (!items.links || items.links.length === 0)) {
      throw new Error("未找到任何可提取的内容（文本、图片或链接）");
    }

    // 普通处理逻辑（列表项）
    items.texts?.forEach((t: any) => {
      children.push({
        id: Date.now() + Math.random(),
        type: "field",
        label: t.text,
        selector: useJsPath ? "" : t.xpath,
        jsPath: useJsPath ? validPath : "",
        samples: [t.text],
        contentFormat: "text",
      });
    });

    items.images?.forEach((i: any) => {
      children.push({
        id: Date.now() + Math.random(),
        type: "image",
        label: i.src,
        selector: useJsPath ? "" : i.xpath,
        jsPath: useJsPath ? validPath : "",
        imgSrc: i.src,
        samples: [i.src],
      });
    });

    items.links?.forEach((l: any) => {
      children.push({
        id: Date.now() + Math.random(),
        type: "link",
        label: l.href,
        selector: useJsPath ? "" : l.xpath,
        jsPath: useJsPath ? validPath : "",
        samples: [l.href],
        children: [],
        hasChildren: true,
      });
    });

    emit('confirm', children);

    if (shouldUseMarkdown) {
      ElMessage.success(`成功添加文章内容节点，已直接转换为Markdown格式`);
    } else {
      ElMessage.success(`成功添加列表项节点，已通过XPath解析处理`);
    }
  } catch (err: any) {
    console.error("添加子节点失败:", err);

    let errorMessage = "解析子节点失败";
    if (err.message) {
      errorMessage = err.message;
    } else if (typeof err === 'string') {
      errorMessage = err;
    }

    // 显示详细错误信息
    ElMessage.error({
      message: errorMessage,
      duration: 5000,
      showClose: true
    });
  } finally {
    loading.value = false;
  }
}

// 处理对话框显示状态更新
function handleUpdateVisible(value: boolean) {
  if (!value) {
    // 当对话框关闭时，重置所有状态
    listItems.value.length = 0;
    selectedIndex.value = -1;
    selectedXpath.value = "";
    customXpath.value = "";
    customJsPath.value = "";
    selectedXpathType.value = "";
    loading.value = false;
    recognitionLoading.value = false;
    autoRecognitionDone.value = false;
    configMode.value = 'custom';
  }

  emit('update:visible', value);
}

// 关闭对话框
function handleClose() {
  emit('update:visible', false);
}
</script>
