<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <h1 class="page-title">系统日志</h1>
        <p class="page-description">
          统一查看平台日志、导出审计记录，并在不同屏宽下保持清晰的信息层级。
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <el-button plain :loading="exporting" @click="exportLogs">导出日志</el-button>
        <el-button type="danger" plain @click="clearLogs">清空日志</el-button>
      </div>
    </header>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article class="metric-card">
        <p class="metric-label">日志总数</p>
        <p class="metric-value">{{ stats.total }}</p>
        <p class="metric-note">当前筛选条件下的总记录数</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">错误</p>
        <p class="metric-value text-rose-600">{{ stats.error }}</p>
        <p class="metric-note">优先排查的异常记录</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">警告</p>
        <p class="metric-value text-amber-600">{{ stats.warn }}</p>
        <p class="metric-note">需要关注但不阻断流程</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">信息</p>
        <p class="metric-value text-sky-600">{{ stats.info }}</p>
        <p class="metric-note">常规操作与审计轨迹</p>
      </article>
    </section>

    <section class="toolbar-card p-4 sm:p-5">
      <div class="grid gap-3 xl:grid-cols-[180px,minmax(0,1fr),minmax(0,1fr),auto]">
        <el-select
          v-model="levelFilter"
          clearable
          placeholder="日志级别"
          @change="handleFiltersChange"
        >
          <el-option label="ERROR" value="error" />
          <el-option label="WARN" value="warn" />
          <el-option label="INFO" value="info" />
          <el-option label="DEBUG" value="debug" />
        </el-select>

        <el-input
          v-model="searchQuery"
          clearable
          placeholder="搜索模块、用户或消息内容"
          @input="debouncedSearch"
          @keyup.enter="handleFiltersChange"
          @clear="handleFiltersChange"
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

        <el-button plain @click="refreshLogs">刷新</el-button>
      </div>
    </section>

    <section class="surface-card p-5 sm:p-6">
      <div class="page-header">
        <div>
          <h2 class="section-title">日志记录</h2>
          <p class="section-description">小屏使用卡片，大屏保留表格。详情支持单独展开查看 JSON 内容。</p>
        </div>
      </div>

      <div class="mt-5 lg:hidden">
        <div v-if="loading" class="grid gap-4">
          <div
            v-for="index in 5"
            :key="index"
            class="h-44 animate-pulse rounded-3xl bg-slate-100"
          />
        </div>

        <div v-else-if="logList.length" class="grid gap-4">
          <article
            v-for="row in logList"
            :key="row.id"
            class="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <el-tag :type="getLevelType(row.level)" size="small">
                    {{ row.level.toUpperCase() }}
                  </el-tag>
                  <span class="inline-chip">{{ row.module }}</span>
                </div>
                <p class="mt-3 text-sm font-semibold text-slate-900">
                  {{ row.message }}
                </p>
              </div>
              <span class="text-xs text-slate-400">
                {{ formatDate(row.timestamp) }}
              </span>
            </div>

            <div class="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
              <span>{{ row.user || "系统" }}</span>
              <el-button v-if="row.details" size="small" text @click="viewLogDetails(row)">
                查看详情
              </el-button>
            </div>
          </article>
        </div>

        <el-empty v-else description="没有符合条件的日志" />
      </div>

      <div class="app-table mt-5 hidden lg:block">
        <el-table
          v-loading="loading"
          :data="logList"
          border
          stripe
          :row-key="(row: LogEntry) => row.id.toString()"
        >
          <el-table-column label="时间" width="180">
            <template #default="{ row }">
              {{ formatDate(row.timestamp) }}
            </template>
          </el-table-column>
          <el-table-column label="级别" width="110">
            <template #default="{ row }">
              <el-tag :type="getLevelType(row.level)" size="small">
                {{ row.level.toUpperCase() }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="模块" width="150">
            <template #default="{ row }">
              <span class="inline-chip !bg-slate-100">{{ row.module }}</span>
            </template>
          </el-table-column>
          <el-table-column label="用户" width="150">
            <template #default="{ row }">
              {{ row.user || "系统" }}
            </template>
          </el-table-column>
          <el-table-column label="消息" min-width="360" show-overflow-tooltip>
            <template #default="{ row }">
              <span :class="getMessageClass(row.level)">{{ row.message }}</span>
            </template>
          </el-table-column>
          <el-table-column label="详情" width="100" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.details"
                size="small"
                text
                type="primary"
                @click="viewLogDetails(row)"
              >
                查看
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="mt-5 flex justify-end">
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
    </section>

    <el-dialog v-model="logDetailVisible" title="日志详情" width="min(92vw, 760px)">
      <div v-if="selectedLog" class="page-shell">
        <section class="surface-card p-5">
          <div class="detail-grid md:grid-cols-2">
            <div>
              <div class="detail-label">时间</div>
              <div class="detail-value">{{ formatDate(selectedLog.timestamp) }}</div>
            </div>
            <div>
              <div class="detail-label">级别</div>
              <div class="detail-value">
                <el-tag :type="getLevelType(selectedLog.level)">
                  {{ selectedLog.level.toUpperCase() }}
                </el-tag>
              </div>
            </div>
            <div>
              <div class="detail-label">模块</div>
              <div class="detail-value">{{ selectedLog.module }}</div>
            </div>
            <div>
              <div class="detail-label">用户</div>
              <div class="detail-value">{{ selectedLog.user || "系统" }}</div>
            </div>
            <div class="md:col-span-2">
              <div class="detail-label">消息</div>
              <div class="detail-value">{{ selectedLog.message }}</div>
            </div>
          </div>
        </section>

        <section v-if="selectedLog.details" class="surface-card p-5">
          <h3 class="section-title">详细内容</h3>
          <pre class="log-detail">{{ JSON.stringify(selectedLog.details, null, 2) }}</pre>
        </section>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
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

let searchTimer: number | null = null;

function buildParams(overrides?: Partial<GetLogsParams>): GetLogsParams {
  return {
    level: (levelFilter.value as GetLogsParams["level"]) || undefined,
    module: undefined,
    search: searchQuery.value.trim() || undefined,
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
    logList.value = [];
    pagination.total = 0;
    ElMessage.error(error instanceof Error ? error.message : "加载日志失败");
  } finally {
    loading.value = false;
  }
}

function debouncedSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = window.setTimeout(() => {
    handleFiltersChange();
  }, 320);
}

function handleFiltersChange() {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  pagination.page = 1;
  void fetchLogs();
}

function refreshLogs() {
  void fetchLogs();
}

function handlePageChange(page: number) {
  pagination.page = page;
  void fetchLogs();
}

function handleSizeChange(size: number) {
  pagination.limit = size;
  pagination.page = 1;
  void fetchLogs();
}

function getLevelType(level: string) {
  if (level === "error") return "danger";
  if (level === "warn") return "warning";
  if (level === "info") return "primary";
  return "info";
}

function getMessageClass(level: string) {
  if (level === "error") return "font-semibold text-rose-600";
  if (level === "warn") return "text-amber-600";
  return "text-slate-900";
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return value;
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
    ElMessage.error(error instanceof Error ? error.message : "导出日志失败");
  } finally {
    exporting.value = false;
  }
}

async function clearLogs() {
  try {
    await ElMessageBox.confirm("确定清空所有系统日志吗？", "警告", {
      confirmButtonText: "清空",
      cancelButtonText: "取消",
      type: "warning",
    });
    await clearLogsApi();
    logList.value = [];
    pagination.total = 0;
    Object.assign(stats, { total: 0, error: 0, warn: 0, info: 0, debug: 0 });
    ElMessage.success("系统日志已清空");
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "清空日志失败");
    }
  }
}

onMounted(() => {
  void fetchLogs();
});
</script>

<style scoped>
.log-detail {
  margin: 1rem 0 0;
  max-height: 360px;
  overflow: auto;
  border-radius: 20px;
  background: #f8fafc;
  padding: 1rem;
  color: #0f172a;
  font-family: "Monaco", "Menlo", "Consolas", monospace;
  font-size: 12px;
  line-height: 1.65;
}
</style>
