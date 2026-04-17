<template>
  <div class="page-shell" data-testid="cookie-credentials-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Cookie 凭证</h1>
        <p class="page-description">
          独立维护站点登录 Cookie，支持随时查看、删除、更新，并在新建任务时按目标 URL 自动匹配可复用凭证。
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <el-button plain @click="router.push('/crawleer/task-add/basic')">新建任务</el-button>
        <el-button type="primary" @click="scrollToManager" data-testid="cookie-manager-scroll">
          管理凭证
        </el-button>
      </div>
    </header>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article class="metric-card">
        <p class="metric-label">凭证总数</p>
        <p class="metric-value">{{ metricText(totalCount) }}</p>
        <p class="metric-note">所有保存的 Cookie 凭证都可以随时查看、修改和删除。</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">已绑定域名</p>
        <p class="metric-value">{{ metricText(domainBoundCount) }}</p>
        <p class="metric-note">填写域名后，新建任务时才能更稳定地自动匹配。</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">7 天内过期</p>
        <p class="metric-value">{{ metricText(expiringSoonCount) }}</p>
        <p class="metric-note">建议提前更新，避免任务运行时因为登录态失效而失败。</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">30 天内使用过</p>
        <p class="metric-value">{{ metricText(recentlyUsedCount) }}</p>
        <p class="metric-note">近期还在使用的凭证更值得优先维护和保活。</p>
      </article>
    </section>

    <section class="cookie-page-grid">
      <article class="surface-card cookie-guide-card">
        <div>
          <h2 class="section-title">填写说明</h2>
          <p class="section-description">
            这个页面是用户自己的 Cookie 管理中心。你可以先把常用站点的 Cookie 录进去，后面新建任务时系统会优先按域名自动匹配。
          </p>
        </div>

        <el-alert
          class="mt-5"
          type="success"
          :closable="false"
          title="Cookie 明文只会在服务端加密保存，任务与模板里只保留凭证引用。"
        />

        <div class="cookie-rule-list">
          <div class="cookie-rule-card">
            <p class="detail-label">1. 如何填写 Cookie</p>
            <p class="detail-value">只粘贴请求头里的 Cookie 值，例如：`session=abc; theme=dark`。</p>
          </div>
          <div class="cookie-rule-card">
            <p class="detail-label">2. 不要填什么</p>
            <p class="detail-value">不要包含 `Cookie:` 前缀，不要换行，也不要整段请求头一起粘贴。</p>
          </div>
          <div class="cookie-rule-card">
            <p class="detail-label">3. 域名怎么填</p>
            <p class="detail-value">建议填写 `example.com` 这种站点域名。填写后，任务创建时才能自动匹配。</p>
          </div>
          <div class="cookie-rule-card">
            <p class="detail-label">4. 什么场景适合更新</p>
            <p class="detail-value">如果站点登录态失效、账号切换，或任务提示需要重新登录，就来这里直接更新 Cookie。</p>
          </div>
        </div>

        <div class="cookie-example-card">
          <p class="detail-label">Cookie 示例</p>
          <code class="cookie-example-code">session=abc123; theme=dark; remember_me=true</code>
        </div>

        <div class="cookie-preview-card">
          <div>
            <h3 class="section-title">自动匹配预览</h3>
            <p class="section-description">
              输入一个任务 URL，先看看系统会优先推荐哪个凭证。
            </p>
          </div>

          <el-input
            v-model="previewUrl"
            clearable
            placeholder="https://example.com/account"
            data-testid="cookie-preview-url"
          />

          <div
            v-if="previewHost && previewMatch"
            class="cookie-preview-match cookie-preview-match--success"
          >
            <div class="cookie-preview-match__title">
              已匹配到“{{ previewMatch.credential.name }}”
            </div>
            <p class="cookie-preview-match__desc">
              当前 URL 主机名是 {{ previewHost }}，系统会按
              {{ previewMatch.matchType === "exact" ? "精确域名" : "上级域名" }}
              规则匹配到 {{ previewMatch.domain }}。
            </p>
            <div class="cookie-preview-match__meta">
              <span>Cookie 数量：{{ previewMatch.credential.cookieCount }}</span>
              <span>最近更新：{{ formatDateTime(previewMatch.credential.updatedAt) }}</span>
            </div>
            <div class="cookie-preview-match__actions">
              <el-button size="small" type="primary" plain @click="selectPreviewMatch">
                定位到这个凭证
              </el-button>
            </div>
          </div>

          <div v-else-if="previewHost" class="cookie-preview-match">
            <div class="cookie-preview-match__title">还没有匹配凭证</div>
            <p class="cookie-preview-match__desc">
              当前主机名是 {{ previewHost }}。建议先在右侧新建一个带域名的 Cookie 凭证，保存后这里就会自动匹配。
            </p>
          </div>
        </div>
      </article>

      <div ref="managerRef">
        <CookieCredentialManagerPanel
          v-model:selected-id="selectedCredentialId"
          stacked
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import CookieCredentialManagerPanel from "@/components/task/CookieCredentialManagerPanel.vue";
import { useCookieCredentials } from "@/composables/useCookieCredentials";
import {
  extractHostnameFromUrl,
  findBestMatchingCookieCredential,
} from "@/utils/cookie-credential";

const router = useRouter();
const managerRef = ref<HTMLElement | null>(null);
const previewUrl = ref("");
const selectedCredentialId = ref<number | null>(null);

const { credentials, cookieCredentialsLoading, fetchCookieCredentials } =
  useCookieCredentials();

onMounted(() => {
  void fetchCookieCredentials();
});

const totalCount = computed(() => credentials.value.length);

const domainBoundCount = computed(
  () => credentials.value.filter((item) => String(item.cookieDomain || "").trim()).length,
);

const expiringSoonCount = computed(() => {
  const now = Date.now();
  const future = now + 7 * 24 * 60 * 60 * 1000;

  return credentials.value.filter((item) => {
    if (!item.expiresAt) {
      return false;
    }

    const time = new Date(item.expiresAt).getTime();
    return !Number.isNaN(time) && time >= now && time <= future;
  }).length;
});

const recentlyUsedCount = computed(() => {
  const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return credentials.value.filter((item) => {
    if (!item.lastUsedAt) {
      return false;
    }

    const time = new Date(item.lastUsedAt).getTime();
    return !Number.isNaN(time) && time >= threshold;
  }).length;
});

const previewHost = computed(() => extractHostnameFromUrl(previewUrl.value));

const previewMatch = computed(() =>
  findBestMatchingCookieCredential(credentials.value, previewUrl.value),
);

function metricText(value: number) {
  if (cookieCredentialsLoading.value && value === 0) {
    return "--";
  }

  return String(value);
}

function selectPreviewMatch() {
  if (!previewMatch.value) {
    return;
  }

  selectedCredentialId.value = previewMatch.value.credential.id;
  managerRef.value?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function scrollToManager() {
  managerRef.value?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "未设置";
  }

  try {
    return new Date(value).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}
</script>

<style scoped>
.cookie-page-grid {
  display: grid;
  gap: 1.15rem;
}

.cookie-guide-card {
  display: grid;
  gap: 1rem;
  padding: 1.35rem;
}

.cookie-rule-list {
  display: grid;
  gap: 0.85rem;
}

.cookie-rule-card {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 20px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
  padding: 0.95rem 1rem;
}

.cookie-example-card {
  border: 1px dashed rgba(12, 92, 171, 0.28);
  border-radius: 20px;
  background: rgba(239, 246, 255, 0.68);
  padding: 1rem;
}

.cookie-example-code {
  display: block;
  margin-top: 0.55rem;
  overflow-x: auto;
  color: #0f172a;
  font-family: "Monaco", "Menlo", "Consolas", monospace;
  font-size: 0.82rem;
  line-height: 1.6;
}

.cookie-preview-card {
  display: grid;
  gap: 0.85rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
  padding: 1rem;
}

.cookie-preview-match {
  border: 1px dashed rgba(148, 163, 184, 0.32);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.88);
  padding: 0.9rem 1rem;
}

.cookie-preview-match--success {
  border-style: solid;
  border-color: rgba(12, 92, 171, 0.18);
  background:
    linear-gradient(135deg, rgba(12, 92, 171, 0.08), transparent 62%),
    rgba(255, 255, 255, 0.96);
}

.cookie-preview-match__title {
  color: #0f172a;
  font-size: 0.9rem;
  font-weight: 700;
}

.cookie-preview-match__desc {
  margin-top: 0.35rem;
  color: #64748b;
  font-size: 0.8rem;
  line-height: 1.55;
}

.cookie-preview-match__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.9rem;
  margin-top: 0.6rem;
  color: #475569;
  font-size: 0.76rem;
}

.cookie-preview-match__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.75rem;
}

</style>
