<template>
  <div class="task-row">
    <!-- 结果头部 -->
    <div class="result-header mb-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <el-icon size="20" class="text-green-600"><CircleCheck /></el-icon>
            <h3 class="text-xl font-semibold text-gray-800">爬取结果</h3>
          </div>
          <el-tag type="success" size="large" effect="light">
            <el-icon class="mr-1"><DataLine /></el-icon>
            {{ resultCount }} 条数据
          </el-tag>
        </div>
        <div class="flex gap-3">
          <el-button
            v-if="resultPath && !isZipFile"
            type="success"
            size="default"
            @click="showPackageDialog = true"
            class="package-btn"
          >
            <el-icon class="mr-1"><Box /></el-icon>
            打包下载
          </el-button>
          <el-button
            v-if="resultPath"
            type="primary"
            size="default"
            @click="handleDownload"
            class="download-btn"
          >
            <el-icon class="mr-1"><Download /></el-icon>
            {{ isZipFile ? '下载打包文件 (ZIP)' : '下载完整数据 (JSON)' }}
          </el-button>
        </div>
      </div>
    </div>


    <!-- 结果数据展示 -->
    <div v-if="!isZipFile && results && results.length > 0" class="result-content">
      <!-- 数据概览卡片 -->
      <div class="data-overview mb-6">
        <el-card shadow="never" class="overview-card">
          <template #header>
            <div class="flex items-center gap-2">
              <el-icon><InfoFilled /></el-icon>
              <span class="font-medium">数据概览</span>
            </div>
          </template>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="stat-item">
              <div class="stat-value text-2xl font-bold text-blue-600">{{ resultCount }}</div>
              <div class="stat-label text-gray-600">总记录数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value text-2xl font-bold text-green-600">{{ fieldCount }}</div>
              <div class="stat-label text-gray-600">字段数量</div>
            </div>
            <div class="stat-item">
              <div class="stat-value text-2xl font-bold text-purple-600">{{ formatFileSize(estimatedSize) }}</div>
              <div class="stat-label text-gray-600">预估大小</div>
            </div>
          </div>
        </el-card>
      </div>

      <!-- 数据预览表格 -->
      <div class="data-preview">
        <div class="preview-header mb-4">
          <div class="flex items-center justify-between">
            <h4 class="text-lg font-medium text-gray-800 flex items-center gap-2">
              <el-icon><List /></el-icon>
              数据预览
            </h4>
            <el-text type="info" size="small">
              显示前 {{ Math.min(10, resultCount) }} 条记录
            </el-text>
          </div>
        </div>

        <!-- 美化的数据表格 -->
        <div class="data-table-container">
          <el-table
            :data="previewData"
            size="small"
            border
            stripe
            style="width: 100%"
            max-height="500"
            class="result-table"
            :row-class-name="getRowClass"
          >
            <el-table-column
              v-for="key in fieldKeys"
              :key="key"
              :prop="key"
              :label="key"
              min-width="150"
              show-overflow-tooltip
              class="data-column"
            >
              <template #header="{ column }">
                <div class="column-header">
                  <span class="column-label">{{ column.label }}</span>
                  <el-tag size="mini" type="info" class="column-type-tag">
                    {{ getDataType(column.property) }}
                  </el-tag>
                </div>
              </template>
              <template #default="{ row: dataRow }">
                <div class="data-cell">
                  {{ renderCellValue(dataRow[key], key) }}
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 分页信息和下载提示 -->
        <div v-if="resultCount > 10" class="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <el-icon class="text-blue-600"><InfoFilled /></el-icon>
              <span class="text-blue-800">
                还有 <strong>{{ resultCount - 10 }}</strong> 条数据未显示
              </span>
            </div>
            <el-button
              type="primary"
              size="small"
              @click="handleDownload"
              class="download-more-btn"
            >
              <el-icon class="mr-1"><Download /></el-icon>
              下载完整数据
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 打包配置对话框 -->
    <PackageConfigDialog
      v-if="!isZipFile"
      v-model:visible="showPackageDialog"
      :results="results || []"
      :execution-id="executionId"
      @package-complete="handlePackageComplete"
    />

    <!-- 无结果数据提示 -->
    <div v-if="!isZipFile && (!results || results.length === 0)" class="no-result">
      <el-empty description="暂无结果数据" :image-size="100">
        <template #image>
          <el-icon size="100" class="text-gray-400"><Document /></el-icon>
        </template>
        <template #description>
          <div class="text-center">
            <p class="text-gray-600 mb-2">任务已完成但未提取到数据</p>
            <p class="text-sm text-gray-500">可能的原因：选择器配置错误或页面结构变更</p>
          </div>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Download, Document, CircleCheck, DataLine, InfoFilled, List, Box } from '@element-plus/icons-vue';
import PackageConfigDialog from './PackageConfigDialog.vue';

interface Props {
  results: any[];
  resultPath?: string;
  executionId?: number;
}

const props = defineProps<Props>();
const showPackageDialog = ref(false);

// 判断是否为ZIP文件
const isZipFile = computed(() => {
  if (!props.resultPath) return false;
  return props.resultPath.toLowerCase().endsWith('.zip');
});

// 计算属性
const resultCount = computed(() => props.results?.length || 0);

const getResultKeys = (results: any[]) => {
  if (!results || results.length === 0) return [];
  const keys = new Set<string>();
  results.forEach((item) => {
    Object.keys(item).forEach((key) => keys.add(key));
  });
  return Array.from(keys);
};

const fieldKeys = computed(() => getResultKeys(props.results));

const fieldCount = computed(() => fieldKeys.value.length);

const previewData = computed(() => props.results?.slice(0, 10) || []);

const estimatedSize = computed(() => {
  if (!props.results || props.results.length === 0) return 0;
  const sampleSize = JSON.stringify(props.results[0]).length;
  return sampleSize * props.results.length;
});

// 方法
const getRowClass = (row: any, rowIndex: number) => {
  return rowIndex % 2 === 0 ? 'even-row' : 'odd-row';
};

const getDataType = (key: string) => {
  if (!props.results || props.results.length === 0) return '未知';

  const sampleValue = props.results.find(item => item[key] !== null && item[key] !== undefined)?.[key];

  if (sampleValue === null || sampleValue === undefined) return '空值';

  if (typeof sampleValue === 'string') {
    // 检查是否为URL
    if (sampleValue.startsWith('http://') || sampleValue.startsWith('https://')) {
      return '链接';
    }
    return '文本';
  }
  if (typeof sampleValue === 'number') return '数字';
  if (typeof sampleValue === 'boolean') return '布尔';
  if (Array.isArray(sampleValue)) return '数组';
  if (typeof sampleValue === 'object') return '对象';

  return '未知';
};

const renderCellValue = (value: any, key: string) => {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string') {
    // 检查是否为URL
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value.length > 50 ? value.substring(0, 50) + '...' : value;
    }
    // 检查是否为很长的文本
    if (value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    return value;
  }

  if (typeof value === 'boolean') {
    return value ? '✓' : '✗';
  }

  if (Array.isArray(value)) {
    return `[${value.length} 项]`;
  }

  if (typeof value === 'object') {
    return '{对象}';
  }

  return String(value);
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const handlePackageComplete = (packagePath: string) => {
  showPackageDialog.value = false;
  // 触发下载打包文件
  downloadFile(packagePath);
  ElMessage.success('打包完成，开始下载');
};

const downloadFile = (filePath: string) => {
  try {
    const downloadUrl = `${import.meta.env.VITE_API_BASE_URL || "/api"}/${filePath}`;
    const fileName = filePath.split("/").pop() || "package.zip";
    
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    ElMessage.error("下载失败");
    console.error("Download error:", error);
  }
};

const handleDownload = () => {
  if (!props.resultPath) return;

  try {
    // 构建下载URL
    const downloadUrl = `${import.meta.env.VITE_API_BASE_URL || "/api"}/${props.resultPath}`;
    const fileName = props.resultPath.split("/").pop() || (isZipFile.value ? "result.zip" : "result.json");
    
    // 对于ZIP文件，直接下载
    if (isZipFile.value) {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      ElMessage.success("开始下载打包文件");
    } else {
      // 对于JSON文件，使用fetch获取后下载
      fetch(downloadUrl)
        .then(response => {
          if (!response.ok) throw new Error('下载失败');
          return response.blob();
        })
        .then(blob => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          ElMessage.success("开始下载结果文件");
        })
        .catch(error => {
          console.error("Download error:", error);
          ElMessage.error("下载失败");
        });
    }
  } catch (error) {
    ElMessage.error("下载失败");
    console.error("Download error:", error);
  }
};
</script>

<style scoped>
/* 结果预览样式 */
.task-row {
  padding: 24px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 12px;
  margin: 16px 0;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.result-header {
  margin-bottom: 24px;
}

.result-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
}

.download-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  border: none;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
  transition: all 0.3s ease;
}

.download-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
}

.download-more-btn {
  background: #ffffff;
  border: 1px solid #3b82f6;
  color: #3b82f6;
}

.download-more-btn:hover {
  background: #3b82f6;
  color: white;
}

/* 数据概览卡片 */
.data-overview {
  margin-bottom: 24px;
}

.overview-card {
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.overview-card .el-card__header {
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 500;
}

.stat-item {
  text-align: center;
  padding: 16px 0;
}

.stat-value {
  margin-bottom: 4px;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
}

/* 数据预览样式 */
.data-preview {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid #e5e7eb;
}

.preview-header {
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 12px;
}

.preview-header h4 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 500;
  color: #374151;
}

/* 数据表格样式 */
.data-table-container {
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.result-table {
  border-radius: 6px;
  overflow: hidden;
}

.result-table .el-table__header {
  background: #f8fafc;
}

.result-table .el-table__header th {
  background: #f8fafc;
  border-bottom: 2px solid #e5e7eb;
  font-weight: 600;
  color: #374151;
}

.column-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.column-label {
  font-weight: 500;
  color: #374151;
}

.column-type-tag {
  font-size: 10px;
  padding: 2px 6px;
}

.data-column .el-table__cell {
  padding: 12px 8px;
}

.data-cell {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  color: #374151;
}

/* 表格行样式 */
.even-row {
  background: #fafbfc;
}

.odd-row {
  background: white;
}

.result-table .el-table__row:hover {
  background: #eff6ff;
}

/* 无结果样式 */
.no-result {
  padding: 48px 24px;
  text-align: center;
  background: white;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .task-row {
    padding: 16px;
    margin: 8px 0;
  }

  .data-overview .grid {
    grid-template-columns: 1fr;
  }

  .stat-item {
    padding: 12px 0;
  }

  .data-preview {
    padding: 16px;
  }

  .result-table {
    font-size: 12px;
  }

  .column-header {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
}

@media (max-width: 480px) {
  .task-row {
    padding: 12px;
  }

  .data-preview {
    padding: 12px;
  }

  .result-header .flex {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }

  .download-btn {
    width: 100%;
  }
}
</style>
