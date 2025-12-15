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
        ],
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

  // 尝试从 session 恢复
  if (!store.user) {
    const saved = sessionStorage.getItem("user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // ✅ 确认至少有 id 或 email
        if (parsed && parsed.id) {
          store.user = parsed;
          return { path: "/login" };
        }
      } catch {
        store.user = null;
      }
    }
  }

  const isLogin = !!store.user;

  if (to.path === "/login") {
    return isLogin ? { path: "/" } : true;
  }

  if (!isLogin) {
    return { path: "/login" };
  }

  return true;
});

export default router;
