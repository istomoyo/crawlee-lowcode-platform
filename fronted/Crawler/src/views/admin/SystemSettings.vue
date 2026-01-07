<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">系统设置</h1>
      <el-button type="primary" @click="saveSettings">
        <el-icon><Check /></el-icon>
        保存设置
      </el-button>
    </div>

    <el-tabs v-model="activeTab" class="settings-tabs">
      <!-- 基础设置 -->
      <el-tab-pane label="基础设置" name="basic">
        <div class="bg-white p-6 rounded-lg shadow-sm border">
          <h2 class="text-lg font-semibold mb-4">基础配置</h2>
          <el-form :model="settings.basic" label-width="150px">
            <el-form-item label="系统名称">
              <el-input v-model="settings.basic.systemName" placeholder="Crawlee System" />
            </el-form-item>
            <el-form-item label="系统描述">
              <el-input
                v-model="settings.basic.systemDescription"
                type="textarea"
                :rows="3"
                placeholder="基于Crawlee的低代码爬虫平台"
              />
            </el-form-item>
            <el-form-item label="管理员邮箱">
              <el-input v-model="settings.basic.adminEmail" placeholder="admin@example.com" />
            </el-form-item>
            <el-form-item label="系统语言">
              <el-select v-model="settings.basic.language" style="width: 120px">
                <el-option label="中文" value="zh-CN" />
                <el-option label="English" value="en-US" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 爬虫设置 -->
      <el-tab-pane label="爬虫设置" name="crawler">
        <div class="bg-white p-6 rounded-lg shadow-sm border">
          <h2 class="text-lg font-semibold mb-4">爬虫引擎配置</h2>
          <el-form :model="settings.crawler" label-width="180px">
            <el-form-item label="默认并发数">
              <el-input-number
                v-model="settings.crawler.defaultConcurrency"
                :min="1"
                :max="20"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="最大请求数/爬取">
              <el-input-number
                v-model="settings.crawler.maxRequestsPerCrawl"
                :min="1"
                :max="1000"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="请求超时时间(秒)">
              <el-input-number
                v-model="settings.crawler.requestTimeout"
                :min="5"
                :max="300"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="默认等待时间(毫秒)">
              <el-input-number
                v-model="settings.crawler.waitForTimeout"
                :min="1000"
                :max="60000"
                :step="1000"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="启用代理">
              <el-switch v-model="settings.crawler.enableProxy" />
            </el-form-item>
            <el-form-item label="代理地址" v-if="settings.crawler.enableProxy">
              <el-input v-model="settings.crawler.proxyUrl" placeholder="http://proxy.example.com:8080" />
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 存储设置 -->
      <el-tab-pane label="存储设置" name="storage">
        <div class="bg-white p-6 rounded-lg shadow-sm border">
          <h2 class="text-lg font-semibold mb-4">数据存储配置</h2>
          <el-form :model="settings.storage" label-width="150px">
            <el-form-item label="数据集保留时间(天)">
              <el-input-number
                v-model="settings.storage.datasetRetentionDays"
                :min="1"
                :max="365"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="截图保留时间(天)">
              <el-input-number
                v-model="settings.storage.screenshotRetentionDays"
                :min="1"
                :max="365"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="日志保留时间(天)">
              <el-input-number
                v-model="settings.storage.logRetentionDays"
                :min="7"
                :max="365"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="自动清理">
              <el-switch v-model="settings.storage.autoCleanup" />
            </el-form-item>
            <el-form-item label="清理执行时间">
              <el-time-select
                v-model="settings.storage.cleanupTime"
                start="00:00"
                step="01:00"
                end="23:00"
                placeholder="选择时间"
              />
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 安全设置 -->
      <el-tab-pane label="安全设置" name="security">
        <div class="bg-white p-6 rounded-lg shadow-sm border">
          <h2 class="text-lg font-semibold mb-4">安全配置</h2>
          <el-form :model="settings.security" label-width="180px">
            <el-form-item label="密码最小长度">
              <el-input-number
                v-model="settings.security.minPasswordLength"
                :min="6"
                :max="32"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="登录失败锁定次数">
              <el-input-number
                v-model="settings.security.loginFailLockCount"
                :min="3"
                :max="10"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="锁定时间(分钟)">
              <el-input-number
                v-model="settings.security.lockDurationMinutes"
                :min="5"
                :max="1440"
                :step="5"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="启用双因子认证">
              <el-switch v-model="settings.security.enableTwoFactor" />
            </el-form-item>
            <el-form-item label="会话超时时间(分钟)">
              <el-input-number
                v-model="settings.security.sessionTimeoutMinutes"
                :min="15"
                :max="480"
                :step="15"
                controls-position="right"
              />
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 邮件设置 -->
      <el-tab-pane label="邮件设置" name="email">
        <div class="bg-white p-6 rounded-lg shadow-sm border">
          <h2 class="text-lg font-semibold mb-4">邮件服务配置</h2>
          <el-form :model="settings.email" label-width="120px">
            <el-form-item label="启用邮件通知">
              <el-switch v-model="settings.email.enableEmail" />
            </el-form-item>
            <el-form-item label="SMTP服务器" v-if="settings.email.enableEmail">
              <el-input v-model="settings.email.smtpHost" placeholder="smtp.example.com" />
            </el-form-item>
            <el-form-item label="SMTP端口" v-if="settings.email.enableEmail">
              <el-input-number
                v-model="settings.email.smtpPort"
                :min="1"
                :max="65535"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="用户名" v-if="settings.email.enableEmail">
              <el-input v-model="settings.email.smtpUsername" placeholder="noreply@example.com" />
            </el-form-item>
            <el-form-item label="密码" v-if="settings.email.enableEmail">
              <el-input
                v-model="settings.email.smtpPassword"
                type="password"
                placeholder="邮件服务器密码"
              />
            </el-form-item>
            <el-form-item label="启用SSL" v-if="settings.email.enableEmail">
              <el-switch v-model="settings.email.smtpSSL" />
            </el-form-item>
            <el-form-item label="发件人邮箱" v-if="settings.email.enableEmail">
              <el-input v-model="settings.email.fromEmail" placeholder="noreply@example.com" />
            </el-form-item>
            <el-form-item label="发件人名称" v-if="settings.email.enableEmail">
              <el-input v-model="settings.email.fromName" placeholder="Crawlee System" />
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 系统状态 -->
    <div class="mt-6 bg-white p-6 rounded-lg shadow-sm border">
      <h2 class="text-lg font-semibold mb-4">系统状态</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="flex items-center gap-3">
          <el-icon size="24" class="text-green-500">
            <SuccessFilled />
          </el-icon>
          <div>
            <p class="font-medium">系统运行状态</p>
            <p class="text-sm text-gray-600">正常运行</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <el-icon size="24" class="text-blue-500">
            <Clock />
          </el-icon>
          <div>
            <p class="font-medium">系统启动时间</p>
            <p class="text-sm text-gray-600">{{ formatDate(systemInfo.startTime) }}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <el-icon size="24" class="text-purple-500">
            <InfoFilled />
          </el-icon>
          <div>
            <p class="font-medium">系统版本</p>
            <p class="text-sm text-gray-600">{{ systemInfo.version }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, SuccessFilled, Clock, InfoFilled } from '@element-plus/icons-vue'
import { getSystemSettingsApi, updateSystemSettingsApi, getSystemInfoApi, type SystemSettings, type SystemInfo, type ApiResponse } from '@/api/admin'

// 系统设置接口
interface SystemSettings {
  basic: {
    systemName: string
    systemDescription: string
    adminEmail: string
    language: string
  }
  crawler: {
    defaultConcurrency: number
    maxRequestsPerCrawl: number
    requestTimeout: number
    waitForTimeout: number
    enableProxy: boolean
    proxyUrl: string
  }
  storage: {
    datasetRetentionDays: number
    screenshotRetentionDays: number
    logRetentionDays: number
    autoCleanup: boolean
    cleanupTime: string
  }
  security: {
    minPasswordLength: number
    loginFailLockCount: number
    lockDurationMinutes: number
    enableTwoFactor: boolean
    sessionTimeoutMinutes: number
  }
  email: {
    enableEmail: boolean
    smtpHost: string
    smtpPort: number
    smtpUsername: string
    smtpPassword: string
    smtpSSL: boolean
    fromEmail: string
    fromName: string
  }
}

// 系统信息接口
interface SystemInfo {
  startTime: string
  version: string
  status: string
}

// 响应式数据
const activeTab = ref('basic')

// 系统设置
const settings = reactive<SystemSettings>({
  basic: {
    systemName: 'Crawlee System',
    systemDescription: '基于Crawlee的低代码爬虫平台',
    adminEmail: 'admin@example.com',
    language: 'zh-CN',
  },
  crawler: {
    defaultConcurrency: 5,
    maxRequestsPerCrawl: 100,
    requestTimeout: 30,
    waitForTimeout: 30000,
    enableProxy: false,
    proxyUrl: '',
  },
  storage: {
    datasetRetentionDays: 30,
    screenshotRetentionDays: 30,
    logRetentionDays: 90,
    autoCleanup: true,
    cleanupTime: '02:00',
  },
  security: {
    minPasswordLength: 8,
    loginFailLockCount: 5,
    lockDurationMinutes: 30,
    enableTwoFactor: false,
    sessionTimeoutMinutes: 60,
  },
  email: {
    enableEmail: false,
    smtpHost: '',
    smtpPort: 587,
    smtpUsername: '',
    smtpPassword: '',
    smtpSSL: true,
    fromEmail: '',
    fromName: 'Crawlee System',
  },
})

// 系统信息
const systemInfo = reactive<SystemInfo>({
  startTime: new Date().toISOString(),
  version: '1.0.0',
  status: 'running',
})

// 加载设置
const loadSettings = async () => {
  try {
    const response: SystemSettings = await getSystemSettingsApi()
    Object.assign(settings, response)
    ElMessage.success('设置加载完成')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '加载设置失败'
    ElMessage.error(errorMessage)
  }
}

// 保存设置
const saveSettings = async () => {
  try {
    const response: ApiResponse<SystemSettings> = await updateSystemSettingsApi(settings)
    Object.assign(settings, response.data!)
    ElMessage.success('设置保存成功')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '保存设置失败'
    ElMessage.error(errorMessage)
  }
}

// 格式化日期
const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// 生命周期
onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
.settings-tabs {
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

:deep(.el-tabs__header) {
  margin: 0;
}

:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-tabs__item) {
  border-bottom: 2px solid transparent;
}

:deep(.el-tabs__item.is-active) {
  border-bottom-color: #409eff;
}
</style>
