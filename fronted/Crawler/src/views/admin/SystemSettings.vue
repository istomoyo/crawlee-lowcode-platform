<template>
  <div v-loading="loading && !isReady" class="page-shell">
    <header class="page-header">
      <div>
        <h1 class="page-title">系统设置</h1>
        <p class="page-description">统一管理平台公告、维护提示、爬虫资源参数与清理策略，同时保持后台表单在不同屏宽下都清晰易读。</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <el-button plain :loading="loading" @click="reloadAll">刷新</el-button>
        <el-button type="primary" :loading="saving" :disabled="!isReady || loading" @click="saveSettings">保存设置</el-button>
      </div>
    </header>

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article class="metric-card">
        <p class="metric-label">运行状态</p>
        <p class="metric-value !text-2xl">{{ displayText(systemInfo.status, infoLoaded) }}</p>
        <p class="metric-note">服务启动于 {{ displayText(formatDate(systemInfo.startTime), infoLoaded) }}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">系统版本</p>
        <p class="metric-value !text-2xl">{{ displayText(systemInfo.version, infoLoaded) }}</p>
        <p class="metric-note">运行时长 {{ infoLoaded ? formatUptime(systemInfo.uptime) : "--" }}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">平台公告</p>
        <p class="metric-value">{{ settingsLoaded ? (settings.basic.announcementEnabled ? "开启" : "关闭") : "--" }}</p>
        <p class="metric-note">当前标题 {{ displayText(settings.basic.announcementTitle, settingsLoaded) }}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">自动清理</p>
        <p class="metric-value">{{ settingsLoaded ? (settings.storage.autoCleanup ? cleanupModeLabel(settings.storage.cleanupMode) : "关闭") : "--" }}</p>
        <p class="metric-note">执行时间 {{ displayText(settings.storage.cleanupTime, settingsLoaded) }}</p>
      </article>
    </section>

    <section class="surface-card p-5 sm:p-6">
      <el-tabs v-model="activeTab" class="app-tabs">
        <el-tab-pane label="平台与公告" name="platform">
          <div class="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <article class="toolbar-card p-5">
              <div class="page-header">
                <div>
                  <h2 class="section-title">平台基础信息</h2>
                  <p class="section-description">这些信息会同步到布局标题、对外展示信息与登录页文案。</p>
                </div>
              </div>
              <el-form label-position="top" class="mt-5 grid gap-4">
                <el-form-item label="系统名称"><el-input v-model="settings.basic.systemName" placeholder="Crawlee Workspace" /></el-form-item>
                <el-form-item label="系统描述"><el-input v-model="settings.basic.systemDescription" maxlength="120" show-word-limit placeholder="描述平台用途、团队定位或当前版本重点" /></el-form-item>
                <div class="grid gap-4 md:grid-cols-2">
                  <el-form-item label="管理员邮箱"><el-input v-model="settings.basic.adminEmail" placeholder="admin@example.com" /></el-form-item>
                  <el-form-item label="语言">
                    <el-select v-model="settings.basic.language" class="w-full">
                      <el-option label="中文" value="zh-CN" />
                      <el-option label="English" value="en-US" />
                    </el-select>
                  </el-form-item>
                </div>
              </el-form>
            </article>

            <article class="toolbar-card p-5">
              <div class="page-header">
                <div>
                  <h2 class="section-title">公告预览</h2>
                  <p class="section-description">实时预览工作台顶部和维护提示卡片的展示状态。</p>
                </div>
              </div>
              <div class="mt-5 grid gap-4">
                <div class="rounded-3xl border border-slate-200/80 bg-white p-4">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="metric-label">平台公告</p>
                      <p class="mt-2 text-base font-semibold text-slate-900">{{ settings.basic.announcementTitle || "未设置公告标题" }}</p>
                    </div>
                    <el-switch v-model="settings.basic.announcementEnabled" />
                  </div>
                  <p class="mt-3 text-sm leading-6 text-slate-600">{{ settings.basic.announcementContent || "公告内容会展示在工作台顶部。" }}</p>
                </div>

                <div class="rounded-3xl border border-slate-200/80 bg-white p-4">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="metric-label">维护提示</p>
                      <p class="mt-2 text-base font-semibold text-slate-900">{{ settings.basic.maintenanceTitle || "未设置维护标题" }}</p>
                    </div>
                    <el-switch v-model="settings.basic.maintenanceEnabled" />
                  </div>
                  <p class="mt-3 text-sm leading-6 text-slate-600">{{ settings.basic.maintenanceContent || "维护信息会优先展示给所有用户。" }}</p>
                </div>
              </div>
            </article>
          </div>

          <div class="mt-4 grid gap-4 xl:grid-cols-2">
            <article class="toolbar-card p-5">
              <h3 class="section-title">平台公告</h3>
              <el-form label-position="top" class="mt-5 grid gap-4">
                <el-form-item label="启用公告"><el-switch v-model="settings.basic.announcementEnabled" /></el-form-item>
                <el-form-item label="公告标题"><el-input v-model="settings.basic.announcementTitle" maxlength="60" show-word-limit /></el-form-item>
                <el-form-item label="公告内容"><el-input v-model="settings.basic.announcementContent" maxlength="220" show-word-limit /></el-form-item>
                <el-form-item label="公告样式">
                  <el-select v-model="settings.basic.announcementVariant" class="w-full">
                    <el-option label="信息" value="info" />
                    <el-option label="成功" value="success" />
                    <el-option label="提醒" value="warning" />
                  </el-select>
                </el-form-item>
              </el-form>
            </article>

            <article class="toolbar-card p-5">
              <h3 class="section-title">维护提示</h3>
              <el-form label-position="top" class="mt-5 grid gap-4">
                <el-form-item label="启用维护提示"><el-switch v-model="settings.basic.maintenanceEnabled" /></el-form-item>
                <el-form-item label="维护标题"><el-input v-model="settings.basic.maintenanceTitle" maxlength="60" show-word-limit /></el-form-item>
                <el-form-item label="维护内容"><el-input v-model="settings.basic.maintenanceContent" maxlength="220" show-word-limit /></el-form-item>
                <div class="grid gap-4 md:grid-cols-2">
                  <el-form-item label="维护样式">
                    <el-select v-model="settings.basic.maintenanceVariant" class="w-full">
                      <el-option label="信息" value="info" />
                      <el-option label="成功" value="success" />
                      <el-option label="提醒" value="warning" />
                      <el-option label="错误" value="error" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="开始时间">
                    <el-date-picker v-model="settings.basic.maintenanceStartAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" format="YYYY-MM-DD HH:mm" class="w-full" />
                  </el-form-item>
                </div>
                <el-form-item label="结束时间">
                  <el-date-picker v-model="settings.basic.maintenanceEndAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" format="YYYY-MM-DD HH:mm" class="w-full" />
                </el-form-item>
              </el-form>
            </article>
          </div>
        </el-tab-pane>

        <el-tab-pane label="爬虫与存储" name="crawler">
          <div class="grid gap-4 xl:grid-cols-2">
            <article class="toolbar-card p-5">
              <h2 class="section-title">爬虫引擎</h2>
              <el-form label-position="top" class="mt-5 grid gap-4">
                <div class="grid gap-4 md:grid-cols-2">
                  <el-form-item label="默认并发"><el-input-number v-model="settings.crawler.defaultConcurrency" :min="1" :max="20" class="w-full" /></el-form-item>
                  <el-form-item label="单任务最大请求数"><el-input-number v-model="settings.crawler.maxRequestsPerCrawl" :min="1" :max="5000" class="w-full" /></el-form-item>
                </div>
                <div class="grid gap-4 md:grid-cols-2">
                  <el-form-item label="请求超时（秒）"><el-input-number v-model="settings.crawler.requestTimeout" :min="5" :max="300" class="w-full" /></el-form-item>
                  <el-form-item label="默认等待（毫秒）"><el-input-number v-model="settings.crawler.waitForTimeout" :min="500" :max="120000" :step="500" class="w-full" /></el-form-item>
                </div>
              </el-form>
            </article>

            <article class="toolbar-card p-5">
              <h2 class="section-title">存储与清理</h2>
              <el-form label-position="top" class="mt-5 grid gap-4">
                <div class="grid gap-4 md:grid-cols-2">
                  <el-form-item label="数据保留天数"><el-input-number v-model="settings.storage.datasetRetentionDays" :min="1" :max="365" class="w-full" /></el-form-item>
                  <el-form-item label="截图保留天数"><el-input-number v-model="settings.storage.screenshotRetentionDays" :min="1" :max="365" class="w-full" /></el-form-item>
                </div>
                <div class="grid gap-4 md:grid-cols-2">
                  <el-form-item label="日志保留天数"><el-input-number v-model="settings.storage.logRetentionDays" :min="7" :max="365" class="w-full" /></el-form-item>
                  <el-form-item label="清理模式">
                    <el-select v-model="settings.storage.cleanupMode" class="w-full">
                      <el-option label="安全" value="safe" />
                      <el-option label="标准" value="standard" />
                      <el-option label="深度" value="deep" />
                    </el-select>
                  </el-form-item>
                </div>
                <div class="grid gap-4 md:grid-cols-2">
                  <el-form-item label="启用自动清理"><el-switch v-model="settings.storage.autoCleanup" /></el-form-item>
                  <el-form-item label="执行时间"><el-time-select v-model="settings.storage.cleanupTime" start="00:00" step="00:30" end="23:30" class="w-full" /></el-form-item>
                </div>
              </el-form>
            </article>
          </div>
        </el-tab-pane>

        <el-tab-pane label="安全与邮件" name="security">
          <div class="grid gap-4 xl:grid-cols-2">
            <article class="toolbar-card p-5">
              <h2 class="section-title">安全策略</h2>
              <el-form label-position="top" class="mt-5 grid gap-4">
                <div class="grid gap-4 md:grid-cols-2">
                  <el-form-item label="最小密码长度"><el-input-number v-model="settings.security.minPasswordLength" :min="6" :max="32" class="w-full" /></el-form-item>
                  <el-form-item label="登录失败锁定次数"><el-input-number v-model="settings.security.loginFailLockCount" :min="3" :max="10" class="w-full" /></el-form-item>
                </div>
                <div class="grid gap-4 md:grid-cols-2">
                  <el-form-item label="锁定时长（分钟）"><el-input-number v-model="settings.security.lockDurationMinutes" :min="5" :max="1440" class="w-full" /></el-form-item>
                  <el-form-item label="会话超时（分钟）"><el-input-number v-model="settings.security.sessionTimeoutMinutes" :min="15" :max="1440" class="w-full" /></el-form-item>
                </div>
                <el-form-item label="双因素认证"><el-switch v-model="settings.security.enableTwoFactor" /></el-form-item>
              </el-form>
            </article>

            <article class="toolbar-card p-5">
              <h2 class="section-title">邮件服务</h2>
              <el-form label-position="top" class="mt-5 grid gap-4">
                <el-form-item label="启用邮件服务"><el-switch v-model="settings.email.enableEmail" /></el-form-item>
                <template v-if="settings.email.enableEmail">
                  <div class="grid gap-4 md:grid-cols-2">
                    <el-form-item label="SMTP 主机"><el-input v-model="settings.email.smtpHost" /></el-form-item>
                    <el-form-item label="SMTP 端口"><el-input-number v-model="settings.email.smtpPort" :min="1" :max="65535" class="w-full" /></el-form-item>
                  </div>
                  <div class="grid gap-4 md:grid-cols-2">
                    <el-form-item label="用户名"><el-input v-model="settings.email.smtpUsername" /></el-form-item>
                    <el-form-item label="密码"><el-input v-model="settings.email.smtpPassword" type="password" show-password /></el-form-item>
                  </div>
                  <div class="grid gap-4 md:grid-cols-2">
                    <el-form-item label="发件邮箱"><el-input v-model="settings.email.fromEmail" /></el-form-item>
                    <el-form-item label="发件名称"><el-input v-model="settings.email.fromName" /></el-form-item>
                  </div>
                  <el-form-item label="启用 SSL"><el-switch v-model="settings.email.smtpSSL" /></el-form-item>
                </template>
              </el-form>
            </article>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { getSystemInfoApi, getSystemSettingsApi, updateSystemSettingsApi, type SystemInfo, type SystemSettings } from "@/api/admin";

function createDefaultSettings(): SystemSettings {
  return {
    basic: { systemName: "", systemDescription: "", adminEmail: "", language: "zh-CN", announcementEnabled: false, announcementTitle: "", announcementContent: "", announcementVariant: "info", maintenanceEnabled: false, maintenanceTitle: "", maintenanceContent: "", maintenanceVariant: "warning", maintenanceStartAt: "", maintenanceEndAt: "" },
    crawler: { defaultConcurrency: 0, maxRequestsPerCrawl: 0, requestTimeout: 0, waitForTimeout: 0 },
    storage: { datasetRetentionDays: 0, screenshotRetentionDays: 0, logRetentionDays: 0, autoCleanup: false, cleanupTime: "", cleanupMode: "safe" },
    security: { minPasswordLength: 0, loginFailLockCount: 0, lockDurationMinutes: 0, enableTwoFactor: false, sessionTimeoutMinutes: 0 },
    email: { enableEmail: false, smtpHost: "", smtpPort: 0, smtpUsername: "", smtpPassword: "", smtpSSL: false, fromEmail: "", fromName: "" },
  };
}

const activeTab = ref("platform");
const loading = ref(false);
const saving = ref(false);
const settingsLoaded = ref(false);
const infoLoaded = ref(false);
const settings = reactive<SystemSettings>(createDefaultSettings());
const systemInfo = reactive<SystemInfo>({ startTime: "", version: "", status: "", uptime: 0 });
const isReady = computed(() => settingsLoaded.value && infoLoaded.value);

function assignSettings(payload: SystemSettings) {
  Object.assign(settings.basic, payload.basic || {});
  Object.assign(settings.crawler, payload.crawler || {});
  Object.assign(settings.storage, payload.storage || {});
  Object.assign(settings.security, payload.security || {});
  Object.assign(settings.email, payload.email || {});
}

async function loadSettings() {
  const response = await getSystemSettingsApi();
  assignSettings(response);
  settingsLoaded.value = true;
}

async function loadSystemInfo() {
  const response = await getSystemInfoApi();
  Object.assign(systemInfo, response);
  infoLoaded.value = true;
}

async function reloadAll() {
  try {
    loading.value = true;
    await Promise.all([loadSettings(), loadSystemInfo()]);
    ElMessage.success("系统设置已刷新");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "刷新失败");
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  try {
    saving.value = true;
    const response = await updateSystemSettingsApi(settings);
    assignSettings(response);
    settingsLoaded.value = true;
    ElMessage.success("系统设置已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存系统设置失败");
  } finally {
    saving.value = false;
  }
}

function displayText(value?: string | null, enabled = true) {
  if (!enabled) return "--";
  const normalized = String(value || "").trim();
  return normalized || "--";
}

function cleanupModeLabel(mode?: string) {
  if (mode === "safe") return "安全";
  if (mode === "standard") return "标准";
  if (mode === "deep") return "深度";
  return "--";
}

function formatDate(value?: string | null) {
  if (!value) return "--";
  try {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

function formatUptime(seconds?: number) {
  const totalSeconds = Number(seconds || 0);
  if (!totalSeconds) return "--";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} 天 ${hours % 24} 小时`;
  }
  return `${hours} 小时 ${minutes} 分钟`;
}

onMounted(() => {
  void reloadAll();
});
</script>
