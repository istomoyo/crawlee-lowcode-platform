<template>
  <el-card
    class="mt-6 p-4 flex flex-col h-full space-y-4"
    body-class="flex flex-col"
  >
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-bold text-lg">配置编辑 (JSON)</h3>
        <p class="text-sm text-gray-500">
          可以直接编辑 JSON 配置，或从当前步骤生成
        </p>
      </div>
      <div class="flex gap-2">
        <el-button @click="generateFromSteps">从步骤生成</el-button>
        <el-button @click="formatJson">格式化</el-button>
        <el-button @click="compressJson">压缩</el-button>
        <el-button @click="validateJson">验证</el-button>
        <el-button type="primary" @click="copyJson">复制</el-button>
      </div>
    </div>

    <el-card
      class="flex-1 overflow-hidden"
      shadow="never"
      body-class="flex flex-col"
    >
      <el-input
        v-model="editableJson"
        type="textarea"
        :rows="20"
        placeholder="请输入 JSON 配置，或粘贴从任务列表复制的配置（会自动转换格式）..."
        class="json-editor w-full flex-1"
        @input="handleJsonChange"
      />
      <div v-if="jsonError" class="mt-2 text-red-500 text-sm">
        JSON 格式错误: {{ jsonError }}
      </div>
      <div v-if="isValidJson && !jsonError" class="mt-2 text-green-500 text-sm">
        ✓ JSON 格式正确
      </div>
    </el-card>

    <div class="flex justify-end gap-2">
      <el-button @click="goBack">上一步</el-button>
      <el-button type="success" @click="runCrawler">开始爬取</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useTaskFormStore } from "@/stores/taskForm";
import { ElMessage } from "element-plus";
import { executeTaskApi } from "@/api/task";

const store = useTaskFormStore();
const router = useRouter();

// JSON 编辑状态
const editableJson = ref("");
const jsonError = ref("");
const isValidJson = ref(false);

// 生成最终配置
const prettyJson = computed(() => {
  const crawleeConfig = store.buildConfig();

  // 合并额外配置
  const finalConfig = {
    name: store.form.name,
    url: store.form.url,
    ...crawleeConfig,
  };

  return JSON.stringify(finalConfig, null, 2);
});

// 格式化 JSON 字符串
const formatJson = () => {
  if (!editableJson.value.trim()) {
    ElMessage.warning("没有可格式化的内容");
    return;
  }

  try {
    const parsed = JSON.parse(editableJson.value);
    editableJson.value = JSON.stringify(parsed, null, 2);
    validateJsonFormat();
    ElMessage.success("JSON 已格式化");
  } catch (error) {
    ElMessage.error("无法格式化：JSON 格式错误");
  }
};

// 压缩 JSON 字符串
const compressJson = () => {
  if (!editableJson.value.trim()) {
    ElMessage.warning("没有可压缩的内容");
    return;
  }

  try {
    const parsed = JSON.parse(editableJson.value);
    editableJson.value = JSON.stringify(parsed);
    validateJsonFormat();
    ElMessage.success("JSON 已压缩");
  } catch (error) {
    ElMessage.error("无法压缩：JSON 格式错误");
  }
};

// 初始化时从步骤生成 JSON
const generateFromSteps = () => {
  editableJson.value = prettyJson.value;
  validateJsonFormat();
  ElMessage.success("已从步骤生成配置");
};

// 组件挂载时自动从步骤生成配置
onMounted(() => {
  if (!editableJson.value || editableJson.value.trim() === '') {
    generateFromSteps();
  }
});

// 验证 JSON 格式
const validateJsonFormat = () => {
  if (!editableJson.value.trim()) {
    jsonError.value = "";
    isValidJson.value = false;
    return;
  }

  try {
    JSON.parse(editableJson.value);
    jsonError.value = "";
    isValidJson.value = true;
  } catch (error: any) {
    jsonError.value = error.message;
    isValidJson.value = false;
  }
};

// 处理 JSON 变化，自动检测并转换从TaskList复制的配置格式
const handleJsonChange = () => {
  validateJsonFormat();
  
  // 检测是否是从TaskList复制的配置格式，如果是则自动转换
  if (editableJson.value.trim()) {
    try {
      const config = JSON.parse(editableJson.value);
      
      // 如果是从TaskList复制的格式（包含config字段），自动转换
      if (config.config && typeof config.config === 'object' && config.name && config.url) {
        const convertedConfig = {
          name: config.name,
          url: config.url,
          ...config.config,
        };
        editableJson.value = JSON.stringify(convertedConfig, null, 2);
        validateJsonFormat();
        ElMessage.success("已自动转换粘贴的配置格式");
      }
    } catch (error) {
      // 如果解析失败，不做处理
    }
  }
};

// 监听 prettyJson 变化，自动更新编辑器（当步骤配置改变时）
watch(
  prettyJson,
  (newJson) => {
    if (!editableJson.value || editableJson.value === prettyJson.value) {
      editableJson.value = newJson;
      validateJsonFormat();
    }
  },
  { immediate: true }
);

function copyJson() {
  const jsonToCopy = editableJson.value || prettyJson.value;
  navigator.clipboard
    .writeText(jsonToCopy)
    .then(() => ElMessage.success("已复制 JSON"))
    .catch(() => ElMessage.error("复制失败"));
}

function validateJson() {
  validateJsonFormat();
  if (isValidJson.value) {
    ElMessage.success("JSON 格式正确");
  } else {
    ElMessage.error("JSON 格式错误，请检查语法");
  }
}

async function runCrawler() {
  try {
    // 验证 JSON 格式
    if (!isValidJson.value) {
      ElMessage.error("请先修正 JSON 格式错误");
      return;
    }

    let config = JSON.parse(editableJson.value);

    // 处理从TaskList复制的配置格式
    // 如果配置包含嵌套的config字段（从TaskList复制粘贴的格式），则提取它
    if (config.config && typeof config.config === 'object') {
      // 从TaskList复制的格式：{ name, url, config: {...}, script }
      // 需要提取config字段，并保留name和url
      const extractedConfig = {
        name: config.name,
        url: config.url,
        ...config.config,
      };
      config = extractedConfig;
    }

    // 验证必需字段
    if (!config.name || !config.url) {
      ElMessage.error("配置必须包含 name 和 url 字段");
      return;
    }

    // 调用封装的API方法
    const result = await executeTaskApi({
      taskName: config.name,
      url: config.url,
      config: config,
    });

    ElMessage.success(`任务已提交！执行ID: ${result.executionId}`);
    console.log("Execution Result:", result);
  } catch (error: any) {
    ElMessage.error(`任务启动失败: ${error.message}`);
    console.error("Crawler execution error:", error);
  }
}

function goBack() {
  router.push("/crawleer/task-add/config");
}
</script>

<style scoped>
.json-editor :deep(.el-textarea__inner) {
  font-family: "JetBrains Mono", "Fira Code", "Monaco", "Menlo", "Consolas",
    "Courier New", monospace;
  font-size: 13px;
  line-height: 1.5;
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 12px;
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: auto;
}

.json-editor :deep(.el-textarea__inner:focus) {
  background-color: #ffffff;
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}
</style>
