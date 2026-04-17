<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <h1 class="page-title">模板中心</h1>
        <p class="page-description">统一沉淀任务配置，支持按分类查找、查看详情、继续编辑，并把可复用配置快速带回任务编排流程。</p>
      </div>

      <div class="flex flex-wrap gap-2">
        <el-button plain @click="router.push('/crawleer/task-list')">返回任务列表</el-button>
        <el-button type="primary" @click="router.push('/crawleer/task-add/basic')">新建任务</el-button>
      </div>
    </header>

    <section class="toolbar-card p-4 sm:p-5">
      <div class="template-toolbar-grid">
        <el-input
          v-model="searchQuery"
          clearable
          placeholder="搜索模板名称、说明或来源任务"
          @input="debouncedSearch"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />

        <el-select
          v-model="selectedCategory"
          clearable
          filterable
          placeholder="按分类筛选"
          @change="handleSearch"
        >
          <el-option
            v-for="category in categories"
            :key="category"
            :label="category"
            :value="category"
          />
        </el-select>

        <div class="template-toolbar-actions">
          <el-button plain @click="resetFilters">重置</el-button>
          <el-button plain :loading="loading" @click="refreshTemplates">刷新</el-button>
        </div>
      </div>
    </section>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article class="metric-card">
        <p class="metric-label">模板总数</p>
        <p class="metric-value">{{ templates.length }}</p>
        <p class="metric-note">当前筛选条件下可用模板</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">分类数</p>
        <p class="metric-value">{{ categories.length }}</p>
        <p class="metric-note">覆盖不同站点结构和业务场景</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">最近更新</p>
        <p class="metric-value !text-2xl">
          {{ templates[0] ? formatShortDate(templates[0].updatedAt) : "--" }}
        </p>
        <p class="metric-note">优先复用最近维护过的模板</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">来源任务</p>
        <p class="metric-value">{{ templates.filter((item) => item.sourceTaskId).length }}</p>
        <p class="metric-note">由现有任务沉淀出的模板数量</p>
      </article>
    </section>

    <section class="surface-card p-5 sm:p-6">
      <div class="page-header">
        <div>
          <h2 class="section-title">模板列表</h2>
          <p class="section-description">模板列表、详情、复制配置、继续编辑、使用模板和删除，都已经接到真实后端接口，不走伪数据。</p>
        </div>
      </div>

      <div v-if="loading" class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="index in 6" :key="index" class="h-56 animate-pulse rounded-3xl bg-slate-100" />
      </div>

      <div v-else-if="templates.length" class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article v-for="template in templates" :key="template.id" class="template-card">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span v-if="template.category" class="inline-chip">{{ template.category }}</span>
                <span v-if="template.sourceTaskId" class="inline-chip">来源任务 #{{ template.sourceTaskId }}</span>
              </div>

              <h3 class="mt-3 text-lg font-bold tracking-tight text-slate-900">
                {{ template.name }}
              </h3>
              <p class="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                {{ template.description || "暂未填写模板说明。" }}
              </p>
            </div>

            <el-button
              text
              :loading="detailLoading && activeTemplateId === template.id"
              @click="openTemplate(template.id)"
            >
              详情
            </el-button>
          </div>

          <div class="glass-divider my-4" />

          <div class="grid gap-3 text-sm text-slate-600">
            <div>
              <span class="detail-label">来源任务</span>
              <p class="detail-value mt-1">{{ template.sourceTaskName || "手动创建" }}</p>
            </div>
            <div>
              <span class="detail-label">目标 URL</span>
              <p class="detail-value mt-1 line-clamp-2">{{ template.url }}</p>
            </div>
            <div class="flex items-center justify-between gap-2 text-xs text-slate-400">
              <span>创建于 {{ formatDate(template.createdAt) }}</span>
              <span>更新于 {{ formatDate(template.updatedAt) }}</span>
            </div>
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <el-button
              size="small"
              type="primary"
              :loading="detailLoading && activeTemplateId === template.id"
              @click="applyTemplate(template.id)"
            >
              使用模板
            </el-button>
            <el-button
              size="small"
              plain
              :loading="detailLoading && activeTemplateId === template.id"
              @click="openTemplate(template.id)"
            >
              预览
            </el-button>
            <el-button
              size="small"
              plain
              :loading="detailLoading && activeTemplateId === template.id"
              @click="startEdit(template.id)"
            >
              编辑
            </el-button>
            <el-button
              size="small"
              text
              type="danger"
              :loading="removingTemplateId === template.id"
              @click="removeTemplate(template)"
            >
              删除
            </el-button>
          </div>
        </article>
      </div>

      <el-empty
        v-else
        class="mt-8"
        description="当前没有匹配的模板，可以先在任务列表里保存一个模板。"
      />
    </section>

    <el-drawer
      v-model="drawerVisible"
      :size="drawerSize"
      :with-header="false"
      class="template-drawer"
    >
      <div v-loading="detailLoading" class="page-shell h-full">
        <header class="page-header">
          <div>
            <p class="metric-label">{{ editing ? "编辑模板" : "模板详情" }}</p>
            <h2 class="page-title !text-2xl">{{ detail?.name || "模板详情" }}</h2>
            <p class="page-description">
              {{ detail?.description || "查看模板配置、来源和适用场景。" }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <el-button v-if="detail" plain @click="copyTemplateConfig(detail)">复制配置</el-button>
            <el-button v-if="detail" type="primary" @click="applyLoadedTemplate">使用模板</el-button>
          </div>
        </header>

        <section v-if="detail" class="surface-card p-5 sm:p-6">
          <div class="detail-grid sm:grid-cols-2">
            <div>
              <div class="detail-label">分类</div>
              <div class="detail-value">{{ detail.category || "未分类" }}</div>
            </div>
            <div>
              <div class="detail-label">来源任务</div>
              <div class="detail-value">{{ detail.sourceTaskName || "手动创建" }}</div>
            </div>
            <div class="sm:col-span-2">
              <div class="detail-label">目标 URL</div>
              <div class="detail-value">{{ detail.url }}</div>
            </div>
          </div>
        </section>

        <section v-if="detail" class="surface-card p-5 sm:p-6">
          <div class="page-header">
            <div>
              <h3 class="section-title">模板编辑</h3>
              <p class="section-description">名称、分类、目标 URL 改成紧凑布局，配置 JSON 和脚本仍保留完整编辑空间。</p>
            </div>
          </div>

          <el-form label-position="top" class="mt-5 grid gap-4" :model="editForm">
            <div class="template-edit-grid">
              <el-form-item label="模板名称">
                <el-input v-model="editForm.name" :disabled="!editing" />
              </el-form-item>
              <el-form-item label="分类">
                <el-input v-model="editForm.category" :disabled="!editing" />
              </el-form-item>
              <el-form-item class="template-edit-grid__wide" label="目标 URL">
                <el-input v-model="editForm.url" :disabled="!editing" />
              </el-form-item>
            </div>

            <el-form-item label="说明">
              <el-input
                v-model="editForm.description"
                type="textarea"
                :rows="3"
                :disabled="!editing"
              />
            </el-form-item>

            <el-form-item label="配置 JSON">
              <el-input
                v-model="editForm.configJson"
                type="textarea"
                :rows="10"
                :disabled="!editing"
                class="font-mono"
              />
            </el-form-item>

            <el-form-item label="脚本">
              <el-input
                v-model="editForm.script"
                type="textarea"
                :rows="6"
                :disabled="!editing"
                class="font-mono"
              />
            </el-form-item>
          </el-form>

          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <el-button v-if="editing" @click="cancelEdit">取消编辑</el-button>
            <el-button v-if="!editing" plain @click="startEdit(detail.id)">开始编辑</el-button>
            <el-button v-if="editing" type="primary" :loading="saving" @click="saveTemplate">保存修改</el-button>
          </div>
        </section>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  deleteTaskTemplateApi,
  getTaskTemplateCategoriesApi,
  getTaskTemplateDetailApi,
  getTaskTemplatesApi,
  updateTaskTemplateApi,
  type TaskTemplateDetail,
  type TaskTemplateSummary,
} from "@/api/task";
import { useTaskFormStore } from "@/stores/taskForm";

const router = useRouter();
const taskFormStore = useTaskFormStore();

const loading = ref(false);
const saving = ref(false);
const detailLoading = ref(false);
const drawerVisible = ref(false);
const editing = ref(false);
const searchQuery = ref("");
const selectedCategory = ref<string | null>(null);
const categories = ref<string[]>([]);
const templates = ref<TaskTemplateSummary[]>([]);
const detail = ref<TaskTemplateDetail | null>(null);
const activeTemplateId = ref<number | null>(null);
const removingTemplateId = ref<number | null>(null);
const drawerSize = computed(() => "min(96vw, 880px)");

const editForm = reactive({
  name: "",
  description: "",
  category: "",
  url: "",
  configJson: "",
  script: "",
});

let searchTimer: number | null = null;

function syncEditForm(payload: TaskTemplateDetail) {
  editForm.name = payload.name;
  editForm.description = payload.description || "";
  editForm.category = payload.category || "";
  editForm.url = payload.url;
  editForm.configJson = JSON.stringify(payload.config || {}, null, 2);
  editForm.script = payload.script || "";
}

async function fetchTemplateCategories() {
  categories.value = await getTaskTemplateCategoriesApi();
}

async function fetchTemplates() {
  try {
    loading.value = true;
    templates.value = await getTaskTemplatesApi({
      search: searchQuery.value.trim() || undefined,
      category: selectedCategory.value || undefined,
    });
  } catch (error) {
    templates.value = [];
    ElMessage.error(error instanceof Error ? error.message : "加载模板失败");
  } finally {
    loading.value = false;
  }
}

async function refreshTemplates() {
  await Promise.all([fetchTemplateCategories(), fetchTemplates()]);
}

function resetFilters() {
  searchQuery.value = "";
  selectedCategory.value = null;
  void fetchTemplates();
}

function debouncedSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }

  searchTimer = window.setTimeout(() => {
    void fetchTemplates();
  }, 320);
}

function handleSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }

  void fetchTemplates();
}

function formatDate(value: string) {
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

function formatShortDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return value;
  }
}

async function openTemplate(templateId: number) {
  activeTemplateId.value = templateId;
  detailLoading.value = true;

  try {
    detail.value = await getTaskTemplateDetailApi(templateId);
    syncEditForm(detail.value);
    editing.value = false;
    drawerVisible.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载模板详情失败");
  } finally {
    detailLoading.value = false;
  }
}

async function applyTemplate(templateId: number) {
  await openTemplate(templateId);
  await applyLoadedTemplate();
}

async function applyLoadedTemplate() {
  if (!detail.value) {
    return;
  }

  taskFormStore.applySerializedTaskConfig({
    name: detail.value.sourceTaskName || detail.value.name,
    url: detail.value.url,
    config: detail.value.config,
    script: detail.value.script,
  });
  drawerVisible.value = false;
  await router.push("/crawleer/task-add/basic");
  ElMessage.success("模板配置已载入，可继续编辑");
}

async function startEdit(templateId: number) {
  if (!detail.value || detail.value.id !== templateId) {
    await openTemplate(templateId);
  }
  editing.value = true;
}

function cancelEdit() {
  if (!detail.value) {
    return;
  }

  syncEditForm(detail.value);
  editing.value = false;
}

async function saveTemplate() {
  if (!detail.value) {
    return;
  }

  let parsedConfig: Record<string, unknown>;
  try {
    parsedConfig = JSON.parse(editForm.configJson || "{}");
  } catch {
    ElMessage.error("配置 JSON 格式不正确");
    return;
  }

  try {
    saving.value = true;
    const response = await updateTaskTemplateApi(detail.value.id, {
      name: editForm.name.trim(),
      description: editForm.description.trim() || undefined,
      category: editForm.category.trim() || undefined,
      url: editForm.url.trim(),
      taskName: detail.value.sourceTaskName || undefined,
      config: parsedConfig,
      script: editForm.script.trim() || undefined,
    });

    detail.value = {
      ...detail.value,
      ...response,
      config: parsedConfig,
      script: editForm.script.trim(),
    };
    editing.value = false;
    await refreshTemplates();
    ElMessage.success("模板已更新");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "更新模板失败");
  } finally {
    saving.value = false;
  }
}

async function removeTemplate(template: TaskTemplateSummary) {
  try {
    await ElMessageBox.confirm(`确定删除模板“${template.name}”吗？`, "提示", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });

    removingTemplateId.value = template.id;
    await deleteTaskTemplateApi(template.id);

    if (detail.value?.id === template.id) {
      drawerVisible.value = false;
      detail.value = null;
      editing.value = false;
    }

    await refreshTemplates();
    ElMessage.success("模板已删除");
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除模板失败");
    }
  } finally {
    removingTemplateId.value = null;
  }
}

async function copyTemplateConfig(template: TaskTemplateDetail) {
  try {
    await navigator.clipboard.writeText(
      JSON.stringify(
        {
          name: template.name,
          url: template.url,
          config: template.config,
          script: template.script,
        },
        null,
        2,
      ),
    );
    ElMessage.success("模板配置已复制到剪贴板");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "复制失败");
  }
}

onMounted(() => {
  void refreshTemplates();
});
</script>

<style scoped>
.template-toolbar-grid {
  display: grid;
  gap: 0.75rem;
  align-items: center;
}

.template-toolbar-actions {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 0.6rem;
}

.template-card {
  border: 1px solid rgba(226, 232, 240, 0.85);
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(12, 92, 171, 0.08), transparent 60%),
    rgba(255, 255, 255, 0.96);
  padding: 1.25rem;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.template-card:hover {
  transform: translateY(-2px);
  border-color: rgba(12, 92, 171, 0.22);
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.08);
}

.template-edit-grid {
  display: grid;
  gap: 1rem;
}

.template-edit-grid__wide {
  grid-column: 1 / -1;
}

.font-mono :deep(textarea) {
  font-family: "Monaco", "Menlo", "Consolas", monospace;
}

@media (min-width: 1024px) {
  .template-toolbar-grid {
    grid-template-columns: minmax(0, 1.5fr) 220px auto;
  }

  .template-edit-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1023px) {
  .template-toolbar-actions {
    flex-wrap: wrap;
  }
}
</style>
