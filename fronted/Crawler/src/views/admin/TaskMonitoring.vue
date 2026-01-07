<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">任务监控</h1>
      <div class="flex gap-4">
        <el-button type="success" @click="refreshData">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">总任务数</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.totalTasks }}</p>
          </div>
          <el-icon size="32" class="text-blue-500">
            <Document />
          </el-icon>
        </div>
      </div>

      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">运行中</p>
            <p class="text-2xl font-bold text-orange-600">{{ stats.runningTasks }}</p>
          </div>
          <el-icon size="32" class="text-orange-500">
            <Loading />
          </el-icon>
        </div>
      </div>

      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">成功完成</p>
            <p class="text-2xl font-bold text-green-600">{{ stats.successTasks }}</p>
          </div>
          <el-icon size="32" class="text-green-500">
            <SuccessFilled />
          </el-icon>
        </div>
      </div>

      <div class="bg-white p-4 rounded-lg shadow-sm border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">失败任务</p>
            <p class="text-2xl font-bold text-red-600">{{ stats.failedTasks }}</p>
          </div>
          <el-icon size="32" class="text-red-500">
            <Warning />
          </el-icon>
        </div>
      </div>
    </div>

    <!-- 筛选器 -->
    <div class="mb-4 flex gap-4">
      <el-select v-model="statusFilter" placeholder="状态筛选" clearable style="width: 120px">
        <el-option label="全部" value="" />
        <el-option label="待执行" value="pending" />
        <el-option label="运行中" value="running" />
        <el-option label="成功" value="success" />
        <el-option label="失败" value="failed" />
      </el-select>
      <el-input
        v-model="searchQuery"
        placeholder="搜索任务名称或用户名"
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
    </div>

    <!-- 任务列表 -->
    <el-table
      :data="taskList"
      border
      stripe
      style="width: 100%"
      v-loading="loading"
      :row-key="(row: Task) => row.id.toString()"
    >
      <el-table-column prop="name" label="任务名称" min-width="150" />
      <el-table-column label="创建者" width="120">
        <template #default="{ row }">
          {{ row.user?.username || '未知' }}
        </template>
      </el-table-column>
      <el-table-column prop="url" label="URL" min-width="200" show-overflow-tooltip />
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <div class="flex items-center gap-2">
            <el-tag :type="getStatusType(row.status)" effect="dark">
              {{ getStatusText(row.status) }}
            </el-tag>
            <el-progress
              v-if="row.status === 'running'"
              type="circle"
              :percentage="row.progress || 0"
              width="25"
              stroke-width="3"
            />
          </div>
        </template>
      </el-table-column>
      <el-table-column label="进度" width="120">
        <template #default="{ row }">
          <el-progress
            :percentage="row.progress || 0"
            :status="getProgressStatus(row.status)"
            :stroke-width="8"
          />
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="最后执行" width="180">
        <template #default="{ row }">
          <div v-if="row.lastExecutionTime">
            {{ formatDate(row.lastExecutionTime) }}
          </div>
          <span v-else class="text-gray-400">未执行</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150">
        <template #default="{ row }">
          <el-button size="small" type="info" @click="viewTaskDetails(row)">
            详情
          </el-button>
          <el-button
            size="small"
            type="danger"
            @click="stopTask(row)"
            v-if="row.status === 'running'"
          >
            停止
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
        :page-sizes="[10, 20, 50]"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>

    <!-- 任务详情对话框 -->
    <el-dialog v-model="taskDetailVisible" title="任务详情" width="800px" :close-on-click-modal="false">
      <div v-if="selectedTask" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700">任务名称</label>
            <p class="mt-1 text-sm text-gray-900">{{ selectedTask.name }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">创建者</label>
            <p class="mt-1 text-sm text-gray-900">{{ selectedTask.user?.username || '未知' }}</p>
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700">URL</label>
            <p class="mt-1 text-sm text-gray-900 break-all">{{ selectedTask.url }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">状态</label>
            <el-tag :type="getStatusType(selectedTask.status)" class="mt-1">
              {{ getStatusText(selectedTask.status) }}
            </el-tag>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">创建时间</label>
            <p class="mt-1 text-sm text-gray-900">{{ formatDate(selectedTask.createdAt) }}</p>
          </div>
        </div>

        <!-- 执行记录 -->
        <div v-if="selectedTask.executions && selectedTask.executions.length > 0">
          <h3 class="text-lg font-medium text-gray-900 mb-3">执行记录</h3>
          <div class="space-y-2 max-h-60 overflow-y-auto">
            <div
              v-for="execution in selectedTask.executions.slice(0, 5)"
              :key="execution.id"
              class="p-3 bg-gray-50 rounded-lg"
            >
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">{{ formatDate(execution.startTime) }}</span>
                <el-tag size="small" :type="getStatusType(execution.status)">
                  {{ getStatusText(execution.status) }}
                </el-tag>
              </div>
              <p class="text-sm text-gray-600 mt-1">{{ execution.log }}</p>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Document, Loading, SuccessFilled, Warning } from '@element-plus/icons-vue'
import { getTasksApi, stopTaskApi, type TaskItem, type TaskListResponse, type ApiResponse } from '@/api/admin'

// 任务接口
interface Task {
  id: number
  name: string
  url: string
  status: string
  progress?: number
  createdAt: string
  lastExecutionTime?: string
  user?: {
    id: number
    username: string
  }
  executions?: Array<{
    id: number
    status: string
    startTime: string
    log: string
  }>
}

// 统计接口
interface TaskStats {
  totalTasks: number
  runningTasks: number
  successTasks: number
  failedTasks: number
}

// 响应式数据
const taskList = ref<Task[]>([])
const loading = ref(false)
const searchQuery = ref('')
const statusFilter = ref('')
const dateRange = ref<string[]>([])

// 统计数据
const stats = reactive<TaskStats>({
  totalTasks: 0,
  runningTasks: 0,
  successTasks: 0,
  failedTasks: 0,
})

// 分页
const pagination = reactive({
  page: 1,
  limit: 10,
  total: 0,
})

// 任务详情
const taskDetailVisible = ref(false)
const selectedTask = ref<Task | null>(null)

// 获取任务列表
const fetchTasks = async () => {
  try {
    loading.value = true
    const params = {
      status: statusFilter.value || undefined,
      search: searchQuery.value || undefined,
      startDate: dateRange.value?.[0] || undefined,
      endDate: dateRange.value?.[1] || undefined,
      page: pagination.page,
      limit: pagination.limit,
    }
    const response: TaskListResponse = await getTasksApi(params)
    taskList.value = response.items
    Object.assign(stats, response.stats)
    pagination.total = response.total
    pagination.page = response.page
    pagination.limit = response.limit
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '获取任务列表失败'
    ElMessage.error(errorMessage)
    taskList.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

// 更新统计数据
const updateStats = () => {
  stats.totalTasks = taskList.value.length
  stats.runningTasks = taskList.value.filter(t => t.status === 'running').length
  stats.successTasks = taskList.value.filter(t => t.status === 'success').length
  stats.failedTasks = taskList.value.filter(t => t.status === 'failed').length
}

// 刷新数据
const refreshData = () => {
  fetchTasks()
}

// 搜索处理
const handleSearch = () => {
  pagination.page = 1
  fetchTasks()
}

// 日期筛选处理
const handleDateChange = () => {
  pagination.page = 1
  fetchTasks()
}

// 分页处理
const handlePageChange = (page: number) => {
  pagination.page = page
  fetchTasks()
}

const handleSizeChange = (size: number) => {
  pagination.limit = size
  pagination.page = 1
  fetchTasks()
}

// 获取状态类型
const getStatusType = (status: string) => {
  switch (status) {
    case 'pending':
      return ''
    case 'running':
      return 'warning'
    case 'success':
      return 'success'
    case 'failed':
      return 'danger'
    default:
      return ''
  }
}

// 获取状态文本
const getStatusText = (status: string) => {
  switch (status) {
    case 'pending':
      return '待执行'
    case 'running':
      return '运行中'
    case 'success':
      return '成功'
    case 'failed':
      return '失败'
    default:
      return status
  }
}

// 获取进度状态
const getProgressStatus = (status: string) => {
  switch (status) {
    case 'success':
      return 'success'
    case 'failed':
      return 'exception'
    case 'running':
      return 'normal'
    default:
      return 'normal'
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

// 查看任务详情
const viewTaskDetails = (task: Task) => {
  selectedTask.value = task
  taskDetailVisible.value = true
}

// 停止任务
const stopTask = async (task: TaskItem) => {
  try {
    await ElMessageBox.confirm(`确定要停止任务 "${task.name}" 吗？`, '提示', {
      type: 'warning',
    })

    await stopTaskApi(task.id)
    // 重新获取任务列表以更新状态
    await fetchTasks()
    ElMessage.success('任务已停止')
  } catch (error) {
    if (error !== 'cancel') {
      const errorMessage = error instanceof Error ? error.message : '停止任务失败'
      ElMessage.error(errorMessage)
    }
  }
}

// 生命周期
onMounted(() => {
  fetchTasks()
})
</script>

<style scoped>
.space-y-4 > * + * {
  margin-top: 1rem;
}

.space-y-2 > * + * {
  margin-top: 0.5rem;
}
</style>
