import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";
import { useUserStore } from "@/stores/user";
import NotFound from "@/views/NotFound.vue";
import BaseLayout from "@/layouts/BaseLayout.vue";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/Login.vue"),
  },
  {
    path: "/",
    component: BaseLayout,
    redirect: "/crawleer/task-list",
    children: [
      {
        path: "crawleer/task-list",
        name: "task-list",
        component: () => import("@/views/TaskList.vue"),
      },
      {
        path: "crawleer/statistics",
        name: "statistics",
        component: () => import("@/views/Statistics.vue"),
      },
      {
        path: "crawleer/task-add",
        name: "task-add",
        component: () => import("@/views/task-add/TaskAdd.vue"),
        meta: { keepAlive: true },
        children: [
          {
            path: "basic",
            component: () => import("@/views/task-add/Step1BasicInfo.vue"),
            meta: { keepAlive: true },
          },
          {
            path: "structure",
            component: () =>
              import("@/views/task-add/Step2StructureSelect.vue"),
            meta: { keepAlive: true },
          },
          {
            path: "mapping",
            component: () => import("@/views/task-add/Step3FieldMapping.vue"),
            meta: { keepAlive: true },
          },
          {
            path: "preview",
            component: () => import("@/views/task-add/Step5Preview.vue"),
            meta: { keepAlive: true },
          },

          {
            path: "config",
            component: () => import("@/views/task-add/Step4Config.vue"),
            meta: { keepAlive: true },
          },
        ],
      },
      {
        path: "admin/users",
        name: "admin-users",
        component: () => import("@/views/admin/UserManagement.vue"),
        meta: { keepAlive: true },
      },
      {
        path: "admin/tasks",
        name: "admin-tasks",
        component: () => import("@/views/admin/TaskMonitoring.vue"),
        meta: { keepAlive: true },
      },
      {
        path: "admin/logs",
        name: "admin-logs",
        component: () => import("@/views/admin/SystemLogs.vue"),
        meta: { keepAlive: true },
      },
      {
        path: "admin/settings",
        name: "admin-settings",
        component: () => import("@/views/admin/SystemSettings.vue"),
        meta: { keepAlive: true },
      },
      {
        path: "account/profile",
        name: "user-profile",
        component: () => import("@/views/UserProfile.vue"),
        meta: { keepAlive: true },
      },
    ],
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: NotFound,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const store = useUserStore();

  // 如果用户状态未初始化，尝试初始化
  if (!store.checked) {
    await store.init();
  }
  console.log("store.user :>> ", store.user);
  const isLogin = !!store.user;

  // 如果访问登录页
  if (to.path === "/login") {
    // 如果已登录，跳转到首页
    return isLogin ? { path: "/" } : true;
  }

  // 如果未登录，跳转到登录页
  if (!isLogin) {
    return { path: "/login" };
  }

  // 检查管理员权限
  const adminRoutes = ['/admin/users', '/admin/tasks', '/admin/logs', '/admin/settings'];
  const isAdminRoute = adminRoutes.some(route => to.path.startsWith(route));
  if (isAdminRoute && store.user?.role !== 'admin') {
    // 非管理员访问管理员页面，重定向到首页
    return { path: "/" };
  }

  return true;
});

export default router;
