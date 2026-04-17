<template>
  <section class="auth-card">
    <header class="auth-card__header">
      <p class="auth-card__eyebrow">邮箱确认</p>
      <h3 class="auth-card__title">完成最后一步</h3>
      <p class="auth-card__description">输入验证码后即可完成注册。</p>

      <div class="auth-email-pill">
        <el-icon><Message /></el-icon>
        {{ props.form.email }}
      </div>
    </header>

    <div class="auth-form">
      <div class="auth-captcha-grid">
        <el-input
          v-model="imgCaptchaText"
          placeholder="请输入图形验证码"
          autocomplete="off"
          clearable
        >
          <template #prefix>
            <el-icon><Key /></el-icon>
          </template>
        </el-input>

        <div
          class="auth-captcha-shell"
          role="button"
          tabindex="0"
          title="点击刷新图形验证码"
          @click="refreshCaptcha"
          @keydown.enter.prevent="refreshCaptcha"
          @keydown.space.prevent="refreshCaptcha"
          v-html="svg"
        />
      </div>

      <p class="auth-quiet-note">图形验证码可刷新，邮箱验证码 60 秒后可重发。</p>

      <el-button
        type="primary"
        class="auth-submit auth-submit--emerald"
        :loading="sendingEmail"
        :disabled="!canSendEmail"
        @click="sendEmailCode"
      >
        <template v-if="countdown === 0">
          发送邮箱验证码
          <el-icon><Promotion /></el-icon>
        </template>
        <template v-else>{{ countdown }}s 后可重新发送</template>
      </el-button>
    </div>

    <el-form
      ref="codeForm"
      :model="form"
      :rules="rules"
      label-position="top"
      class="auth-form"
      @keyup.enter="verifyAndRegister"
    >
      <el-form-item label="邮箱验证码" prop="code">
        <el-input
          v-model="form.code"
          placeholder="请输入收到的邮箱验证码"
          autocomplete="one-time-code"
          clearable
        >
          <template #prefix>
            <el-icon><ChatDotRound /></el-icon>
          </template>
        </el-input>
      </el-form-item>

      <el-button
        type="primary"
        class="auth-submit"
        :loading="registering"
        @click="verifyAndRegister"
      >
        验证并完成注册
        <el-icon><CircleCheck /></el-icon>
      </el-button>
    </el-form>

    <p class="auth-card__footer">
      信息需要修改？
      <span class="auth-card__link" @click="emit('switch', 'register', props.form)">
        返回上一步
      </span>
    </p>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { ElMessage, type FormInstance } from "element-plus";
import {
  ChatDotRound,
  CircleCheck,
  Key,
  Message,
  Promotion,
} from "@element-plus/icons-vue";
import { createCaptchaApi, registerApi, sendEmailCodeApi } from "@/api/user";

const props = defineProps<{
  form: { email: string; username: string; password: string };
}>();

const emit = defineEmits<{
  (
    e: "switch",
    to: "login" | "register" | "code",
    form?: { email: string; username?: string; password?: string },
  ): void;
}>();

const captchaId = ref("");
const svg = ref("");
const imgCaptchaText = ref("");
const sendingEmail = ref(false);
const countdown = ref(0);
const registering = ref(false);
const codeForm = ref<FormInstance>();
const form = reactive({
  code: "",
});

let timer: ReturnType<typeof setInterval> | null = null;

const rules = {
  code: [{ required: true, message: "请输入邮箱验证码", trigger: "blur" }],
};

const loadCaptcha = async () => {
  try {
    const res = await createCaptchaApi();
    captchaId.value = res.captchaId;
    svg.value = res.svg;
  } catch (err: any) {
    console.error(err);
    ElMessage.error(err?.message || "加载图形验证码失败");
  }
};

const refreshCaptcha = () => {
  imgCaptchaText.value = "";
  void loadCaptcha();
};

const startCountdown = (seconds: number) => {
  countdown.value = seconds;

  if (timer) {
    clearInterval(timer);
  }

  timer = setInterval(() => {
    countdown.value -= 1;

    if (countdown.value <= 0) {
      if (timer) {
        clearInterval(timer);
      }

      timer = null;
      countdown.value = 0;
    }
  }, 1000);
};

const canSendEmail = computed(
  () =>
    Boolean(props.form?.email) &&
    imgCaptchaText.value.trim() !== "" &&
    countdown.value === 0,
);

const sendEmailCode = async () => {
  if (!canSendEmail.value) {
    ElMessage.warning("请填写邮箱和图形验证码后再发送");
    return;
  }

  sendingEmail.value = true;

  try {
    await sendEmailCodeApi({
      email: props.form.email,
      captchaId: captchaId.value,
      captchaText: imgCaptchaText.value.trim(),
    });
    ElMessage.success("邮箱验证码已发送，请查收");
    startCountdown(60);
  } catch (err: any) {
    console.error(err);
    ElMessage.error(
      err?.response?.data?.message || err?.message || "发送邮箱验证码失败",
    );
    await loadCaptcha();
  } finally {
    sendingEmail.value = false;
  }
};

const verifyAndRegister = async () => {
  if (!codeForm.value) {
    return;
  }

  try {
    await codeForm.value.validate();
  } catch {
    return;
  }

  registering.value = true;

  try {
    await registerApi({
      email: props.form.email,
      username: props.form.username,
      password: props.form.password,
      code: form.code.trim(),
    });
    ElMessage.success("注册成功，请登录");
    emit("switch", "login", { email: props.form.email });
  } catch (err: any) {
    console.error(err);
    ElMessage.error(
      err?.response?.data?.message || err?.message || "注册失败",
    );
  } finally {
    registering.value = false;
  }
};

onMounted(() => {
  void loadCaptcha();
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});
</script>
