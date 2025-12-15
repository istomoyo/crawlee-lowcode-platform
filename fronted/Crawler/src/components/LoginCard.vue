<template>
  <el-card class="login-card h-fit my-auto max-lg:mx-auto rounded-2xl!">
    <span class="flex items-center">
      <span class="h-0.5 flex-1 bg-gray-500"></span>

      <span
        class="shrink-0 px-4 text-gray-900 font-extrabold text-2xl font-mono my-3"
        >Login</span
      >

      <span class="h-0.5 flex-1 bg-gray-500"></span>
    </span>
    <el-form :model="form" :rules="rules" ref="loginForm" label-width="80px">
      <el-form-item label="邮箱" prop="email">
        <el-input v-model="form.email" />
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <el-input v-model="form.password" type="password" />
      </el-form-item>

      <el-form-item>
        <el-button
          type="primary"
          @click="login"
          :loading="loading"
          class="m-auto w-3/5"
          size="large"
        >
          登录
        </el-button>
      </el-form-item>
    </el-form>

    <p class="text-center text-sm mt-2">
      没有账号？
      <span
        class="text-indigo-600 cursor-pointer hover:underline"
        type="primary"
        @click="emit('switch', 'register')"
      >
        去注册
      </span>
    </p>
  </el-card>
</template>

<script lang="ts" setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, type FormInstance } from "element-plus";
import { type LoginParams } from "@/api/user";
import { useUserStore } from "@/stores/user";
const props = defineProps<{
  form: { email: string };
}>();

// ⚠️ 使用对象函数语法，兼容 TS + verbatimModuleSyntax
const emit = defineEmits<{
  (
    e: "switch",
    to: "login" | "register" | "code",
    form?: { email: string; username: string; password: string }
  ): void;
}>();
const router = useRouter();
const loading = ref(false);

// ⚠️ 明确类型为 FormInstance
const loginForm = ref<FormInstance>();

const form: LoginParams = reactive({
  email: "",
  password: "",
});
if (props.form.email) form.email = props.form.email;
const rules = {
  email: [{ required: true, message: "请输入邮箱", trigger: "blur" }],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
};
const store = useUserStore();

const login = async () => {
  if (!loginForm.value) return;

  try {
    loading.value = true;
    await loginForm.value.validate();

    // ⚡ 这里不再调用 store.init()
    await store.login(form); // 登录成功，store.user 会有值
    router.replace("/"); // 跳首页
  } catch (err: any) {
    ElMessage.error(err.message || "登录失败");
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-card {
  max-width: 500px;
  min-width: 400px;
}
</style>
