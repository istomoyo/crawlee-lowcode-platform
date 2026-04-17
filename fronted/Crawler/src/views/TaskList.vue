<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <h1 class="page-title">任务清单</h1>
        <p class="page-description">
          统一承接任务筛选、整理、模板沉淀、截图预览与执行结果查看，保持当前后端接口能力不变。
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <el-button plain @click="router.push('/crawleer/templates')">模板中心</el-button>
        <el-button type="primary" @click="goToCreateTask">新建任务</el-button>
      </div>
    </header>

    <section class="toolbar-card p-4 sm:p-5">
      <div class="task-toolbar-grid">
        <el-input
          v-model="searchQuery"
          clearable
          placeholder="搜索任务名称或 URL"
          @input="debouncedSearch"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-select v-model="selectedFolder" clearable filterable placeholder="按文件夹筛选">
          <el-option v-for="folder in organizationOptions.folders" :key="folder" :label="folder" :value="folder" />
        </el-select>
        <el-select v-model="selectedTag" clearable filterable placeholder="按标签筛选">
          <el-option v-for="tag in organizationOptions.tags" :key="tag" :label="tag" :value="tag" />
        </el-select>
        <div class="task-toolbar-actions">
          <el-checkbox v-model="favoriteOnly">只看收藏</el-checkbox>
          <el-button text @click="resetFilters">重置</el-button>
          <el-button text :loading="loading" @click="fetchTaskList">刷新</el-button>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <span class="inline-chip">任务 {{ pagination.total }}</span>
        <span class="inline-chip">文件夹 {{ organizationOptions.folders.length }}</span>
        <span class="inline-chip">标签 {{ organizationOptions.tags.length }}</span>
        <span class="inline-chip">收藏 {{ organizationOptions.favoriteCount }}</span>
      </div>
    </section>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article class="metric-card">
        <p class="metric-label">当前结果数</p>
        <p class="metric-value">{{ pagination.total }}</p>
        <p class="metric-note">按搜索、文件夹、标签与收藏状态过滤后的任务总数。</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">收藏任务</p>
        <p class="metric-value">{{ organizationOptions.favoriteCount }}</p>
        <p class="metric-note">建议把高频复用、运行稳定的任务加入收藏。</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">文件夹</p>
        <p class="metric-value">{{ organizationOptions.folders.length }}</p>
        <p class="metric-note">适合按项目、站点或业务场景进行分层整理。</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">标签</p>
        <p class="metric-value">{{ organizationOptions.tags.length }}</p>
        <p class="metric-note">方便跨任务检索与模板归档，减少重复配置。</p>
      </article>
    </section>

    <section class="surface-card p-5 sm:p-6">
      <div class="page-header">
        <div>
          <h2 class="section-title">任务列表</h2>
          <p class="section-description">
            保留真实截图点击预览、任务执行、分组整理、模板保存与结果查看。桌面端使用表格，移动端切换为卡片布局。
          </p>
        </div>
      </div>

      <div class="mt-5 lg:hidden">
        <div v-if="loading" class="grid gap-4">
          <div v-for="index in 4" :key="index" class="h-72 animate-pulse rounded-3xl bg-slate-100" />
        </div>

        <div v-else-if="taskList.length" class="grid gap-4">
          <article
            v-for="row in taskList"
            :key="row.rowKey"
            v-memo="[row.renderToken, expandedRowKeySet.has(row.rowKey), isResultLoading(row.rowKey)]"
            class="task-mobile-card"
          >
            <div class="task-mobile-hero">
              <div class="task-media task-media--interactive">
                <button v-if="row.screenshotUrl" type="button" class="task-media__button" @click="openScreenshotPreview(row)">
                  <img
                    class="task-media__image"
                    :src="row.screenshotUrl"
                    :alt="`${row.name} 截图`"
                    loading="lazy"
                    decoding="async"
                    @error="markScreenshotBroken(row.id)"
                  />
                </button>
                <div v-else class="task-media__empty"><span>暂无截图</span></div>
                <div v-if="row.screenshotUrl" class="task-media__hint" aria-hidden="true">
                  <el-icon><Search /></el-icon>
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span v-if="row.folder" class="inline-chip">{{ row.folder }}</span>
                  <span v-for="tag in row.displayTags" :key="`${row.rowKey}-${tag}`" class="inline-chip">{{ tag }}</span>
                  <span v-if="row.isFavorite" class="inline-chip">收藏</span>
                </div>

                <div class="mt-3 flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate text-lg font-bold tracking-tight text-slate-900">{{ row.name }}</h3>
                    <p class="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{{ row.url }}</p>
                  </div>

                  <div class="flex items-center gap-2">
                    <el-tag :type="row.statusTagType" effect="dark">{{ row.statusLabel }}</el-tag>
                    <el-progress
                      v-if="isProgressVisible(row.status)"
                      type="circle"
                      :percentage="row.progress || 0"
                      width="30"
                      stroke-width="4"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="toolbar-card p-3">
                <p class="detail-label">创建时间</p>
                <p class="detail-value">{{ row.createdAtText }}</p>
              </div>
              <div class="toolbar-card p-3">
                <p class="detail-label">最近执行</p>
                <p class="detail-value">{{ row.lastExecutionText }}</p>
              </div>
            </div>

            <div class="task-action-row mt-4">
              <el-button size="small" type="primary" :loading="executingTaskId === row.id" @click="quickExecuteTask(row)">快速执行</el-button>
              <el-button size="small" plain @click="editTask(row)">继续编辑</el-button>
              <el-button size="small" plain @click="openOrganizationDialog(row)">整理</el-button>
              <el-button size="small" plain @click="openSaveTemplateDialog(row)">保存模板</el-button>
              <el-button size="small" text type="danger" :loading="deletingTaskId === row.id" @click="deleteTask(row)">删除</el-button>
            </div>

            <div v-if="row.hasExpandableResult" class="mt-4">
              <el-button text type="primary" :loading="isResultLoading(row.rowKey)" @click="toggleExpanded(row)">
                {{ expandedRowKeySet.has(row.rowKey) ? "收起结果" : "查看结果" }}
              </el-button>
              <div v-if="expandedRowKeySet.has(row.rowKey)" v-loading="isResultLoading(row.rowKey)" class="task-result-panel mt-3">
                <TaskRow :results="getResultData(row.rowKey)" :result-path="row.latestExecution?.resultPath" :execution-id="row.latestExecution?.id" />
              </div>
            </div>
          </article>
        </div>

        <el-empty v-else class="py-8" description="当前没有匹配的任务" />
      </div>

      <div class="app-table mt-5 hidden lg:block">
        <el-table v-loading="loading" :data="taskList" border stripe row-key="rowKey" :expand-row-keys="expandedRows" @expand-change="handleRowExpand">
          <el-table-column label="任务" min-width="360">
            <template #default="{ row }">
              <div v-memo="[row.renderToken]" class="task-table-cell">
                <div class="task-media task-media--table task-media--interactive">
                  <button v-if="row.screenshotUrl" type="button" class="task-media__button" @click="openScreenshotPreview(row)">
                    <img
                      class="task-media__image"
                      :src="row.screenshotUrl"
                      :alt="`${row.name} 截图`"
                      loading="lazy"
                      decoding="async"
                      @error="markScreenshotBroken(row.id)"
                    />
                  </button>
                  <div v-else class="task-media__empty"><span>暂无截图</span></div>
                  <div v-if="row.screenshotUrl" class="task-media__hint" aria-hidden="true">
                    <el-icon><Search /></el-icon>
                  </div>
                </div>

                <div class="min-w-0 flex-1">
                  <div class="task-table-title">{{ row.name }}</div>
                  <p class="task-table-url">{{ row.url }}</p>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="分组整理" min-width="280">
            <template #default="{ row }">
              <div v-memo="[row.renderToken]" class="flex flex-wrap items-center gap-2">
                <el-button size="small" plain :type="row.isFavorite ? 'warning' : 'info'" :loading="favoriteUpdatingId === row.id" @click="toggleFavorite(row)">
                  {{ row.isFavorite ? "已收藏" : "收藏" }}
                </el-button>
                <el-tag v-if="row.folder" size="small" type="info">{{ row.folder }}</el-tag>
                <el-tag v-for="tag in row.displayTags" :key="`${row.rowKey}-${tag}`" size="small">{{ tag }}</el-tag>
                <el-button text size="small" @click="openOrganizationDialog(row)">整理</el-button>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="状态" width="160">
            <template #default="{ row }">
              <div v-memo="[row.renderToken]" class="flex items-center gap-2">
                <el-tag :type="row.statusTagType" effect="dark">{{ row.statusLabel }}</el-tag>
                <el-progress v-if="isProgressVisible(row.status)" type="circle" :percentage="row.progress || 0" width="28" stroke-width="4" />
              </div>
            </template>
          </el-table-column>

          <el-table-column label="最近执行" width="180">
            <template #default="{ row }">{{ row.lastExecutionText }}</template>
          </el-table-column>
          <el-table-column label="创建时间" width="180">
            <template #default="{ row }">{{ row.createdAtText }}</template>
          </el-table-column>

          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <el-dropdown trigger="click" @command="(command: string) => handleActionMenu(command, row)">
                <el-button type="primary" size="small">
                  操作
                  <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="execute">快速执行</el-dropdown-item>
                    <el-dropdown-item command="edit">继续编辑</el-dropdown-item>
                    <el-dropdown-item command="copy">复制配置</el-dropdown-item>
                    <el-dropdown-item command="organize">整理</el-dropdown-item>
                    <el-dropdown-item command="save-template" divided>保存模板</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button class="ml-2" size="small" type="danger" :loading="deletingTaskId === row.id" @click="deleteTask(row)">删除</el-button>
            </template>
          </el-table-column>

          <el-table-column type="expand" width="52">
            <template #default="{ row }">
              <div v-if="row.hasExpandableResult" v-loading="isResultLoading(row.rowKey)" class="task-result-panel">
                <TaskRow :results="getResultData(row.rowKey)" :result-path="row.latestExecution?.resultPath" :execution-id="row.latestExecution?.id" />
              </div>
              <div v-else class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8">
                <el-empty :description="row.statusDescription" :image-size="80" />
              </div>
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

    <el-dialog v-model="organizationDialogVisible" title="整理任务" width="min(92vw, 520px)" destroy-on-close>
      <el-form label-position="top" class="grid gap-4">
        <el-form-item label="任务名称">
          <div class="detail-value !mt-0">{{ organizationForm.taskName || "-" }}</div>
        </el-form-item>
        <el-form-item label="文件夹">
          <el-select v-model="organizationForm.folder" class="w-full" clearable filterable allow-create default-first-option placeholder="选择或输入文件夹">
            <el-option v-for="folder in organizationOptions.folders" :key="folder" :label="folder" :value="folder" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="organizationForm.tags"
            class="w-full"
            multiple
            filterable
            allow-create
            default-first-option
            collapse-tags
            collapse-tags-tooltip
            placeholder="输入标签"
          >
            <el-option v-for="tag in organizationOptions.tags" :key="tag" :label="tag" :value="tag" />
          </el-select>
        </el-form-item>
        <el-form-item label="收藏"><el-switch v-model="organizationForm.isFavorite" /></el-form-item>
      </el-form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button @click="organizationDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="organizationSaving" @click="submitOrganization">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="previewDialogVisible"
      title="截图详情"
      width="min(96vw, 1360px)"
      top="4vh"
      append-to-body
      destroy-on-close
      class="screenshot-dialog"
    >
      <div class="screenshot-preview">
        <div class="screenshot-preview__meta">
          <div class="screenshot-preview__title">{{ previewTitle }}</div>
          <div class="screenshot-preview__url">{{ previewUrlText }}</div>
        </div>
        <div class="screenshot-preview__shell">
          <img v-if="previewImageUrl" class="screenshot-preview__image" :src="previewImageUrl" :alt="previewTitle || '任务截图'" />
        </div>
      </div>
    </el-dialog>

    <SaveTemplateDialog v-model="saveTemplateVisible" :task="saveTemplateTarget" @saved="handleTemplateSaved" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { ArrowDown, Search } from "@element-plus/icons-vue";
import SaveTemplateDialog from "@/components/SaveTemplateDialog.vue";
import TaskRow from "@/components/TaskRow.vue";
import {
  deleteTaskApi,
  executeTaskApi,
  getTaskListApi,
  getTaskOrganizationOptionsApi,
  updateTaskOrganizationApi,
  type TaskOrganizationOptions,
} from "@/api/task";
import { useCookieCredentials } from "@/composables/useCookieCredentials";
import { useTaskSocket } from "@/composables/useTaskSocket";
import { useTaskFormStore } from "@/stores/taskForm";
import type { TaskItem, TaskStatus } from "@/types/task";
import {
  findCookieCredentialById,
  getCookieCredentialStatusMeta,
  isCookieCredentialUsable,
} from "@/utils/cookie-credential";
import { resolveApiResourceUrl, resolveUploadUrl } from "@/utils/api-url";

type TaskTagType = "success" | "danger" | "warning" | "info";

type TaskViewItem = TaskItem & {
  rowKey: string;
  displayTags: string[];
  statusLabel: string;
  statusTagType: TaskTagType;
  createdAtText: string;
  lastExecutionText: string;
  screenshotUrl?: string;
  hasExpandableResult: boolean;
  statusDescription: string;
  renderToken: string;
};

const EMPTY_RESULTS: unknown[] = [];

const router = useRouter();
const taskFormStore = useTaskFormStore();
const { credentials, fetchCookieCredentials } = useCookieCredentials();

const taskList = shallowRef<TaskViewItem[]>([]);
const loading = ref(false);
const searchQuery = ref("");
const selectedFolder = ref<string | null>(null);
const selectedTag = ref<string | null>(null);
const favoriteOnly = ref(false);
const pagination = ref({ page: 1, limit: 10, total: 0, totalPages: 0 });
const organizationOptions = ref<TaskOrganizationOptions>({ folders: [], tags: [], favoriteCount: 0 });
const expandedRows = ref<string[]>([]);
const taskResults = shallowRef<Map<string, unknown[]>>(new Map());
const resultLoadingKeys = shallowRef<Set<string>>(new Set());
const brokenScreenshotIds = shallowRef<Set<number>>(new Set());
const deletingTaskId = ref<number | null>(null);
const executingTaskId = ref<number | null>(null);
const favoriteUpdatingId = ref<number | null>(null);
const organizationDialogVisible = ref(false);
const organizationSaving = ref(false);
const saveTemplateVisible = ref(false);
const saveTemplateTarget = ref<TaskItem | null>(null);
const previewDialogVisible = ref(false);
const previewImageUrl = ref("");
const previewTitle = ref("");
const previewUrlText = ref("");

const organizationForm = reactive({
  taskId: 0,
  taskName: "",
  folder: "",
  tags: [] as string[],
  isFavorite: false,
});

const expandedRowKeySet = computed(() => new Set(expandedRows.value));

let searchTimer: number | null = null;
let fetchTaskListToken = 0;
let suspendFilterWatch = false;

watch([selectedFolder, selectedTag, favoriteOnly], () => {
  if (suspendFilterWatch) return;
  pagination.value.page = 1;
  void fetchTaskList();
});

function isProgressVisible(status: TaskStatus) {
  return status === "running" || status === "stopping";
}

function getStatusType(status: TaskStatus): TaskTagType {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  if (status === "running" || status === "stopping") return "warning";
  return "info";
}

function getStatusLabel(status: TaskStatus) {
  if (status === "pending") return "待执行";
  if (status === "running") return "执行中";
  if (status === "stopping") return "停止中";
  if (status === "success") return "成功";
  if (status === "failed") return "失败";
  return status;
}

function getStatusDescription(status: TaskStatus) {
  if (status === "pending") return "任务正在等待执行。";
  if (status === "running") return "任务正在执行，请稍后查看结果。";
  if (status === "stopping") return "停止请求已发出，等待引擎中断。";
  if (status === "failed") return "任务执行失败，请检查日志并调整配置。";
  return "暂无可展示结果。";
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "未执行";

  try {
    return new Date(dateStr).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function renderTokenFor(task: TaskItem, screenshotUrl?: string) {
  return [
    task.id,
    task.name,
    task.url,
    task.status,
    task.progress || 0,
    task.folder || "",
    task.isFavorite ? 1 : 0,
    (task.tags || []).join("|"),
    task.createdAt || "",
    task.lastExecutionTime || "",
    task.latestExecution?.id || "",
    task.latestExecution?.status || "",
    task.latestExecution?.resultPath || "",
    screenshotUrl || "",
  ].join("::");
}

function normalizeTaskItem(item: TaskItem): TaskViewItem {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const latestExecution = item.latestExecution ? { ...item.latestExecution } : null;
  const normalized: TaskItem = {
    ...item,
    folder: item.folder || null,
    tags,
    isFavorite: Boolean(item.isFavorite),
    progress: Number(item.progress) || 0,
    latestExecution,
  };
  const screenshotUrl =
    normalized.screenshotPath && !brokenScreenshotIds.value.has(normalized.id)
      ? resolveUploadUrl(normalized.screenshotPath)
      : undefined;

  return {
    ...normalized,
    rowKey: String(normalized.id),
    displayTags: tags.slice(0, 3),
    statusLabel: getStatusLabel(normalized.status),
    statusTagType: getStatusType(normalized.status),
    createdAtText: formatDate(normalized.createdAt),
    lastExecutionText: formatDate(normalized.lastExecutionTime),
    screenshotUrl,
    hasExpandableResult: normalized.status === "success" && Boolean(normalized.latestExecution),
    statusDescription: getStatusDescription(normalized.status),
    renderToken: renderTokenFor(normalized, screenshotUrl),
  };
}

function updateTaskItem(taskId: number, updater: (task: TaskViewItem) => TaskItem) {
  const taskIndex = taskList.value.findIndex((task) => task.id === taskId);
  if (taskIndex === -1) return false;

  const currentTask = taskList.value[taskIndex];
  if (!currentTask) return false;

  const nextTaskList = taskList.value.slice();
  nextTaskList[taskIndex] = normalizeTaskItem(updater(currentTask));
  taskList.value = nextTaskList;
  return true;
}

function setResultLoading(rowKey: string, nextLoading: boolean) {
  const nextSet = new Set(resultLoadingKeys.value);
  if (nextLoading) nextSet.add(rowKey);
  else nextSet.delete(rowKey);
  resultLoadingKeys.value = nextSet;
}

function isResultLoading(rowKey: string) {
  return resultLoadingKeys.value.has(rowKey);
}

function setTaskResults(rowKey: string, results: unknown[]) {
  const nextMap = new Map(taskResults.value);
  nextMap.set(rowKey, Array.isArray(results) ? results : []);
  taskResults.value = nextMap;
}

function getResultData(rowKey: string) {
  return taskResults.value.get(rowKey) || EMPTY_RESULTS;
}

function markScreenshotBroken(taskId: number) {
  if (brokenScreenshotIds.value.has(taskId)) return;

  const nextSet = new Set(brokenScreenshotIds.value);
  nextSet.add(taskId);
  brokenScreenshotIds.value = nextSet;
  updateTaskItem(taskId, (task) => ({ ...task }));
}

function openScreenshotPreview(row: TaskViewItem) {
  if (!row.screenshotUrl) return;
  previewImageUrl.value = row.screenshotUrl;
  previewTitle.value = row.name;
  previewUrlText.value = row.url;
  previewDialogVisible.value = true;
}

async function loadOrganizationOptions() {
  try {
    organizationOptions.value = await getTaskOrganizationOptionsApi();
  } catch (error) {
    console.error("Load organization options failed:", error);
  }
}

async function fetchTaskList() {
  const currentToken = ++fetchTaskListToken;

  try {
    loading.value = true;
    const response = await getTaskListApi({
      page: pagination.value.page,
      limit: pagination.value.limit,
      search: searchQuery.value.trim() || undefined,
      folder: selectedFolder.value || undefined,
      tag: selectedTag.value || undefined,
      favoriteOnly: favoriteOnly.value || undefined,
    });

    if (currentToken !== fetchTaskListToken) return;

    brokenScreenshotIds.value = new Set();
    const nextTaskList = response.data.map((item) => normalizeTaskItem(item));
    const validKeys = new Set(nextTaskList.map((item) => item.rowKey));

    taskList.value = nextTaskList;
    expandedRows.value = expandedRows.value.filter((key) => validKeys.has(key));
    resultLoadingKeys.value = new Set(Array.from(resultLoadingKeys.value).filter((key) => validKeys.has(key)));
    taskResults.value = new Map(Array.from(taskResults.value.entries()).filter(([key]) => validKeys.has(key)));
    pagination.value = { ...pagination.value, ...response.pagination };
  } catch (error) {
    if (currentToken !== fetchTaskListToken) return;
    taskList.value = [];
    ElMessage.error(error instanceof Error ? error.message : "加载任务失败");
  } finally {
    if (currentToken === fetchTaskListToken) {
      loading.value = false;
    }
  }
}

const { connectWebSocket, disconnectWebSocket } = useTaskSocket<TaskViewItem>(taskList, pagination, fetchTaskList, {
  hydrateTask: normalizeTaskItem,
  progressThrottleMs: 160,
});

function debouncedSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    handleSearch();
  }, 360);
}

function handleSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }

  pagination.value.page = 1;
  void fetchTaskList();
}

function resetFilters() {
  const hasChanges =
    Boolean(searchQuery.value.trim()) ||
    Boolean(selectedFolder.value) ||
    Boolean(selectedTag.value) ||
    favoriteOnly.value;

  if (!hasChanges) return;

  suspendFilterWatch = true;
  searchQuery.value = "";
  selectedFolder.value = null;
  selectedTag.value = null;
  favoriteOnly.value = false;
  pagination.value.page = 1;
  suspendFilterWatch = false;
  void fetchTaskList();
}

function handlePageChange(page: number) {
  pagination.value.page = page;
  void fetchTaskList();
}

function handleSizeChange(size: number) {
  pagination.value.limit = size;
  pagination.value.page = 1;
  void fetchTaskList();
}

function parseTaskConfig(row: TaskItem) {
  if (!row.config) return {};

  try {
    return JSON.parse(row.config);
  } catch (error) {
    console.error("Parse task config failed:", error);
    return {};
  }
}

async function ensureCookieCredentialsLoaded(force = false) {
  try {
    await fetchCookieCredentials(force);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载 Cookie 凭证失败");
    throw error;
  }
}

async function validateTaskCookieCredential(row: TaskItem) {
  const parsedConfig = parseTaskConfig(row) as Record<string, unknown>;
  const cookieCredentialId = Number(parsedConfig.cookieCredentialId);

  if (
    !parsedConfig.useCookie ||
    !Number.isInteger(cookieCredentialId) ||
    cookieCredentialId <= 0
  ) {
    return true;
  }

  await ensureCookieCredentialsLoaded();
  const selectedCredential = findCookieCredentialById(
    credentials.value,
    cookieCredentialId,
  );

  if (!selectedCredential) {
    ElMessage.error("任务绑定的 Cookie 凭证不存在，请先更新任务配置");
    return false;
  }

  if (!isCookieCredentialUsable(selectedCredential)) {
    ElMessage.error(getCookieCredentialStatusMeta(selectedCredential).message);
    return false;
  }

  return true;
}

async function handleRowExpand(row: TaskViewItem, expanded: TaskViewItem[]) {
  expandedRows.value = expanded.map((item) => item.rowKey);

  if (!expandedRowKeySet.value.has(row.rowKey) || row.status !== "success" || !row.latestExecution || taskResults.value.has(row.rowKey)) {
    return;
  }

  await loadTaskResult(row);
}

async function loadTaskResult(row: TaskViewItem) {
  const rowKey = row.rowKey;
  setResultLoading(rowKey, true);

  try {
    if (!row.latestExecution?.resultPath) {
      setTaskResults(rowKey, []);
      return;
    }

    if (row.latestExecution.resultPath.toLowerCase().endsWith(".zip")) {
      setTaskResults(rowKey, []);
      return;
    }

    const resultUrl = resolveApiResourceUrl(row.latestExecution.resultPath);
    if (!resultUrl) {
      setTaskResults(rowKey, []);
      return;
    }

    const response = await fetch(resultUrl, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`获取结果失败: ${response.status}`);
    }

    const results = await response.json();
    setTaskResults(rowKey, Array.isArray(results) ? results : []);
  } catch (error) {
    console.error("Load result failed:", error);
    setTaskResults(rowKey, []);
    ElMessage.warning("结果读取失败");
  } finally {
    setResultLoading(rowKey, false);
  }
}

async function goToCreateTask() {
  taskFormStore.startNewTask();
  await router.push("/crawleer/task-add/basic");
}

function handleActionMenu(command: string, row: TaskViewItem) {
  if (command === "execute") {
    void quickExecuteTask(row);
    return;
  }

  if (command === "edit") {
    void editTask(row);
    return;
  }

  if (command === "copy") {
    void copyTaskConfig(row);
    return;
  }

  if (command === "organize") {
    openOrganizationDialog(row);
    return;
  }

  if (command === "save-template") {
    openSaveTemplateDialog(row);
  }
}

async function copyTaskConfig(row: TaskItem) {
  try {
    await navigator.clipboard.writeText(JSON.stringify({ name: row.name, url: row.url, config: parseTaskConfig(row), script: row.script || "" }, null, 2));
    ElMessage.success("任务配置已复制到剪贴板");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "复制配置失败");
  }
}

async function editTask(row: TaskItem) {
  try {
    taskFormStore.applySerializedTaskConfig({ name: row.name, url: row.url, config: parseTaskConfig(row), script: row.script || "" });
    await router.push("/crawleer/task-add/basic");
    ElMessage.success("任务配置已载入，可以继续编辑");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "任务载入失败");
  }
}

async function deleteTask(row: TaskItem) {
  try {
    await ElMessageBox.confirm(`确定删除任务“${row.name}”吗？`, "提示", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    deletingTaskId.value = row.id;
    await deleteTaskApi({ name: row.name, url: row.url });
    await fetchTaskList();
    await loadOrganizationOptions();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除任务失败");
    }
  } finally {
    deletingTaskId.value = null;
  }
}

async function quickExecuteTask(row: TaskItem) {
  try {
    if (!(await validateTaskCookieCredential(row))) {
      return;
    }

    executingTaskId.value = row.id;
    const response = await executeTaskApi({ taskId: String(row.id) });

    if (response.status === "queued" || response.status === "running") {
      ElMessage.success("任务已加入执行队列");
      await fetchTaskList();
    } else {
      ElMessage.warning(response.message || "任务执行状态异常");
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "执行失败");
  } finally {
    executingTaskId.value = null;
  }
}

function openOrganizationDialog(task: TaskItem) {
  organizationForm.taskId = task.id;
  organizationForm.taskName = task.name;
  organizationForm.folder = task.folder || "";
  organizationForm.tags = [...(task.tags || [])];
  organizationForm.isFavorite = Boolean(task.isFavorite);
  organizationDialogVisible.value = true;
}

function normalizeFolderInput(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeTagsInput(tags?: string[]) {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);
}

function applyOrganizationResult(result: { id: number; folder: string | null; tags: string[]; isFavorite: boolean }) {
  updateTaskItem(result.id, (task) => ({
    ...task,
    folder: result.folder || null,
    tags: result.tags || [],
    isFavorite: result.isFavorite,
  }));
}

async function submitOrganization() {
  if (!organizationForm.taskId) return;

  try {
    organizationSaving.value = true;
    const response = await updateTaskOrganizationApi(organizationForm.taskId, {
      folder: normalizeFolderInput(organizationForm.folder),
      tags: normalizeTagsInput(organizationForm.tags),
      isFavorite: organizationForm.isFavorite,
    });
    applyOrganizationResult(response);
    organizationDialogVisible.value = false;
    await loadOrganizationOptions();
    ElMessage.success("任务整理已更新");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "整理任务失败");
  } finally {
    organizationSaving.value = false;
  }
}

async function toggleFavorite(row: TaskItem) {
  if (favoriteUpdatingId.value === row.id) return;

  try {
    favoriteUpdatingId.value = row.id;
    const response = await updateTaskOrganizationApi(row.id, { isFavorite: !row.isFavorite });
    applyOrganizationResult(response);
    await loadOrganizationOptions();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "更新收藏状态失败");
  } finally {
    favoriteUpdatingId.value = null;
  }
}

async function toggleExpanded(row: TaskViewItem) {
  const isExpanded = expandedRowKeySet.value.has(row.rowKey);
  expandedRows.value = isExpanded ? expandedRows.value.filter((item) => item !== row.rowKey) : [...expandedRows.value, row.rowKey];

  if (!isExpanded && !taskResults.value.has(row.rowKey)) {
    await loadTaskResult(row);
  }
}

function openSaveTemplateDialog(row: TaskItem) {
  saveTemplateTarget.value = row;
  saveTemplateVisible.value = true;
}

function handleTemplateSaved() {
  saveTemplateTarget.value = null;
}

onMounted(() => {
  void fetchTaskList();
  void loadOrganizationOptions();
  connectWebSocket();
});

onUnmounted(() => {
  disconnectWebSocket();

  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
});
</script>

<style scoped>
.task-toolbar-grid {
  display: grid;
  gap: 0.75rem;
  align-items: center;
}

.task-toolbar-actions {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  padding: 0 0.9rem;
}

.task-mobile-card {
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(12, 92, 171, 0.06), transparent 58%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
  padding: 1.25rem;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.task-mobile-hero {
  display: grid;
  gap: 1rem;
}

.task-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.task-table-cell {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.task-table-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f172a;
}

.task-table-url {
  margin-top: 0.35rem;
  display: -webkit-box;
  overflow: hidden;
  color: #64748b;
  font-size: 0.78rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.task-media {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 20px;
  background:
    linear-gradient(180deg, #ffffff, #f8fafc),
    linear-gradient(135deg, rgba(12, 92, 171, 0.07), transparent 52%);
  aspect-ratio: 16 / 10;
}

.task-media--table {
  width: 124px;
  flex-shrink: 0;
  border-radius: 18px;
}

.task-media--interactive {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.task-media__button {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.task-media__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.22s ease;
}

.task-media__button:hover .task-media__image {
  transform: scale(1.02);
}

.task-media__hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.28));
  color: #ffffff;
  font-size: 1.15rem;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.task-media__hint :deep(svg) {
  filter: drop-shadow(0 4px 12px rgba(15, 23, 42, 0.24));
  transform: scale(0.92);
  transition: transform 0.18s ease;
}

@media (hover: hover) {
  .task-media--interactive:hover .task-media__hint,
  .task-media--interactive:focus-within .task-media__hint {
    opacity: 1;
  }

  .task-media--interactive:hover .task-media__hint :deep(svg),
  .task-media--interactive:focus-within .task-media__hint :deep(svg) {
    transform: scale(1);
  }
}

.task-media__empty {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  background:
    linear-gradient(135deg, rgba(226, 232, 240, 0.35), rgba(248, 250, 252, 0.95));
}

.task-result-panel {
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.9));
}

.screenshot-preview {
  display: grid;
  gap: 1rem;
}

.screenshot-preview__meta {
  display: grid;
  gap: 0.25rem;
}

.screenshot-preview__title {
  color: #0f172a;
  font-size: 1rem;
  font-weight: 700;
}

.screenshot-preview__url {
  color: #64748b;
  font-size: 0.85rem;
  line-height: 1.5;
  word-break: break-all;
}

.screenshot-preview__shell {
  overflow: auto;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.98));
  padding: 1rem;
}

.screenshot-preview__image {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 18px;
  background: #fff;
}

@media (min-width: 768px) {
  .task-mobile-hero {
    grid-template-columns: 220px minmax(0, 1fr);
    align-items: start;
  }

  .screenshot-preview__shell {
    max-height: calc(92vh - 180px);
  }
}

@media (min-width: 1280px) {
  .task-toolbar-grid {
    grid-template-columns: minmax(0, 1.6fr) 220px 220px auto;
  }
}

@media (max-width: 1279px) {
  .task-toolbar-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
    padding: 0.55rem 0.9rem;
  }
}

@media (max-width: 767px) {
  .screenshot-preview__shell {
    max-height: calc(86vh - 140px);
    padding: 0.75rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .task-media__image {
    transition: none;
  }

  .task-media__hint,
  .task-media__hint :deep(svg) {
    transition: none;
  }
}
</style>
