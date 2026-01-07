<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">系统日志</h1>
      <div class="flex gap-4">
        <el-button type="primary" @click="exportLogs">
          <el-icon><Download /></el-icon>
          导出日志
        </el-button>
        <el-button type="danger" @click="clearLogs">
          <el-icon><Delete /></el-icon>
          清空日志
        </el-button>
      </div>
    </div>

    <!-- 筛选器 -->
    <div class="mb-4 flex gap-4 flex-wrap">
      <el-select v-model="levelFilter" placeholder="日志级别" clearable style="width: 120px">
        <el-option label="全部" value="" />
        <el-option label="ERROR" value="error" />
        <el-option label="WARN" value="warn" />
        <el-option label="INFO" value="info" />
        <el-option label="DEBUG" value="debug" />
      </el-select>
      <el-input
        v-model="searchQuery"
        placeholder="搜索日志内容"
        clearable
        style="width: 250px"
        @input="handleSearch"
      />
      <el-date-picker
        v-model="dateRange"
        type="datetimerange"
        range-separator="至"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        format="YYYY-MM-DD HH:mm"
        value-format="YYYY-MM-DD HH:mm"
        @change="handleDateChange"
      />
      <el-button type="success" @click="refreshLogs">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <!-- 日志统计 -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">总日志数</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.total }}</p>
          </div>
          <el-icon size="32" class="text-gray-500">
            <Document />
          </el-icon>
        </div>
      </div>

      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">错误日志</p>
            <p class="text-2xl font-bold text-red-600">{{ stats.error }}</p>
          </div>
          <el-icon size="32" class="text-red-500">
            <Warning />
          </el-icon>
        </div>
      </div>

      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">警告日志</p>
            <p class="text-2xl font-bold text-yellow-600">{{ stats.warn }}</p>
          </div>
          <el-icon size="32" class="text-yellow-500">
            <InfoFilled />
          </el-icon>
        </div>
      </div>

      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">信息日志</p>
            <p class="text-2xl font-bold text-blue-600">{{ stats.info }}</p>
          </div>
          <el-icon size="32" class="text-blue-500">
            <InfoFilled />
          </el-icon>
        </div>
      </div>
    </div>

    <!-- 日志列表 -->
    <el-table
      :data="logList"
      border
      stripe
      style="width: 100%"
      v-loading="loading"
      :row-key="(row: LogEntry) => row.id.toString()"
      height="600"
    >
      <el-table-column label="时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.timestamp) }}
        </template>
      </el-table-column>
      <el-table-column label="级别" width="100">
        <template #default="{ row }">
          <el-tag :type="getLevelType(row.level)" size="small">
            {{ row.level.toUpperCase() }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="模块" width="120">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.module }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="用户" width="120">
        <template #default="{ row }">
          {{ row.user || '系统' }}
        </template>
      </el-table-column>
      <el-table-column label="消息" min-width="300" show-overflow-tooltip>
        <template #default="{ row }">
          <span :class="getMessageClass(row.level)">{{ row.message }}</span>
        </template>
      </el-table-column>
      <el-table-column label="详情" width="80">
        <template #default="{ row }">
          <el-button
            size="small"
            type="text"
            @click="viewLogDetails(row)"
            v-if="row.details"
          >
            查看
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="mt-4 flex justify-end">
      <el-pagination
        background
        layout="prev, pager, next, sizes"
        :current-page="pagination.page"
        :page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[20, 50, 100]"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>

    <!-- 日志详情对话框 -->
    <el-dialog v-model="logDetailVisible" title="日志详情" width="600px">
      <div v-if="selectedLog" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700">时间</label>
            <p class="mt-1 text-sm text-gray-900">{{ formatDate(selectedLog.timestamp) }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">级别</label>
            <el-tag :type="getLevelType(selectedLog.level)" class="mt-1">
              {{ selectedLog.level.toUpperCase() }}
            </el-tag>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">模块</label>
            <p class="mt-1 text-sm text-gray-900">{{ selectedLog.module }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">用户</label>
            <p class="mt-1 text-sm text-gray-900">{{ selectedLog.user || '系统' }}</p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700">消息</label>
          <p class="mt-1 text-sm text-gray-900">{{ selectedLog.message }}</p>
        </div>

        <div v-if="selectedLog.details">
          <label class="block text-sm font-medium text-gray-700">详细信息</label>
          <pre class="mt-1 p-3 bg-gray-100 rounded text-sm overflow-auto max-h-60">{{ JSON.stringify(selectedLog.details, null, 2) }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Download, Delete, Document, Warning, InfoFilled } from '@element-plus/icons-vue'
import { getLogsApi, clearLogsApi, type LogEntry, type LogListResponse, type ApiResponse } from '@/api/admin'

// 日志接口
interface LogEntry {
  id: number
  timestamp: string
  level: 'error' | 'warn' | 'info' | 'debug'
  module: string
  user?: string
  message: string
  details?: any
}

// 统计接口
interface LogStats {
  total: number
  error: number
  warn: number
  info: number
  debug: number
}

// 响应式数据
const logList = ref<LogEntry[]>([])
const loading = ref(false)
const searchQuery = ref('')
const levelFilter = ref('')
const dateRange = ref<string[]>([])

// 统计数据
const stats = reactive<LogStats>({
  total: 0,
  error: 0,
  warn: 0,
  info: 0,
  debug: 0,
})

// 分页
const pagination = reactive({
  page: 1,
  limit: 50,
  total: 0,
})

// 日志详情
const logDetailVisible = ref(false)
const selectedLog = ref<LogEntry | null>(null)

// 获取日志列表
const fetchLogs = async () => {
  try {
    loading.value = true
    const params = {
      level: levelFilter.value as any || undefined,
      module: searchQuery.value || undefined,
      search: searchQuery.value || undefined,
      startDate: dateRange.value?.[0] || undefined,
      endDate: dateRange.value?.[1] || undefined,
      page: pagination.page,
      limit: pagination.limit,
    }
    const response: LogListResponse = await getLogsApi(params)
    logList.value = response.items
    Object.assign(stats, response.stats)
    pagination.total = response.total
    pagination.page = response.page
    pagination.limit = response.limit
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '获取日志失败'
    ElMessage.error(errorMessage)
    logList.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

// 更新统计数据
const updateStats = () => {
  stats.total = logList.value.length
  stats.error = logList.value.filter(l => l.level === 'error').length
  stats.warn = logList.value.filter(l => l.level === 'warn').length
  stats.info = logList.value.filter(l => l.level === 'info').length
  stats.debug = logList.value.filter(l => l.level === 'debug').length
}

// 刷新日志
const refreshLogs = () => {
  fetchLogs()
}

// 搜索处理
const handleSearch = () => {
  pagination.page = 1
  fetchLogs()
}

// 日期筛选处理
const handleDateChange = () => {
  pagination.page = 1
  fetchLogs()
}

// 分页处理
const handlePageChange = (page: number) => {
  pagination.page = page
  fetchLogs()
}

const handleSizeChange = (size: number) => {
  pagination.limit = size
  pagination.page = 1
  fetchLogs()
}

// 获取级别类型
const getLevelType = (level: string) => {
  switch (level) {
    case 'error':
      return 'danger'
    case 'warn':
      return 'warning'
    case 'info':
      return 'primary'
    case 'debug':
      return 'info'
    default:
      return ''
  }
}

// 获取消息样式
const getMessageClass = (level: string) => {
  switch (level) {
    case 'error':
      return 'text-red-600 font-medium'
    case 'warn':
      return 'text-yellow-600'
    default:
      return 'text-gray-900'
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
      second: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// 查看日志详情
const viewLogDetails = (log: LogEntry) => {
  selectedLog.value = log
  logDetailVisible.value = true
}

// 导出日志
const exportLogs = () => {
  try {
    const csvContent = logList.value.map(log => ({
      时间: formatDate(log.timestamp),
      级别: log.level.toUpperCase(),
      模块: log.module,
      用户: log.user || '系统',
      消息: log.message,
    }))

    // TODO: 实现CSV导出功能
    ElMessage.success('日志导出功能开发中...')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

// 清空日志
const clearLogs = async () => {
  try {
    await ElMessageBox.confirm('确定要清空所有系统日志吗？此操作不可恢复。', '警告', {
      type: 'warning',
      confirmButtonText: '确定清空',
      cancelButtonText: '取消',
    })

    await clearLogsApi()
    logList.value = []
    pagination.total = 0
    Object.assign(stats, { total: 0, error: 0, warn: 0, info: 0, debug: 0 })
    ElMessage.success('日志已清空')
  } catch (error) {
    if (error !== 'cancel') {
      const errorMessage = error instanceof Error ? error.message : '清空失败'
      ElMessage.error(errorMessage)
    }
  }
}

// 生命周期
onMounted(() => {
  fetchLogs()
})
</script>

<style scoped>
pre {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}
</style>
