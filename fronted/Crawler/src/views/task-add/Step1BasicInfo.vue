<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { View } from "@element-plus/icons-vue";
import { previewScreenshotApi } from "@/api/task";
import CookieAccessPanel from "@/components/task/CookieAccessPanel.vue";
import { buildTaskCookiePayload, useTaskFormStore } from "@/stores/taskForm";

const router = useRouter();
const store = useTaskFormStore();
const loading = ref(false);
const previewBase64 = ref("");
const formRef = ref();

const rules = reactive({
  name: [{ required: true, message: "任务名称不能为空", trigger: "blur" }],
  url: [
    { required: true, message: "初始 URL 不能为空", trigger: "blur" },
    { type: "url", message: "请输入合法 URL", trigger: "blur" },
  ],
});

const cookieAccessModel = computed({
  get: () => ({
    useCookie: store.crawlerConfig.useCookie,
    cookieMode: store.crawlerConfig.cookieMode,
    cookieString: store.crawlerConfig.cookieString,
    cookieDomain: store.crawlerConfig.cookieDomain,
    cookieCredentialId: store.crawlerConfig.cookieCredentialId,
  }),
  set: (value) => {
    Object.assign(store.crawlerConfig, value);
  },
});

async function fetchPreview() {
  if (!store.form.url || !/^https?:\/\//.test(store.form.url)) {
    previewBase64.value = "";
    return;
  }

  loading.value = true;
  try {
    const res = await previewScreenshotApi({
      url: store.form.url,
      ...buildTaskCookiePayload(store.crawlerConfig),
    });
    previewBase64.value = res.screenshotBase64;
  } catch (error) {
    previewBase64.value = "";
    ElMessage.error(error instanceof Error ? error.message : "预览获取失败");
  } finally {
    loading.value = false;
  }
}

function nextStep() {
  formRef.value?.validate((valid: boolean) => {
    if (!valid) {
      return;
    }

    router.push({ path: "structure" });
  });
}
</script>

<template>
  <el-card class="mt-6 task-basic-card">
    <div class="task-basic-layout">
      <el-form
        ref="formRef"
        :model="store.form"
        :rules="rules"
        label-width="96px"
        class="task-basic-form"
      >
        <div class="task-basic-title">基础信息</div>
        <div class="task-basic-subtitle">
          先确认任务名称、目标页面和访问凭证，后面的页面预览、结构识别和字段解析会自动复用。
        </div>

        <el-form-item label="任务名称" prop="name">
          <el-input
            v-model="store.form.name"
            placeholder="请输入任务名称"
            data-testid="task-basic-name"
          />
        </el-form-item>

        <el-form-item label="初始 URL" prop="url">
          <el-input
            v-model="store.form.url"
            placeholder="https://example.com/list"
            data-testid="task-basic-url"
          />
        </el-form-item>

        <CookieAccessPanel
          v-model="cookieAccessModel"
          :task-url="store.form.url"
          description="如果目标页面登录后才可见，可以先用临时 Cookie 调试，也可以切换成已保存凭证做安全复用。"
          temporary-hint="当前草稿只保存在前端内存和 Pinia 中，不会写入 localStorage / sessionStorage。若已在 Cookie 凭证页保存过站点登录态，输入 URL 后会自动推荐可复用凭证。"
        />

        <div class="task-basic-actions">
          <el-button type="primary" :loading="loading" @click="fetchPreview">
            {{ previewBase64 ? "刷新预览" : "获取预览" }}
          </el-button>
          <el-button @click="nextStep">下一步</el-button>
        </div>
      </el-form>

      <section class="task-preview-shell" v-loading="loading">
        <div class="task-preview-head">
          <div class="task-preview-title">
            <el-icon><View /></el-icon>
            <span>页面预览</span>
          </div>
          <div class="task-preview-desc">先确认登录态是否生效，再进入结构识别。</div>
        </div>

        <el-image
          v-if="previewBase64"
          :src="previewBase64"
          :preview-src-list="[previewBase64]"
          fit="contain"
          class="task-preview-image"
        />
        <div v-else class="task-preview-empty">
          <div>预览区域</div>
          <p>输入 URL 后可先尝试抓取页面截图，登录态页面也支持带 Cookie 预览。</p>
        </div>
      </section>
    </div>
  </el-card>
</template>

<style scoped>
.task-basic-card :deep(.el-card__body) {
  height: 100%;
}

.task-basic-layout {
  display: grid;
  gap: 1.25rem;
  min-height: 100%;
  position: relative;
  z-index: 0;
}

.task-basic-form {
  min-width: 0;
}

.task-basic-title {
  color: #0f172a;
  font-size: 1.1rem;
  font-weight: 700;
}

.task-basic-subtitle {
  margin: 0.35rem 0 1.25rem;
  color: #64748b;
  font-size: 0.92rem;
  line-height: 1.6;
}

.task-basic-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.task-preview-shell {
  position: relative;
  z-index: 0;
  isolation: isolate;
  display: flex;
  min-height: 420px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
}

.task-preview-head {
  border-bottom: 1px solid rgba(226, 232, 240, 0.85);
  padding: 1rem 1.1rem 0.9rem;
}

.task-preview-title {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #0f172a;
  font-size: 0.98rem;
  font-weight: 700;
}

.task-preview-desc {
  margin-top: 0.35rem;
  color: #64748b;
  font-size: 0.82rem;
}

.task-preview-image {
  flex: 1;
  min-height: 0;
}

.task-preview-shell :deep(.el-loading-mask) {
  z-index: 1;
}

.task-preview-empty {
  display: flex;
  flex: 1;
  min-height: 280px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  color: #94a3b8;
  text-align: center;
}

.task-preview-empty p {
  margin-top: 0.5rem;
  max-width: 24rem;
  font-size: 0.84rem;
  line-height: 1.6;
}

@media (min-width: 1100px) {
  .task-basic-layout {
    grid-template-columns: minmax(340px, 420px) minmax(0, 1fr);
    align-items: stretch;
  }
}
</style>
