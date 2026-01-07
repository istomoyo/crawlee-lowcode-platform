<template>
  <el-card class="h-full flex flex-col p-4">

    <div class="flex justify-between items-center mb-3">
      <h3 class="font-bold">字段结构映射（表格版）</h3>
      <div class="flex gap-2">
        <el-button
          v-if="!batchMode"
          size="small"
          type="primary"
          @click="enableBatchMode"
        >
          批量删除
        </el-button>
        <el-button
          v-else
          size="small"
          type="danger"
          :disabled="selectedNodes.length === 0"
          @click="confirmBatchDelete"
        >
          删除选中 ({{ selectedNodes.length }})
        </el-button>
        <el-button
          v-if="batchMode"
          size="small"
          @click="disableBatchMode"
        >
          取消批量
        </el-button>
      </div>
    </div>

    <div v-if="tableLoading" class="flex items-center justify-center py-10">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span class="ml-2 text-gray-500">加载中...</span>
    </div>
    <FieldNodeList
      v-else
      :nodes="rootNodes"
      :batch-mode="batchMode"
      :selected-nodes="selectedNodes"
      @edit="openEditDialog"
      @remove="removeNode"
      @add-child="openAddChildDialog"
      @selection-change="handleSelectionChange"
    />

    <!-- 添加新节点 -->
    <div class="mt-4">
      <!-- 提示信息 -->
      <div v-if="!hasPaginationOrScroll" class="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
        <div class="flex items-start">
          <el-icon class="text-orange-500 mr-2 mt-0.5"><InfoFilled /></el-icon>
          <div class="flex-1">
            <p class="text-sm text-orange-800 font-medium mb-1">重要提示</p>
            <p class="text-sm text-orange-700">请至少添加一个"分页"或"滚动"类型的节点来控制数据获取范围，否则无法进行下一步。</p>
          </div>
        </div>
      </div>

      <div class="flex gap-2">
        <el-select v-model="newNodeType" placeholder="选择类型" size="small">
          <el-option label="字段" value="field" />
          <el-option label="图片" value="image" />
          <el-option label="链接" value="link" />
          <el-option label="分页" value="next" />
          <el-option label="滚动" value="scroll" />
        </el-select>
        <el-button type="primary" size="small" @click="addNewNode"
          >添加属性</el-button
        >
      </div>
    </div>

    <!-- 编辑弹框 -->
    <el-dialog v-model="editDialogVisible" title="编辑属性" width="400px">
      <el-form :model="editNode" ref="editForm">
        <el-form-item label="属性名">
          <el-input v-model="editNode.label" />
        </el-form-item>
        <el-form-item
          v-if="editNode.type !== 'scroll'"
          label="XPath"
        >
          <el-input
            v-model="editNode.selector"
            @input="editNode.jsPath = ''"
            placeholder="//div[@class='item']"
          />
        </el-form-item>
        <el-form-item label="JSPath">
          <el-input
            v-model="editNode.jsPath"
            @input="editNode.selector = ''"
            placeholder="document.querySelector('...')"
          />
        </el-form-item>
        <el-form-item
          v-if="editNode.type === 'next'"
          label="最大页数"
          :rules="[{ required: true, message: '必须填写最大页数' }]"
        >
          <el-input-number
            v-model="editNode.maxPages"
            :min="1"
            :max="50"
            placeholder="10"
          />
        </el-form-item>
        <el-form-item
          v-if="editNode.type === 'scroll'"
          label="最大滚动次数"
          :rules="[{ required: true, message: '必须填写最大滚动次数' }]"
        >
          <el-input-number
            v-model="editNode.maxScroll"
            :min="1"
            :max="100"
            placeholder="5"
          />
        </el-form-item>
        <el-form-item
          v-if="editNode.type === 'scroll'"
          label="等待时间(ms)"
          :rules="[{ required: true, message: '必须填写等待时间' }]"
        >
          <el-input-number
            v-model="editNode.waitTime"
            :min="500"
            :max="5000"
            :step="100"
            placeholder="1000"
          />
        </el-form-item>
        <el-form-item
          v-if="editNode.type === 'scroll'"
          label="最大数量限制"
          :rules="[{ required: true, message: '必须填写最大数量限制' }]"
        >
          <el-input-number
            v-model="editNode.maxItems"
            :min="1"
            :max="1000"
            :step="10"
            placeholder="100"
          />
        </el-form-item>

        <!-- 文字字段的内容格式选项 -->
        <el-form-item
          v-if="editNode.type === 'field'"
          label="内容格式"
        >
          <el-radio-group v-model="editNode.contentFormat">
            <el-radio value="text">解析HTML标签为纯文本</el-radio>
            <el-radio value="html">保留HTML格式</el-radio>
            <el-radio value="markdown">转换为Markdown格式</el-radio>
            <el-radio value="smart">智能提取（推荐文章内容）</el-radio>
          </el-radio-group>
          <div class="text-xs text-gray-500 mt-1">
            <div v-if="editNode.contentFormat === 'text'">
              将HTML标签解析为纯文本，适合提取简单文本内容
            </div>
            <div v-else-if="editNode.contentFormat === 'html'">
              保留原始HTML格式，适合保存文章内容或需要保持格式的文本
            </div>
            <div v-else-if="editNode.contentFormat === 'markdown'">
              将HTML转换为Markdown格式，适合爬取文章、博客等内容
            </div>
            <div v-else-if="editNode.contentFormat === 'smart'">
              <el-icon class="text-blue-500 mr-1"><InfoFilled /></el-icon>
              智能识别内容类型，自动应用最佳格式转换。特别适合博客文章、新闻内容等结构化文本，能自动提取标题、正文、列表等元素并转换为Markdown格式。
            </div>
          </div>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </span>
    </el-dialog>

    <!-- 添加子节点弹框 -->
    <AddChildNodeDialog
      v-model:visible="addChildDialogVisible"
      :parent-node="addChildParent"
      :page-url="getPageUrl(addChildParent)"
      @confirm="handleChildNodeConfirm"
    />
    <div class="mt-4 flex justify-end gap-2">
      <el-button @click="goPrev">上一步</el-button>
      <el-button type="primary" @click="goNext">下一步</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useTaskFormStore } from "@/stores/taskForm";
import { xpathParseApi, jsPathParseApi } from "@/api/task";

import { ElMessageBox, ElMessage } from "element-plus";
import { Loading, InfoFilled } from "@element-plus/icons-vue";
import FieldNodeList from "./components/FieldNodeList.vue";
import AddChildNodeDialog from "./components/AddChildNodeDialog.vue";
interface TreeNode {
  id: number;
  label: string;
  type: "field" | "image" | "link" | "next" | "scroll";
  selector?: string;
  jsPath?: string;
  samples?: string[];
  children?: TreeNode[];
  hasChildren?: boolean;
  imgSrc?: string;
  maxPages?: number;
  maxScroll?: number;
  waitTime?: number;
  maxItems?: number;
  contentFormat?: "text" | "html" | "markdown" | "smart"; // 内容格式，默认为text
}

declare global {
  interface TreeNode {
    id: number;
    label: string;
    type: "field" | "image" | "link" | "next" | "scroll";
    selector?: string;
    jsPath?: string;
    samples?: string[];
    children?: TreeNode[];
    hasChildren?: boolean;
    imgSrc?: string;
    maxPages?: number;
    maxScroll?: number;
    waitTime?: number;
    maxItems?: number;
    contentFormat?: "text" | "html" | "markdown" | "smart"; // 内容格式，默认为text
  }
}

const store = useTaskFormStore();
let idSeed = 1;
const rootNodes = computed(() => store.treeData as any);
const router = useRouter();




// 检查是否已配置分页或滚动节点
const hasPaginationOrScroll = computed(() => {
  return store.treeData.some(node =>
    node.type === 'next' || node.type === 'scroll'
  );
});


// 检测XPath或文本内容类型，返回推荐的XPath类型
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
      /\bdiv\b.*\bentry\b/i,
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
    title: [
      /title/i,
      /h1/i,
      /h2/i,
      /headline/i,
      /heading/i,
      /class.*title/i,
      /id.*title/i,
      /\/\/h1/i,
      /\/\/h2/i
    ],
    summary: [
      /summary/i,
      /description/i,
      /excerpt/i,
      /abstract/i,
      /preview/i,
      /class.*summary/i,
      /class.*desc/i,
      /meta.*description/i
    ],
    author: [
      /author/i,
      /writer/i,
      /byline/i,
      /class.*author/i,
      /id.*author/i
    ],
    date: [
      /date/i,
      /time/i,
      /published/i,
      /datetime/i,
      /class.*date/i,
      /class.*time/i
    ],
    category: [
      /category/i,
      /tag/i,
      /topic/i,
      /class.*cat/i,
      /class.*tag/i
    ]
  };

  // 检查是否匹配不同类型的XPath模式
  for (const [type, patterns] of Object.entries(typePatterns)) {
    if (patterns.some(pattern => pattern.test(input))) {
      return type;
    }
  }

  // 如果输入看起来像是实际的文本内容（不是XPath），进行内容分析
  const looksLikeContent = !input.includes('/') && !input.includes('[') && !input.includes('@') && input.length > 50;

  if (looksLikeContent) {
    // 内容分析模式
    const contentIndicators = [
      // 文本长度（文章通常较长）
      input.length > 200,
      // 包含多个句子
      (input.match(/[.!?。！？]/g) || []).length > 3,
      // 包含段落分隔
      input.includes('\n\n') || input.includes('\r\n\r\n'),
      // 包含HTML段落标签（如果保留了HTML）
      input.includes('<p>') || input.includes('</p>'),
      // 不像是列表项（不包含序号或短语）
      !/^\d+\.|\*\s|-\s/.test(input.trim()),
      // 包含文章常见词汇
      /\b(the|a|an)\s+(article|post|blog|news|story|content)\b/i.test(input)
    ];

    // 如果满足多个内容指标，认为是文章内容
    const contentScore = contentIndicators.filter(Boolean).length;
    if (contentScore >= 2) {
      return 'article';
    }

    // 检查是否是标题（较短，可能是标题）
    if (input.length < 200 && input.length > 10) {
      const titleIndicators = [
        !input.includes('\n'), // 单行
        /^[A-Z]/.test(input.trim()), // 大写开头
        (input.match(/[.!?。！？]/g) || []).length <= 1, // 至多一个句子结束符
        !/\d{4}-\d{2}-\d{2}/.test(input), // 不包含日期格式
      ];
      if (titleIndicators.filter(Boolean).length >= 2) {
        return 'title';
      }
    }

    // 检查是否是摘要（中等长度）
    if (input.length >= 50 && input.length <= 500) {
      return 'summary';
    }
  }

  return null; // 未识别出特定类型
}

// 保持向后兼容的函数
function isArticleLike(input: string): boolean {
  const detectedType = detectContentType(input);
  return detectedType === 'article';
}

// 根据JSPath类型生成有效的JSPath

// 编辑弹框
const editDialogVisible = ref(false);
const editNode = ref<TreeNode>({} as TreeNode);
const editForm = ref();

// 批量删除
const batchMode = ref(false);
const selectedNodes = ref<TreeNode[]>([]);

// 新节点类型
const newNodeType = ref<"field" | "image" | "link" | "next" | "scroll">("field");

// 添加子节点弹框相关
const addChildDialogVisible = ref(false);
const addChildParent = ref<any>(null);
const tableLoading = ref(true);




// 点击"添加子节点"时调用
function openAddChildDialog(node: any) {
  console.log('node :>> ', node);
  addChildParent.value = node;
  addChildDialogVisible.value = true;
}

// 获取页面URL
function getPageUrl(node: any): string {
  if (!node) return store.form.url;

  // 如果节点有samples，使用第一个有效的URL
  if (node.samples && node.samples.length > 0) {
    const sampleUrl = node.samples[0];
    if (sampleUrl && (sampleUrl.startsWith('http://') || sampleUrl.startsWith('https://'))) {
      return sampleUrl;
    }
  }

  // 否则使用默认的表单URL
  return store.form.url;
}

// 处理子节点确认添加
function handleChildNodeConfirm(children: any[]) {
  if (!addChildParent.value) return;

  // 使用Vue响应式方式更新children
  addChildParent.value.children.splice(0, addChildParent.value.children.length, ...children);
  addChildParent.value.hasChildren = true;
  addChildDialogVisible.value = false;
  addChildParent.value = null;
}

// 初始化树
async function initTree() {
  if (!store.form.url) {
    tableLoading.value = false;
    return;
  }
  const hasXpath = !!store.selectedItem?.xpath;
  const hasJsPath = !!store.selectedItem?.jsPath;
  if (!hasXpath && !hasJsPath) {
    tableLoading.value = false;
    return;
  }

  try {
    const res: any = hasJsPath
      ? await jsPathParseApi({
          url: store.form.url,
          jsPath: store.selectedItem?.jsPath || "",
        })
      : await xpathParseApi({
          url: store.form.url,
          xpath: store.selectedItem?.xpath || "",
        });
    console.log("object :>> ", {
      url: store.form.url,
      xpath: store.selectedItem?.xpath,
      jsPath: store.selectedItem?.jsPath,
    });
    console.log("res--init :>> ", res);
    store.treeData.length = 0;
    const item = res.items;
    if (!item) return;

    // 文本 - 根据内容自动设置内容格式
    item.texts?.forEach(({ text, xpath }: any) => {
      let contentFormat: "text" | "html" | "markdown" | "smart" = "text";

      if (isArticleLike(text)) {
        // 如果内容可能是文章，使用智能提取
        contentFormat = "smart";
      }

      store.treeData.push(
        createNode("field", text, hasJsPath ? "" : xpath, [text], false, hasJsPath ? store.selectedItem?.jsPath : undefined, contentFormat)
      );
    });

    // 图片
    item.images?.forEach(({ src, xpath }: any) => {
      const node = createNode(
        "image",
        src,
        hasJsPath ? "" : xpath,
        [src],
        false,
        hasJsPath ? store.selectedItem?.jsPath : undefined
      );
      // node.imgSrc = src // 图片直接显示 src
      store.treeData.push(node);
    });

    // 链接
    item.links?.forEach(({ href, xpath }: any) => {
      store.treeData.push(
        createNode("link", "链接地址", hasJsPath ? "" : xpath, [href], true, hasJsPath ? store.selectedItem?.jsPath : undefined)
      );
    });
  } catch (e) {
    console.error("XPath解析失败", e);
  } finally {
    tableLoading.value = false;
  }
}

// 创建节点
function createNode(
  type: "field" | "image" | "link" | "next" | "scroll",
  label: string,
  selector: string,
  samples: string[] = [],
  hasChildren = false,
  jsPath?: string,
  contentFormat?: "text" | "html" | "markdown" | "smart"
): TreeNode {
  // 确定内容格式
  let finalContentFormat: "text" | "html" | "markdown" | "smart" = "text";

  if (type === "field") {
    if (contentFormat !== undefined) {
      // 如果明确传入了内容格式，使用它
      finalContentFormat = contentFormat;
    } else {
      // 否则根据内容自动确定格式
      if (isArticleLike(label)) {
        finalContentFormat = "smart";
      }
    }
  }

  return {
    id: idSeed++,
    type,
    label,
    selector,
    jsPath,
    samples,
    hasChildren,
    children: type === "link" ? [] : undefined,
    contentFormat: type === "field" ? finalContentFormat : undefined,
  };
}

// 编辑
function openEditDialog(node: TreeNode) {
  editNode.value = {
    ...node,
    contentFormat: node.contentFormat ?? "text" // 确保contentFormat有默认值
  };
  editDialogVisible.value = true;
}
function saveEdit() {
  // 表单验证
  const editFormRef = editForm.value as any;
  if (editFormRef) {
    editFormRef.validate(async (valid: boolean) => {
      if (!valid) {
        return false;
      }

      // 额外验证逻辑
      // 检查XPath和JSPath不能同时填写
      if (editNode.value.selector?.trim() && editNode.value.jsPath?.trim()) {
        ElMessage.error('XPath和JSPath只能填写其中之一');
        return false;
      }

      if (editNode.value.type === 'next') {
        if (!editNode.value.selector?.trim() && !editNode.value.jsPath?.trim()) {
          ElMessage.error('分页节点必须填写XPath或JSPath其中之一');
          return false;
        }
        if (!editNode.value.maxPages || editNode.value.maxPages < 1 || editNode.value.maxPages > 50) {
          ElMessage.error('最大页数必须在1-50之间');
          return false;
        }
      }

      if (editNode.value.type === 'scroll') {
        if (!editNode.value.maxScroll || editNode.value.maxScroll < 1 || editNode.value.maxScroll > 100) {
          ElMessage.error('最大滚动次数必须在1-100之间');
          return false;
        }
        if (!editNode.value.waitTime || editNode.value.waitTime < 500 || editNode.value.waitTime > 5000) {
          ElMessage.error('等待时间必须在500-5000ms之间');
          return false;
        }
        if (!editNode.value.maxItems || editNode.value.maxItems < 1 || editNode.value.maxItems > 1000) {
          ElMessage.error('最大数量限制必须在1-1000之间');
          return false;
        }
      }

      // 递归查找节点（包括子节点）
      function findNodeInTree(list: TreeNode[], id: number): TreeNode | null {
        for (const node of list) {
          if (node.id === id) {
            return node;
          }
          if (node.children && node.children.length > 0) {
            const found = findNodeInTree(node.children, id);
            if (found) {
              return found;
            }
          }
        }
        return null;
      }

      const target = findNodeInTree(store.treeData as any, editNode.value.id);
      if (target) {
        Object.assign(target, editNode.value);
        editDialogVisible.value = false;
        ElMessage.success('保存成功');
      } else {
        ElMessage.error('未找到要编辑的节点');
      }
    });
  }
}

// 删除
function removeNode(id: number) {
  function dfs(list: TreeNode[]): boolean {
    const idx = list.findIndex((n) => n.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      return true;
    }
    return list.some((n) => n.children && dfs(n.children));
  }
  dfs(store.treeData as any);
}

// 批量删除
function enableBatchMode() {
  batchMode.value = true;
  selectedNodes.value = [];
}

function disableBatchMode() {
  batchMode.value = false;
  selectedNodes.value = [];
}

function handleSelectionChange(nodes: TreeNode[]) {
  selectedNodes.value = nodes;
}

function confirmBatchDelete() {
  if (selectedNodes.value.length === 0) {
    ElMessage.warning('请先选择要删除的节点');
    return;
  }

  ElMessageBox.confirm(
    `确定要删除选中的 ${selectedNodes.value.length} 个节点吗？此操作不可恢复。`,
    '批量删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
    }
  )
    .then(() => {
      // 执行批量删除
      const idsToDelete = selectedNodes.value.map(node => node.id);
      idsToDelete.forEach(id => removeNode(id));

      disableBatchMode();
      ElMessage.success(`成功删除 ${idsToDelete.length} 个节点`);
    })
    .catch(() => {
      // 用户取消操作
    });
}

// 添加最外层新节点
function addNewNode() {
  // 检查是否已经存在 next 或 scroll 类型的节点
  if ((newNodeType.value === "next" || newNodeType.value === "scroll") &&
      store.treeData.some(node => node.type === "next" || node.type === "scroll")) {
    ElMessage.warning("一层只能添加一个分页或滚动节点");
    return;
  }

  let label = "新属性";
  let selector = ".//text()";
  let maxPages: number | undefined;
  let maxScroll: number | undefined;
  let waitTime: number | undefined;
  let maxItems: number | undefined;

  if (newNodeType.value === "next") {
    label = "分页";
    selector = "//a[@class='next']";
    maxPages = 10;
  } else if (newNodeType.value === "scroll") {
    label = "滚动";
    selector = "";
    maxScroll = 5;
    waitTime = 1000;
    maxItems = 100;
  } else if (newNodeType.value === "link") {
    label = "链接地址";
    selector = ".//a[1]"; // 默认链接选择器
    hasChildren = true; // 链接默认可以有子节点
  }

  const node = createNode(newNodeType.value, label, selector, [""]);
  // 设置默认值
  if (maxPages !== undefined) node.maxPages = maxPages;
  if (maxScroll !== undefined) node.maxScroll = maxScroll;
  if (waitTime !== undefined) node.waitTime = waitTime;
  if (maxItems !== undefined) node.maxItems = maxItems;

  // 对于field类型的节点，使用默认内容格式
  if (newNodeType.value === "field") {
    node.contentFormat = "text";
  }

  store.treeData.push(node);
}

function goPrev() {
  router.push("/crawleer/task-add/structure");
}
function goNext() {
  // 检查是否配置了分页或滚动
  const hasPaginationOrScroll = store.treeData.some(node =>
    node.type === 'next' || node.type === 'scroll'
  );

  if (!hasPaginationOrScroll) {
    ElMessageBox.confirm(
      '请至少配置一个分页或滚动节点来控制数据获取范围。您可以点击上方"添加属性"下拉菜单选择"分页"或"滚动"类型来添加。',
      '缺少分页或滚动配置',
      {
        confirmButtonText: '知道了',
        cancelButtonText: '取消',
        type: 'warning',
        showCancelButton: false,
        confirmButtonClass: 'el-button--primary'
      }
    );
    return;
  }

  // 检查滚动节点是否配置了maxItems
  const scrollNode = store.treeData.find(node => node.type === 'scroll');
  if (scrollNode && (!scrollNode.maxItems || scrollNode.maxItems < 1)) {
    ElMessage.error("滚动节点必须配置最大数量限制");
    return;
  }

  router.push("/crawleer/task-add/config");
}

onMounted(initTree);
</script>

<style scoped>
.el-table img {
  display: block;
  max-width: 120px;
  max-height: 60px;
}
</style>
