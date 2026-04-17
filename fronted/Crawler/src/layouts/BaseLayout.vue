<template>
  <div class="min-h-screen bg-transparent">
    <aside class="sidebar-shell hidden lg:flex">
      <div class="sidebar-panel">
        <div class="sidebar-content">
          <section class="surface-card sidebar-brand-card">
            <p class="metric-label">
              {{ platformInfo?.systemName || "Crawlee Workspace" }}
            </p>
            <h2 class="sidebar-brand-card__title">数据采集工作台</h2>
            <p class="sidebar-brand-card__description">
              {{ platformInfo?.systemDescription || "围绕任务、模板、通知与后台管理统一协作。" }}
            </p>
          </section>

          <nav class="sidebar-nav">
            <el-collapse v-model="activeMenuGroup" accordion class="sidebar-collapse">
              <el-collapse-item
                v-for="group in menuGroups"
                :key="group.key"
                :name="group.key"
                class="sidebar-collapse-item"
              >
                <template #title>
                  <div class="sidebar-group-title">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-slate-900">
                        {{ group.title }}
                      </p>
                      <p class="sidebar-group-title__summary text-xs text-slate-400">
                        {{ group.summary }}
                      </p>
                    </div>
                  </div>
                </template>

                <div class="grid gap-2 pb-1">
                  <RouterLink
                    v-for="item in group.items"
                    :key="item.path"
                    :to="item.path"
                    class="sidebar-link"
                    :class="isActive(item.path) ? 'sidebar-link--active' : ''"
                  >
                    <div
                      class="sidebar-link__icon"
                      :class="isActive(item.path) ? 'sidebar-link__icon--active' : ''"
                    >
                      <el-icon :size="18">
                        <component :is="item.icon" />
                      </el-icon>
                    </div>

                    <div class="sidebar-link__meta min-w-0 flex-1">
                      <div class="truncate text-sm font-semibold">
                        {{ item.label }}
                      </div>
                      <div class="sidebar-link__description truncate text-xs text-slate-400">
                        {{ item.description }}
                      </div>
                    </div>
                  </RouterLink>
                </div>
              </el-collapse-item>
            </el-collapse>
          </nav>
        </div>

        <RouterLink
          to="/account/profile"
          class="surface-card sidebar-profile transition-transform duration-200 hover:-translate-y-0.5"
        >
          <el-avatar :size="46" :src="avatarUrl">
            {{ avatarUrl ? "" : userStore.user?.username?.slice(0, 1) }}
          </el-avatar>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold text-slate-900">
              {{ userStore.user?.username }}
            </div>
            <div class="truncate text-xs text-slate-500">
              {{ userStore.user?.email }}
            </div>
          </div>
        </RouterLink>
      </div>
    </aside>

    <div class="layout-main">
      <header class="layout-header">
        <div
          class="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"
        >
          <div class="flex min-w-0 items-center gap-3">
            <el-button class="mobile-nav-trigger lg:hidden" circle plain @click="mobileNavVisible = true">
              <el-icon><Operation /></el-icon>
            </el-button>

            <div class="min-w-0">
              <p class="truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {{ platformInfo?.systemName || "Crawlee Workspace" }}
              </p>
              <h1 class="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                {{ currentTitle }}
              </h1>
              <p v-if="currentSubtitle" class="hidden truncate text-xs text-slate-500 sm:block">
                {{ currentSubtitle }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 sm:gap-3">
            <el-button class="hidden sm:inline-flex" plain @click="goToCreateTask">
              新建任务
            </el-button>

            <el-badge :value="unreadCount" :hidden="!unreadCount">
              <el-button circle plain @click="notificationVisible = true">
                <el-icon><Bell /></el-icon>
              </el-button>
            </el-badge>

            <el-dropdown trigger="click">
              <button type="button" class="account-switcher">
                <el-avatar :size="34" :src="avatarUrl">
                  {{ avatarUrl ? "" : userStore.user?.username?.slice(0, 1) }}
                </el-avatar>
                <div class="hidden text-left sm:block">
                  <div class="max-w-[140px] truncate text-sm font-semibold text-slate-900">
                    {{ userStore.user?.username }}
                  </div>
                  <div class="max-w-[160px] truncate text-xs text-slate-500">
                    {{ userStore.user?.role === "admin" ? "管理员" : "普通成员" }}
                  </div>
                </div>
                <el-icon class="hidden text-slate-400 sm:block"><ArrowDown /></el-icon>
              </button>

              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="router.push('/account/profile')">
                    个人资料
                  </el-dropdown-item>
                  <el-dropdown-item @click="router.push('/account/cookies')">
                    Cookie 凭证
                  </el-dropdown-item>
                  <el-dropdown-item @click="router.push('/crawleer/templates')">
                    模板中心
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="handleLogout">
                    退出登录
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </header>

      <main class="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div class="mx-auto flex max-w-[1600px] flex-col gap-4 lg:gap-6">
          <PlatformAnnouncementBanner :platform-info="platformInfo" />

          <div class="app-page">
            <router-view />
          </div>
        </div>
      </main>
    </div>

    <el-drawer
      v-model="mobileNavVisible"
      direction="ltr"
      size="280px"
      :with-header="false"
      class="lg:hidden"
    >
      <div class="mobile-drawer-shell">
        <section class="surface-card p-4">
          <p class="metric-label">
            {{ platformInfo?.systemName || "Crawlee Workspace" }}
          </p>
          <h2 class="sidebar-brand-card__title mt-2">数据采集工作台</h2>
          <p class="sidebar-brand-card__description mt-2">
            {{ platformInfo?.systemDescription || "围绕任务、模板、通知与后台管理统一协作。" }}
          </p>
        </section>

        <nav class="grid gap-4">
          <el-collapse v-model="activeMenuGroup" accordion class="sidebar-collapse">
            <el-collapse-item
              v-for="group in menuGroups"
              :key="group.key"
              :name="group.key"
              class="sidebar-collapse-item"
            >
              <template #title>
                <div class="sidebar-group-title">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-900">
                      {{ group.title }}
                    </p>
                    <p class="sidebar-group-title__summary text-xs text-slate-400">
                      {{ group.summary }}
                    </p>
                  </div>
                </div>
              </template>

              <div class="grid gap-2 pb-1">
                <button
                  v-for="item in group.items"
                  :key="item.path"
                  type="button"
                  class="sidebar-link text-left"
                  :class="isActive(item.path) ? 'sidebar-link--active' : ''"
                  @click="navigate(item.path)"
                >
                  <div
                    class="sidebar-link__icon"
                    :class="isActive(item.path) ? 'sidebar-link__icon--active' : ''"
                  >
                    <el-icon :size="18">
                      <component :is="item.icon" />
                    </el-icon>
                  </div>

                  <div class="sidebar-link__meta min-w-0 flex-1">
                    <div class="truncate text-sm font-semibold">
                      {{ item.label }}
                    </div>
                    <div class="sidebar-link__description truncate text-xs text-slate-400">
                      {{ item.description }}
                    </div>
                  </div>
                </button>
              </div>
            </el-collapse-item>
          </el-collapse>
        </nav>

        <div class="mt-auto flex gap-2">
          <el-button class="flex-1" plain @click="navigate('/account/profile')">
            个人资料
          </el-button>
          <el-button class="flex-1" type="danger" plain @click="handleLogout">
            退出登录
          </el-button>
        </div>
      </div>
    </el-drawer>

    <NotificationCenter
      v-model="notificationVisible"
      @unread-change="handleUnreadChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  ArrowDown,
  Bell,
  DataAnalysis,
  DocumentCopy,
  Files,
  HomeFilled,
  Key,
  Operation,
  Reading,
  Setting,
  User,
  UserFilled,
} from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { RouterLink, useRoute, useRouter } from "vue-router";
import NotificationCenter from "@/components/NotificationCenter.vue";
import PlatformAnnouncementBanner from "@/components/PlatformAnnouncementBanner.vue";
import { getNotificationsApi } from "@/api/notification";
import { usePlatformInfo } from "@/composables/usePlatformInfo";
import { useUserStore } from "@/stores/user";
import { getAvatarUrl } from "@/utils/avatar";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { platformInfo, fetchPlatformInfo } = usePlatformInfo();

const activeMenuGroup = ref<string | number>("overview");
const mobileNavVisible = ref(false);
const notificationVisible = ref(false);
const unreadCount = ref(0);

const avatarUrl = computed(() => getAvatarUrl(userStore.user?.avatar));

const menuGroups = computed(() => {
  const groups = [
    {
      key: "overview",
      title: "总览",
      summary: "工作台与高频入口",
      items: [
        {
          label: "工作台",
          description: "运行概览、通知与待处理异常",
          path: "/crawleer/workspace",
          icon: HomeFilled,
        },
        {
          label: "任务清单",
          description: "截图预览、整理信息与执行结果",
          path: "/crawleer/task-list",
          icon: Reading,
        },
        {
          label: "模板中心",
          description: "复用任务配置并沉淀标准模板",
          path: "/crawleer/templates",
          icon: Files,
        },
        {
          label: "统计分析",
          description: "查看执行趋势与成功分布",
          path: "/crawleer/statistics",
          icon: DataAnalysis,
        },
      ],
    },
    {
      key: "account",
      title: "账户",
      summary: "个人资料与账号设置",
      items: [
        {
          label: "个人资料",
          description: "头像、账号信息与密码设置",
          path: "/account/profile",
          icon: User,
        },
        {
          label: "Cookie 凭证",
          description: "查看、更新站点登录态并支持任务自动匹配",
          path: "/account/cookies",
          icon: Key,
        },
      ],
    },
  ];

  if (userStore.user?.role === "admin") {
    groups.splice(1, 0, {
      key: "management",
      title: "管理",
      summary: "后台监控与系统配置",
      items: [
        {
          label: "用户管理",
          description: "成员、角色与账号状态",
          path: "/admin/users",
          icon: UserFilled,
        },
        {
          label: "任务监控",
          description: "执行状态、队列与停止任务",
          path: "/admin/tasks",
          icon: DocumentCopy,
        },
        {
          label: "系统日志",
          description: "排障审计与错误定位",
          path: "/admin/logs",
          icon: Files,
        },
        {
          label: "系统设置",
          description: "公告、维护与存储策略",
          path: "/admin/settings",
          icon: Setting,
        },
      ],
    });
  }

  return groups;
});

const activeMenuItem = computed(() =>
  menuGroups.value
    .flatMap((group) => group.items)
    .find((item) => route.path.startsWith(item.path)),
);

const currentTitle = computed(() => {
  if (route.path.startsWith("/crawleer/task-add")) {
    return "新建任务";
  }

  return activeMenuItem.value?.label || String(route.meta.title || "工作台");
});

const currentSubtitle = computed(() => {
  if (route.path.startsWith("/crawleer/task-add")) {
    return "按步骤完成抓取配置、字段映射与执行参数设置。";
  }

  return activeMenuItem.value?.description || "";
});

function getMatchedMenuGroup() {
  return (
    menuGroups.value.find((group) =>
      group.items.some((item) => route.path.startsWith(item.path)),
    )?.key ||
    menuGroups.value[0]?.key ||
    "overview"
  );
}

function isActive(path: string) {
  return route.path.startsWith(path);
}

function navigate(path: string) {
  mobileNavVisible.value = false;
  void router.push(path);
}

function goToCreateTask() {
  mobileNavVisible.value = false;
  void router.push("/crawleer/task-add/basic");
}

async function refreshUnreadCount() {
  try {
    const response = await getNotificationsApi({
      status: "unread",
      page: 1,
      limit: 1,
    });
    unreadCount.value = response.unreadCount;
  } catch {
    unreadCount.value = 0;
  }
}

function handleUnreadChange(count: number) {
  unreadCount.value = count;
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm("确定要退出当前账号吗？", "提示", {
      confirmButtonText: "退出登录",
      cancelButtonText: "取消",
      type: "warning",
    });

    await userStore.logout();
    mobileNavVisible.value = false;
    notificationVisible.value = false;
    await router.push("/login");
  } catch (error) {
    if (error !== "cancel") {
      console.error("Logout failed:", error);
    }
  }
}

watch(
  [() => route.fullPath, menuGroups],
  () => {
    activeMenuGroup.value = getMatchedMenuGroup();
    mobileNavVisible.value = false;
  },
  { immediate: true },
);

onMounted(() => {
  void fetchPlatformInfo();
  void refreshUnreadCount();
});
</script>

<style scoped>
.sidebar-shell {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 40;
  width: 296px;
  padding: 0.75rem;
}

.sidebar-panel {
  display: flex;
  min-height: 0;
  height: calc(100vh - 1.5rem);
  width: 100%;
  flex-direction: column;
  gap: 0.9rem;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.sidebar-content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.9rem;
  overflow: hidden;
  padding: 0.9rem;
}

.sidebar-brand-card {
  flex-shrink: 0;
  border-radius: 22px;
  padding: 1.15rem;
}

.sidebar-brand-card__title {
  margin: 0.45rem 0 0;
  font-size: 1.32rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #0f172a;
}

.sidebar-brand-card__description {
  margin: 0.45rem 0 0;
  color: #64748b;
  font-size: 0.88rem;
  line-height: 1.6;
}

.sidebar-nav {
  display: flex;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.sidebar-profile {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0.9rem 0.9rem;
  padding: 0.95rem 1rem;
  border-radius: 22px;
}

.layout-main {
  min-width: 0;
}

@media (min-width: 1024px) {
  .layout-main {
    padding-left: 296px;
  }

  .mobile-nav-trigger {
    display: none !important;
  }
}

.layout-header {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
}

.account-switcher {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 999px;
  background: #ffffff;
  padding: 0.35rem 0.55rem;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;
  cursor: pointer;
}

.account-switcher:hover {
  border-color: rgba(148, 163, 184, 0.85);
  background: #f8fafc;
  transform: translateY(-1px);
}

.mobile-drawer-shell {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 1rem;
}

.sidebar-collapse {
  width: 100%;
  border: none;
  background: transparent;
}

.sidebar-collapse :deep(.el-collapse-item) {
  margin-bottom: 0.55rem;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
  overflow: hidden;
}

.sidebar-collapse :deep(.el-collapse-item__header) {
  min-height: 58px;
  border: none;
  background: transparent;
  padding: 0 1rem;
  line-height: normal;
}

.sidebar-collapse :deep(.el-collapse-item__wrap) {
  border: none;
  background: transparent;
  overflow: hidden;
}

.sidebar-collapse :deep(.el-collapse-item__content) {
  padding: 0 0.75rem 0.75rem;
}

.sidebar-group-title {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-right: 0.5rem;
}

.sidebar-group-title__summary {
  margin-top: 0.15rem;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: 18px;
  padding: 0.75rem;
  color: #475569;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease,
    color 0.2s ease;
}

.sidebar-link:hover {
  background: #f8fafc;
  color: #0f172a;
  transform: translateY(-1px);
}

.sidebar-link--active {
  background:
    linear-gradient(135deg, rgba(12, 92, 171, 0.12), rgba(59, 130, 246, 0.05));
  color: #0c5cab;
  box-shadow: inset 0 0 0 1px rgba(12, 92, 171, 0.12);
}

.sidebar-link__icon {
  display: flex;
  height: 2.55rem;
  width: 2.55rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: #f1f5f9;
  color: #64748b;
}

.sidebar-link__icon--active {
  background: #dbeafe;
  color: #0c5cab;
}

.sidebar-link__meta {
  min-width: 0;
}

.sidebar-link__description {
  margin-top: 0.15rem;
}

@media (max-height: 940px) {
  .sidebar-content {
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .sidebar-brand-card {
    padding: 0.95rem;
  }

  .sidebar-profile {
    margin: 0 0.75rem 0.75rem;
    padding: 0.8rem 0.9rem;
  }

  .sidebar-collapse :deep(.el-collapse-item__header) {
    min-height: 54px;
    padding: 0 0.9rem;
  }

  .sidebar-link {
    padding: 0.68rem;
  }

  .sidebar-link__icon {
    height: 2.3rem;
    width: 2.3rem;
    border-radius: 14px;
  }
}

@media (max-height: 860px) {
  .sidebar-brand-card__description,
  .sidebar-group-title__summary,
  .sidebar-link__description {
    display: none;
  }

  .sidebar-brand-card__title {
    font-size: 1.12rem;
  }
}

@media (max-height: 760px) {
  .sidebar-shell {
    padding: 0.5rem;
  }

  .sidebar-panel {
    height: calc(100vh - 1rem);
    gap: 0.7rem;
  }

  .sidebar-content {
    gap: 0.6rem;
    padding: 0.65rem;
  }

  .sidebar-profile {
    margin: 0 0.65rem 0.65rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .account-switcher,
  .sidebar-link,
  .sidebar-profile {
    transition: none;
  }
}
</style>
