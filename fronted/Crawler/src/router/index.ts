import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";
import { useUserStore } from "@/stores/user";
import BaseLayout from "@/layouts/BaseLayout.vue";
import NotFound from "@/views/NotFound.vue";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/Login.vue"),
    meta: { title: "登录" },
  },
  {
    path: "/",
    component: BaseLayout,
    redirect: "/crawleer/workspace",
    children: [
      {
        path: "crawleer/workspace",
        name: "workspace",
        component: () => import("@/views/WorkspaceOverview.vue"),
        meta: { title: "工作台" },
      },
      {
        path: "crawleer/task-list",
        name: "task-list",
        component: () => import("@/views/TaskList.vue"),
        meta: { title: "任务列表" },
      },
      {
        path: "crawleer/templates",
        name: "task-templates",
        component: () => import("@/views/TaskTemplates.vue"),
        meta: { title: "模板中心" },
      },
      {
        path: "crawleer/statistics",
        name: "statistics",
        component: () => import("@/views/Statistics.vue"),
        meta: { title: "统计分析" },
      },
      {
        path: "crawleer/task-add",
        name: "task-add",
        component: () => import("@/views/task-add/TaskAdd.vue"),
        meta: { title: "新建任务", keepAlive: true },
        children: [
          {
            path: "basic",
            component: () => import("@/views/task-add/Step1BasicInfo.vue"),
            meta: { title: "基础信息", keepAlive: true },
          },
          {
            path: "structure",
            component: () => import("@/views/task-add/Step2StructureSelect.vue"),
            meta: { title: "结构选择", keepAlive: true },
          },
          {
            path: "mapping",
            component: () => import("@/views/task-add/Step3FieldMapping.vue"),
            meta: { title: "字段映射", keepAlive: true },
          },
          {
            path: "config",
            component: () => import("@/views/task-add/Step4Config.vue"),
            meta: { title: "执行配置", keepAlive: true },
          },
          {
            path: "preview",
            component: () => import("@/views/task-add/Step5Preview.vue"),
            meta: { title: "执行预览", keepAlive: true },
          },
        ],
      },
      {
        path: "admin/users",
        name: "admin-users",
        component: () => import("@/views/admin/UserManagement.vue"),
        meta: { title: "用户管理", keepAlive: true, adminOnly: true },
      },
      {
        path: "admin/tasks",
        name: "admin-tasks",
        component: () => import("@/views/admin/TaskMonitoring.vue"),
        meta: { title: "任务监控", keepAlive: true, adminOnly: true },
      },
      {
        path: "admin/logs",
        name: "admin-logs",
        component: () => import("@/views/admin/SystemLogs.vue"),
        meta: { title: "系统日志", keepAlive: true, adminOnly: true },
      },
      {
        path: "admin/settings",
        name: "admin-settings",
        component: () => import("@/views/admin/SystemSettings.vue"),
        meta: { title: "系统设置", keepAlive: true, adminOnly: true },
      },
      {
        path: "account/profile",
        name: "user-profile",
        component: () => import("@/views/UserProfile.vue"),
        meta: { title: "个人资料", keepAlive: true },
      },
      {
        path: "account/cookies",
        name: "cookie-credentials",
        component: () => import("@/views/CookieCredentials.vue"),
        meta: { title: "Cookie 凭证", keepAlive: true },
      },
    ],
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: NotFound,
    meta: { title: "页面不存在" },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const userStore = useUserStore();

  if (!userStore.checked) {
    await userStore.init();
  }

  const isLoggedIn = Boolean(userStore.user);

  if (to.path === "/login") {
    return isLoggedIn ? { path: "/" } : true;
  }

  if (!isLoggedIn) {
    return { path: "/login" };
  }

  if (to.meta.adminOnly && userStore.user?.role !== "admin") {
    return { path: "/" };
  }

  return true;
});

router.afterEach((to) => {
  const routeTitle = String(to.meta.title || "Crawlee Workspace");
  document.title = `${routeTitle} | Crawlee Workspace`;
});

export default router;
