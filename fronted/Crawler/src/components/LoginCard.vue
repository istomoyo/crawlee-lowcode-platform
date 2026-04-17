<template>
  <section class="auth-card" data-testid="login-card">
    <header class="auth-card__header">
      <p class="auth-card__eyebrow">账号登录</p>
      <h3 class="auth-card__title">继续进入工作台</h3>
      <p class="auth-card__description">输入邮箱和密码后即可登录。</p>
    </header>

    <el-form
      ref="loginForm"
      :model="form"
      :rules="rules"
      label-position="top"
      class="auth-form"
      @keyup.enter="login"
    >
      <el-form-item label="邮箱" prop="email">
        <div data-testid="login-email">
          <el-input
            v-model="form.email"
            placeholder="请输入注册邮箱"
            autocomplete="email"
            clearable
          >
            <template #prefix>
              <el-icon><Message /></el-icon>
            </template>
          </el-input>
        </div>
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <div data-testid="login-password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入登录密码"
            autocomplete="current-password"
            show-password
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </div>
      </el-form-item>

      <el-button
        type="primary"
        class="auth-submit"
        :loading="loading"
        data-testid="login-submit"
        @click="login"
      >
        登录并进入工作台
        <el-icon><ArrowRight /></el-icon>
      </el-button>
    </el-form>

    <p class="auth-card__footer">
      还没有账号？
      <span class="auth-card__link" @click="emit('switch', 'register')">立即注册</span>
    </p>
  </section>
</template>

<script lang="ts" setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, type FormInstance } from "element-plus";
import { ArrowRight, Lock, Message } from "@element-plus/icons-vue";
import { type LoginParams } from "@/api/user";
import { useUserStore } from "@/stores/user";

const props = defineProps<{
  form: { email: string };
}>();

const emit = defineEmits<{
  (
    e: "switch",
    to: "login" | "register" | "code",
    form?: { email: string; username: string; password: string },
  ): void;
}>();

const router = useRouter();
const store = useUserStore();
const loading = ref(false);
const loginForm = ref<FormInstance>();

const form = reactive<LoginParams>({
  email: props.form.email || "",
  password: "",
});

const rules = {
  email: [{ required: true, message: "请输入邮箱", trigger: "blur" }],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
};

const login = async () => {
  if (!loginForm.value) {
    return;
  }

  try {
    loading.value = true;
    await loginForm.value.validate();
    await store.login(form);
    router.replace("/");
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || err?.message || "登录失败");
  } finally {
    loading.value = false;
  }
};
</script>
