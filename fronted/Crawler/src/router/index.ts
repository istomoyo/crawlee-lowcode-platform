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
            component: () => import("@/views/task-add/Step4Preview.vue"),
            meta: { keepAlive: true },
          },
        ],
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

  return true;
});

export default router;
