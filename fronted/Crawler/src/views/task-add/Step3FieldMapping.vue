<template>
  <el-card class="h-full flex flex-col p-4">
    <h3 class="font-bold mb-3">字段结构映射（表格版）</h3>

    <!-- 表格 -->
    <el-table
      :data="store.treeData"
      style="width: 100%"
      row-key="id"
      stripe
      border
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
    >
      <!-- 属性名 -->
      <el-table-column prop="label" label="属性名" width="200" />

      <!-- 类型 -->
      <el-table-column label="类型" width="80">
        <template #default="{ row }">
          <el-tag class="tag-item" type="primary">
            {{ row.type }}
          </el-tag>
        </template>
      </el-table-column>

      <!-- XPath -->
      <el-table-column label="XPath">
        <template #default="{ row }">{{ row.selector }}</template>
      </el-table-column>

      <!-- 值 -->
      <el-table-column label="值">
        <template #default="{ row }">
          <template v-if="row.type === 'image'">
            <img
              v-if="row.imgSrc"
              :src="row.imgSrc"
              alt="img"
              style="max-height: 60px; max-width: 120px"
            />
            <span v-else>{{ row.samples?.[0] ?? "" }}</span>
          </template>
          <template v-else>{{ row.samples?.[0] ?? "" }}</template>
        </template>
      </el-table-column>

      <!-- 操作 -->
      <el-table-column label="操作" width="250">
        <template #default="{ row }">
          <el-button
            size="small"
            type="primary"
            text
            @click="openEditDialog(row)"
          >
            编辑
          </el-button>
          <el-button
            size="small"
            type="danger"
            text
            @click="removeNode(row.id)"
          >
            删除
          </el-button>
          <el-button
            v-if="row.type === 'link'"
            size="small"
            type="success"
            text
            @click="openAddChildDialog(row)"
          >
            添加子节点
          </el-button>
        </template>
      </el-table-column>
    </el-table>

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
          <el-input v-model="editNode.selector" />
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
        </div>
      </template>

      <template #footer>
        <el-button @click="closeAddChildDialog">取消</el-button>
        <el-button
          type="primary"
          :disabled="!selectedXpath"
          @click="confirmAddChildNode"
          >确认</el-button
        >
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, watch } from "vue";
import { useTaskFormStore } from "@/stores/taskForm";
import { xpathParseApi } from "@/api/task";

import { listPreviewApi } from "@/api/task";
import { ElMessageBox, ElMessage } from "element-plus";
interface TreeNode {
  id: number;
  label: string;
  type: "field" | "image" | "link";
  selector: string;
  samples?: string[];
  children?: TreeNode[];
  hasChildren?: boolean;
  imgSrc?: string;
}

const store = useTaskFormStore();
let idSeed = 1;

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
const loading = ref(false);
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

// 关闭弹窗
function closeAddChildDialog() {
  addChildDialogVisible.value = false;
  addChildParent.value = null;
  listItems.length = 0;
  selectedIndex.value = -1;
  selectedXpath.value = "";
  customXpath.value = "";
}

// 确认添加子节点
async function confirmAddChildNode() {
  if (!selectedXpath.value || !addChildParent.value) return;

  try {
    const res = await xpathParseApi({
      url: currentObjectUrl.value,
      xpath: selectedXpath.value,
    });
    console.log("object :>> ", {
      url: currentObjectUrl.value,
      xpath: selectedXpath.value,
    });
    console.log("res :>> ", res);
    // 将返回结果渲染为子节点
    const children: any[] = [];

    res.items.texts?.forEach((t: any) => {
      children.push({
        id: Date.now() + Math.random(),
        type: "field",
        label: t.text,
        selector: t.xpath,
        samples: [t.text],
      });
    });

    res.items.images?.forEach((i: any) => {
      children.push({
        id: Date.now() + Math.random(),
        type: "image",
        label: i.src,
        selector: i.xpath,
        imgSrc: i.src,
        samples: [i.src],
      });
    });

    res.items.links?.forEach((l: any) => {
      children.push({
        id: Date.now() + Math.random(),
        type: "link",
        label: l.href,
        selector: l.xpath,
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
  if (!store.form.url || !store.selectedItem?.xpath) return;

  try {
    const res = await xpathParseApi({
      url: store.form.url,
      xpath: store.selectedItem.xpath,
    });
    console.log("object :>> ", {
      url: store.form.url,
      xpath: store.selectedItem.xpath,
    });
    console.log("res--init :>> ", res);
    store.treeData.length = 0;
    const item = res.items;
    if (!item) return;

    // 文本
    item.texts?.forEach(({ text, xpath }: any) => {
      store.treeData.push(createNode("field", text, xpath, [text]));
    });

    // 图片
    item.images?.forEach(({ src, xpath }: any) => {
      const node = createNode("image", src, xpath, [src]);
      // node.imgSrc = src // 图片直接显示 src
      store.treeData.push(node);
    });

    // 链接
    item.links?.forEach(({ href, xpath }: any) => {
      store.treeData.push(createNode("link", href, xpath, [href], true));
    });
  } catch (e) {
    console.error("XPath解析失败", e);
  }
}

// 创建节点
function createNode(
  type: "field" | "image" | "link",
  label: string,
  selector: string,
  samples: string[] = [],
  hasChildren = false
): TreeNode {
  return {
    id: idSeed++,
    type,
    label,
    selector,
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

onMounted(initTree);
</script>

<style scoped>
.el-table img {
  display: block;
  max-width: 120px;
  max-height: 60px;
}
</style>
