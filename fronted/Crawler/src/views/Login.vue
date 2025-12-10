<template>
  <section
    class="bg-gray-50 h-screen relative before:absolute before:inset-0 before:bg-gradient-radial before:from-white before:via-indigo-50 before:to-indigo-200/50 before:opacity-70 before:z-0"
  >
    <div
      class="mx-auto w-screen max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32 flex max-lg:flex-col h-full max-lg:justify-center justify-around overflow-hidden relative z-10"
    >
      <div
        class="lg:max-w-prose text-left flex max-lg:text-center max-lg:w-full max-lg:my-5"
      >
        <div class="m-auto">
          <h1 class="text-4xl font-bold text-gray-900 sm:text-5xl">
            Crawlee <strong class="text-indigo-600"> Lowcode </strong> System
          </h1>

          <p
            class="mt-4 text-base text-pretty text-gray-700 sm:text-lg/relaxed max-lg:hidden font-mono tracking-widest"
          >
            基于Clawlee的低代码爬虫系统
          </p>
        </div>
      </div>

      <transition
        name="animate__animated"
        mode="out-in"
        enter-active-class="animate__animated animate__zoomIn"
        leave-active-class="animate__animated animate__hinge"
      >
        <component
          :is="currentCard"
          :key="model"
          :form="tempForm"
          @switch="toggleModel"
        />
      </transition>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { ref, computed, reactive } from "vue";
interface TempForm {
  email: string;
  username?: string;
  password?: string;
}
const model = ref<"login" | "register" | "code">("login");
const tempForm = reactive<TempForm>({
  email: "",
  username: "",
  password: "",
});
import LoginCard from "@/components/LoginCard.vue";
import RegisterCard from "@/components/RegisterCard.vue";
import CodeCard from "@/components/CodeCard.vue";

// 更优雅的映射表
const cardMap = {
  login: LoginCard,
  register: RegisterCard,
  code: CodeCard,
} as const;

// 动态组件
const currentCard = computed(() => cardMap[model.value]);

const toggleModel = (
  to?: keyof typeof cardMap,
  form?: { email: string; username?: string; password?: string }
) => {
  if (form) Object.assign(tempForm, form);
  if (to) model.value = to;
};
</script>
