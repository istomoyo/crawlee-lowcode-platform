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

    <el-table-column label="属性名" width="200">
      <template #default="{ row }">
        <div class="truncate" :title="row.label">
          <el-tag v-if="row.contentFormat === 'markdown'" size="mini" type="success" class="mr-1">MD</el-tag>
          {{ row.label }}
        </div>
      </template>
    </el-table-column>

    <el-table-column label="类型" width="80">
      <template #default="{ row }">
        <el-tag class="tag-item" type="primary">{{ row.type }}</el-tag>
      </template>
    </el-table-column>

    <el-table-column label="路径">
      <template #default="{ row }">{{ displayPath(row) }}</template>
    </el-table-column>

    <el-table-column label="值">
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
          <span v-else>{{ firstSample(row) }}</span>
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
          <span v-else>{{ firstSample(row) }}</span>
        </template>
        <template v-else>
          <div v-if="row.contentFormat === 'markdown'" class="max-w-xs">
            <pre class="text-xs bg-gray-100 p-2 rounded whitespace-pre-wrap overflow-hidden text-ellipsis"
                 :title="firstSample(row)"
                 style="max-height: 100px; overflow: hidden;">
              {{ firstSample(row) }}
            </pre>
          </div>
          <div v-else class="max-w-xs truncate" :title="firstSample(row)">
            {{ firstSample(row) }}
          </div>
        </template>
      </template>
    </el-table-column>

    <el-table-column label="操作" width="250">
      <template #default="{ row }">
        <el-button size="small" type="primary" text @click="emit('edit', row)">
          编辑
        </el-button>
        <el-button size="small" type="danger" text @click="emit('remove', row.id)">
          删除
        </el-button>
        <el-button
          v-if="row.type === 'link'"
          size="small"
          type="success"
          text
          @click="emit('add-child', row)"
        >
          添加子节点
        </el-button>
      </template>
    </el-table-column>

    <el-table-column type="expand" width="50">
      <template #default="{ row }">
        <div v-if="row.children?.length" class="pl-4">
          <FieldNodeList
            :nodes="row.children"
            :batch-mode="batchMode"
            :selected-nodes="selectedNodes"
            @edit="(n) => emit('edit', n)"
            @remove="(id) => emit('remove', id)"
            @add-child="(n) => emit('add-child', n)"
            @selection-change="(nodes) => emit('selection-change', nodes)"
          />
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import { defineProps, defineEmits } from "vue";

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
}

defineProps<{
  nodes: TreeNode[];
  batchMode?: boolean;
  selectedNodes?: TreeNode[];
}>();

const emit = defineEmits<{
  (e: "edit", node: TreeNode): void;
  (e: "remove", id: number): void;
  (e: "add-child", node: TreeNode): void;
  (e: "selection-change", nodes: TreeNode[]): void;
}>();

const firstSample = (row: TreeNode) => row.samples?.[0] ?? "";
const imageHref = (row: TreeNode) => row.imgSrc || firstSample(row);
const displayPath = (row: TreeNode) => row.selector || row.jsPath || "";

const handleSelectionChange = (selection: TreeNode[]) => {
  emit("selection-change", selection);
};
</script>

