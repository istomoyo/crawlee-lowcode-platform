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
      <el-spinner />
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
    <div class="mt-4 flex gap-2">
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
            :max="20"
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
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </span>
    </el-dialog>

    <!-- 添加子节点弹框 -->
    <!-- 添加子节点弹窗 -->
    <el-dialog v-model="addChildDialogVisible" title="添加子节点" width="600px">
      <template #default>
        <div v-if="loading" class="text-center">
          <el-spinner />
          <p>正在加载列表项...</p>
        </div>

        <div v-else>
          <!-- 自动识别列表 -->
          <div v-if="listItems.length">
            <h4 class="font-bold mb-2">自动识别的列表项</h4>
            <div class="grid grid-cols-3 gap-4">
              <el-card
                v-for="(item, index) in listItems"
                :key="index"
                :class="[
                  'cursor-pointer',
                  selectedIndex === index ? 'border-blue-500! border-2!' : '',
                ]"
                @click="selectAuto(index)"
              >
                <template #header>{{ item.xpath }}</template>
                <img
                  :src="'data:image/png;base64,' + item.base64"
                  class="w-full h-40 object-contain"
                />
                <p class="text-sm mt-1">数量：{{ item.matchCount }}</p>
              </el-card>
            </div>
          </div>

          <!-- 自定义 XPath -->
          <div class="mt-4">
            <h4 class="font-bold mb-2">自定义 XPath</h4>
            <el-input
              v-model="customXpath"
              placeholder="//div[@class='item']"
              clearable
            />
          </div>

          <!-- 自定义 JSPath -->
          <div class="mt-4">
            <h4 class="font-bold mb-2">自定义 JSPath</h4>
            <el-input
              v-model="customJsPath"
              placeholder="document.querySelector('...').shadowRoot.querySelector('...')"
              clearable
            />
          </div>
        </div>
      </template>

      <template #footer>
        <el-button @click="closeAddChildDialog">取消</el-button>
        <el-button
          type="primary"
          :disabled="!selectedXpath && !customJsPath"
          @click="confirmAddChildNode"
          >确认</el-button
        >
      </template>
    </el-dialog>
    <div class="mt-4 flex justify-end gap-2">
      <el-button @click="goPrev">上一步</el-button>
      <el-button type="primary" @click="goNext">下一步</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, watch, computed } from "vue";
import { useRouter } from "vue-router";
import { useTaskFormStore } from "@/stores/taskForm";
import { xpathParseApi, jsPathParseApi } from "@/api/task";

import { listPreviewApi } from "@/api/task";
import { ElMessageBox, ElMessage } from "element-plus";
import FieldNodeList from "./components/FieldNodeList.vue";
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
  }
}

const store = useTaskFormStore();
let idSeed = 1;
const rootNodes = computed(() => store.treeData as any);
const router = useRouter();

// 编辑弹框
const editDialogVisible = ref(false);
const editNode = ref<TreeNode>({} as TreeNode);
const editForm = ref();

// 批量删除
const batchMode = ref(false);
const selectedNodes = ref<TreeNode[]>([]);

// 新节点类型
const newNodeType = ref<"field" | "image" | "link" | "next" | "scroll">("field");

interface ListItem {
  xpath: string;
  base64: string;
  matchCount: number;
}
// 添加子节点弹框
// 添加子节点弹窗状态
const addChildDialogVisible = ref(false);
const addChildParent = ref<any>(null);
const listItems = reactive<ListItem[]>([]);
const selectedIndex = ref(-1);
const selectedXpath = ref<string>("");
const customXpath = ref("");
const customJsPath = ref("");
const loading = ref(false);
const tableLoading = ref(true);
const currentObjectUrl = ref("");
// 点击“添加子节点”时调用
async function openAddChildDialog(node: any) {
  // console.log('node :>> ', node);
  const [objectUrl] = node.samples || [];
  currentObjectUrl.value = objectUrl;
  addChildParent.value = node;
  addChildDialogVisible.value = true;
  listItems.length = 0;
  selectedIndex.value = -1;
  selectedXpath.value = "";
  customXpath.value = "";
  customJsPath.value = "";

  // 弹窗让用户输入目标长宽比和误差
  try {
    const { value: ratioValue } = await ElMessageBox.prompt(
      "请输入目标长宽比",
      "子节点识别设置",
      {
        inputValue: "1",
        inputPattern: /^\d+(\.\d+)?$/,
        inputErrorMessage: "请输入数字",
      }
    );
    const targetAspectRatio = parseFloat(ratioValue);

    const { value: toleranceValue } = await ElMessageBox.prompt(
      "请输入允许误差",
      "子节点识别设置",
      {
        inputValue: "0.3",
        inputPattern: /^\d+(\.\d+)?$/,
        inputErrorMessage: "请输入数字",
      }
    );
    const tolerance = parseFloat(toleranceValue);

    loading.value = true;
    // 调用列表识别接口
    const res = await listPreviewApi({
      url: objectUrl,
      targetAspectRatio,
      tolerance,
    });
    listItems.splice(0, listItems.length, ...res);
    console.log("listItems :>> ", listItems);
  } catch (err) {
    addChildDialogVisible.value = false;
    ElMessage.info("取消操作或输入错误");
  } finally {
    loading.value = false;
  }
}

// 选择自动识别
function selectAuto(index: number) {
  selectedIndex.value = index;
  selectedXpath.value = listItems[index]!.xpath;
  customXpath.value = "";
}

// 输入自定义 XPath
watch(customXpath, (val) => {
  if (val) selectedXpath.value = val;
  else if (selectedIndex.value >= 0)
    selectedXpath.value = listItems[selectedIndex.value]?.xpath || "";
});

// 自定义 JSPath 与 XPath 互斥优先：输入 JSPath 时清空 XPath 选择
watch(customJsPath, (val) => {
  if (val) {
    selectedXpath.value = "";
    selectedIndex.value = -1;
    customXpath.value = "";
  }
});

// 关闭弹窗
function closeAddChildDialog() {
  addChildDialogVisible.value = false;
  addChildParent.value = null;
  listItems.length = 0;
  selectedIndex.value = -1;
  selectedXpath.value = "";
  customXpath.value = "";
  customJsPath.value = "";
}

// 确认添加子节点
async function confirmAddChildNode() {
  const useJsPath = !!customJsPath.value;
  const validPath = useJsPath ? customJsPath.value : selectedXpath.value;
  if (!validPath || !addChildParent.value) return;

  try {
    const res: any = useJsPath
      ? await jsPathParseApi({
          url: currentObjectUrl.value,
          jsPath: customJsPath.value,
        })
      : await xpathParseApi({
          url: currentObjectUrl.value,
          xpath: selectedXpath.value,
        });
    console.log("object :>> ", {
      url: currentObjectUrl.value,
      xpath: selectedXpath.value,
      jsPath: customJsPath.value,
    });
    console.log("res :>> ", res);
    // 将返回结果渲染为子节点
    const children: any[] = [];

    const items = (res as any)?.items;
    if (!items) throw new Error("解析结果为空");

    items.texts?.forEach((t: any) => {
      children.push({
        id: Date.now() + Math.random(),
        type: "field",
        label: t.text,
        selector: useJsPath ? "" : t.xpath,
        jsPath: useJsPath ? customJsPath.value : "",
        samples: [t.text],
      });
    });

    items.images?.forEach((i: any) => {
      children.push({
        id: Date.now() + Math.random(),
        type: "image",
        label: i.src,
        selector: useJsPath ? "" : i.xpath,
        jsPath: useJsPath ? customJsPath.value : "",
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
        jsPath: useJsPath ? customJsPath.value : "",
        samples: [l.href],
        children: [],
        hasChildren: true,
      });
    });

    addChildParent.value.children = children;
    addChildParent.value.hasChildren = true;
    closeAddChildDialog();
  } catch (err) {
    ElMessage.error("解析子节点失败");
    console.error(err);
  }
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

    // 文本
    item.texts?.forEach(({ text, xpath }: any) => {
      store.treeData.push(
        createNode("field", text, hasJsPath ? "" : xpath, [text], false, hasJsPath ? store.selectedItem?.jsPath : undefined)
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
        createNode("link", href, hasJsPath ? "" : xpath, [href], true, hasJsPath ? store.selectedItem?.jsPath : undefined)
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
  jsPath?: string
): TreeNode {
  return {
    id: idSeed++,
    type,
    label,
    selector,
    jsPath,
    samples,
    hasChildren,
    children: type === "link" ? [] : undefined,
  };
}

// 编辑
function openEditDialog(node: TreeNode) {
  editNode.value = { ...node };
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
        if (!editNode.value.maxScroll || editNode.value.maxScroll < 1 || editNode.value.maxScroll > 20) {
          ElMessage.error('最大滚动次数必须在1-20之间');
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

      const target = store.treeData.find((n) => n.id === editNode.value.id);
      if (target) Object.assign(target, editNode.value);
      editDialogVisible.value = false;
      ElMessage.success('保存成功');
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
  }

  const node = createNode(newNodeType.value, label, selector, [""]);
  // 设置默认值
  if (maxPages !== undefined) node.maxPages = maxPages;
  if (maxScroll !== undefined) node.maxScroll = maxScroll;
  if (waitTime !== undefined) node.waitTime = waitTime;
  if (maxItems !== undefined) node.maxItems = maxItems;

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
    ElMessage.error("请至少配置一个分页或滚动节点来控制数据获取范围");
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
