<template>
  <div class="p-6 bg-gray-50 min-h-screen">
    <!-- 页面标题 -->
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">数据统计面板</h1>
      <p class="text-gray-600">查看您的爬虫任务执行情况和统计数据</p>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600">总任务数</p>
            <p class="text-3xl font-bold text-gray-900">{{ stats.totalTasks }}</p>
          </div>
          <div class="p-3 bg-blue-100 rounded-lg">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600">成功任务</p>
            <p class="text-3xl font-bold text-green-600">{{ stats.successTasks }}</p>
            <p class="text-xs text-gray-500">{{ stats.successRate }}% 成功率</p>
          </div>
          <div class="p-3 bg-green-100 rounded-lg">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600">执行中</p>
            <p class="text-3xl font-bold text-yellow-600">{{ stats.runningTasks }}</p>
            <p class="text-xs text-gray-500">正在运行的任务</p>
          </div>
          <div class="p-3 bg-yellow-100 rounded-lg">
            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600">失败任务</p>
            <p class="text-3xl font-bold text-red-600">{{ stats.failedTasks }}</p>
            <p class="text-xs text-gray-500">需要检查的任务</p>
          </div>
          <div class="p-3 bg-red-100 rounded-lg">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
      <!-- 任务状态分布饼图 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">任务状态分布</h3>
        <div class="h-80 flex items-center justify-center">
          <div v-if="chartLoading" class="text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-200 border-t-blue-600"></div>
            <p class="mt-2 text-gray-500">加载中...</p>
          </div>
          <div v-else id="statusChart" class="w-full h-full"></div>
        </div>
      </div>

      <!-- 执行趋势折线图 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">执行趋势 (最近7天)</h3>
        <div class="h-80 flex items-center justify-center">
          <div v-if="chartLoading" class="text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-200 border-t-blue-600"></div>
            <p class="mt-2 text-gray-500">加载中...</p>
          </div>
          <div v-else id="trendChart" class="w-full h-full"></div>
        </div>
      </div>

      <!-- 数据量分布饼图 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">数据量分布</h3>
        <div class="h-80 flex items-center justify-center">
          <div v-if="chartLoading" class="text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-200 border-t-blue-600"></div>
            <p class="mt-2 text-gray-500">加载中...</p>
          </div>
          <div v-else id="dataChart" class="w-full h-full"></div>
        </div>
      </div>

      <!-- 成功率趋势折线图 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">成功率趋势</h3>
        <div class="h-80 flex items-center justify-center">
          <div v-if="chartLoading" class="text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-200 border-t-blue-600"></div>
            <p class="mt-2 text-gray-500">加载中...</p>
          </div>
          <div v-else id="successRateChart" class="w-full h-full"></div>
        </div>
      </div>

      <!-- 执行时间分布 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">执行时间分布</h3>
        <div class="h-80 flex items-center justify-center">
          <div v-if="chartLoading" class="text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-200 border-t-blue-600"></div>
            <p class="mt-2 text-gray-500">加载中...</p>
          </div>
          <div v-else id="timeChart" class="w-full h-full"></div>
        </div>
      </div>

      <!-- 任务类型分布 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">任务类型分布</h3>
        <div class="h-80 flex items-center justify-center">
          <div v-if="chartLoading" class="text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-200 border-t-blue-600"></div>
            <p class="mt-2 text-gray-500">加载中...</p>
          </div>
          <div v-else id="taskTypeChart" class="w-full h-full"></div>
        </div>
      </div>
    </div>

    <!-- 最近执行记录 -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900">最近执行记录</h3>
        <el-button size="small" @click="refreshData" :loading="loading">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          刷新
        </el-button>
      </div>

      <div v-if="recentExecutions.length === 0" class="text-center py-12 text-gray-500">
        <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p>暂无执行记录</p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="execution in recentExecutions"
          :key="execution.id"
          class="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div class="flex items-center space-x-4">
            <div class="shrink-0">
              <el-tag
                :type="getStatusType(execution.status)"
                effect="dark"
                size="small"
              >
                {{ getStatusText(execution.status) }}
              </el-tag>
            </div>
            <div>
              <h4 class="text-sm font-medium text-gray-900">{{ execution.taskName }}</h4>
              <p class="text-sm text-gray-500">{{ execution.url }}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm text-gray-900">{{ execution.resultCount }} 条数据</p>
            <p class="text-xs text-gray-500">{{ formatDate(execution.createdAt) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getStatisticsApi } from '@/api/task'
import * as echarts from 'echarts'

// 响应式数据
const loading = ref(false)
const chartLoading = ref(false)
const stats = ref({
  totalTasks: 0,
  successTasks: 0,
  runningTasks: 0,
  failedTasks: 0,
  successRate: 0
})
const trendData = ref<any[]>([])
const successRateData = ref<any[]>([])
const dataDistribution = ref<any[]>([])
const timeDistribution = ref<any[]>([])
const taskTypeDistribution = ref<any[]>([])
const recentExecutions = ref<any[]>([])

// 监听数据变化，自动更新图表
watch([trendData, successRateData, dataDistribution, timeDistribution, taskTypeDistribution], () => {
  // 延迟执行，确保DOM已完全更新
  setTimeout(() => {
    updateCharts()
  }, 100)
}, { deep: true })

// 图表实例
let statusChart: echarts.ECharts | null = null
let trendChart: echarts.ECharts | null = null
let dataChart: echarts.ECharts | null = null
let successRateChart: echarts.ECharts | null = null
let timeChart: echarts.ECharts | null = null
let taskTypeChart: echarts.ECharts | null = null

// 获取统计数据
const fetchStatistics = async () => {
  try {
    loading.value = true
    chartLoading.value = true

    const response = await getStatisticsApi()

    // 设置基础统计数据
    stats.value = {
      totalTasks: response.totalTasks,
      successTasks: response.successTasks,
      runningTasks: response.runningTasks,
      failedTasks: response.failedTasks,
      successRate: response.successRate
    }

    // 设置各种图表数据
    trendData.value = response.trendData || []
    successRateData.value = response.successRateData || []
    dataDistribution.value = response.dataDistribution || []
    timeDistribution.value = response.timeDistribution || []
    taskTypeDistribution.value = response.taskTypeDistribution || []
    recentExecutions.value = response.recentExecutions || []

  } catch (error) {
    console.error('获取统计数据失败:', error)
    ElMessage.error('获取统计数据失败')

    // 设置默认的空数据，确保图表能正常显示
    stats.value = {
      totalTasks: 0,
      successTasks: 0,
      runningTasks: 0,
      failedTasks: 0,
      successRate: 0
    }
    trendData.value = []
    successRateData.value = []
    dataDistribution.value = []
    timeDistribution.value = []
    taskTypeDistribution.value = []
    recentExecutions.value = []
  } finally {
    loading.value = false
    chartLoading.value = false
  }
}


// 更新图表
const updateCharts = () => {
  // 总是尝试初始化图表，即使没有数据也会显示空状态

  // ECharts配置选项，禁用可能引起性能警告的功能
  const commonOptions = {
    // 禁用一些可能影响性能的交互
    toolbox: {
      show: false
    },
    // 优化事件处理
    opts: {
      devicePixelRatio: window.devicePixelRatio,
      renderer: 'canvas' as const,
      useDirtyRect: true
    }
  }

  // 状态分布饼图
  const statusChartDom = document.getElementById('statusChart')
  if (statusChartDom) {
    if (statusChart) {
      statusChart.dispose()
    }
    statusChart = echarts.init(statusChartDom, null, {
      devicePixelRatio: window.devicePixelRatio,
      renderer: 'canvas',
      useDirtyRect: true,
      width: statusChartDom.clientWidth,
      height: statusChartDom.clientHeight
    })

    const statusData = [
      { name: '成功', value: stats.value.successTasks, color: '#10B981' },
      { name: '执行中', value: stats.value.runningTasks, color: '#F59E0B' },
      { name: '失败', value: stats.value.failedTasks, color: '#EF4444' },
      { name: '待执行', value: Math.max(0, stats.value.totalTasks - stats.value.successTasks - stats.value.runningTasks - stats.value.failedTasks), color: '#6B7280' }
    ].filter(item => item.value > 0)

    // 如果没有数据，显示空状态
    const chartData = statusData.length > 0 ? statusData : [{ name: '暂无数据', value: 1, color: '#E5E7EB' }]

    statusChart.setOption({
      ...commonOptions,
      tooltip: {
        trigger: statusData.length > 0 ? 'item' : 'none',
        formatter: statusData.length > 0 ? '{a} <br/>{b}: {c} ({d}%)' : ''
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        show: statusData.length > 0
      },
      series: [{
        name: '任务状态',
        type: 'pie',
        radius: ['30%', '70%'],
        data: chartData,
        emphasis: statusData.length > 0 ? {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        } : {},
        itemStyle: {
          color: (params: any) => chartData[params.dataIndex]?.color || '#6B7280'
        },
        label: {
          show: statusData.length === 0,
          position: 'center',
          fontSize: 14,
          color: '#9CA3AF'
        }
      }]
    })
  }

  // 执行趋势折线图
  const trendChartDom = document.getElementById('trendChart')
  if (trendChartDom) {
    if (trendChart) {
      trendChart.dispose()
    }
    trendChart = echarts.init(trendChartDom, null, {
      devicePixelRatio: window.devicePixelRatio,
      renderer: 'canvas',
      useDirtyRect: true,
      width: trendChartDom.clientWidth,
      height: trendChartDom.clientHeight
    })

    const hasData = trendData.value.length > 0
    const chartData = hasData ? trendData.value : [
      { day: '周一', success: 0, failed: 0, total: 0 },
      { day: '周二', success: 0, failed: 0, total: 0 },
      { day: '周三', success: 0, failed: 0, total: 0 },
      { day: '周四', success: 0, failed: 0, total: 0 },
      { day: '周五', success: 0, failed: 0, total: 0 },
      { day: '周六', success: 0, failed: 0, total: 0 },
      { day: '周日', success: 0, failed: 0, total: 0 }
    ]

    trendChart.setOption({
      ...commonOptions,
      tooltip: {
        trigger: hasData ? 'axis' : 'none'
      },
      legend: {
        data: hasData ? ['成功', '失败', '总数'] : [],
        show: hasData
      },
      xAxis: {
        type: 'category',
        data: chartData.map(item => item.day)
      },
      yAxis: {
        type: 'value'
      },
      series: hasData ? [
        {
          name: '成功',
          type: 'line',
          data: chartData.map(item => item.success),
          smooth: true,
          itemStyle: { color: '#10B981' },
          areaStyle: { color: 'rgba(16, 185, 129, 0.1)' }
        },
        {
          name: '失败',
          type: 'line',
          data: chartData.map(item => item.failed),
          smooth: true,
          itemStyle: { color: '#EF4444' },
          areaStyle: { color: 'rgba(239, 68, 68, 0.1)' }
        },
        {
          name: '总数',
          type: 'line',
          data: chartData.map(item => item.total),
          smooth: true,
          itemStyle: { color: '#3B82F6' },
          areaStyle: { color: 'rgba(59, 130, 246, 0.1)' }
        }
      ] : [],
      ...(hasData ? {} : {
        graphic: {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: {
            text: '暂无数据',
            fontSize: 14,
            fill: '#9CA3AF'
          }
        }
      })
    })
  }

  // 数据量分布饼图
  const dataChartDom = document.getElementById('dataChart')
  if (dataChartDom) {
    if (dataChart) {
      dataChart.dispose()
    }
    dataChart = echarts.init(dataChartDom, null, {
      devicePixelRatio: window.devicePixelRatio,
      renderer: 'canvas',
      useDirtyRect: true,
      width: dataChartDom.clientWidth,
      height: dataChartDom.clientHeight
    })

    const hasData = dataDistribution.value.length > 0
    const chartData = hasData ? dataDistribution.value : [{ name: '暂无数据', value: 1, color: '#E5E7EB' }]

    dataChart.setOption({
      ...commonOptions,
      tooltip: {
        trigger: hasData ? 'item' : 'none',
        formatter: hasData ? '{a} <br/>{b}: {c} ({d}%)' : ''
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        show: hasData
      },
      series: [{
        name: '数据量分布',
        type: 'pie',
        radius: '60%',
        data: chartData,
        emphasis: hasData ? {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        } : {},
        itemStyle: {
          color: (params: any) => chartData[params.dataIndex]?.color || '#6B7280'
        },
        label: {
          show: !hasData,
          position: 'center',
          fontSize: 14,
          color: '#9CA3AF'
        }
      }]
    })
  }

  // 成功率趋势折线图
  const successRateChartDom = document.getElementById('successRateChart')
  if (successRateChartDom) {
    if (successRateChart) {
      successRateChart.dispose()
    }
    successRateChart = echarts.init(successRateChartDom, null, {
      devicePixelRatio: window.devicePixelRatio,
      renderer: 'canvas',
      useDirtyRect: true,
      width: successRateChartDom.clientWidth,
      height: successRateChartDom.clientHeight
    })

    const hasData = successRateData.value.length > 0
    const chartData = hasData ? successRateData.value : [
      { day: '周一', rate: 0 },
      { day: '周二', rate: 0 },
      { day: '周三', rate: 0 },
      { day: '周四', rate: 0 },
      { day: '周五', rate: 0 },
      { day: '周六', rate: 0 },
      { day: '周日', rate: 0 }
    ]

    successRateChart.setOption({
      ...commonOptions,
      tooltip: {
        trigger: hasData ? 'axis' : 'none',
        formatter: hasData ? '{b}: {c}%' : ''
      },
      xAxis: {
        type: 'category',
        data: chartData.map(item => item.day)
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: '{value}%'
        }
      },
      series: hasData ? [{
        name: '成功率',
        type: 'line',
        data: chartData.map(item => item.rate),
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: {
          color: '#10B981',
          width: 3
        },
        itemStyle: {
          color: '#10B981'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [{
              offset: 0, color: 'rgba(16, 185, 129, 0.3)'
            }, {
              offset: 1, color: 'rgba(16, 185, 129, 0.05)'
            }]
          }
        }
      }] : [],
      ...(hasData ? {} : {
        graphic: {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: {
            text: '暂无数据',
            fontSize: 14,
            fill: '#9CA3AF'
          }
        }
      })
    })
  }

  // 执行时间分布饼图
  const timeChartDom = document.getElementById('timeChart')
  if (timeChartDom) {
    if (timeChart) {
      timeChart.dispose()
    }
    timeChart = echarts.init(timeChartDom, null, {
      devicePixelRatio: window.devicePixelRatio,
      renderer: 'canvas',
      useDirtyRect: true,
      width: timeChartDom.clientWidth,
      height: timeChartDom.clientHeight
    })

    const hasData = timeDistribution.value.length > 0
    const chartData = hasData ? timeDistribution.value : [{ name: '暂无数据', value: 1, color: '#E5E7EB' }]

    timeChart.setOption({
      ...commonOptions,
      tooltip: {
        trigger: hasData ? 'item' : 'none',
        formatter: hasData ? '{a} <br/>{b}: {c} ({d}%)' : ''
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        show: hasData
      },
      series: [{
        name: '执行时间分布',
        type: 'pie',
        radius: ['20%', '60%'],
        avoidLabelOverlap: false,
        data: chartData,
        emphasis: hasData ? {
          label: {
            show: true,
            fontSize: '14',
            fontWeight: 'bold'
          }
        } : {},
        labelLine: {
          show: hasData
        },
        itemStyle: {
          color: (params: any) => chartData[params.dataIndex]?.color || '#6B7280'
        },
        label: {
          show: !hasData,
          position: 'center',
          fontSize: 14,
          color: '#9CA3AF'
        }
      }]
    })
  }

  // 任务类型分布饼图
  const taskTypeChartDom = document.getElementById('taskTypeChart')
  if (taskTypeChartDom) {
    if (taskTypeChart) {
      taskTypeChart.dispose()
    }
    taskTypeChart = echarts.init(taskTypeChartDom, null, {
      devicePixelRatio: window.devicePixelRatio,
      renderer: 'canvas',
      useDirtyRect: true,
      width: taskTypeChartDom.clientWidth,
      height: taskTypeChartDom.clientHeight
    })

    const hasData = taskTypeDistribution.value.length > 0
    const chartData = hasData ? taskTypeDistribution.value : [{ name: '暂无数据', value: 1, color: '#E5E7EB' }]

    taskTypeChart.setOption({
      ...commonOptions,
      tooltip: {
        trigger: hasData ? 'item' : 'none',
        formatter: hasData ? '{a} <br/>{b}: {c} ({d}%)' : ''
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        show: hasData
      },
      series: [{
        name: '任务类型分布',
        type: 'pie',
        radius: '55%',
        center: ['50%', '45%'],
        data: chartData,
        emphasis: hasData ? {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        } : {},
        itemStyle: {
          color: (params: any) => chartData[params.dataIndex]?.color || '#6B7280'
        },
        label: {
          show: !hasData,
          position: 'center',
          fontSize: 14,
          color: '#9CA3AF'
        }
      }]
    })
  }
}

// 状态相关方法
const getStatusType = (status: string) => {
  switch (status) {
    case 'success': return 'success'
    case 'running': return 'warning'
    case 'failed': return 'danger'
    default: return ''
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'success': return '成功'
    case 'running': return '执行中'
    case 'failed': return '失败'
    case 'pending': return '待执行'
    default: return status
  }
}

// 格式化日期
const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return dateStr
  }
}

// 刷新数据
const refreshData = () => {
  fetchStatistics()
}

// 窗口大小改变时重新调整图表
const handleResize = () => {
  if (statusChart) statusChart.resize()
  if (trendChart) trendChart.resize()
  if (dataChart) dataChart.resize()
  if (successRateChart) successRateChart.resize()
  if (timeChart) timeChart.resize()
  if (taskTypeChart) taskTypeChart.resize()
}

// 生命周期
onMounted(() => {
  fetchStatistics()
  window.addEventListener('resize', handleResize)

  // 额外延迟初始化，确保DOM完全渲染
  setTimeout(() => {
    updateCharts()
  }, 500)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (statusChart) statusChart.dispose()
  if (trendChart) trendChart.dispose()
  if (dataChart) dataChart.dispose()
  if (successRateChart) successRateChart.dispose()
  if (timeChart) timeChart.dispose()
  if (taskTypeChart) taskTypeChart.dispose()
})
</script>

<style scoped>
/* 自定义样式 */
.el-tag {
  font-weight: 500;
}

.grid {
  display: grid;
}

.grid-cols-1 {
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

@media (min-width: 768px) {
  .md\:grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .lg\:grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .md\:grid-cols-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.gap-6 {
  gap: 1.5rem;
}

.gap-4 {
  gap: 1rem;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}

.space-x-4 > * + * {
  margin-left: 1rem;
}

/* Loading spinner animation */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
