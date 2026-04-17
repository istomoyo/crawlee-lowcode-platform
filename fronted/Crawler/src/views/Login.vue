<template>
  <section class="auth-shell">
    <div class="auth-shell__layer auth-shell__layer--grid" />
    <div class="auth-shell__layer auth-shell__layer--glow-a" />
    <div class="auth-shell__layer auth-shell__layer--glow-b" />

    <div class="auth-layout">
      <aside class="auth-hero">
        <div class="auth-badge">
          <span class="auth-badge__dot" />
          Crawlee Workspace
        </div>

        <div class="auth-hero__copy">
          <p class="auth-hero__eyebrow">低代码采集平台</p>
          <h1 class="auth-hero__title">
            一站式采集工作台
          </h1>
          <p class="auth-hero__description">
            登录后继续管理任务、模板、通知和 Cookie 凭证。
          </p>
        </div>

        <div class="auth-showcase">
          <div class="auth-showcase__halo" />
          <article class="auth-showcase__card auth-showcase__card--primary">
            <div class="auth-showcase__icon">
              <el-icon><DataAnalysis /></el-icon>
            </div>
            <span class="auth-showcase__tag">Workspace</span>
            <strong class="auth-showcase__title">任务编排</strong>
          </article>

          <article class="auth-showcase__card auth-showcase__card--accent">
            <div class="auth-showcase__icon auth-showcase__icon--accent">
              <el-icon><Lock /></el-icon>
            </div>
            <span class="auth-showcase__tag">Session</span>
            <strong class="auth-showcase__title">安全会话</strong>
          </article>

          <article class="auth-showcase__card auth-showcase__card--warm">
            <div class="auth-showcase__icon auth-showcase__icon--warm">
              <el-icon><Connection /></el-icon>
            </div>
            <span class="auth-showcase__tag">Local Lab</span>
            <strong class="auth-showcase__title">本地实验</strong>
          </article>
        </div>

      </aside>

      <div class="auth-panel">
        <div class="auth-panel__header">
          <div>
            <p class="auth-panel__eyebrow">账户入口</p>
            <h2 class="auth-panel__title">{{ currentStage.panelTitle }}</h2>
            <p class="auth-panel__description">{{ currentStage.panelDescription }}</p>
          </div>

          <div class="auth-panel__tabs">
            <button
              v-for="item in stageTabs"
              :key="item.key"
              type="button"
              class="auth-panel__tab"
              :class="item.key === model ? 'auth-panel__tab--active' : ''"
              @click="switchStage(item.key)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>

        <div class="auth-panel__body">
          <transition name="auth-card" mode="out-in">
            <component
              :is="currentCard"
              :key="model"
              :form="tempForm"
              @switch="toggleModel"
            />
          </transition>
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from "vue";
import {
  Connection,
  DataAnalysis,
  Lock,
} from "@element-plus/icons-vue";
import LoginCard from "@/components/LoginCard.vue";
import RegisterCard from "@/components/RegisterCard.vue";
import CodeCard from "@/components/CodeCard.vue";

interface TempForm {
  email: string;
  username?: string;
  password?: string;
}

type AuthStageKey = "login" | "register" | "code";

const model = ref<AuthStageKey>("login");
const tempForm = reactive<TempForm>({
  email: "",
  username: "",
  password: "",
});

const cardMap = {
  login: LoginCard,
  register: RegisterCard,
  code: CodeCard,
} as const;

const stageMetaMap: Record<
  AuthStageKey,
  {
    panelTitle: string;
    panelDescription: string;
  }
> = {
  login: {
    panelTitle: "欢迎回来",
    panelDescription: "输入邮箱和密码，继续你的工作流。",
  },
  register: {
    panelTitle: "创建新账号",
    panelDescription: "完成基础信息填写后进入邮箱验证。",
  },
  code: {
    panelTitle: "验证注册邮箱",
    panelDescription: "输入验证码，完成账号创建。",
  },
};

const stageTabs = [
  { key: "login" as const, label: "登录" },
  { key: "register" as const, label: "注册" },
];

const currentCard = computed(() => cardMap[model.value]);
const currentStage = computed(() => stageMetaMap[model.value]);

function toggleModel(
  to?: AuthStageKey,
  form?: { email: string; username?: string; password?: string },
) {
  if (form) {
    Object.assign(tempForm, form);
  }

  if (to) {
    model.value = to;
  }
}

function switchStage(nextStage: AuthStageKey) {
  if (nextStage === "code") {
    return;
  }

  model.value = nextStage;
}
</script>

<style scoped>
.auth-shell {
  --auth-primary: #0369a1;
  --auth-primary-soft: #0ea5e9;
  --auth-primary-deep: #0c4a6e;
  --auth-accent: #22c55e;
  --auth-accent-deep: #15803d;
  --auth-warm: #f59e0b;
  --auth-border: rgba(148, 163, 184, 0.18);
  --auth-text: #111827;
  --auth-muted: #64748b;
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  font-family:
    "Plus Jakarta Sans",
    "Segoe UI",
    "PingFang SC",
    "Microsoft YaHei",
    sans-serif;
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.18), transparent 28%),
    radial-gradient(circle at bottom right, rgba(34, 197, 94, 0.14), transparent 28%),
    linear-gradient(180deg, #f5fbff 0%, #eef8ff 42%, #f6fbf8 100%);
}

.auth-shell__layer {
  pointer-events: none;
  position: absolute;
  inset: 0;
}

.auth-shell__layer--grid {
  opacity: 0.32;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(180deg, rgba(255, 255, 255, 0.9), transparent 92%);
}

.auth-shell__layer--glow-a {
  top: -12%;
  left: -8%;
  height: 420px;
  width: 420px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(14, 165, 233, 0.16), transparent 70%);
}

.auth-shell__layer--glow-b {
  right: -10%;
  bottom: -16%;
  height: 420px;
  width: 420px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(34, 197, 94, 0.12), transparent 70%);
}

.auth-layout {
  position: relative;
  z-index: 1;
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  align-items: stretch;
  gap: 1.35rem;
  padding: 1rem;
  box-sizing: border-box;
}

.auth-hero,
.auth-panel {
  border: 1px solid var(--auth-border);
  border-radius: 32px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.94));
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.08);
  min-height: 0;
}

.auth-hero {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  align-items: start;
  gap: 1rem;
  padding: clamp(1.1rem, 2.5vw, 2rem);
}

.auth-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid rgba(14, 165, 233, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  padding: 0.5rem 0.9rem;
  color: var(--auth-primary-deep);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.auth-badge__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--auth-primary-soft), var(--auth-accent));
}

.auth-hero__copy {
  display: grid;
  gap: 0.8rem;
}

.auth-hero__eyebrow {
  margin: 0;
  color: var(--auth-primary);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.auth-hero__title {
  margin: 0;
  max-width: 12ch;
  color: var(--auth-text);
  font-size: clamp(2.2rem, 5vw, 4rem);
  line-height: 1.03;
  font-weight: 800;
  letter-spacing: -0.05em;
}

.auth-hero__description {
  margin: 0;
  max-width: 28rem;
  color: #475569;
  font-size: 0.94rem;
  line-height: 1.7;
}

.auth-showcase {
  position: relative;
  display: grid;
  align-self: stretch;
  min-height: 0;
  height: 100%;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 30px;
  background:
    radial-gradient(circle at center, rgba(14, 165, 233, 0.12), transparent 42%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(240, 249, 255, 0.96));
}

.auth-showcase__halo {
  position: absolute;
  width: 220px;
  height: 220px;
  border-radius: 999px;
  border: 1px solid rgba(14, 165, 233, 0.14);
  background:
    radial-gradient(circle, rgba(14, 165, 233, 0.12), rgba(255, 255, 255, 0.24) 58%, transparent 72%);
}

.auth-showcase__card {
  position: absolute;
  display: grid;
  gap: 0.35rem;
  min-width: 142px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.08);
  padding: 0.95rem 1rem;
}

.auth-showcase__card--primary {
  top: 1.2rem;
  left: 1.2rem;
}

.auth-showcase__card--accent {
  top: 50%;
  right: 1.2rem;
  transform: translateY(-50%);
}

.auth-showcase__card--warm {
  bottom: 1.2rem;
  left: 3.25rem;
}

.auth-showcase__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 16px;
  background: rgba(14, 165, 233, 0.12);
  color: var(--auth-primary);
  font-size: 1.05rem;
}

.auth-showcase__icon--accent {
  background: rgba(34, 197, 94, 0.12);
  color: var(--auth-accent-deep);
}

.auth-showcase__icon--warm {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.auth-showcase__tag {
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.auth-showcase__title {
  color: var(--auth-text);
  font-size: 1rem;
  font-weight: 800;
}

.auth-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  padding: clamp(1rem, 2.5vw, 1.5rem);
}

.auth-panel__header {
  display: grid;
  gap: 1rem;
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
  padding-bottom: 1.15rem;
}

.auth-panel__eyebrow {
  margin: 0;
  color: var(--auth-primary);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.auth-panel__title {
  margin: 0.45rem 0 0;
  color: var(--auth-text);
  font-size: clamp(1.45rem, 2.2vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.04em;
}

.auth-panel__description {
  margin: 0.45rem 0 0;
  color: #64748b;
  font-size: 0.88rem;
  line-height: 1.7;
}

.auth-panel__tabs {
  display: inline-flex;
  width: fit-content;
  flex-wrap: wrap;
  gap: 0.45rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 999px;
  background: #f8fafc;
  padding: 0.3rem;
}

.auth-panel__tab {
  border: 0;
  border-radius: 999px;
  background: transparent;
  padding: 0.62rem 1rem;
  color: #64748b;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.auth-panel__tab:hover {
  color: #111827;
}

.auth-panel__tab--active {
  background: linear-gradient(135deg, var(--auth-primary), var(--auth-primary-soft));
  color: #fff;
  box-shadow: 0 10px 20px rgba(14, 165, 233, 0.18);
}

.auth-panel__body {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  padding-top: 1rem;
}

.auth-card-enter-active,
.auth-card-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.auth-card-enter-from,
.auth-card-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

:deep(.auth-card) {
  width: min(100%, 480px);
  border: 1px solid var(--auth-border);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
  padding: 1.3rem;
}

:deep(.auth-card__header) {
  display: grid;
  gap: 0.45rem;
}

:deep(.auth-card__eyebrow) {
  margin: 0;
  color: var(--auth-primary);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

:deep(.auth-card__title) {
  margin: 0;
  color: var(--auth-text);
  font-size: 1.55rem;
  font-weight: 800;
  letter-spacing: -0.04em;
}

:deep(.auth-card__description) {
  margin: 0;
  color: #64748b;
  font-size: 0.86rem;
  line-height: 1.7;
}

:deep(.auth-card__chips) {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

:deep(.auth-chip) {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 999px;
  background: #f8fafc;
  padding: 0.4rem 0.72rem;
  color: #475569;
  font-size: 0.76rem;
  font-weight: 600;
}

:deep(.auth-chip__dot) {
  width: 0.48rem;
  height: 0.48rem;
  border-radius: 999px;
  background: var(--auth-primary-soft);
}

:deep(.auth-chip__dot--emerald) {
  background: var(--auth-accent);
}

:deep(.auth-chip__dot--amber) {
  background: #f59e0b;
}

:deep(.auth-form) {
  margin-top: 1.1rem;
}

:deep(.auth-form .el-form-item) {
  margin-bottom: 1rem;
}

:deep(.auth-form .el-form-item__label) {
  color: #334155;
  font-size: 0.82rem;
  font-weight: 700;
}

:deep(.auth-form .el-input__wrapper) {
  min-height: 46px;
  border-radius: 16px;
  box-shadow: 0 0 0 1px rgba(203, 213, 225, 0.78) inset;
}

:deep(.auth-form .el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.25) inset;
}

:deep(.auth-form .is-focus .el-input__wrapper) {
  box-shadow:
    0 0 0 2px rgba(14, 165, 233, 0.14),
    0 0 0 1px rgba(14, 165, 233, 0.45) inset;
}

:deep(.auth-form__hint) {
  margin: -0.2rem 0 0.9rem;
  color: #64748b;
  font-size: 0.76rem;
  line-height: 1.6;
}

:deep(.auth-submit) {
  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--auth-primary), var(--auth-primary-soft));
  box-shadow: 0 16px 30px rgba(14, 165, 233, 0.2);
  font-weight: 700;
}

:deep(.auth-submit--emerald) {
  background: linear-gradient(135deg, var(--auth-accent-deep), var(--auth-accent));
  box-shadow: 0 16px 30px rgba(34, 197, 94, 0.18);
}

:deep(.auth-submit .el-icon) {
  margin-left: 0.35rem;
}

:deep(.auth-card__footer) {
  margin-top: 1rem;
  color: #64748b;
  font-size: 0.82rem;
  line-height: 1.7;
  text-align: center;
}

:deep(.auth-card__link) {
  color: var(--auth-primary);
  font-weight: 700;
  cursor: pointer;
  transition: color 0.2s ease;
}

:deep(.auth-card__link:hover) {
  color: var(--auth-primary-deep);
}

:deep(.auth-inline-grid) {
  display: grid;
  gap: 0.85rem;
}

:deep(.auth-captcha-grid) {
  display: grid;
  gap: 0.85rem;
  margin-bottom: 1rem;
}

:deep(.auth-captcha-shell) {
  display: flex;
  align-items: stretch;
  justify-content: center;
  min-height: 54px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 16px;
  background: #f8fafc;
  cursor: pointer;
}

:deep(.auth-captcha-shell svg) {
  width: 100%;
  height: 100%;
}

:deep(.auth-quiet-note) {
  margin: 0 0 0.9rem;
  color: #64748b;
  font-size: 0.78rem;
  line-height: 1.6;
}

:deep(.auth-email-pill) {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid rgba(34, 197, 94, 0.16);
  border-radius: 999px;
  background: rgba(236, 253, 245, 0.92);
  padding: 0.45rem 0.8rem;
  color: var(--auth-accent-deep);
  font-size: 0.78rem;
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .auth-card-enter-active,
  .auth-card-leave-active,
  .auth-panel__tab,
  :deep(.auth-card__link) {
    transition: none;
  }
}

@media (min-width: 1120px) {
  .auth-shell {
    height: 100dvh;
    min-height: 100dvh;
  }

  .auth-layout {
    grid-template-columns: minmax(0, 1.1fr) minmax(420px, 0.9fr);
    min-height: 100dvh;
    height: 100dvh;
    padding: 1rem;
  }

  .auth-panel__header {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }

  :deep(.auth-inline-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  :deep(.auth-captcha-grid) {
    grid-template-columns: minmax(0, 1fr) 180px;
    align-items: stretch;
  }
}

@media (max-width: 1119px) {
  .auth-layout {
    padding: 0.9rem;
  }

  .auth-hero__title {
    max-width: none;
  }

  .auth-panel__tabs {
    width: 100%;
  }

  .auth-panel__tab {
    flex: 1;
  }
}

@media (max-width: 767px) {
  .auth-layout {
    gap: 0.85rem;
  }

  .auth-hero,
  .auth-panel {
    border-radius: 24px;
  }

  .auth-shell__layer--glow-a,
  .auth-shell__layer--glow-b {
    width: 280px;
    height: 280px;
  }

  .auth-showcase {
    min-height: 200px;
    height: 200px;
  }

  .auth-showcase__card {
    min-width: 124px;
    padding: 0.8rem;
  }

  .auth-showcase__card--primary {
    top: 0.9rem;
    left: 0.9rem;
  }

  .auth-showcase__card--accent {
    right: 0.9rem;
  }

  .auth-showcase__card--warm {
    bottom: 0.9rem;
    left: 1.4rem;
  }

  :deep(.auth-card) {
    width: 100%;
    border-radius: 22px;
    padding: 1.05rem;
  }
}
</style>
