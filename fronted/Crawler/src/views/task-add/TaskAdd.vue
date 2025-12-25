<template>
  <div class="p-6 h-full flex flex-col">
    <div>
      <h2 class="sr-only">Steps</h2>

      <div>
        <ol
          class="grid grid-cols-1 divide-x divide-gray-100 overflow-hidden rounded-lg border border-gray-100 text-sm text-gray-600 sm:grid-cols-5"
        >
          <li
            class="flex items-center justify-center gap-2 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
            :class="active == 0 ? 'bg-gray-200' : ''"
            @click="goToStep(0)"
          >
            <svg
              class="size-7 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
              ></path>
            </svg>

            <p class="leading-none">
              <strong class="block font-medium text-gray-900">
                基础信息
              </strong>

              <small class="mt-1"> 任务基础信息 </small>
            </p>
          </li>

          <li
            class="relative flex items-center justify-center gap-2 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
            :class="active == 1 ? 'bg-gray-200' : ''"
            @click="goToStep(1)"
          >
            <span
              class="absolute top-1/2 -left-2 hidden size-4 -translate-y-1/2 rotate-45 border border-gray-100 sm:block ltr:border-s-0 ltr:border-b-0 ltr:bg-white rtl:border-e-0 rtl:border-t-0 rtl:bg-gray-50"
            >
            </span>

            <span
              class="absolute top-1/2 -right-2 hidden size-4 -translate-y-1/2 rotate-45 border border-gray-100 sm:block ltr:border-s-0 ltr:border-b-0 ltr:bg-gray-50 rtl:border-e-0 rtl:border-t-0 rtl:bg-white"
            >
            </span>

            <svg
              class="size-7 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              ></path>
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              ></path>
            </svg>

            <p class="leading-none">
              <strong class="block font-medium text-gray-900">
                详细配置
              </strong>

              <small class="mt-1"> 爬虫详细配置 </small>
            </p>
          </li>

          <li
            class="flex items-center justify-center gap-2 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
            :class="active == 2 ? 'bg-gray-200' : ''"
            @click="goToStep(2)"
          >
            <svg
              class="size-7 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              ></path>
            </svg>

            <p class="leading-none">
              <strong class="block font-medium text-gray-900">
                数据映射
              </strong>

              <small class="mt-1"> 自定义爬虫数据 </small>
            </p>
          </li>

          <li
            class="flex items-center justify-center gap-2 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
            :class="active == 3 ? 'bg-gray-200' : ''"
            @click="goToStep(3)"
          >
            <svg
              class="size-7 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              ></path>
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>

            <p class="leading-none">
              <strong class="block font-medium text-gray-900">
                最终配置
              </strong>

              <small class="mt-1"> 运行参数设置 </small>
            </p>
          </li>

          <li
            class="flex items-center justify-center gap-2 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
            :class="active == 4 ? 'bg-gray-200' : ''"
            @click="goToStep(4)"
          >
            <svg
              class="size-7 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 17v-2a2 2 0 012-2h2a2 2 0 012 2v2m-2-6a2 2 0 100-4 2 2 0 000 4zm-6 8h12a2 2 0 002-2V9a2 2 0 00-2-2h-3.586a1 1 0 01-.707-.293l-1.828-1.828A1 1 0 0010.586 4H6a2 2 0 00-2 2v11a2 2 0 002 2z"
              ></path>
            </svg>

            <p class="leading-none">
              <strong class="block font-medium text-gray-900">
                配置预览
              </strong>

              <small class="mt-1"> 导出 JSON 配置 </small>
            </p>
          </li>
        </ol>
      </div>
    </div>
    <!-- <router-view v-slot="{ Component }">
      <keep-alive v-if="$route.meta.keepAlive && Component">
        <component :is="Component" />
      </keep-alive>

      <component v-else-if="Component" :is="Component" />
    </router-view> -->
    <router-view></router-view>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

const active = computed(() => {
  if (route.path.includes("basic")) return 0;
  if (route.path.includes("structure")) return 1;
  if (route.path.includes("mapping")) return 2;
  if (route.path.includes("config")) return 3;
  if (route.path.includes("preview")) return 4;
  return 0;
});

// 步骤路由映射
const stepRoutes = [
  "/crawleer/task-add/basic",
  "/crawleer/task-add/structure",
  "/crawleer/task-add/mapping",
  "/crawleer/task-add/config",
  "/crawleer/task-add/preview"
];

// 跳转到指定步骤
function goToStep(stepIndex) {
  if (stepIndex >= 0 && stepIndex < stepRoutes.length) {
    router.push(stepRoutes[stepIndex]);
  }
}
</script>
