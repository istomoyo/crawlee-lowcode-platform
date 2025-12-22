<template>
  <el-card class="h-full flex flex-col p-4">
    <h3 class="font-bold mb-3">字段结构映射（表格版）</h3>

    <div v-if="tableLoading" class="flex items-center justify-center py-10">
      <el-spinner />
      <span class="ml-2 text-gray-500">加载中...</span>
    </div>
    <FieldNodeList
      v-else
      :nodes="rootNodes"
      @edit="openEditDialog"
      @remove="removeNode"
      @add-child="openAddChildDialog"
    />

    <!-- 添加新节点 -->
    <div class="mt-4 flex gap-2">
      <el-select v-model="newNodeType" placeholder="选择类型" size="small">
        <el-option label="字段" value="field" />
        <el-option label="图片" value="image" />
        <el-option label="链接" value="link" />
      </el-select>
      <el-button type="primary" size="small" @click="addNewNode"
        >添加属性</el-button
      >
    </div>

    <!-- 编辑弹框 -->
    <el-dialog v-model="editDialogVisible" title="编辑属性" width="400px">
      <el-form :model="editNode">
        <el-form-item label="属性名">
          <el-input v-model="editNode.label" />
        </el-form-item>
        <el-form-item label="XPath">
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
  type: "field" | "image" | "link";
  selector?: string;
  jsPath?: string;
  samples?: string[];
  children?: TreeNode[];
  hasChildren?: boolean;
  imgSrc?: string;
}

const store = useTaskFormStore();
let idSeed = 1;
const rootNodes = computed<TreeNode[]>(() => store.treeData as unknown as TreeNode[]);
const router = useRouter();

// 编辑弹框
const editDialogVisible = ref(false);
const editNode = ref<TreeNode>({} as TreeNode);

// 新节点类型
const newNodeType = ref<"field" | "image" | "link">("field");

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
  type: "field" | "image" | "link",
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
  const target = store.treeData.find((n) => n.id === editNode.value.id);
  if (target) Object.assign(target, editNode.value);
  editDialogVisible.value = false;
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

// 添加最外层新节点
function addNewNode() {
  const node = createNode(newNodeType.value, "新属性", ".//text()", [""]);
  store.treeData.push(node);
}

function goPrev() {
  router.push("/crawleer/task-add/structure");
}
function goNext() {
  router.push("/crawleer/task-add/preview");
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
