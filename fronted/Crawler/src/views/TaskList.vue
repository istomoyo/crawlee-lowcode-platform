<template>
  <div class="p-4">
    <!-- 顶部工具栏 -->
    <div class="flex justify-between items-center mb-4">
      <el-input
        v-model="searchQuery"
        placeholder="搜索任务名称 / URL"
        clearable
        style="width: 260px"
        @input="debouncedSearch"
        @keyup.enter="handleSearch"
        @clear="clearSearch"
      />
      <el-button type="primary" @click="goToCreateTask">新增任务</el-button>
    </div>

    <!-- 表格 -->
    <el-table
      :data="taskList"
      border
      stripe
      style="width: 100%"
      v-loading="loading"
    >
      <el-table-column prop="name" label="任务名称" min-width="160" />

      <el-table-column label="首页截图" width="120">
        <template #default="{ row }">
          <div v-if="row.screenshotPath" class="screenshot-cell">
            <el-image
              :src="`/api/uploads/${row.screenshotPath}`"
              :preview-src-list="[`/api/uploads/${row.screenshotPath}`]"
              alt="首页截图"
              class="screenshot-thumb"
              fit="cover"
              preview-teleported
              :z-index="3000"
            />
          </div>
          <div v-else class="text-gray-400 text-sm">无截图</div>
        </template>
      </el-table-column>

      <el-table-column
        prop="url"
        label="URL"
        min-width="220"
        show-overflow-tooltip
      />

      <el-table-column label="状态" width="140">
        <template #default="{ row }">
          <div class="flex items-center gap-2">
            <el-tag :type="statusType(row.status)" effect="dark">
              {{ statusText(row.status) }}
            </el-tag>
            <el-progress
              v-if="row.status === 'running'"
              type="circle"
              :percentage="row.progress"
              width="30"
              stroke-width="4"
            />
          </div>
        </template>
      </el-table-column>

      <el-table-column label="最后执行" width="180">
        <template #default="{ row }">
          <div v-if="row.lastExecutionTime">
            {{ formatDate(row.lastExecutionTime) }}
          </div>
          <span v-else class="text-gray-400">未执行</span>
        </template>
      </el-table-column>

      <el-table-column prop="createdAt" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>

      <el-table-column label="结束时间" width="180">
        <template #default="{ row }">
          <div v-if="row.endTime">
            {{ formatDate(row.endTime) }}
          </div>
          <span v-else class="text-gray-400">未结束</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button size="small" @click="viewExecution(row)"
            >查看执行</el-button
          >
          <el-button size="small" type="warning" @click="editTask(row)"
            >编辑</el-button
          >
          <el-button
            size="small"
            type="danger"
            :loading="deletingTaskName === row.name"
            @click="deleteTask(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="mt-4 flex justify-end">
      <el-pagination
        background
        layout="prev, pager, next, sizes"
        :current-page="pagination.page"
        :page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>

    <!-- 执行详情弹窗 -->
    <el-dialog
      v-model="executionDialogVisible"
      title="执行详情"
      width="700px"
      :close-on-click-modal="false"
    >
      <div v-if="currentExecution" class="space-y-4">
        <!-- 任务基本信息 -->
        <div class="grid grid-cols-1 gap-4">
          <div>
            <label class="text-sm font-medium text-gray-600">任务名称</label>
            <p class="text-lg font-semibold">{{ currentExecution.taskName }}</p>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-600">任务URL</label>
            <p class="text-sm text-blue-600 break-all">
              {{ currentExecution.taskUrl }}
            </p>
          </div>
        </div>

        <!-- 执行状态和时间 -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-sm font-medium text-gray-600">执行状态</label>
            <p>
              <el-tag :type="statusType(currentExecution.status)">
                {{ statusText(currentExecution.status) }}
              </el-tag>
            </p>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-600">开始时间</label>
            <p>{{ formatDate(currentExecution.startTime) }}</p>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-600">结束时间</label>
            <p>
              {{
                currentExecution.endTime
                  ? formatDate(currentExecution.endTime)
                  : "进行中"
              }}
            </p>
          </div>
          <div v-if="currentExecution.resultPath">
            <label class="text-sm font-medium text-gray-600">执行结果</label>
            <p>
              <el-button
                type="success"
                size="small"
                @click="downloadResult(currentExecution.resultPath!)"
              >
                下载结果文件
              </el-button>
            </p>
          </div>
        </div>

        <!-- 执行结果（仅在成功时显示） -->
        <div
          v-if="
            currentExecution.status === 'success' && currentExecution.results
          "
        >
          <label class="text-sm font-medium text-gray-600">执行结果</label>
          <div class="mt-2 p-3 bg-green-50 rounded border border-green-200">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-green-800">
                共爬取 {{ currentExecution.resultCount }} 条数据
              </span>
              <el-button
                v-if="currentExecution.resultPath"
                type="success"
                size="mini"
                @click="downloadResult(currentExecution.resultPath)"
              >
                下载完整结果
              </el-button>
            </div>
            <el-table
              :data="currentExecution.results"
              size="mini"
              border
              style="width: 100%"
              max-height="300"
            >
              <el-table-column
                v-for="key in getResultKeys(currentExecution.results)"
                :key="key"
                :prop="key"
                :label="key"
                min-width="100"
                show-overflow-tooltip
              />
            </el-table>
          </div>
        </div>

        <!-- 执行日志 -->
        <div>
          <label class="text-sm font-medium text-gray-600">执行日志</label>
          <pre
            class="mt-2 p-3 bg-gray-100 rounded text-sm whitespace-pre-wrap max-h-60 overflow-y-auto"
            >{{ currentExecution.log }}</pre
          >
        </div>
      </div>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { getTaskListApi, deleteTaskApi } from "@/api/task";
import { useTaskSocket } from "@/composables/useTaskSocket";

const router = useRouter();

import type { TaskItem } from "@/types/task";

// 响应式数据
const taskList = ref<TaskItem[]>([]);
const loading = ref(false);
const searchQuery = ref("");
const pagination = ref({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
});

// 执行详情弹窗
const executionDialogVisible = ref(false);
const currentExecution = ref<{
  status: string;
  log: string;
  startTime: string;
  endTime: string | null;
  resultPath?: string;
  taskName?: string;
  taskUrl?: string;
  // 结果数据
  resultCount?: number;
  results?: any[];
} | null>(null);

// 操作状态
const deletingTaskName = ref<string | null>(null);

// Socket.IO 功能
// Socket.IO 功能（将在fetchTaskList定义后初始化）
let connectWebSocket: () => void;
let disconnectWebSocket: () => void;

// 防抖定时器
let searchTimer: number | null = null;

// 获取任务列表
const fetchTaskList = async () => {
  try {
    loading.value = true;
    const response = await getTaskListApi({
      page: pagination.value.page,
      limit: pagination.value.limit,
      search: searchQuery.value || undefined,
    });

    taskList.value = response.data || [];
    pagination.value = {
      ...pagination.value,
      ...response.pagination,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    ElMessage.error(`获取任务列表失败: ${errorMessage}`);
    // 在出错时重置为空数组
    taskList.value = [];
  } finally {
    loading.value = false;
  }
};

// 初始化Socket.IO功能
const socketFunctions = useTaskSocket(taskList, pagination, fetchTaskList);
connectWebSocket = socketFunctions.connectWebSocket;
disconnectWebSocket = socketFunctions.disconnectWebSocket;

// 防抖搜索
function debouncedSearch(): void {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = window.setTimeout(() => {
    handleSearch();
  }, 500); // 500ms 防抖
}

// 清空搜索
const clearSearch = () => {
  searchQuery.value = "";
  handleSearch();
};

// 搜索处理
const handleSearch = () => {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  pagination.value.page = 1; // 重置到第一页
  fetchTaskList();
};

// 分页处理
const handlePageChange = (page: number) => {
  pagination.value.page = page;
  fetchTaskList();
};

const handleSizeChange = (size: number) => {
  pagination.value.limit = size;
  pagination.value.page = 1;
  fetchTaskList();
};

// 状态相关
const statusType = (status: string) => {
  switch (status) {
    case "pending":
      return "";
    case "running":
      return "warning";
    case "success":
      return "success";
    case "failed":
      return "danger";
    default:
      return "";
  }
};

const statusText = (status: string) => {
  switch (status) {
    case "pending":
      return "待执行";
    case "running":
      return "执行中";
    case "success":
      return "成功";
    case "failed":
      return "失败";
    default:
      return status;
  }
};


// 下载执行结果文件
const downloadResult = (resultPath: string) => {
  try {
    // 创建下载链接
    const link = document.createElement("a");
    link.href = `${import.meta.env.VITE_API_BASE_URL || "/api"}/${resultPath}`;
    link.download = resultPath.split("/").pop() || "result.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    ElMessage.success("开始下载结果文件");
  } catch (error) {
    ElMessage.error("下载失败");
    console.error("Download error:", error);
  }
};

// 获取结果数据的键名
const getResultKeys = (results: any[]) => {
  if (!results || results.length === 0) return [];
  const keys = new Set<string>();
  results.forEach((item) => {
    Object.keys(item).forEach((key) => keys.add(key));
  });
  return Array.from(keys);
};

// 格式化日期
const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr; // 如果日期无效，返回原始字符串
    }
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr; // 如果解析失败，返回原始字符串
  }
};

// 操作处理
const goToCreateTask = () => {
  router.push("/crawleer/task-add/basic");
};

const viewExecution = async (row: TaskItem) => {
  if (row.latestExecution) {
    currentExecution.value = {
      ...row.latestExecution,
      taskName: row.name,
      taskUrl: row.url,
    };

    // 如果任务成功完成，尝试获取结果数据
    if (row.status === "success") {
      try {
        // 由于我们没有executionId，我们暂时显示模拟数据
        // 在实际应用中，应该通过API获取executionId对应的结果
        currentExecution.value.resultCount = 1;
        currentExecution.value.results = [
          {
            url: row.url,
            title: "爬取成功",
            crawledAt: new Date().toISOString(),
            statusCode: 200,
            message: "数据已保存到服务器文件系统中",
          },
        ];
      } catch (error) {
        console.error("获取结果数据失败:", error);
      }
    }

    executionDialogVisible.value = true;
  } else {
    ElMessage.info("该任务暂无执行记录");
  }
};

const editTask = (_row: TaskItem) => {
  ElMessage.info("编辑功能开发中...");
  // router.push(`/task/edit/${row.id}`);
};

const deleteTask = async (row: TaskItem) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除任务 "${row.name}" 吗？此操作不可恢复。`,
      "确认删除",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    deletingTaskName.value = row.name;
    await deleteTaskApi({ name: row.name, url: row.url });
    // 删除成功消息由后端处理
    fetchTaskList(); // 刷新列表
  } catch (error) {
    if (error !== "cancel") {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      ElMessage.error(`删除失败: ${errorMessage}`);
    }
  } finally {
    deletingTaskName.value = null;
  }
};

// 清理所有定时器和连接
const cleanup = () => {
  disconnectWebSocket();
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
};

// 生命周期
onMounted(() => {
  fetchTaskList(); // 初始加载数据
  connectWebSocket(); // 建立Socket.IO连接
});

onUnmounted(() => {
  cleanup();
});
</script>

<style scoped>
.screenshot-cell {
  display: flex;
  justify-content: center;
  align-items: center;
}

.screenshot-thumb {
  width: 80px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  transition: all 0.2s ease;
}

.screenshot-thumb:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</style>
