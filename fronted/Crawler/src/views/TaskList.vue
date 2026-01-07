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
      :row-key="(row: TaskItem) => row.id.toString()"
      :expand-row-keys="expandedRows"
      @expand-change="handleRowExpand"
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

      <el-table-column label="操作" width="240">
        <template #default="{ row }">
          <el-dropdown @command="(command: string) => handleActionMenu(command, row)" trigger="click">
            <el-button size="small" type="primary">
              操作
              <el-icon class="el-icon--right">
                <arrow-down />
              </el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="execute" :disabled="executingTaskName === row.name">
                  <el-icon><VideoPlay /></el-icon>
                  快速执行
                </el-dropdown-item>
                <el-dropdown-item command="edit">
                  <el-icon><Edit /></el-icon>
                  编辑任务
                </el-dropdown-item>
                <el-dropdown-item command="copy">
                  <el-icon><CopyDocument /></el-icon>
                  复制配置
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button
            size="small"
            type="danger"
            :loading="deletingTaskName === row.name"
            @click="deleteTask(row)"
            style="margin-left: 8px;"
          >
            删除
          </el-button>
        </template>
      </el-table-column>

      <!-- 展开行显示结果 -->
      <el-table-column type="expand" width="50">
        <template #default="{ row }">
          <div v-if="row.status === 'success' && row.latestExecution">
            <TaskRow
              :results="getResultData(row)"
              :result-path="row.latestExecution.resultPath"
              :execution-id="row.latestExecution.id"
            />
          </div>
          <div v-else class="no-result">
            <el-empty
              :description="getTaskStatusDescription(row)"
              :image-size="80"
            >
              <template #image>
                <el-icon size="80" class="text-gray-400">
                  <Clock v-if="row.status === 'running'" />
                  <Warning v-else />
                </el-icon>
              </template>
            </el-empty>
          </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { Clock, Warning, ArrowDown, VideoPlay, Edit, CopyDocument } from "@element-plus/icons-vue";
import { getTaskListApi, deleteTaskApi, executeTaskApi } from "@/api/task";
import { useTaskSocket } from "@/composables/useTaskSocket";
import TaskRow from "@/components/TaskRow.vue";

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

// 展开行控制
const expandedRows = ref<string[]>([]);

// 任务结果缓存，避免重复加载
const taskResults = ref<Map<string, any>>(new Map());

// 当前正在加载结果的行
const loadingRows = ref<Set<string>>(new Set());

// 获取行的唯一键
const getRowKey = (row: TaskItem) => row.id.toString();

// 操作状态
const deletingTaskName = ref<string | null>(null);
const executingTaskName = ref<string | null>(null);

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

// 处理行展开
const handleRowExpand = async (row: TaskItem, expanded: TaskItem[]) => {
  const rowKey = getRowKey(row);
  const isExpanding = expanded.some((r) => getRowKey(r) === rowKey);

  if (isExpanding && row.status === "success" && row.latestExecution) {
    // 检查是否已有缓存的结果数据
    const cacheKey = getRowKey(row);
    if (!taskResults.value.has(cacheKey)) {
      loadingRows.value.add(rowKey);
      try {
        // 从结果文件路径获取数据
        if (row.latestExecution.resultPath) {
          // 检查是否为ZIP文件，ZIP文件不需要加载JSON数据
          const isZipFile = row.latestExecution.resultPath.toLowerCase().endsWith('.zip');
          if (isZipFile) {
            // ZIP文件不需要加载数据，设置为空数组，但保留路径用于下载
            taskResults.value.set(cacheKey, []);
          } else {
            // JSON文件，正常加载
            const response = await fetch(
              `${import.meta.env.VITE_API_BASE_URL || "/api"}/${
                row.latestExecution.resultPath
              }`
            );
            if (response.ok) {
              const results = await response.json();
              // 确保结果是数组格式，且只包含用户自定义字段
              taskResults.value.set(
                cacheKey,
                Array.isArray(results) ? results : []
              );
            } else {
              throw new Error(`获取结果失败: ${response.status}`);
            }
          }
        } else {
          taskResults.value.set(cacheKey, []);
        }
      } catch (error) {
        console.error("获取结果数据失败:", error);
        taskResults.value.set(cacheKey, []);
        ElMessage.warning("获取结果数据失败");
      } finally {
        loadingRows.value.delete(rowKey);
      }
    }
  }
};

// 获取结果数据
const getResultData = (row: TaskItem) => {
  const cacheKey = getRowKey(row);
  return taskResults.value.get(cacheKey) || [];
};

// 获取任务状态描述
const getTaskStatusDescription = (row: TaskItem) => {
  switch (row.status) {
    case "pending":
      return "任务等待执行中";
    case "running":
      return "任务正在执行中，请稍候...";
    case "failed":
      return "任务执行失败，请查看执行日志";
    default:
      return "任务状态未知";
  }
};

// 操作处理
const goToCreateTask = () => {
  router.push("/crawleer/task-add/basic");
};

// 处理操作菜单命令
const handleActionMenu = (command: any, row: TaskItem) => {
  switch (command) {
    case 'execute':
      quickExecuteTask(row);
      break;
    case 'edit':
      editTask(row);
      break;
    case 'copy':
      copyTaskConfig(row);
      break;
  }
};

// 复制任务配置
const copyTaskConfig = async (row: TaskItem) => {
  try {
    // 构建配置对象
    const config = {
      name: row.name,
      url: row.url,
      config: row.config ? JSON.parse(row.config) : {},
      script: row.script || "",
    };

    // 格式化为JSON字符串
    const configJson = JSON.stringify(config, null, 2);

    // 复制到剪贴板
    await navigator.clipboard.writeText(configJson);

    ElMessage.success("任务配置已复制到剪贴板");
  } catch (error) {
    console.error("复制配置失败:", error);
    ElMessage.error("复制配置失败");
  }
};

// 编辑任务
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

const quickExecuteTask = async (row: TaskItem) => {
  try {
    executingTaskName.value = row.name;
    
    // 生成新任务名称（基于原任务名称 + 时间戳）
    const timestamp = new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).replace(/\//g, '-').replace(/:/g, '-');
    const newTaskName = `${row.name}_${timestamp}`;
    
    // 解析原任务的配置
    let taskConfig = null;
    if (row.config) {
      try {
        taskConfig = JSON.parse(row.config);
      } catch (e) {
        console.error('解析任务配置失败:', e);
        ElMessage.warning('任务配置解析失败，将使用默认配置');
      }
    }
    
    // 创建新任务并执行（不传 taskId，这样会创建新任务）
    const response = await executeTaskApi({
      taskName: newTaskName,
      url: row.url,
      config: taskConfig,
    });

    if (response.status === 'queued' || response.status === 'running') {
      ElMessage.success(`已创建新任务 "${newTaskName}" 并开始执行`);
      // 刷新任务列表以显示新任务
      fetchTaskList();
    } else {
      ElMessage.warning(`任务执行状态: ${response.message}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    ElMessage.error(`执行失败: ${errorMessage}`);
  } finally {
    executingTaskName.value = null;
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

/* 无结果样式 */
.no-result {
  padding: 48px 24px;
  text-align: center;
  background: white;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}
</style>
