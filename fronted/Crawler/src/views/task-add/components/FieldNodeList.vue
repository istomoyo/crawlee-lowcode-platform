<template>
  <el-table
    :data="nodes"
    style="width: 100%"
    row-key="id"
    stripe
    border
    :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
    @selection-change="handleSelectionChange"
  >
    <el-table-column
      v-if="batchMode"
      type="selection"
      width="55"
      :reserve-selection="true"
    />

    <el-table-column label="属性名" width="260">
      <template #default="{ row }">
        <div class="flex flex-wrap items-center gap-1">
          <span class="truncate max-w-[150px]" :title="row.label">{{ row.label }}</span>
          <el-tag
            v-if="typeof row.exampleMatchCount === 'number'"
            size="small"
            :type="exampleMatchTagType(row.exampleMatchCount)"
            :title="exampleMatchLabel(row)"
          >
            {{ exampleMatchLabel(row) }}
          </el-tag>
          <el-tag
            v-if="row.contentFormat === 'markdown'"
            size="small"
            type="success"
          >
            MD
          </el-tag>
          <el-tag
            v-if="isLayerConfigured(row)"
            size="small"
            type="warning"
          >
            页面层已配置
          </el-tag>
        </div>
      </template>
    </el-table-column>

    <el-table-column label="类型" width="110">
      <template #default="{ row }">
        <el-tag class="tag-item" type="primary">{{ typeLabel(row.type) }}</el-tag>
      </template>
    </el-table-column>

    <el-table-column label="路径" min-width="260">
      <template #default="{ row }">
        <div class="truncate" :title="displayPath(row)">
          {{ displayPath(row) || "-" }}
        </div>
      </template>
    </el-table-column>

    <el-table-column label="示例值" min-width="240">
      <template #default="{ row }">
        <template v-if="row.type === 'image'">
          <a
            v-if="imageHref(row)"
            :href="imageHref(row)"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1"
          >
            <img
              :src="imageHref(row)"
              alt="img"
              style="max-height: 60px; max-width: 120px"
            />
          </a>
          <span v-else>{{ firstSample(row) || "-" }}</span>
        </template>
        <template v-else-if="row.type === 'link'">
          <el-link
            v-if="firstSample(row)"
            :href="firstSample(row)"
            target="_blank"
            rel="noopener"
            type="primary"
            :underline="false"
          >
            {{ firstSample(row) }}
          </el-link>
          <span v-else>-</span>
        </template>
        <template v-else>
          <div v-if="row.contentFormat === 'markdown'" class="max-w-xs">
            <pre
              class="text-xs bg-gray-100 p-2 rounded whitespace-pre-wrap overflow-hidden text-ellipsis"
              :title="firstSample(row)"
              style="max-height: 100px; overflow: hidden;"
            >{{ firstSample(row) }}</pre>
          </div>
          <div v-else class="max-w-xs truncate" :title="firstSample(row)">
            {{ firstSample(row) || "-" }}
          </div>
        </template>
      </template>
    </el-table-column>

    <el-table-column label="操作" width="380">
      <template #default="{ row }">
        <div class="flex flex-wrap items-center gap-1">
          <el-button size="small" type="primary" text @click="emit('edit', row)">
            编辑
          </el-button>
          <el-button size="small" type="danger" text @click="emit('remove', row.id)">
            删除
          </el-button>
          <el-button
            v-if="row.type === 'link'"
            size="small"
            type="warning"
            text
            @click="emit('edit-layer', row)"
          >
            页面层配置
          </el-button>
          <el-button
            v-if="row.type === 'link'"
            size="small"
            type="success"
            text
            @click="emit('add-child', row)"
          >
            智能添加子节点
          </el-button>
          <el-dropdown
            v-if="row.type === 'link'"
            trigger="click"
            @command="(cmd: NodeType) => emit('add-custom-child', row, cmd)"
          >
            <el-button size="small" type="info" text>
              添加属性
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="field">字段</el-dropdown-item>
                <el-dropdown-item command="image">图片</el-dropdown-item>
                <el-dropdown-item command="link">链接</el-dropdown-item>
                <el-dropdown-item command="next">分页</el-dropdown-item>
                <el-dropdown-item command="scroll">滚动</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </template>
    </el-table-column>

    <el-table-column type="expand" width="50">
      <template #default="{ row }">
        <div v-if="row.children?.length || row.type === 'link'" class="pl-4">
          <FieldNodeList
            v-if="row.children?.length"
            :nodes="row.children"
            :parent-node="row"
            :batch-mode="batchMode"
            :selected-nodes="selectedNodes"
            @edit="(node) => emit('edit', node)"
            @edit-layer="(node) => emit('edit-layer', node)"
            @remove="(id) => emit('remove', id)"
            @add-child="(node) => emit('add-child', node)"
            @add-custom-child="(parent, type) => emit('add-custom-child', parent, type)"
            @selection-change="(items) => emit('selection-change', items)"
          />

          <div
            v-if="row.type === 'link' && (!row.children || row.children.length === 0)"
            class="py-2"
          >
            <el-dropdown
              trigger="click"
              @command="(cmd: NodeType) => emit('add-custom-child', row, cmd)"
            >
              <el-button size="small" type="primary">添加子属性</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="field">字段</el-dropdown-item>
                  <el-dropdown-item command="image">图片</el-dropdown-item>
                  <el-dropdown-item command="link">链接</el-dropdown-item>
                  <el-dropdown-item command="next">分页</el-dropdown-item>
                  <el-dropdown-item command="scroll">滚动</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <div
            v-else-if="row.type === 'link' && row.children?.length"
            class="py-1 flex items-center gap-2"
          >
            <el-dropdown
              trigger="click"
              @command="(cmd: NodeType) => emit('add-custom-child', row, cmd)"
            >
              <el-button size="small" type="primary" text>+ 添加子属性</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="field">字段</el-dropdown-item>
                  <el-dropdown-item command="image">图片</el-dropdown-item>
                  <el-dropdown-item command="link">链接</el-dropdown-item>
                  <el-dropdown-item command="next">分页</el-dropdown-item>
                  <el-dropdown-item command="scroll">滚动</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import { ArrowDown } from "@element-plus/icons-vue";

type NodeType = "field" | "image" | "link" | "next" | "scroll";

interface PreActionConfig {
  type: "click" | "type" | "wait_for_selector" | "wait_for_timeout";
  selectorType?: "xpath" | "css";
  selector?: string;
  value?: string;
  timeout?: number;
}

interface TreeNode {
  id: number;
  label: string;
  type: NodeType;
  selector?: string;
  jsPath?: string;
  samples?: string[];
  children?: TreeNode[];
  hasChildren?: boolean;
  imgSrc?: string;
  maxPages?: number;
  maxScroll?: number;
  waitTime?: number;
  contentFormat?: "text" | "html" | "markdown" | "smart";
  preActions?: PreActionConfig[];
  detailBaseSelector?: string;
  exampleMatchCount?: number | null;
}

defineProps<{
  nodes: TreeNode[];
  parentNode?: TreeNode | null;
  batchMode?: boolean;
  selectedNodes?: TreeNode[];
}>();

const emit = defineEmits<{
  (e: "edit", node: TreeNode): void;
  (e: "edit-layer", node: TreeNode): void;
  (e: "remove", id: number): void;
  (e: "add-child", node: TreeNode): void;
  (e: "add-custom-child", parentNode: TreeNode, type: NodeType): void;
  (e: "selection-change", nodes: TreeNode[]): void;
}>();

const typeLabels: Record<NodeType, string> = {
  field: "字段",
  image: "图片",
  link: "链接",
  next: "分页",
  scroll: "滚动",
};

const typeLabel = (type: NodeType) => typeLabels[type] || type;
const firstSample = (row: TreeNode) => row.samples?.[0] ?? "";
const imageHref = (row: TreeNode) => row.imgSrc || firstSample(row);
const displayPath = (row: TreeNode) => row.selector || row.jsPath || "";

function isLayerConfigured(row: TreeNode) {
  return (
    row.type === "link" &&
    (Boolean(row.detailBaseSelector) ||
      Boolean(row.preActions?.length) ||
      Boolean(row.children?.length))
  );
}

function exampleMatchTagType(count?: number | null) {
  if (count === 1) {
    return "success";
  }

  if (typeof count === "number" && count > 1) {
    return "danger";
  }

  return "warning";
}

function getNormalizedSelector(row: TreeNode) {
  const selector = String(row.selector || row.jsPath || "").trim();
  return selector.startsWith("xpath=") ? selector.slice("xpath=".length).trim() : selector;
}

function isPageScopedSelector(row: TreeNode) {
  const selector = getNormalizedSelector(row);
  if (!selector) {
    return false;
  }

  return !selector.startsWith("./") && !selector.startsWith(".//");
}

function exampleMatchLabel(row: TreeNode) {
  const count = typeof row.exampleMatchCount === "number" ? row.exampleMatchCount : 0;
  return `${isPageScopedSelector(row) ? "页面命中" : "当前项命中"} ${count} 个`;
}

const handleSelectionChange = (selection: TreeNode[]) => {
  emit("selection-change", selection);
};
</script>
