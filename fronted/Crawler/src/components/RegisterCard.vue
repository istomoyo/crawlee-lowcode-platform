<template>
  <section class="auth-card">
    <header class="auth-card__header">
      <p class="auth-card__eyebrow">新用户注册</p>
      <h3 class="auth-card__title">先填写基础信息</h3>
      <p class="auth-card__description">完成后进入邮箱验证。</p>
    </header>

    <el-form
      ref="registerForm"
      :model="form"
      :rules="rules"
      label-position="top"
      class="auth-form"
      @keyup.enter="register"
    >
      <div class="auth-inline-grid">
        <el-form-item label="邮箱" prop="email">
          <el-input
            v-model="form.email"
            placeholder="用于接收验证码"
            autocomplete="email"
            clearable
          >
            <template #prefix>
              <el-icon><Message /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="用于展示与区分用户"
            autocomplete="username"
            clearable
          >
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </el-form-item>
      </div>

      <el-form-item label="密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="建议使用更强一点的密码"
          autocomplete="new-password"
          show-password
        >
          <template #prefix>
            <el-icon><Lock /></el-icon>
          </template>
        </el-input>
      </el-form-item>

      <el-button
        type="primary"
        class="auth-submit auth-submit--emerald"
        :loading="loading"
        @click="register"
      >
        下一步，验证邮箱
        <el-icon><ArrowRight /></el-icon>
      </el-button>
    </el-form>

    <p class="auth-card__footer">
      已有账号？
      <span class="auth-card__link" @click="emit('switch', 'login')">返回登录</span>
    </p>
  </section>
</template>

<script lang="ts" setup>
import { reactive, ref } from "vue";
import { type FormInstance } from "element-plus";
import { ArrowRight, Lock, Message, User } from "@element-plus/icons-vue";

const emit = defineEmits<{
  (
    e: "switch",
    to: "login" | "register" | "code",
    form?: { email: string; username: string; password: string },
  ): void;
}>();

const props = defineProps<{
  form: { email: string; username: string; password: string };
}>();

const loading = ref(false);
const registerForm = ref<FormInstance>();
const form = reactive({
  email: props.form.email || "",
  username: props.form.username || "",
  password: props.form.password || "",
});

const rules = {
  email: [{ required: true, message: "请输入邮箱", trigger: "blur" }],
  username: [{ required: true, message: "请输入用户名", trigger: "blur" }],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
};

const register = async () => {
  if (!registerForm.value) {
    return;
  }

  try {
    loading.value = true;
    await registerForm.value.validate();
    emit("switch", "code", { ...form });
  } finally {
    loading.value = false;
  }
};
</script>
