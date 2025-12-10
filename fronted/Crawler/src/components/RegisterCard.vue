<template>
  <el-card
    class="login-card h-fit my-auto max-lg:mx-auto rounded-2xl! overflow-hidden"
  >
    <span class="flex items-center">
      <span class="h-0.5 flex-1 bg-gray-500"></span>
      <span
        class="shrink-0 px-4 text-gray-900 font-extrabold text-2xl font-mono my-3"
        >Register</span
      >
      <span class="h-0.5 flex-1 bg-gray-500"></span>
    </span>
    <el-form :model="form" :rules="rules" ref="registerForm" label-width="80px">
      <el-form-item label="邮箱" prop="email">
        <el-input v-model="form.email" />
      </el-form-item>
      <el-form-item label="用户名" prop="username">
        <el-input v-model="form.username" />
      </el-form-item>
      <el-form-item label="密码" prop="password">
        <el-input v-model="form.password" type="password" />
      </el-form-item>
      <el-form-item>
        <el-button
          type="primary"
          @click="register"
          :loading="loading"
          class="m-auto w-3/5"
          size="large"
        >
          注册
        </el-button>
      </el-form-item>
    </el-form>
    <p class="text-center text-sm mt-2">
      已有账号？
      <span
        class="text-indigo-600 cursor-pointer hover:underline"
        @click="emit('switch', 'login')"
      >
        返回登录
      </span>
    </p>
  </el-card>
</template>
<script lang="ts" setup>
import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";
const emit = defineEmits<{
  (
    e: "switch",
    to: "login" | "register" | "code",
    form?: { email: string; username: string; password: string }
  ): void;
}>();
const props = defineProps<{
  form: { email: string; username: string; password: string };
}>();

const loading = ref(false);
const registerForm = ref();
const form = reactive({ email: "", username: "", password: "" });
if (props.form) {
  form.email = props.form.email;
  form.username = props.form.username;
  form.password = props.form.password;
}
const rules = {
  email: [{ required: true, message: "请输入邮箱", trigger: "blur" }],
  username: [{ required: true, message: "请输入用户名", trigger: "blur" }],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
};
const register = async () => {
  await registerForm.value.validate();
  loading.value = true;
  emit("switch", "code", form);
};
</script>
<style scoped>
.login-card {
  max-width: 500px;
  min-width: 400px;
}
</style>
