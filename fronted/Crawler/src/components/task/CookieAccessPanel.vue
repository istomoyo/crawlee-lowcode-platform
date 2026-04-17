<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import type { CookieAccessMode } from "@/stores/taskForm";
import type { TaskCookieCredentialSummary } from "@/api/task";
import { useCookieCredentials } from "@/composables/useCookieCredentials";
import {
  extractHostnameFromUrl,
  findBestMatchingCookieCredential,
  getCookieCredentialStatusMeta,
  isCookieCredentialMatchingUrl,
  isCookieCredentialUsable,
  normalizeCookieCredentialDomain,
} from "@/utils/cookie-credential";
import CookieCredentialManagerDialog from "./CookieCredentialManagerDialog.vue";

export type CookieAccessValue = {
  useCookie: boolean;
  cookieMode: CookieAccessMode;
  cookieString: string;
  cookieDomain: string;
  cookieCredentialId: number | null;
};

const props = withDefaults(
  defineProps<{
    modelValue: CookieAccessValue;
    title?: string;
    description?: string;
    temporaryHint?: string;
    taskUrl?: string;
    manageRoute?: string;
  }>(),
  {
    title: "访问凭证",
    description:
      "需要登录后才可见的页面，可以用临时 Cookie 调试，也可以切换到已保存凭证进行安全复用。",
    temporaryHint:
      "临时 Cookie 兼容旧任务方式；如果希望任务和模板不保存明文 Cookie，建议改用已保存凭证。",
    taskUrl: "",
    manageRoute: "/account/cookies",
  },
);

const emit = defineEmits<{
  "update:modelValue": [CookieAccessValue];
}>();

const router = useRouter();
const managerVisible = ref(false);
const lastAutoAppliedKey = ref("");
const { credentials, cookieCredentialsLoading, fetchCookieCredentials } =
  useCookieCredentials();

function patchValue(nextPartial: Partial<CookieAccessValue>) {
  emit("update:modelValue", {
    ...props.modelValue,
    ...nextPartial,
  });
}

const useCookie = computed({
  get: () => props.modelValue.useCookie,
  set: (value: boolean) => patchValue({ useCookie: value }),
});

const cookieMode = computed({
  get: () => props.modelValue.cookieMode,
  set: (value: CookieAccessMode) =>
    patchValue({
      cookieMode: value,
      cookieCredentialId:
        value === "temporary" ? null : props.modelValue.cookieCredentialId,
    }),
});

const cookieString = computed({
  get: () => props.modelValue.cookieString,
  set: (value: string) => patchValue({ cookieString: value }),
});

const cookieDomain = computed({
  get: () => props.modelValue.cookieDomain,
  set: (value: string) => patchValue({ cookieDomain: value }),
});

const cookieCredentialId = computed({
  get: () => props.modelValue.cookieCredentialId,
  set: (value: number | null) => patchValue({ cookieCredentialId: value }),
});

const taskHost = computed(() => extractHostnameFromUrl(props.taskUrl));

const selectedCredential = computed<TaskCookieCredentialSummary | null>(
  () =>
    credentials.value.find((item) => item.id === props.modelValue.cookieCredentialId) ||
    null,
);

const selectedCredentialStatusMeta = computed(() =>
  getCookieCredentialStatusMeta(selectedCredential.value),
);

const selectedCredentialIsUsable = computed(() =>
  isCookieCredentialUsable(selectedCredential.value),
);

const suggestedCredentialMatch = computed(() =>
  findBestMatchingCookieCredential(credentials.value, props.taskUrl),
);

const suggestedCredential = computed(
  () => suggestedCredentialMatch.value?.credential || null,
);

const selectedCredentialHasDomain = computed(() =>
  Boolean(normalizeCookieCredentialDomain(selectedCredential.value?.cookieDomain)),
);

const selectedCredentialMatchesTaskUrl = computed(() =>
  isCookieCredentialMatchingUrl(selectedCredential.value, props.taskUrl),
);

watch(
  () => [props.modelValue.useCookie, props.modelValue.cookieMode, taskHost.value] as const,
  ([enabled, mode, host]) => {
    if (host || (enabled && mode === "credential")) {
      void ensureCredentialsLoaded();
    }
  },
  { immediate: true },
);

watch(
  () =>
    [
      props.modelValue.useCookie,
      props.modelValue.cookieMode,
      props.modelValue.cookieCredentialId,
      suggestedCredential.value?.id,
      taskHost.value,
    ] as const,
  ([enabled, mode, selectedId, suggestedId, host]) => {
    if (!enabled || mode !== "credential" || !suggestedId || selectedId || !host) {
      return;
    }

    const currentKey = `${host}:${suggestedId}`;
    if (lastAutoAppliedKey.value === currentKey) {
      return;
    }

    lastAutoAppliedKey.value = currentKey;
    patchValue({
      cookieCredentialId: suggestedId,
      cookieString: "",
      cookieDomain: "",
    });
  },
  { immediate: true },
);

watch(
  () => [props.modelValue.useCookie, props.modelValue.cookieMode] as const,
  ([enabled, mode]) => {
    if (!enabled || mode !== "credential") {
      lastAutoAppliedKey.value = "";
    }
  },
);

async function ensureCredentialsLoaded(force = false) {
  try {
    await fetchCookieCredentials(force);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载 Cookie 凭证失败");
  }
}

function openManager() {
  managerVisible.value = true;
  void ensureCredentialsLoaded(true);
}

function handleManagerRefreshed() {
  void ensureCredentialsLoaded(true);
}

function applySuggestedCredential() {
  if (!suggestedCredential.value || !taskHost.value) {
    return;
  }

  lastAutoAppliedKey.value = `${taskHost.value}:${suggestedCredential.value.id}`;
  patchValue({
    useCookie: true,
    cookieMode: "credential",
    cookieCredentialId: suggestedCredential.value.id,
    cookieString: "",
    cookieDomain: "",
  });
}

function goToCookieCenter() {
  void router.push(props.manageRoute);
}

function formatCredentialOptionLabel(item: TaskCookieCredentialSummary) {
  const meta = getCookieCredentialStatusMeta(item);
  const domainText = item.cookieDomain ? ` (${item.cookieDomain})` : "";
  return `${item.name}${domainText} · ${meta.label}`;
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

<template>
  <section class="cookie-access-panel" data-testid="cookie-access-panel">
    <div class="cookie-access-panel__head">
      <div class="cookie-access-panel__copy">
        <div class="cookie-access-panel__title">{{ title }}</div>
        <p class="cookie-access-panel__desc">{{ description }}</p>
      </div>
      <el-switch v-model="useCookie" active-text="启用" inactive-text="关闭" />
    </div>

    <div
      v-if="taskHost && suggestedCredential"
      class="cookie-match-card"
      :class="selectedCredentialMatchesTaskUrl ? 'cookie-match-card--active' : ''"
      data-testid="cookie-match-card"
    >
      <div class="cookie-match-card__copy">
        <div class="cookie-match-card__title">
          检测到 {{ taskHost }} 可复用已保存凭证
        </div>
        <p class="cookie-match-card__desc">
          推荐使用“{{ suggestedCredential.name }}”
          {{
            suggestedCredentialMatch?.matchType === "exact"
              ? "，域名精确匹配。"
              : "，按上级域名自动匹配。"
          }}
        </p>
      </div>
      <div class="cookie-match-card__actions">
        <el-button
          size="small"
          type="primary"
          plain
          @click="applySuggestedCredential"
          data-testid="cookie-apply-suggestion"
        >
          {{ useCookie && cookieMode === "credential" ? "使用推荐凭证" : "启用并使用" }}
        </el-button>
        <el-button size="small" text @click="goToCookieCenter">前往凭证页</el-button>
      </div>
    </div>

    <div
      v-else-if="taskHost && !cookieCredentialsLoading && credentials.length > 0"
      class="cookie-match-card cookie-match-card--neutral"
    >
      <div class="cookie-match-card__copy">
        <div class="cookie-match-card__title">当前没有匹配到已保存凭证</div>
        <p class="cookie-match-card__desc">
          建议在 Cookie 凭证页为 {{ taskHost }} 保存一个带域名的凭证，后续新建任务时就能自动匹配。
        </p>
      </div>
      <div class="cookie-match-card__actions">
        <el-button size="small" type="primary" plain @click="goToCookieCenter">
          去新增凭证
        </el-button>
      </div>
    </div>

    <template v-if="useCookie">
      <div class="cookie-access-panel__mode">
        <el-radio-group v-model="cookieMode" size="small">
          <el-radio-button label="temporary">临时 Cookie</el-radio-button>
          <el-radio-button label="credential">已保存凭证</el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="cookieMode === 'temporary'" class="cookie-access-panel__body">
        <div class="cookie-inline-grid">
          <el-form-item label="Cookie 内容" class="!mb-0">
            <el-input
              v-model="cookieString"
              placeholder="name1=value1; name2=value2"
              class="font-mono"
              clearable
            />
          </el-form-item>

          <el-form-item label="Cookie 域名" class="!mb-0">
            <el-input
              v-model="cookieDomain"
              placeholder="例如：example.com，留空时按目标 URL 自动匹配"
              class="font-mono"
              clearable
            />
          </el-form-item>
        </div>

        <div class="cookie-panel-hint">{{ temporaryHint }}</div>
      </div>

      <div v-else class="cookie-access-panel__body">
        <div class="cookie-credential-toolbar">
          <el-select
            v-model="cookieCredentialId"
            class="cookie-credential-select"
            filterable
            clearable
            :loading="cookieCredentialsLoading"
            placeholder="选择已保存的 Cookie 凭证"
            @visible-change="(visible: boolean) => visible && ensureCredentialsLoaded()"
          >
            <el-option
              v-for="item in credentials"
              :key="item.id"
              :label="formatCredentialOptionLabel(item)"
              :value="item.id"
              :disabled="!item.isUsable"
            />
          </el-select>

          <div class="cookie-credential-toolbar__actions">
            <el-button plain @click="ensureCredentialsLoaded(true)">刷新</el-button>
            <el-button plain @click="goToCookieCenter">凭证页</el-button>
            <el-button type="primary" plain @click="openManager">管理凭证</el-button>
          </div>
        </div>

        <el-empty
          v-if="!cookieCredentialsLoading && credentials.length === 0"
          description="还没有保存的 Cookie 凭证"
          :image-size="64"
        >
          <el-button type="primary" @click="openManager">创建第一个凭证</el-button>
        </el-empty>

        <div v-else-if="selectedCredential" class="selected-credential-card" data-testid="selected-cookie-credential">
          <div class="selected-credential-card__title">
            <span>{{ selectedCredential.name }}</span>
            <el-tag
              size="small"
              :type="selectedCredentialStatusMeta.tagType"
              effect="light"
            >
              {{ selectedCredentialStatusMeta.label }}
            </el-tag>
          </div>
          <div class="selected-credential-card__meta">
            <span>
              域名：{{ selectedCredential.cookieDomain || "按目标 URL 自动匹配" }}
            </span>
            <span>Cookie 数量：{{ selectedCredential.cookieCount }}</span>
            <span>最近更新：{{ formatDateTime(selectedCredential.updatedAt) }}</span>
            <span v-if="selectedCredential.expiresAt">
              过期时间：{{ formatDateTime(selectedCredential.expiresAt) }}
            </span>
          </div>
          <div
            v-if="!selectedCredentialIsUsable"
            class="selected-credential-card__warning selected-credential-card__warning--danger"
          >
            {{ selectedCredentialStatusMeta.message }}
          </div>
          <div
            v-else-if="taskHost && selectedCredentialHasDomain && !selectedCredentialMatchesTaskUrl"
            class="selected-credential-card__warning"
          >
            当前选择的凭证域名与 {{ taskHost }} 不一致，请确认是否仍要继续使用。
          </div>
          <div
            v-else-if="selectedCredential && !selectedCredentialHasDomain"
            class="selected-credential-card__warning selected-credential-card__warning--soft"
          >
            这个凭证没有填写域名，之后新建同站点任务时系统无法自动匹配，建议去凭证页补全。
          </div>
        </div>
      </div>
    </template>

    <CookieCredentialManagerDialog
      v-model:visible="managerVisible"
      v-model:selected-id="cookieCredentialId"
      @refreshed="handleManagerRefreshed"
    />
  </section>
</template>

<style scoped>
.cookie-access-panel {
  margin: 1rem 0 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(12, 92, 171, 0.05), transparent 58%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
  padding: 1rem 1rem 0.95rem;
}

.cookie-access-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.cookie-access-panel__copy {
  min-width: 0;
}

.cookie-access-panel__title {
  color: #0f172a;
  font-size: 0.98rem;
  font-weight: 700;
}

.cookie-access-panel__desc {
  margin-top: 0.45rem;
  color: #64748b;
  font-size: 0.84rem;
  line-height: 1.6;
}

.cookie-access-panel__mode {
  margin-top: 0.95rem;
}

.cookie-access-panel__body {
  margin-top: 1rem;
}

.cookie-match-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  margin-top: 0.95rem;
  border: 1px solid rgba(12, 92, 171, 0.18);
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(12, 92, 171, 0.08), transparent 64%),
    rgba(255, 255, 255, 0.96);
  padding: 0.85rem 0.95rem;
}

.cookie-match-card--active {
  border-color: rgba(16, 185, 129, 0.28);
}

.cookie-match-card--neutral {
  border-style: dashed;
  background: rgba(248, 250, 252, 0.96);
}

.cookie-match-card__copy {
  min-width: 0;
  flex: 1;
}

.cookie-match-card__title {
  color: #0f172a;
  font-size: 0.88rem;
  font-weight: 700;
}

.cookie-match-card__desc {
  margin-top: 0.28rem;
  color: #64748b;
  font-size: 0.78rem;
  line-height: 1.55;
}

.cookie-match-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.cookie-inline-grid {
  display: grid;
  gap: 0.85rem;
}

.cookie-panel-hint {
  margin-top: 0.65rem;
  color: #64748b;
  font-size: 0.78rem;
  line-height: 1.55;
}

.cookie-credential-toolbar {
  display: grid;
  gap: 0.75rem;
}

.cookie-credential-select {
  width: 100%;
}

.cookie-credential-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.selected-credential-card {
  border: 1px solid rgba(12, 92, 171, 0.16);
  border-radius: 18px;
  background: rgba(12, 92, 171, 0.05);
  padding: 0.9rem 1rem;
}

.selected-credential-card__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  color: #0f172a;
  font-size: 0.92rem;
  font-weight: 700;
}

.selected-credential-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.9rem;
  margin-top: 0.5rem;
  color: #475569;
  font-size: 0.77rem;
  line-height: 1.5;
}

.selected-credential-card__warning {
  margin-top: 0.7rem;
  border-top: 1px dashed rgba(148, 163, 184, 0.45);
  padding-top: 0.7rem;
  color: #b45309;
  font-size: 0.76rem;
  line-height: 1.55;
}

.selected-credential-card__warning--soft {
  color: #64748b;
}

.selected-credential-card__warning--danger {
  color: #b91c1c;
}

.font-mono {
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
}

@media (min-width: 900px) {
  .cookie-inline-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cookie-credential-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }
}

@media (max-width: 899px) {
  .cookie-access-panel__head {
    flex-direction: column;
  }
}
</style>
