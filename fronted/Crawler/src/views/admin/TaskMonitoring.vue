<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <h1 class="page-title">任务监控</h1>
        <p class="page-description">
          面向管理员查看全局任务运行情况，支持按状态、关键词和时间窗口筛选。
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <el-button plain @click="refreshData">刷新</el-button>
      </div>
    </header>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article class="metric-card">
        <p class="metric-label">任务总数</p>
        <p class="metric-value">{{ stats.totalTasks }}</p>
        <p class="metric-note">平台内全部任务</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">执行中</p>
        <p class="metric-value text-amber-600">{{ stats.runningTasks }}</p>
        <p class="metric-note">包含正在停止中的任务</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">成功</p>
        <p class="metric-value text-emerald-600">{{ stats.successTasks }}</p>
        <p class="metric-note">最近状态为成功</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">失败</p>
        <p class="metric-value text-rose-600">{{ stats.failedTasks }}</p>
        <p class="metric-note">建议优先检查日志</p>
      </article>
    </section>

    <section class="toolbar-card p-4 sm:p-5">
      <div class="grid gap-3 xl:grid-cols-[180px,minmax(0,1fr),minmax(0,1fr),auto]">
        <el-select
          v-model="statusFilter"
          clearable
          placeholder="状态筛选"
          @change="handleSearch"
        >
          <el-option label="待执行" value="pending" />
          <el-option label="执行中" value="running" />
          <el-option label="停止中" value="stopping" />
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
        </el-select>

        <el-input
          v-model="searchQuery"
          clearable
          placeholder="搜索任务名称或创建者"
          @input="debouncedSearch"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />

        <el-date-picker
          v-model="dateRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          format="YYYY-MM-DD HH:mm"
          value-format="YYYY-MM-DD HH:mm"
          @change="handleSearch"
        />

        <el-button plain @click="resetFilters">重置</el-button>
      </div>
    </section>

    <section class="surface-card p-5 sm:p-6">
      <div class="page-header">
        <div>
          <h2 class="section-title">全局任务列表</h2>
          <p class="section-description">桌面端使用表格提高巡检效率，移动端采用卡片模式减少挤压。</p>
        </div>
      </div>

      <div class="mt-5 lg:hidden">
        <div v-if="loading" class="grid gap-4">
          <div
            v-for="index in 4"
            :key="index"
            class="h-52 animate-pulse rounded-3xl bg-slate-100"
          />
        </div>

        <div v-else-if="taskList.length" class="grid gap-4">
          <article
            v-for="row in taskList"
            :key="row.id"
            class="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="truncate text-lg font-bold text-slate-900">{{ row.name }}</h3>
                <p class="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                  {{ row.url }}
                </p>
              </div>
              <el-tag :type="getStatusType(row.status)" effect="dark">
                {{ getStatusText(row.status) }}
              </el-tag>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="toolbar-card p-3">
                <p class="detail-label">创建者</p>
                <p class="detail-value">{{ row.user?.username || "未知" }}</p>
              </div>
              <div class="toolbar-card p-3">
                <p class="detail-label">创建时间</p>
                <p class="detail-value">{{ formatDate(row.createdAt) }}</p>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <el-button size="small" plain @click="viewTaskDetails(row)">
                详情
              </el-button>
              <el-button
                v-if="['running', 'stopping'].includes(row.status)"
                size="small"
                type="danger"
                plain
                @click="stopTask(row)"
              >
                停止
              </el-button>
            </div>
          </article>
        </div>

        <el-empty v-else description="当前没有匹配的任务" />
      </div>

      <div class="app-table mt-5 hidden lg:block">
        <el-table
          v-loading="loading"
          :data="taskList"
          border
          stripe
          :row-key="(row: AdminTaskItem) => row.id.toString()"
        >
          <el-table-column prop="name" label="任务名称" min-width="180" />
          <el-table-column label="创建者" width="130">
            <template #default="{ row }">
              {{ row.user?.username || "未知" }}
            </template>
          </el-table-column>
          <el-table-column prop="url" label="URL" min-width="240" show-overflow-tooltip />
          <el-table-column label="状态" width="140">
            <template #default="{ row }">
              <div class="flex items-center gap-2">
                <el-tag :type="getStatusType(row.status)" effect="dark">
                  {{ getStatusText(row.status) }}
                </el-tag>
                <el-progress
                  v-if="['running', 'stopping'].includes(row.status)"
                  type="circle"
                  :percentage="row.progress || 0"
                  width="26"
                  stroke-width="4"
                />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="进度" width="140">
            <template #default="{ row }">
              <el-progress
                :percentage="row.progress || 0"
                :status="getProgressStatus(row.status)"
                :stroke-width="8"
              />
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="180">
            <template #default="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column label="最后执行" width="180">
            <template #default="{ row }">
              {{ formatDate(row.lastExecutionTime) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button size="small" plain @click="viewTaskDetails(row)">
                详情
              </el-button>
              <el-button
                v-if="['running', 'stopping'].includes(row.status)"
                size="small"
                type="danger"
                plain
                @click="stopTask(row)"
              >
                停止
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
          :page-sizes="[10, 20, 50]"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </section>

    <el-dialog
      v-model="taskDetailVisible"
      title="任务详情"
      width="min(92vw, 760px)"
      :close-on-click-modal="false"
    >
      <div v-if="selectedTask" class="page-shell">
        <section class="surface-card p-5">
          <div class="detail-grid md:grid-cols-2">
            <div>
              <div class="detail-label">任务名称</div>
              <div class="detail-value">{{ selectedTask.name }}</div>
            </div>
            <div>
              <div class="detail-label">创建者</div>
              <div class="detail-value">{{ selectedTask.user?.username || "未知" }}</div>
            </div>
            <div>
              <div class="detail-label">状态</div>
              <div class="detail-value">
                <el-tag :type="getStatusType(selectedTask.status)" effect="dark">
                  {{ getStatusText(selectedTask.status) }}
                </el-tag>
              </div>
            </div>
            <div>
              <div class="detail-label">创建时间</div>
              <div class="detail-value">{{ formatDate(selectedTask.createdAt) }}</div>
            </div>
            <div class="md:col-span-2">
              <div class="detail-label">URL</div>
              <div class="detail-value">{{ selectedTask.url }}</div>
            </div>
          </div>
        </section>

        <section class="surface-card p-5">
          <div class="page-header">
            <div>
              <h3 class="section-title">执行记录</h3>
              <p class="section-description">展示最近几次执行状态与日志摘要。</p>
            </div>
          </div>

          <div v-if="selectedTask.executions?.length" class="mt-4 grid gap-3">
            <article
              v-for="execution in selectedTask.executions.slice(0, 5)"
              :key="execution.id"
              class="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-sm font-semibold text-slate-900">
                  {{ formatDate(execution.startTime) }}
                </span>
                <el-tag size="small" :type="getStatusType(execution.status)">
                  {{ getStatusText(execution.status) }}
                </el-tag>
              </div>
              <p class="mt-3 text-sm leading-6 text-slate-600">
                {{ execution.log || "暂无日志" }}
              </p>
            </article>
          </div>
          <el-empty v-else class="mt-4" description="当前没有执行记录" />
        </section>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  getTasksApi,
  stopTaskApi,
  type GetTasksParams,
  type TaskItem as AdminTaskItem,
  type TaskStats,
} from "@/api/admin";

const taskList = ref<AdminTaskItem[]>([]);
const loading = ref(false);
const searchQuery = ref("");
const statusFilter = ref("");
const dateRange = ref<string[]>([]);
const taskDetailVisible = ref(false);
const selectedTask = ref<AdminTaskItem | null>(null);
const stats = reactive<TaskStats>({
  totalTasks: 0,
  runningTasks: 0,
  successTasks: 0,
  failedTasks: 0,
});
const pagination = reactive({
  page: 1,
  limit: 10,
  total: 0,
});

let searchTimer: number | null = null;

function buildParams(overrides?: Partial<GetTasksParams>): GetTasksParams {
  return {
    status: statusFilter.value || undefined,
    search: searchQuery.value.trim() || undefined,
    startDate: dateRange.value?.[0] || undefined,
    endDate: dateRange.value?.[1] || undefined,
    page: pagination.page,
    limit: pagination.limit,
    ...overrides,
  };
}

async function fetchTasks(overrides?: Partial<GetTasksParams>) {
  try {
    loading.value = true;
    const response = await getTasksApi(buildParams(overrides));
    taskList.value = response.items;
    Object.assign(stats, response.stats);
    pagination.total = response.total;
    pagination.page = response.page;
    pagination.limit = response.limit;
  } catch (error) {
    taskList.value = [];
    pagination.total = 0;
    ElMessage.error(error instanceof Error ? error.message : "加载任务失败");
  } finally {
    loading.value = false;
  }
}

function debouncedSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = window.setTimeout(() => {
    handleSearch();
  }, 320);
}

function handleSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  pagination.page = 1;
  void fetchTasks();
}

function resetFilters() {
  searchQuery.value = "";
  statusFilter.value = "";
  dateRange.value = [];
  pagination.page = 1;
  void fetchTasks();
}

function refreshData() {
  void fetchTasks();
}

function handlePageChange(page: number) {
  pagination.page = page;
  void fetchTasks();
}

function handleSizeChange(size: number) {
  pagination.limit = size;
  pagination.page = 1;
  void fetchTasks();
}

function getStatusType(status: string) {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  if (status === "running" || status === "stopping") return "warning";
  return "info";
}

function getStatusText(status: string) {
  switch (status) {
    case "pending":
      return "待执行";
    case "running":
      return "执行中";
    case "stopping":
      return "停止中";
    case "success":
      return "成功";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

function getProgressStatus(status: string) {
  if (status === "success") return "success";
  if (status === "failed") return "exception";
  return undefined;
}

function formatDate(value?: string) {
  if (!value) {
    return "--";
  }

  try {
    return new Date(value).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function viewTaskDetails(task: AdminTaskItem) {
  selectedTask.value = task;
  taskDetailVisible.value = true;
}

async function stopTask(task: AdminTaskItem) {
  try {
    await ElMessageBox.confirm(`确定停止任务“${task.name}”吗？`, "提示", {
      confirmButtonText: "停止",
      cancelButtonText: "取消",
      type: "warning",
    });
    await stopTaskApi(task.id);
    await fetchTasks();
    ElMessage.success("停止请求已发送");
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "停止任务失败");
    }
  }
}

onMounted(() => {
  void fetchTasks();
});
</script>
