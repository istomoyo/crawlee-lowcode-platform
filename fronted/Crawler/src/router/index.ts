import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";
import { useUserStore } from "@/stores/user";
import NotFound from "@/views/NotFound.vue"; // 404 页面组件
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
        path: "crawleer/task-add",
        name: "task-add",
        component: () => import("@/views/TaskAdd.vue"),
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
  const userStore = useUserStore();

  // 登录页逻辑
  if (to.path === "/login") {
    if (userStore.user) return { path: "/" }; // 已登录 → 跳首页
    return true;
  }

  // 非登录页逻辑
  if (userStore.user) return true; // 已有用户信息 → 放行

  // 尝试获取用户信息（只会请求一次）
  const user = await userStore.fetchUserInfo();
  if (!user) return { path: "/login" }; // 没有用户信息 → 强制跳登录页

  return true; // 有用户信息 → 放行
});

export default router;
