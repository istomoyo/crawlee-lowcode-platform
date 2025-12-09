import { createRouter, createWebHistory } from "vue-router"; // 运行时函数
import type { RouteRecordRaw } from "vue-router"; // 类型

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
    redirect: "/tasks",
    children: [
      {
        path: "tasks",
        name: "task-list",
        component: () => import("@/views/TaskList.vue"),
      },
      {
        path: "tasks/edit/:id?",
        name: "task-edit",
        component: () => import("@/views/TaskEdit.vue"),
      },
      {
        path: "users",
        name: "user-list",
        component: () => import("@/views/UserList.vue"),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem("token");
  if (to.path === "/login") return next();
  if (!token) return next("/login");
  next();
});

export default router;
