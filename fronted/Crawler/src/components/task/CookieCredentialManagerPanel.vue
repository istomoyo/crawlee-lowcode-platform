<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  createTaskCookieCredentialApi,
  deleteTaskCookieCredentialApi,
  getTaskCookieCredentialDetailApi,
  updateTaskCookieCredentialApi,
  type TaskCookieCredentialSummary,
} from "@/api/task";
import { useCookieCredentials } from "@/composables/useCookieCredentials";
import { getCookieCredentialStatusMeta } from "@/utils/cookie-credential";

const props = withDefaults(
  defineProps<{
    active?: boolean;
    selectedId?: number | null;
    stacked?: boolean;
  }>(),
  {
    active: true,
    selectedId: null,
    stacked: false,
  },
);

const emit = defineEmits<{
  "update:selectedId": [number | null];
  refreshed: [];
}>();

const { credentials, cookieCredentialsLoading, fetchCookieCredentials } =
  useCookieCredentials();

const saving = ref(false);
const detailLoading = ref(false);
const initialized = ref(false);
const keyword = ref("");
const mode = ref<"create" | "edit">("create");
const editingId = ref<number | null>(null);

const form = reactive({
  name: "",
  cookieDomain: "",
  cookieString: "",
  notes: "",
  expiresAt: "",
});

const currentSelectionId = computed({
  get: () => props.selectedId ?? null,
  set: (value: number | null) => emit("update:selectedId", value),
});

const selectedSummary = computed(
  () => credentials.value.find((item) => item.id === currentSelectionId.value) || null,
);

const filteredCredentials = computed(() => {
  const searchValue = keyword.value.trim().toLowerCase();
  if (!searchValue) {
    return credentials.value;
  }

  return credentials.value.filter((item) =>
    [item.name, item.cookieDomain].some((field) =>
      String(field || "").toLowerCase().includes(searchValue),
    ),
  );
});

const domainBoundCount = computed(
  () => credentials.value.filter((item) => String(item.cookieDomain || "").trim()).length,
);

watch(
  () => props.active,
  (active) => {
    if (active) {
      void initialize(true);
    }
  },
  { immediate: true },
);

watch(
  () => props.selectedId,
  (selectedId) => {
    if (!props.active || !initialized.value) {
      return;
    }

    if (selectedId && selectedId !== editingId.value) {
      void startEdit(selectedId, false);
      return;
    }

    if (!selectedId && editingId.value) {
      resetForm();
    }
  },
);

async function initialize(force = false) {
  try {
    await fetchCookieCredentials(force || !initialized.value);
    initialized.value = true;
    emit("refreshed");

    if (props.selectedId) {
      await startEdit(props.selectedId, false);
    } else if (!editingId.value) {
      resetForm();
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载 Cookie 凭证失败");
  }
}

function resetForm() {
  mode.value = "create";
  editingId.value = null;
  form.name = "";
  form.cookieDomain = "";
  form.cookieString = "";
  form.notes = "";
  form.expiresAt = "";
}

async function refreshList(force = true) {
  await fetchCookieCredentials(force);
  emit("refreshed");
}

async function startEdit(id: number, syncSelection = true) {
  detailLoading.value = true;
  try {
    const detail = await getTaskCookieCredentialDetailApi(id);
    mode.value = "edit";
    editingId.value = id;
    form.name = detail.name;
    form.cookieDomain = detail.cookieDomain || "";
    form.cookieString = "";
    form.notes = detail.notes || "";
    form.expiresAt = detail.expiresAt
      ? formatDateTimeForInput(detail.expiresAt)
      : "";

    if (syncSelection) {
      currentSelectionId.value = id;
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载凭证详情失败");
  } finally {
    detailLoading.value = false;
  }
}

function startCreate() {
  currentSelectionId.value = null;
  resetForm();
}

async function submitForm() {
  const name = form.name.trim();
  const cookieString = form.cookieString.trim();
  const cookieDomain = form.cookieDomain.trim();
  const notes = form.notes.trim();

  if (!name) {
    ElMessage.error("请输入凭证名称");
    return;
  }

  if (mode.value === "create" && !cookieString) {
    ElMessage.error("新建凭证时必须填写 Cookie 内容");
    return;
  }

  saving.value = true;
  try {
    if (mode.value === "create") {
      const created = await createTaskCookieCredentialApi({
        name,
        cookieString,
        cookieDomain: cookieDomain || undefined,
        notes: notes || undefined,
        expiresAt: form.expiresAt || undefined,
      });
      await refreshList(true);
      currentSelectionId.value = created.id;
      await startEdit(created.id, false);
      ElMessage.success("Cookie 凭证已创建");
      return;
    }

    if (!editingId.value) {
      ElMessage.error("当前没有可更新的凭证");
      return;
    }

    await updateTaskCookieCredentialApi(editingId.value, {
      name,
      cookieString: cookieString || undefined,
      cookieDomain,
      notes,
      expiresAt: form.expiresAt,
    });
    await refreshList(true);
    currentSelectionId.value = editingId.value;
    ElMessage.success("Cookie 凭证已更新");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存 Cookie 凭证失败");
  } finally {
    saving.value = false;
  }
}

async function removeCredential(item: TaskCookieCredentialSummary) {
  try {
    await ElMessageBox.confirm(`确定删除 Cookie 凭证“${item.name}”吗？`, "删除凭证", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });

    await deleteTaskCookieCredentialApi(item.id);
    await refreshList(true);

    if (currentSelectionId.value === item.id) {
      currentSelectionId.value = null;
    }

    if (editingId.value === item.id) {
      resetForm();
    }

    ElMessage.success("Cookie 凭证已删除");
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除 Cookie 凭证失败");
    }
  }
}

function useCredential(item: TaskCookieCredentialSummary) {
  currentSelectionId.value = item.id;
  void startEdit(item.id, false);
}

function getCredentialMeta(item: TaskCookieCredentialSummary | null) {
  return getCookieCredentialStatusMeta(item);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "未设置";
  }

  try {
    return new Date(value).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function formatDateTimeForInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}
</script>

<template>
  <div
    class="credential-manager-layout"
    :class="{ 'is-stacked': props.stacked }"
    data-testid="cookie-credential-manager"
  >
    <section class="credential-list-panel">
      <div class="panel-toolbar">
        <div>
          <h3>已保存凭证</h3>
          <p>{{ credentials.length }} 个凭证，可自动匹配 {{ domainBoundCount }} 个域名站点。</p>
        </div>
        <div class="panel-toolbar__actions">
          <el-button plain size="small" @click="refreshList(true)" data-testid="cookie-refresh-button">
            刷新
          </el-button>
          <el-button type="primary" size="small" @click="startCreate" data-testid="cookie-create-button">
            新建
          </el-button>
        </div>
      </div>

      <el-input
        v-model="keyword"
        clearable
        placeholder="搜索凭证名称或域名"
        class="credential-search"
        data-testid="cookie-search-input"
      />

      <div v-loading="cookieCredentialsLoading" class="credential-list app-scrollbar">
        <el-empty
          v-if="!cookieCredentialsLoading && credentials.length === 0"
          description="还没有保存的 Cookie 凭证"
          :image-size="72"
        />

        <el-empty
          v-else-if="!cookieCredentialsLoading && filteredCredentials.length === 0"
          description="没有匹配的 Cookie 凭证"
          :image-size="72"
        />

        <article
          v-for="item in filteredCredentials"
          :key="item.id"
          class="credential-card"
          :class="{ 'is-active': item.id === currentSelectionId }"
          data-testid="cookie-credential-card"
          @click="useCredential(item)"
        >
          <div class="credential-card__header">
            <div class="min-w-0">
              <div class="credential-card__title">
                <span>{{ item.name }}</span>
                <el-tag
                  size="small"
                  :type="getCredentialMeta(item).tagType"
                  effect="light"
                >
                  {{ getCredentialMeta(item).label }}
                </el-tag>
              </div>
              <div class="credential-card__domain">
                {{ item.cookieDomain || "未填写域名，任务创建时不会自动匹配" }}
              </div>
            </div>
            <span class="credential-card__count">{{ item.cookieCount }} 项</span>
          </div>

          <div class="credential-card__meta">
            <span>更新：{{ formatDateTime(item.updatedAt) }}</span>
            <span v-if="item.expiresAt">过期：{{ formatDateTime(item.expiresAt) }}</span>
            <span v-if="item.lastUsedAt">最近使用：{{ formatDateTime(item.lastUsedAt) }}</span>
          </div>

          <div class="credential-card__actions">
            <el-button size="small" text @click.stop="useCredential(item)">使用</el-button>
            <el-button size="small" text @click.stop="startEdit(item.id)">编辑</el-button>
            <el-button size="small" text type="danger" @click.stop="removeCredential(item)">
              删除
            </el-button>
          </div>
        </article>
      </div>
    </section>

    <section class="credential-form-panel" v-loading="detailLoading">
      <div class="panel-toolbar">
        <div>
          <h3>{{ mode === "create" ? "新建凭证" : "编辑凭证" }}</h3>
          <p>
            {{
              mode === "create"
                ? "建议按站点或账号用途命名，后续任务就能直接复用。"
                : "更新时 Cookie 内容可留空，仅修改名称、域名和备注。"
            }}
          </p>
        </div>
      </div>

      <div class="credential-security-note">
        <div class="credential-security-note__title">填写说明</div>
        <div class="credential-security-note__list">
          <span>只粘贴请求头里的 Cookie 值，例如：`session=abc; theme=dark`</span>
          <span>不要包含 `Cookie:` 前缀，也不要换行</span>
          <span>建议填写域名，例如 `example.com`，这样新建任务时才能自动匹配</span>
          <span>Cookie 明文只在服务端加密保存，任务和模板里只保留凭证引用</span>
        </div>
      </div>

      <el-form label-position="top" class="credential-form">
        <section class="credential-form-section">
          <div class="credential-form-section__header">
            <div>
              <div class="credential-form-section__title">基本信息</div>
              <p class="credential-form-section__description">
                先定义这份凭证的名称和适用站点，后续任务创建时才更容易自动匹配和复用。
              </p>
            </div>
          </div>

          <div class="credential-form-grid credential-form-grid--basic">
            <el-form-item label="凭证名称" required class="credential-form-item">
              <div data-testid="cookie-name-input">
                <el-input
                  v-model="form.name"
                  clearable
                  placeholder="例如：知乎主账号 / 内网测试账号"
                />
              </div>
            </el-form-item>

            <el-form-item label="Cookie 域名" class="credential-form-item">
              <div data-testid="cookie-domain-input">
                <el-input
                  v-model="form.cookieDomain"
                  clearable
                  placeholder="例如：example.com，留空时只能手动选择"
                  class="font-mono"
                />
              </div>
            </el-form-item>
          </div>
        </section>

        <section class="credential-form-section credential-form-section--accent">
          <div class="credential-form-section__header">
            <div>
              <div class="credential-form-section__title">
                {{ mode === "create" ? "Cookie 内容" : "替换 Cookie 内容" }}
              </div>
              <p class="credential-form-section__description">
                这里填写浏览器请求头中的整段 Cookie 值，是这张表单最核心的输入区域。
              </p>
            </div>
            <span class="credential-form-section__badge">
              {{ mode === "create" ? "新建时必填" : "留空则保持不变" }}
            </span>
          </div>

          <el-form-item
            :label="mode === 'create' ? 'Cookie 明文' : '新的 Cookie 明文'"
            :required="mode === 'create'"
            class="credential-form-item"
          >
            <div data-testid="cookie-string-input">
              <el-input
                v-model="form.cookieString"
                type="textarea"
                :autosize="{ minRows: 6, maxRows: 12 }"
                placeholder="name1=value1; name2=value2"
                class="font-mono"
              />
            </div>
            <div class="field-hint field-hint--panel">
              {{
                mode === "create"
                  ? "请直接粘贴浏览器请求头中的整段 Cookie 值，不要额外补前缀，也不要换行。"
                  : "留空表示继续使用当前已加密保存的 Cookie，不会回显旧值；只有填写了新内容时才会替换。"
              }}
            </div>
          </el-form-item>
        </section>

        <section class="credential-form-section">
          <div class="credential-form-section__header">
            <div>
              <div class="credential-form-section__title">附加信息</div>
              <p class="credential-form-section__description">
                这些信息不是必填项，但能帮助你更清楚地维护凭证生命周期和使用场景。
              </p>
            </div>
          </div>

          <div class="credential-form-grid credential-form-grid--meta">
            <el-form-item label="过期时间" class="credential-form-item">
              <el-date-picker
                v-model="form.expiresAt"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss"
                format="YYYY-MM-DD HH:mm"
                placeholder="可选"
                class="w-full"
              />
            </el-form-item>

            <el-form-item label="备注" class="credential-form-item">
              <div data-testid="cookie-notes-input">
                <el-input
                  v-model="form.notes"
                  type="textarea"
                  :autosize="{ minRows: 4, maxRows: 8 }"
                  placeholder="例如：仅用于本地调试，不用于生产账号"
                />
              </div>
            </el-form-item>
          </div>
        </section>

        <div v-if="selectedSummary" class="credential-status">
          <div class="credential-status__label">当前凭证状态</div>
          <div class="credential-status__headline">
            <el-tag
              size="small"
              :type="getCredentialMeta(selectedSummary).tagType"
              effect="light"
            >
              {{ getCredentialMeta(selectedSummary).label }}
            </el-tag>
            <span>{{ getCredentialMeta(selectedSummary).message }}</span>
          </div>
          <div class="credential-status__list">
            <span class="credential-status__item">
              最近使用：{{ formatDateTime(selectedSummary.lastUsedAt) }}
            </span>
            <span class="credential-status__item">
              最近更新：{{ formatDateTime(selectedSummary.updatedAt) }}
            </span>
            <span v-if="selectedSummary.expiresAt" class="credential-status__item">
              到期时间：{{ formatDateTime(selectedSummary.expiresAt) }}
            </span>
          </div>
        </div>

        <div class="credential-form__actions">
          <p class="credential-form__action-note">
            {{
              mode === "create"
                ? "保存后，这份凭证就能在新建任务时按域名自动匹配。"
                : "保存后会立即更新这份凭证；如果填写了新的 Cookie 内容，也会同步替换。"
            }}
          </p>
          <div class="credential-form__buttons">
            <el-button plain @click="startCreate" data-testid="cookie-clear-button">清空</el-button>
            <el-button
              type="primary"
              :loading="saving"
              @click="submitForm"
              data-testid="cookie-save-button"
            >
              {{ mode === "create" ? "保存新凭证" : "保存修改" }}
            </el-button>
          </div>
        </div>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.credential-manager-layout {
  display: grid;
  gap: 1rem;
}

.credential-list-panel,
.credential-form-panel {
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
  padding: 1.2rem;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.06);
}

.panel-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.9rem;
  margin-bottom: 1rem;
}

.panel-toolbar h3 {
  color: #0f172a;
  font-size: 1.02rem;
  font-weight: 700;
}

.panel-toolbar p {
  margin-top: 0.25rem;
  color: #64748b;
  font-size: 0.8rem;
  line-height: 1.5;
}

.panel-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.credential-search {
  margin-bottom: 0.9rem;
}

.credential-list {
  display: grid;
  gap: 0.85rem;
  max-height: 68vh;
  overflow: auto;
  padding-right: 0.2rem;
}

.credential-card {
  border: 1px solid rgba(203, 213, 225, 0.75);
  border-radius: 20px;
  background: #fff;
  padding: 1rem;
  text-align: left;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
  cursor: pointer;
}

.credential-card:hover {
  transform: translateY(-1px);
  border-color: rgba(12, 92, 171, 0.32);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
}

.credential-card.is-active {
  border-color: rgba(12, 92, 171, 0.55);
  box-shadow: 0 14px 32px rgba(12, 92, 171, 0.12);
}

.credential-card__header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.credential-card__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  color: #0f172a;
  font-size: 0.98rem;
  font-weight: 700;
}

.credential-card__domain {
  margin-top: 0.3rem;
  color: #475569;
  font-size: 0.82rem;
  line-height: 1.5;
  word-break: break-all;
}

.credential-card__count {
  flex-shrink: 0;
  border-radius: 999px;
  background: rgba(12, 92, 171, 0.08);
  color: #0c5cab;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.22rem 0.55rem;
}

.credential-card__meta {
  display: grid;
  gap: 0.2rem;
  margin-top: 0.7rem;
  color: #64748b;
  font-size: 0.75rem;
}

.credential-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.35rem;
  margin-top: 0.65rem;
}

.credential-security-note {
  border: 1px solid rgba(12, 92, 171, 0.12);
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(12, 92, 171, 0.07), transparent 62%),
    rgba(248, 250, 252, 0.98);
  padding: 1rem 1.05rem;
}

.credential-security-note__title {
  color: #0f172a;
  font-size: 0.9rem;
  font-weight: 700;
}

.credential-security-note__list {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.55rem;
  color: #475569;
  font-size: 0.78rem;
  line-height: 1.55;
}

.credential-form {
  display: grid;
  gap: 1.1rem;
  margin-top: 1.05rem;
}

.credential-status {
  display: grid;
  gap: 0.65rem;
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  padding: 0.95rem 1rem;
}

.credential-form__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid rgba(226, 232, 240, 0.95);
  padding-top: 0.95rem;
}

.field-hint {
  color: #64748b;
  font-size: 0.77rem;
  line-height: 1.55;
}

.field-hint--panel {
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.88);
  padding: 0.7rem 0.8rem;
}

:deep(.credential-search .el-input__wrapper),
:deep(.credential-form .el-input__wrapper),
:deep(.credential-form .el-date-editor.el-input__wrapper) {
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 0 0 1px rgba(203, 213, 225, 0.9) inset;
  transition:
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}

:deep(.credential-search .el-input__wrapper),
:deep(.credential-form .el-input__wrapper),
:deep(.credential-form .el-date-editor.el-input__wrapper) {
  min-height: 46px;
}

:deep(.credential-form .el-input__wrapper:hover),
:deep(.credential-form .el-date-editor.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.32) inset;
}

:deep(.credential-form .el-input__wrapper.is-focus),
:deep(.credential-form .el-date-editor.el-input__wrapper.is-focus) {
  background: rgba(255, 255, 255, 1);
  box-shadow:
    0 0 0 1.5px rgba(59, 130, 246, 0.76) inset,
    0 0 0 4px rgba(59, 130, 246, 0.12);
}

:deep(.credential-form .el-input__inner),
:deep(.credential-form .el-textarea__inner),
:deep(.credential-form .el-input__inner::placeholder),
:deep(.credential-form .el-textarea__inner::placeholder) {
  font-size: 0.86rem;
}

:deep(.credential-form .el-input__inner::placeholder),
:deep(.credential-form .el-textarea__inner::placeholder) {
  color: #94a3b8;
}

:deep(.credential-form .el-textarea__inner) {
  min-height: 132px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 0 0 1px rgba(203, 213, 225, 0.9) inset;
  padding-top: 0.85rem;
  line-height: 1.65;
  resize: vertical;
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

:deep(.credential-form .el-textarea__inner:hover) {
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.32) inset;
}

:deep(.credential-form .el-textarea__inner:focus) {
  box-shadow:
    0 0 0 1.5px rgba(59, 130, 246, 0.76) inset,
    0 0 0 4px rgba(59, 130, 246, 0.12);
}

:deep(.credential-form .el-form-item__label) {
  color: #334155;
  font-size: 0.83rem;
  font-weight: 700;
  line-height: 1.3;
  margin-bottom: 0.45rem;
}

.credential-form-section {
  display: grid;
  gap: 1rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.95));
  padding: 1rem;
}

.credential-form-section--accent {
  border-color: rgba(59, 130, 246, 0.18);
  background:
    linear-gradient(135deg, rgba(59, 130, 246, 0.08), transparent 52%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 250, 252, 0.96));
}

.credential-form-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
}

.credential-form-section__title {
  color: #0f172a;
  font-size: 0.96rem;
  font-weight: 700;
}

.credential-form-section__description {
  margin-top: 0.3rem;
  color: #64748b;
  font-size: 0.8rem;
  line-height: 1.55;
}

.credential-form-section__badge {
  flex-shrink: 0;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.1);
  color: #1d4ed8;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.28rem 0.65rem;
}

.credential-form-grid {
  display: grid;
  gap: 0.95rem 1rem;
}

.credential-form-item {
  margin-bottom: 0;
}

.credential-form-item :deep(.el-form-item__content) {
  display: grid;
  gap: 0.6rem;
}

.credential-status__label {
  color: #0f172a;
  font-size: 0.83rem;
  font-weight: 700;
}

.credential-status__headline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  color: #475569;
  font-size: 0.78rem;
  line-height: 1.55;
}

.credential-status__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem 0.7rem;
}

.credential-status__item {
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.95);
  color: #475569;
  font-size: 0.75rem;
  line-height: 1.4;
  padding: 0.38rem 0.72rem;
}

.credential-form__action-note {
  max-width: 34rem;
  color: #64748b;
  font-size: 0.78rem;
  line-height: 1.6;
}

.credential-form__buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.65rem;
}

.font-mono {
  font-family: "Monaco", "Menlo", "Consolas", monospace;
}

@media (min-width: 960px) {
  .credential-manager-layout:not(.is-stacked) {
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    align-items: start;
  }

  .credential-form-grid--basic {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .credential-form-grid--meta {
    grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  }
}

@media (max-width: 959px) {
  .credential-list {
    max-height: none;
  }

  .credential-form__actions,
  .credential-form-section__header {
    flex-direction: column;
    align-items: stretch;
  }

  .credential-form__buttons {
    justify-content: flex-start;
  }
}

.credential-manager-layout.is-stacked .credential-list {
  max-height: none;
}
</style>
