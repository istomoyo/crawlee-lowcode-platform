<template>
  <el-card class="mt-6 p-4 flex flex-col h-full space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-bold text-lg">配置预览 (JSON)</h3>
        <p class="text-sm text-gray-500">将当前步骤配置保存为 crawlee 可读 JSON</p>
      </div>
      <el-button type="primary" @click="copyJson">复制 JSON</el-button>
    </div>

    <el-card class="flex-1 overflow-auto" shadow="never">
      <pre class="text-sm whitespace-pre-wrap break-words">{{ prettyJson }}</pre>
    </el-card>

    <div class="flex justify-end gap-2">
      <el-button @click="goBack">上一步</el-button>
      <el-button type="primary" @click="refreshConfig">刷新配置</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useTaskFormStore } from "@/stores/taskForm";
import { ElMessage } from "element-plus";

const store = useTaskFormStore();
const router = useRouter();

const prettyJson = computed(() =>
  JSON.stringify(store.buildConfig(), null, 2)
);

function copyJson() {
  navigator.clipboard
    .writeText(prettyJson.value)
    .then(() => ElMessage.success("已复制 JSON"))
    .catch(() => ElMessage.error("复制失败"));
}

function refreshConfig() {
  ElMessage.success("配置已刷新");
}

function goBack() {
  router.push("/crawleer/task-add/mapping");
}
</script>

<style scoped>
pre {
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
}
</style>

