<template>
  <el-card class="login-card h-fit my-auto max-lg:mx-auto rounded-2xl!">
    <span class="flex items-center">
      <span class="h-0.5 flex-1 bg-gray-500"></span>

      <span
        class="shrink-0 px-4 text-gray-900 font-extrabold text-2xl font-mono my-3"
      >
        Verify Email
      </span>

      <span class="h-0.5 flex-1 bg-gray-500"></span>
    </span>

    <p class="text-center text-gray-600 text-sm">
      验证码将发送到 <span class="font-bold">{{ props.form.email }}</span>
    </p>

    <!-- 图形验证码区域 -->
    <div class="flex items-center gap-4 my-4">
      <el-input
        v-model="imgCaptchaText"
        placeholder="请输入图形验证码"
        class="flex-1"
      />
      <div class="cursor-pointer" @click="refreshCaptcha" v-html="svg" />
    </div>

    <!-- 发送邮箱验证码按钮 -->
    <div class="flex justify-center mb-4">
      <el-button
        type="primary"
        :loading="sendingEmail"
        :disabled="!canSendEmail"
        @click="sendEmailCode"
      >
        <span v-if="countdown === 0">发送邮箱验证码</span>
        <span v-else>{{ countdown }}s 后重发</span>
      </el-button>
    </div>

    <el-form :model="form" :rules="rules" ref="codeForm" label-width="80px">
      <el-form-item label="邮箱验证码" prop="code">
        <el-input v-model="form.code" />
      </el-form-item>

      <el-form-item>
        <el-button
          type="primary"
          @click="verifyAndRegister"
          :loading="registering"
          class="m-auto w-3/5"
          size="large"
        >
          验证并注册
        </el-button>
      </el-form-item>

      <p class="text-center text-sm mt-2">
        <span
          class="text-indigo-600 cursor-pointer hover:underline"
          @click="emit('switch', 'register', props.form)"
        >
          返回修改注册信息
        </span>
      </p>
    </el-form>
  </el-card>
</template>

<script lang="ts" setup>
import { ref, reactive, onMounted, computed } from "vue";
import { ElMessage } from "element-plus";
import { createCaptchaApi, sendEmailCodeApi, registerApi } from "@/api/user";

const props = defineProps<{
  form: { email: string; username: string; password: string };
}>();

const emit = defineEmits<{
  (
    e: "switch",
    to: "login" | "register" | "code",
    form?: { email: string; username?: string; password?: string }
  ): void;
}>();

// --- 验证码相关 ---
const captchaId = ref<string>("");
const svg = ref<string>("");
const imgCaptchaText = ref<string>("");

const loadCaptcha = async () => {
  try {
    const res = await createCaptchaApi(); // 拦截器已返回实际 payload 或者你需调整 API 类型
    // 如果你拦截器返回的是 res.data 结构，请适配：captchaId.value = res.data.captchaId
    captchaId.value = res.captchaId;
    svg.value = res.svg;
  } catch (err: any) {
    console.error(err);
    ElMessage.error(err?.message || "加载图形验证码失败");
  }
};

const refreshCaptcha = () => {
  imgCaptchaText.value = "";
  loadCaptcha();
};

onMounted(loadCaptcha);

// --- 发送邮箱验证码（倒计时） ---
const sendingEmail = ref(false);
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const startCountdown = (sec: number) => {
  countdown.value = sec;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      if (timer) clearInterval(timer);
      timer = null;
      countdown.value = 0;
    }
  }, 1000);
};

const canSendEmail = computed(() => {
  return (
    props.form?.email &&
    imgCaptchaText.value.trim() !== "" &&
    countdown.value === 0
  );
});

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
      captchaText: imgCaptchaText.value,
    });
    ElMessage.success("邮箱验证码已发送，请查收");
    startCountdown(60); // 60s 冷却
  } catch (err: any) {
    console.error(err);
    ElMessage.error(
      err?.response?.data?.message || err?.message || "发送邮箱验证码失败"
    );
    // 发送失败时建议刷新图形验证码
    await loadCaptcha();
  } finally {
    sendingEmail.value = false;
  }
};

// --- 表单 & 注册 ---
const loading = ref(false);
const registering = ref(false);
const codeForm = ref();

const form = reactive({
  code: "",
});

const rules = {
  code: [{ required: true, message: "请输入邮箱验证码", trigger: "blur" }],
};

const verifyAndRegister = async () => {
  if (!codeForm.value) return;
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
      code: form.code,
    });
    ElMessage.success("注册成功，请登录");
    emit("switch", "login", { email: props.form.email });
  } catch (err: any) {
    console.error(err);
    ElMessage.error(err?.response?.data?.message || err?.message || "注册失败");
  } finally {
    registering.value = false;
  }
};
</script>

<style scoped>
.login-card {
  max-width: 500px;
  min-width: 400px;
}
</style>
