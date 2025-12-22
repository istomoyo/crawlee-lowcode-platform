<template>
  <div class="w-screen flex h-screen overflow-hidden">
    <div
      class="flex h-screen flex-col justify-between border-e border-gray-100 bg-white max-w-[400px] min-w-[300px]"
    >
      <div class="px-4 py-6">
        <span
          class="grid h-10 w-fit place-content-center rounded-lg bg-gray-100 text-gray-600 font-mono font-extrabold text-xl p-2"
        >
          Crawlee-System
        </span>

        <ul class="mt-6 space-y-1">
          <template v-for="(item, idx) in menu" :key="idx">
            <!-- 没有子菜单 -->
            <li v-if="!item.children">
              <RouterLink
                :to="item.path!"
                class="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-100"
                :class="
                  isActive(item.path)
                    ? 'bg-indigo-200 text-indigo-800'
                    : 'text-gray-500'
                "
              >
                <span :class="item.class" class="text-xl"></span>
                <span class="">{{ item.label }}</span>
              </RouterLink>
            </li>

            <!-- 有子菜单 -->
            <li v-else>
              <details
                class="group [&_summary::-webkit-details-marker]:hidden"
                :open="item.children.some((c) => isActive(c.path))"
              >
                <summary
                  class="flex cursor-pointer items-center justify-between rounded-lg px-4 py-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  <span class="text-sm font-medium">{{ item.label }}</span>
                  <span
                    class="shrink-0 transition duration-300 group-open:-rotate-180"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="size-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      ></path>
                    </svg>
                  </span>
                </summary>

                <ul class="mt-2 space-y-1 px-4">
                  <li v-for="(child, cidx) in item.children" :key="cidx">
                    <RouterLink
                      v-if="child.label !== 'Logout'"
                      :to="child.path!"
                      class="rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-100 flex items-center gap-2"
                      :class="
                        isActive(child.path)
                          ? 'bg-indigo-200 text-indigo-800'
                          : 'text-gray-500'
                      "
                    >
                      <span :class="child.class" class="text-xl"></span>
                      {{ child.label }}
                    </RouterLink>
                    <button
                      v-else
                      @click="handleLogout"
                      class="w-full text-left rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-100 flex items-center gap-2 text-gray-500"
                    >
                      <span class="text-xl">🚪</span>
                      {{ child.label }}
                    </button>
                  </li>
                </ul>
              </details>
            </li>
          </template>
        </ul>
      </div>

      <!-- 头像区域 -->
      <div class="sticky inset-x-0 bottom-0 border-t border-gray-100">
        <RouterLink
          to="/account/profile"
          class="flex items-center gap-2 bg-white p-4 hover:bg-gray-50 cursor-pointer"
        >
          <el-avatar :size="50" :src="avatarUrl">{{
            avatarUrl ? "" : userStore.user?.username
          }}</el-avatar>
          <div>
            <p class="text-xs">
              <strong class="block font-extrabold font-mono">{{
                userStore.user?.username
              }}</strong>
              <span>{{ userStore.user?.email }}</span>
            </p>
          </div>
        </RouterLink>
      </div>
    </div>
    <div class="w-full h-screen min-w-0">
      <router-view />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useUserStore } from "@/stores/user";
import { useRoute, RouterLink, useRouter } from "vue-router";
import { onMounted, computed } from "vue";
import { getAvatarUrl } from "@/utils/avatar";
import { ElMessageBox } from "element-plus";

const userStore = useUserStore();
const route = useRoute();
const router = useRouter();

// 计算完整的头像 URL
const avatarUrl = computed(() => {
  return getAvatarUrl(userStore.user?.avatar);
});

// 菜单项类型
interface MenuItem {
  label: string;
  path?: string;
  children?: MenuItem[];
  class?: string;
}

// 动态菜单数组
const menu: MenuItem[] = [
  {
    label: "用户任务",
    children: [
      {
        label: "任务列表",
        path: "/crawleer/task-list",
        class: "icon-[mingcute--task-fill]",
      },
      {
        label: "新建任务",
        path: "/crawleer/task-add/basic",
        class: "icon-[mingcute--task-2-fill]",
      },
    ],
  },
  {
    label: "账户",
    children: [
      { label: "个人信息", path: "/account/profile" },
      { label: "Logout" },
    ],
  },
];

// 判断当前路由是否匹配
const isActive = (path?: string) => path && route.path.startsWith(path);

// 登出处理
async function handleLogout() {
  try {
    await ElMessageBox.confirm("确定要退出登录吗？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    // 调用 store 的 logout 方法（会调用 API 并清理本地状态）
    await userStore.logout();

    // 跳转到登录页
    router.push("/login");
  } catch (error: any) {
    // 用户取消或登出失败
    if (error !== "cancel") {
      console.error("登出失败:", error);
    }
  }
}

onMounted(() => {
  console.log("user.avatar :>> ", userStore.user?.avatar);
});
</script>
