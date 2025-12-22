<template>
  <el-table
    :data="nodes"
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
        <el-tag type="primary">{{ row.type }}</el-tag>
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
            style="max-height:60px; max-width:120px"
          />
          <span v-else>{{ row.samples?.[0] ?? '' }}</span>
        </template>
        <template v-else>{{ row.samples?.[0] ?? '' }}</template>
      </template>
    </el-table-column>

    <!-- 操作 -->
    <el-table-column label="操作" width="250">
      <template #default="{ row }">
        <el-button size="small" type="primary" text @click="openEdit(row)">
          编辑
        </el-button>
        <el-button size="small" type="danger" text @click="removeNode(row.id)">
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

  <!-- 添加子节点弹窗 -->
  <el-dialog v-model="addChildDialogVisible" title="添加子节点" width="600px">
    <div v-if="loading" class="text-center">
      <el-spinner />
      <p>正在加载列表项...</p>
    </div>
    <div v-else>
      <div v-if="listItems.length">
        <h4 class="font-bold mb-2">自动识别的列表项</h4>
        <div class="grid grid-cols-3 gap-4">
          <el-card
            v-for="(item, index) in listItems"
            :key="index"
            :class="['cursor-pointer', selectedIndex === index ? 'border-blue-500! border-2!' : '']"
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

      <!-- 自定义 XPath / JSPath -->
      <div class="mt-4">
        <h4 class="font-bold mb-2">自定义 XPath / JSPath</h4>
        <el-radio-group v-model="customType" size="small">
          <el-radio label="xpath">XPath</el-radio>
          <el-radio label="jspath">JSPath</el-radio>
        </el-radio-group>

        <el-input
          v-if="customType === 'xpath'"
          v-model="customXpath"
          placeholder="//div[@class='item']"
          clearable
          class="mt-2"
        />
        <el-input
          v-else
          v-model="customJsPath"
          placeholder="document.querySelector('#app')..."
          clearable
          type="textarea"
          class="mt-2"
        />
      </div>
    </div>

    <template #footer>
      <el-button @click="closeAddChildDialog">取消</el-button>
      <el-button
        type="primary"
        :disabled="!selectedXpath && !customJsPath"
        @click="confirmAddChildNode"
      >
        确认
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { xpathParseApi, jsPathParseApi, listPreviewApi } from '@/api/task';
import { ElMessageBox, ElMessage } from 'element-plus';

export interface TreeNode {
  id: number;
  label: string;
  type: 'field' | 'image' | 'link';
  selector: string;
  samples?: string[];
  imgSrc?: string;
  children?: TreeNode[];
  hasChildren?: boolean;
}

interface ListItem {
  xpath: string;
  base64: string;
  matchCount: number;
}

const props = defineProps<{ nodes: TreeNode[] }>();
const emit = defineEmits<{
  (e: 'update:nodes', nodes: TreeNode[]): void;
}>();

let idSeed = 1;

const editDialogVisible = ref(false);
const editNode = ref<TreeNode>({} as TreeNode);

const addChildDialogVisible = ref(false);
const addChildParent = ref<TreeNode | null>(null);
const listItems = reactive<ListItem[]>([]);
const selectedIndex = ref(-1);
const selectedXpath = ref('');
const customXpath = ref('');
const customJsPath = ref('');
const customType = ref<'xpath' | 'jspath'>('xpath');
const loading = ref(false);
const currentObjectUrl = ref('');

// 编辑
function openEdit(node: TreeNode) {
  editNode.value = { ...node };
  editDialogVisible.value = true;
}
function saveEdit() {
  if (!editNode.value) return;
  const idx = props.nodes.findIndex((n) => n.id === editNode.value.id);
  if (idx !== -1) props.nodes[idx] = { ...editNode.value };
  emit('update:nodes', props.nodes);
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
  dfs(props.nodes);
  emit('update:nodes', props.nodes);
}

// 添加子节点
async function openAddChildDialog(node: TreeNode) {
  addChildParent.value = node;
  currentObjectUrl.value = node.samples?.[0] || '';
  addChildDialogVisible.value = true;
  listItems.length = 0;
  selectedIndex.value = -1;
  selectedXpath.value = '';
  customXpath.value = '';
  customJsPath.value = '';
  customType.value = 'xpath';

  try {
    const { value: ratioValue } = await ElMessageBox.prompt(
      '请输入目标长宽比',
      '子节点识别设置',
      {
        inputValue: '1',
        inputPattern: /^\d+(\.\d+)?$/,
        inputErrorMessage: '请输入数字',
      }
    );
    const targetAspectRatio = parseFloat(ratioValue);

    const { value: toleranceValue } = await ElMessageBox.prompt(
      '请输入允许误差',
      '子节点识别设置',
      {
        inputValue: '0.3',
        inputPattern: /^\d+(\.\d+)?$/,
        inputErrorMessage: '请输入数字',
      }
    );
    const tolerance = parseFloat(toleranceValue);

    loading.value = true;
    const res = await listPreviewApi({
      url: currentObjectUrl.value,
      targetAspectRatio,
      tolerance,
    });
    listItems.splice(0, listItems.length, ...res);
  } catch (err) {
    addChildDialogVisible.value = false;
    ElMessage.info('取消操作或输入错误');
  } finally {
    loading.value = false;
  }
}

// 选择自动识别
function selectAuto(index: number) {
  selectedIndex.value = index;
  selectedXpath.value = listItems[index]!.xpath;
  customXpath.value = '';
  customJsPath.value = '';
  customType.value = 'xpath';
}

// watch 自定义输入
watch(customXpath, (val) => {
  if (customType.value === 'xpath') selectedXpath.value = val;
});
watch(customJsPath, (val) => {
  if (customType.value === 'jspath') selectedXpath.value = '';
});

// 关闭弹窗
function closeAddChildDialog() {
  addChildDialogVisible.value = false;
  addChildParent.value = null;
  listItems.length = 0;
  selectedIndex.value = -1;
  selectedXpath.value = '';
  customXpath.value = '';
  customJsPath.value = '';
  customType.value = 'xpath';
}

// 确认添加子节点
async function confirmAddChildNode() {
  if (!addChildParent.value) return;
  loading.value = true;

  try {
    let res: any = null;
    if (customType.value === 'xpath') {
      if (!selectedXpath.value) return;
      res = await xpathParseApi({
        url: currentObjectUrl.value,
        xpath: selectedXpath.value,
      });
    } else {
      if (!customJsPath.value) return;
      res = await jsPathParseApi({
        url: currentObjectUrl.value,
        jsPath: customJsPath.value,
      });
    }

    const children: TreeNode[] = [];

    res.items.texts?.forEach((t: any) => {
      children.push({
        id: idSeed++,
        type: 'field',
        label: t.text,
        selector: t.xpath || '',
        samples: [t.text],
      });
    });

    res.items.images?.forEach((i: any) => {
      children.push({
        id: idSeed++,
        type: 'image',
        label: i.src,
        selector: i.xpath || '',
        imgSrc: i.src,
        samples: [i.src],
      });
    });

    res.items.links?.forEach((l: any) => {
      children.push({
        id: idSeed++,
        type: 'link',
        label: l.href,
        selector: l.xpath || '',
        samples: [l.href],
        children: [],
        hasChildren: true,
      });
    });

    addChildParent.value.children = children;
    addChildParent.value.hasChildren = true;

    emit('update:nodes', props.nodes);
    closeAddChildDialog();
  } catch (err) {
    console.error(err);
    ElMessage.error('解析子节点失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.el-table img {
  display: block;
  max-width: 120px;
  max-height: 60px;
}
</style>
