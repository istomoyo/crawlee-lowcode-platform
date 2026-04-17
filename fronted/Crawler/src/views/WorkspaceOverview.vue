<template>
  <div v-loading="loading && !loaded" class="page-shell">
    <header class="page-header">
      <div>
        <h1 class="page-title">工作台</h1>
        <p class="page-description">把运行状态、队列、未读通知和任务整理入口放到同一首页，方便快速判断现在最该处理什么。</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <el-button plain @click="router.push('/crawleer/templates')">模板中心</el-button>
        <el-button plain @click="router.push('/crawleer/task-list')">查看任务</el-button>
        <el-button type="primary" @click="router.push('/crawleer/task-add/basic')">新建任务</el-button>
      </div>
    </header>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article class="metric-card">
        <p class="metric-label">任务总数</p>
        <p class="metric-value">{{ displayNumber(overview.runtime.totalTasks) }}</p>
        <p class="metric-note">当前运行 {{ displayNumber(overview.runtime.runningTasks) }} 个任务</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">今日执行</p>
        <p class="metric-value">{{ displayNumber(overview.today.executions) }}</p>
        <p class="metric-note">成功 {{ displayNumber(overview.today.success) }}，失败 {{ displayNumber(overview.today.failed) }}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">当前队列</p>
        <p class="metric-value">{{ displayNumber(overview.runtime.queueLength) }}</p>
        <p class="metric-note">{{ loaded ? queueMetricNote : "--" }}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">任务整理</p>
        <p class="metric-value">{{ displayNumber(overview.organization.folders) }}</p>
        <p class="metric-note">标签 {{ displayNumber(overview.organization.tags) }}，收藏 {{ displayNumber(overview.organization.favorites) }}</p>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
      <article class="surface-card p-5 sm:p-6">
        <div class="page-header">
          <div>
            <h2 class="section-title">运行面板</h2>
            <p class="section-description">关注队列状态和最近失败记录，快速判断是否需要重试或调整配置。</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="inline-chip">
              <span class="dot" :class="loaded && overview.runtime.isProcessing ? 'bg-emerald-500' : 'bg-slate-400'" />
              {{ loaded ? queueStatusLabel : "加载中" }}
            </span>
            <el-button text :loading="loading" @click="refreshOverview">刷新</el-button>
          </div>
        </div>

        <div class="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div class="toolbar-card p-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="metric-label">执行队列</p>
                <p class="mt-1 text-sm text-slate-600">
                  运行中 {{ displayNumber(queueRunningCount) }}，排队中 {{ displayNumber(queueQueuedCount) }}
                </p>
              </div>
              <el-tag round type="info">总计 {{ displayNumber(overview.runtime.queueLength) }}</el-tag>
            </div>

            <div v-if="overview.runtime.queuedTasks.length" class="mt-4 grid gap-3">
              <div v-for="queued in overview.runtime.queuedTasks" :key="queued.executionId" class="rounded-2xl border border-slate-200/70 bg-white/85 p-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="text-sm font-semibold text-slate-900">任务 #{{ queued.taskId }}</div>
                  <el-tag size="small" :type="queued.status === 'running' ? 'success' : 'info'">
                    {{ queued.status === "running" ? "运行中" : "排队中" }}
                  </el-tag>
                </div>
                <div class="mt-1 text-xs text-slate-500">执行批次 #{{ queued.executionId }}</div>
              </div>
            </div>
            <el-empty v-else class="mt-2" description="当前没有运行或排队中的任务" :image-size="84" />
          </div>

          <div class="toolbar-card p-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="metric-label">最近失败任务</p>
                <p class="mt-1 text-sm text-slate-600">保留最新 5 条异常记录</p>
              </div>
              <el-button text @click="router.push('/crawleer/task-list')">去任务列表</el-button>
            </div>

            <div v-if="overview.recentFailedTasks.length" class="mt-4 grid gap-3">
              <article v-for="failure in overview.recentFailedTasks" :key="failure.executionId" class="rounded-2xl border border-rose-100 bg-rose-50/65 p-4">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h3 class="truncate text-sm font-semibold text-slate-900">{{ failure.taskName }}</h3>
                    <p class="mt-1 truncate text-xs text-slate-500">{{ failure.taskUrl }}</p>
                  </div>
                  <span class="text-xs text-slate-400">{{ formatDate(failure.startTime) }}</span>
                </div>
                <p class="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{{ failure.log || "暂无日志详情" }}</p>
              </article>
            </div>
            <el-empty v-else class="mt-2" description="近期没有失败记录" :image-size="84" />
          </div>
        </div>
      </article>

      <article class="surface-card p-5 sm:p-6">
        <div class="page-header">
          <div>
            <h2 class="section-title">待处理异常</h2>
            <p class="section-description">这里汇总未读的关键通知，可直接标记已读或跳转到相关页面。</p>
          </div>
          <el-tag round type="danger">{{ displayNumber(overview.pendingExceptions.length) }} 条</el-tag>
        </div>

        <div v-if="overview.pendingExceptions.length" class="mt-5 grid gap-3">
          <article v-for="item in overview.pendingExceptions" :key="item.id" class="rounded-2xl border p-4" :class="getExceptionClass(item.level)">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-slate-900">{{ item.title }}</p>
                <p class="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{{ item.content }}</p>
              </div>
              <span class="text-xs text-slate-400">{{ formatDate(item.createdAt) }}</span>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <el-button size="small" text type="primary" :loading="handlingNotificationId === item.id && notificationAction === 'open'" @click="handleOpenException(item)">查看</el-button>
              <el-button size="small" text :loading="handlingNotificationId === item.id && notificationAction === 'read'" @click="markExceptionRead(item.id)">标记已读</el-button>
            </div>
          </article>
        </div>
        <el-empty v-else class="mt-6" description="当前没有待处理的异常通知" :image-size="96" />
      </article>
    </section>

    <section class="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <article class="surface-card p-5 sm:p-6">
        <div class="page-header">
          <div>
            <h2 class="section-title">今日执行概览</h2>
            <p class="section-description">把今天的执行结果浓缩成可快速扫视的数字。</p>
          </div>
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          <div class="toolbar-card p-4"><p class="metric-label">总执行数</p><p class="mt-2 text-2xl font-bold text-slate-900">{{ displayNumber(overview.today.executions) }}</p></div>
          <div class="toolbar-card p-4"><p class="metric-label">成功</p><p class="mt-2 text-2xl font-bold text-emerald-600">{{ displayNumber(overview.today.success) }}</p></div>
          <div class="toolbar-card p-4"><p class="metric-label">失败</p><p class="mt-2 text-2xl font-bold text-rose-600">{{ displayNumber(overview.today.failed) }}</p></div>
        </div>
      </article>

      <article class="surface-card p-5 sm:p-6">
        <div class="page-header">
          <div>
            <h2 class="section-title">整理状态</h2>
            <p class="section-description">文件夹、标签和收藏会直接影响任务列表的查找效率。</p>
          </div>
          <el-button text @click="router.push('/crawleer/task-list')">去整理任务</el-button>
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          <div class="toolbar-card p-4"><p class="metric-label">文件夹</p><p class="mt-2 text-2xl font-bold text-slate-900">{{ displayNumber(overview.organization.folders) }}</p></div>
          <div class="toolbar-card p-4"><p class="metric-label">标签</p><p class="mt-2 text-2xl font-bold text-slate-900">{{ displayNumber(overview.organization.tags) }}</p></div>
          <div class="toolbar-card p-4"><p class="metric-label">收藏任务</p><p class="mt-2 text-2xl font-bold text-slate-900">{{ displayNumber(overview.organization.favorites) }}</p></div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { getWorkspaceOverviewApi, type WorkspaceOverview } from "@/api/task";
import { markNotificationReadApi } from "@/api/notification";

const router = useRouter();
const loading = ref(false);
const loaded = ref(false);
const handlingNotificationId = ref<number | null>(null);
const notificationAction = ref<"open" | "read" | null>(null);

function createDefaultOverview(): WorkspaceOverview {
  return {
    runtime: { totalTasks: 0, runningTasks: 0, successTasks: 0, failedTasks: 0, queueLength: 0, isProcessing: false, queuedTasks: [] },
    today: { executions: 0, success: 0, failed: 0 },
    recentFailedTasks: [],
    pendingExceptions: [],
    organization: { folders: 0, tags: 0, favorites: 0 },
  };
}

const overview = reactive<WorkspaceOverview>(createDefaultOverview());

const queueRunningCount = computed(
  () => overview.runtime.queuedTasks.filter((item) => item.status === "running").length,
);

const queueQueuedCount = computed(
  () => overview.runtime.queuedTasks.filter((item) => item.status !== "running").length,
);

const queueMetricNote = computed(() => {
  if (!overview.runtime.queueLength) {
    return overview.runtime.isProcessing ? "执行器处理中" : "执行器空闲";
  }

  return `运行中 ${queueRunningCount.value}，排队中 ${queueQueuedCount.value}`;
});

const queueStatusLabel = computed(() => {
  if (queueRunningCount.value > 0) {
    return `${queueRunningCount.value} 个运行中`;
  }

  if (queueQueuedCount.value > 0) {
    return `${queueQueuedCount.value} 个排队中`;
  }

  return "空闲中";
});

function assignOverview(value: WorkspaceOverview) {
  Object.assign(overview.runtime, value.runtime);
  Object.assign(overview.today, value.today);
  Object.assign(overview.organization, value.organization);
  overview.recentFailedTasks = value.recentFailedTasks;
  overview.pendingExceptions = value.pendingExceptions;
}

async function refreshOverview() {
  try {
    loading.value = true;
    const response = await getWorkspaceOverviewApi();
    assignOverview(response);
    loaded.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载工作台失败");
  } finally {
    loading.value = false;
  }
}

function displayNumber(value: number) {
  return loaded.value ? value : "--";
}

function formatDate(value?: string | null) {
  if (!value) return "--";
  try {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

function getExceptionClass(level: string) {
  if (level === "error") return "border-rose-100 bg-rose-50/70";
  if (level === "warning") return "border-amber-100 bg-amber-50/80";
  if (level === "success") return "border-emerald-100 bg-emerald-50/80";
  return "border-slate-200 bg-slate-50/80";
}

async function markExceptionRead(id: number) {
  try {
    handlingNotificationId.value = id;
    notificationAction.value = "read";
    await markNotificationReadApi(id);
    await refreshOverview();
    ElMessage.success("通知已标记为已读");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "操作失败");
  } finally {
    handlingNotificationId.value = null;
    notificationAction.value = null;
  }
}

async function handleOpenException(item: WorkspaceOverview["pendingExceptions"][number]) {
  try {
    handlingNotificationId.value = item.id;
    notificationAction.value = "open";
    await markNotificationReadApi(item.id);
    await refreshOverview();
    if (item.link) {
      await router.push(item.link);
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "打开通知失败");
  } finally {
    handlingNotificationId.value = null;
    notificationAction.value = null;
  }
}

onMounted(() => {
  void refreshOverview();
});
</script>
