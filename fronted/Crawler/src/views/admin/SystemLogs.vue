<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">系统日志</h1>
      <div class="flex gap-4">
        <el-button type="primary" @click="exportLogs" :loading="exporting">
          <el-icon><Download /></el-icon>
          导出日志
        </el-button>
        <el-button type="danger" @click="clearLogs">
          <el-icon><Delete /></el-icon>
          清空日志
        </el-button>
      </div>
    </div>

    <div class="mb-4 flex gap-4 flex-wrap">
      <el-select
        v-model="levelFilter"
        placeholder="日志级别"
        clearable
        style="width: 140px"
        @change="handleFiltersChange"
      >
        <el-option label="全部" value="" />
        <el-option label="ERROR" value="error" />
        <el-option label="WARN" value="warn" />
        <el-option label="INFO" value="info" />
        <el-option label="DEBUG" value="debug" />
      </el-select>

      <el-input
        v-model="searchQuery"
        placeholder="搜索模块、用户或消息内容"
        clearable
        style="width: 280px"
        @input="handleFiltersChange"
      />

      <el-date-picker
        v-model="dateRange"
        type="datetimerange"
        range-separator="至"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        format="YYYY-MM-DD HH:mm"
        value-format="YYYY-MM-DD HH:mm"
        @change="handleFiltersChange"
      />

      <el-button type="success" @click="refreshLogs">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">日志总数</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.total }}</p>
          </div>
          <el-icon size="32" class="text-gray-500">
            <Document />
          </el-icon>
        </div>
      </div>

      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">错误日志</p>
            <p class="text-2xl font-bold text-red-600">{{ stats.error }}</p>
          </div>
          <el-icon size="32" class="text-red-500">
            <Warning />
          </el-icon>
        </div>
      </div>

      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">警告日志</p>
            <p class="text-2xl font-bold text-yellow-600">{{ stats.warn }}</p>
          </div>
          <el-icon size="32" class="text-yellow-500">
            <InfoFilled />
          </el-icon>
        </div>
      </div>

      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">信息日志</p>
            <p class="text-2xl font-bold text-blue-600">{{ stats.info }}</p>
          </div>
          <el-icon size="32" class="text-blue-500">
            <InfoFilled />
          </el-icon>
        </div>
      </div>
    </div>

    <el-table
      :data="logList"
      border
      stripe
      style="width: 100%"
      v-loading="loading"
      :row-key="(row: LogEntry) => row.id.toString()"
      height="600"
    >
      <el-table-column label="时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.timestamp) }}
        </template>
      </el-table-column>

      <el-table-column label="级别" width="100">
        <template #default="{ row }">
          <el-tag :type="getLevelType(row.level)" size="small">
            {{ row.level.toUpperCase() }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="模块" width="140">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.module }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="用户" width="140">
        <template #default="{ row }">
          {{ row.user || "系统" }}
        </template>
      </el-table-column>

      <el-table-column label="消息" min-width="320" show-overflow-tooltip>
        <template #default="{ row }">
          <span :class="getMessageClass(row.level)">{{ row.message }}</span>
        </template>
      </el-table-column>

      <el-table-column label="详情" width="90">
        <template #default="{ row }">
          <el-button
            v-if="row.details"
            size="small"
            type="primary"
            text
            @click="viewLogDetails(row)"
          >
            查看
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="mt-4 flex justify-end">
      <el-pagination
        background
        layout="prev, pager, next, sizes"
        :current-page="pagination.page"
        :page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[20, 50, 100]"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>

    <el-dialog v-model="logDetailVisible" title="日志详情" width="680px">
      <div v-if="selectedLog" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700">时间</label>
            <p class="mt-1 text-sm text-gray-900">{{ formatDate(selectedLog.timestamp) }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">级别</label>
            <el-tag :type="getLevelType(selectedLog.level)" class="mt-1">
              {{ selectedLog.level.toUpperCase() }}
            </el-tag>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">模块</label>
            <p class="mt-1 text-sm text-gray-900">{{ selectedLog.module }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">用户</label>
            <p class="mt-1 text-sm text-gray-900">{{ selectedLog.user || "系统" }}</p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700">消息</label>
          <p class="mt-1 text-sm text-gray-900">{{ selectedLog.message }}</p>
        </div>

        <div v-if="selectedLog.details">
          <label class="block text-sm font-medium text-gray-700">详细信息</label>
          <pre class="mt-1 p-3 bg-gray-100 rounded text-sm overflow-auto max-h-72">{{ JSON.stringify(selectedLog.details, null, 2) }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Refresh,
  Download,
  Delete,
  Document,
  Warning,
  InfoFilled,
} from "@element-plus/icons-vue";
import {
  clearLogsApi,
  getLogsApi,
  type GetLogsParams,
  type LogEntry,
  type LogStats,
} from "@/api/admin";

const logList = ref<LogEntry[]>([]);
const loading = ref(false);
const exporting = ref(false);
const searchQuery = ref("");
const levelFilter = ref("");
const dateRange = ref<string[]>([]);
const logDetailVisible = ref(false);
const selectedLog = ref<LogEntry | null>(null);

const stats = reactive<LogStats>({
  total: 0,
  error: 0,
  warn: 0,
  info: 0,
  debug: 0,
});

const pagination = reactive({
  page: 1,
  limit: 50,
  total: 0,
});

function buildParams(overrides?: Partial<GetLogsParams>): GetLogsParams {
  return {
    level: (levelFilter.value as GetLogsParams["level"]) || undefined,
    module: searchQuery.value || undefined,
    search: searchQuery.value || undefined,
    startDate: dateRange.value?.[0] || undefined,
    endDate: dateRange.value?.[1] || undefined,
    page: pagination.page,
    limit: pagination.limit,
    ...overrides,
  };
}

async function fetchLogs(overrides?: Partial<GetLogsParams>) {
  try {
    loading.value = true;
    const response = await getLogsApi(buildParams(overrides));
    logList.value = response.items;
    Object.assign(stats, response.stats);
    pagination.total = response.total;
    pagination.page = response.page;
    pagination.limit = response.limit;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "获取日志失败";
    ElMessage.error(errorMessage);
    logList.value = [];
    pagination.total = 0;
  } finally {
    loading.value = false;
  }
}

function handleFiltersChange() {
  pagination.page = 1;
  fetchLogs();
}

function refreshLogs() {
  fetchLogs();
}

function handlePageChange(page: number) {
  pagination.page = page;
  fetchLogs();
}

function handleSizeChange(size: number) {
  pagination.limit = size;
  pagination.page = 1;
  fetchLogs();
}

function getLevelType(level: string) {
  switch (level) {
    case "error":
      return "danger";
    case "warn":
      return "warning";
    case "info":
      return "primary";
    case "debug":
      return "info";
    default:
      return "";
  }
}

function getMessageClass(level: string) {
  switch (level) {
    case "error":
      return "text-red-600 font-medium";
    case "warn":
      return "text-yellow-600";
    default:
      return "text-gray-900";
  }
}

function formatDate(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function viewLogDetails(log: LogEntry) {
  selectedLog.value = log;
  logDetailVisible.value = true;
}

function csvCell(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportLogs() {
  try {
    exporting.value = true;
    const response = await getLogsApi(buildParams({ page: 1, limit: 1000 }));
    const rows = response.items.map((log) =>
      [
        formatDate(log.timestamp),
        log.level.toUpperCase(),
        log.module,
        log.user || "系统",
        log.message,
        log.details ? JSON.stringify(log.details) : "",
      ]
        .map(csvCell)
        .join(","),
    );

    const csv = [
      "\uFEFF时间,级别,模块,用户,消息,详情",
      ...rows,
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `system-logs-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    ElMessage.success(`已导出 ${response.items.length} 条日志`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "导出日志失败";
    ElMessage.error(errorMessage);
  } finally {
    exporting.value = false;
  }
}

async function clearLogs() {
  try {
    await ElMessageBox.confirm(
      "确定要清空所有系统日志吗？该操作不可恢复。",
      "警告",
      {
        type: "warning",
        confirmButtonText: "确认清空",
        cancelButtonText: "取消",
      },
    );

    await clearLogsApi();
    logList.value = [];
    pagination.total = 0;
    Object.assign(stats, { total: 0, error: 0, warn: 0, info: 0, debug: 0 });
    ElMessage.success("系统日志已清空");
  } catch (error) {
    if (error !== "cancel") {
      const errorMessage = error instanceof Error ? error.message : "清空日志失败";
      ElMessage.error(errorMessage);
    }
  }
}

onMounted(() => {
  fetchLogs();
});
</script>

<style scoped>
pre {
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 12px;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}
</style>
