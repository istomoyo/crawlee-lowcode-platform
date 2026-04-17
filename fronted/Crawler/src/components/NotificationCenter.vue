<template>
  <el-drawer
    v-model="drawerVisible"
    :size="drawerSize"
    :with-header="false"
    class="notification-drawer"
  >
    <div class="page-shell h-full">
      <header class="page-header">
        <div>
          <p class="metric-label">通知中心</p>
          <h2 class="page-title !text-2xl">系统通知</h2>
          <p class="page-description">
            聚合任务异常、执行结果和平台公告，点击后可快速跳转处理。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <el-tag round type="primary">{{ unreadCount }} 未读</el-tag>
          <el-button text @click="refreshNotifications">刷新</el-button>
        </div>
      </header>

      <section class="toolbar-card p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <el-radio-group v-model="status" size="small">
            <el-radio-button label="all">全部</el-radio-button>
            <el-radio-button label="unread">未读</el-radio-button>
            <el-radio-button label="read">已读</el-radio-button>
          </el-radio-group>

          <el-button
            text
            :disabled="!unreadCount"
            @click="handleMarkAllRead"
          >
            全部设为已读
          </el-button>
        </div>
      </section>

      <section class="surface-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div v-loading="loading" class="min-h-0 flex-1">
          <div
            v-if="notifications.length"
            class="app-scrollbar grid max-h-full gap-3 overflow-y-auto p-4"
          >
            <button
              v-for="item in notifications"
              :key="item.id"
              type="button"
              class="notification-item text-left"
              :class="item.isRead ? 'opacity-85' : 'notification-item--unread'"
              @click="handleOpenNotification(item)"
            >
              <div class="flex items-start gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                  :class="getLevelMeta(item.level).wrapClass"
                >
                  <el-icon :size="18">
                    <component :is="getLevelMeta(item.level).icon" />
                  </el-icon>
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="truncate text-sm font-semibold text-slate-900">
                          {{ item.title }}
                        </p>
                        <span
                          v-if="!item.isRead"
                          class="dot bg-indigo-500"
                        />
                      </div>
                      <p class="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                        {{ item.content }}
                      </p>
                    </div>
                    <span class="text-xs text-slate-400">
                      {{ formatDate(item.createdAt) }}
                    </span>
                  </div>

                  <div class="mt-3 flex flex-wrap items-center gap-2">
                    <span class="inline-chip">{{ mapType(item.type) }}</span>
                    <el-button
                      v-if="!item.isRead"
                      size="small"
                      text
                      @click.stop="handleMarkRead(item)"
                    >
                      标记已读
                    </el-button>
                    <el-button
                      v-if="item.link"
                      size="small"
                      text
                      type="primary"
                      @click.stop="handleOpenNotification(item)"
                    >
                      查看详情
                    </el-button>
                  </div>
                </div>
              </div>
            </button>
          </div>

          <div v-else class="flex h-full items-center justify-center p-6">
            <el-empty description="当前没有符合条件的通知" />
          </div>
        </div>

        <footer class="border-t border-slate-100 px-4 py-3">
          <div class="flex justify-end">
            <el-pagination
              small
              background
              layout="prev, pager, next"
              :current-page="pagination.page"
              :page-size="pagination.limit"
              :total="pagination.total"
              @current-change="handlePageChange"
            />
          </div>
        </footer>
      </section>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  InfoFilled,
  SuccessFilled,
  WarningFilled,
} from "@element-plus/icons-vue";
import {
  getNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  type NotificationItem,
  type NotificationLevel,
  type NotificationStatus,
} from "@/api/notification";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "unread-change", count: number): void;
}>();

const router = useRouter();
const status = ref<NotificationStatus>("all");
const loading = ref(false);
const notifications = ref<NotificationItem[]>([]);
const unreadCount = ref(0);
const pagination = ref({
  page: 1,
  limit: 12,
  total: 0,
  totalPages: 0,
});

const drawerVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const drawerSize = computed(() => "min(94vw, 420px)");

function getLevelMeta(level: NotificationLevel) {
  switch (level) {
    case "success":
      return {
        wrapClass: "bg-emerald-100 text-emerald-700",
        icon: SuccessFilled,
      };
    case "warning":
      return {
        wrapClass: "bg-amber-100 text-amber-700",
        icon: WarningFilled,
      };
    case "error":
      return {
        wrapClass: "bg-rose-100 text-rose-700",
        icon: WarningFilled,
      };
    default:
      return {
        wrapClass: "bg-indigo-100 text-indigo-700",
        icon: InfoFilled,
      };
  }
}

function mapType(type: string) {
  if (type.includes("failure")) return "异常提醒";
  if (type.includes("success")) return "执行成功";
  if (type.includes("maintenance")) return "维护通知";
  return "系统消息";
}

function formatDate(value: string) {
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

async function fetchNotifications() {
  try {
    loading.value = true;
    const response = await getNotificationsApi({
      status: status.value,
      page: pagination.value.page,
      limit: pagination.value.limit,
    });
    notifications.value = response.items;
    unreadCount.value = response.unreadCount;
    pagination.value = {
      ...pagination.value,
      ...response.pagination,
    };
    emit("unread-change", response.unreadCount);
  } catch (error) {
    notifications.value = [];
    ElMessage.error(error instanceof Error ? error.message : "加载通知失败");
  } finally {
    loading.value = false;
  }
}

async function refreshNotifications() {
  pagination.value.page = 1;
  await fetchNotifications();
}

async function handleMarkRead(item: NotificationItem) {
  if (item.isRead) {
    return;
  }

  await markNotificationReadApi(item.id);
  await fetchNotifications();
}

async function handleMarkAllRead() {
  try {
    await markAllNotificationsReadApi();
    await fetchNotifications();
    ElMessage.success("通知已全部标记为已读");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "操作失败");
  }
}

async function handleOpenNotification(item: NotificationItem) {
  try {
    if (!item.isRead) {
      await markNotificationReadApi(item.id);
      unreadCount.value = Math.max(0, unreadCount.value - 1);
      emit("unread-change", unreadCount.value);
    }

    if (item.link) {
      await router.push(item.link);
      drawerVisible.value = false;
    } else {
      await fetchNotifications();
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "处理通知失败");
  }
}

function handlePageChange(page: number) {
  pagination.value.page = page;
  void fetchNotifications();
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      void fetchNotifications();
    }
  },
);

watch(status, () => {
  pagination.value.page = 1;
  if (drawerVisible.value) {
    void fetchNotifications();
  }
});
</script>

<style scoped>
.notification-item {
  border: 1px solid rgba(226, 232, 240, 0.85);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.88);
  padding: 1rem;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
  cursor: pointer;
}

.notification-item:hover {
  transform: translateY(-1px);
  border-color: rgba(99, 102, 241, 0.24);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.notification-item--unread {
  border-color: rgba(99, 102, 241, 0.26);
  background:
    linear-gradient(135deg, rgba(99, 102, 241, 0.06), transparent 60%),
    rgba(255, 255, 255, 0.96);
}
</style>
