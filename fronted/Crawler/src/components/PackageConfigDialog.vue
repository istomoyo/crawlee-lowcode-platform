<template>
  <el-dialog
    v-model="dialogVisible"
    title="打包配置"
    width="800px"
    :close-on-click-modal="false"
  >
    <div v-if="results && results.length > 0">
      <!-- 字段选择 -->
      <el-card shadow="never" class="mb-4">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <el-icon><List /></el-icon>
              <span>字段选择（共 {{ fieldKeys.length }} 个）</span>
            </div>
            <div class="flex gap-2">
              <el-button size="small" text @click="selectAllFields">全选</el-button>
              <el-button size="small" text @click="deselectAllFields">全不选</el-button>
            </div>
          </div>
        </template>
        <div class="space-y-2">
          <div
            v-for="field in fieldKeys"
            :key="field"
            class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div class="flex items-center gap-3 flex-1">
              <el-checkbox
                v-model="selectedFields"
                :label="field"
                @change="handleFieldSelectionChange"
              />
              <div class="flex items-center gap-2 flex-1">
                <span class="font-medium">{{ field }}</span>
                <el-tag
                  :type="getFieldType(field) === 'image' ? 'success' : getFieldType(field) === 'file' ? 'warning' : 'info'"
                  size="small"
                  class="cursor-pointer"
                  @click="toggleFieldType(field)"
                >
                  {{ getFieldTypeLabel(getFieldType(field)) }}
                  <el-icon class="ml-1" v-if="getFieldType(field) === 'image'"><Picture /></el-icon>
                  <el-icon class="ml-1" v-else-if="getFieldType(field) === 'file'"><Link /></el-icon>
                </el-tag>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-4 text-sm text-gray-500">
          <p>• 勾选字段表示要下载/保存该字段</p>
          <p>• 点击字段类型标签可以手动修改类型（图片、链接、文本）</p>
        </div>
      </el-card>

      <!-- 文件结构配置 -->
      <el-card shadow="never" class="mb-4">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><FolderOpened /></el-icon>
            <span>文件结构配置</span>
          </div>
        </template>
        <el-collapse v-model="activeCollapse">
          <el-collapse-item title="图片文件结构" name="images">
            <div class="flex gap-2 mb-2">
              <el-input
                v-model="packageConfig.structure.images"
                placeholder="images/{index}_{fieldName}.{ext}"
                class="font-mono flex-1"
              />
              <el-dropdown @command="(field) => insertField('images', field)" trigger="click">
                <el-button type="primary" plain>
                  <el-icon class="mr-1"><Plus /></el-icon>
                  插入字段
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="field in fieldKeys"
                      :key="field"
                      :command="field"
                    >
                      {{ field }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="text-xs text-gray-500">
              <p>• 支持变量：{index}, {fieldName}, {ext}, {timestamp}, {date}, {字段名}</p>
              <p>• 示例：images/{标题}.{ext} 或 images/{index}_{title}.jpg</p>
              <p>• 点击"插入字段"按钮可以快速插入您在 Step3 中定义的字段名</p>
            </div>
          </el-collapse-item>

          <el-collapse-item title="文件结构（从链接下载）" name="files">
            <div class="flex gap-2 mb-2">
              <el-input
                v-model="packageConfig.structure.files"
                placeholder="files/{index}_{fieldName}.{ext}"
                class="font-mono flex-1"
              />
              <el-dropdown @command="(field) => insertField('files', field)" trigger="click">
                <el-button type="primary" plain>
                  <el-icon class="mr-1"><Plus /></el-icon>
                  插入字段
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="field in fieldKeys"
                      :key="field"
                      :command="field"
                    >
                      {{ field }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="text-xs text-gray-500">
              <p>• 支持变量：{index}, {fieldName}, {ext}, {timestamp}, {date}, {字段名}</p>
              <p>• 点击"插入字段"按钮可以快速插入您在 Step3 中定义的字段名</p>
            </div>
          </el-collapse-item>

          <el-collapse-item title="文本文件结构" name="texts">
            <div class="flex gap-2 mb-2">
              <el-input
                v-model="packageConfig.structure.texts"
                placeholder="texts/{index}_{fieldName}.txt"
                class="font-mono flex-1"
              />
              <el-dropdown @command="(field) => insertField('texts', field)" trigger="click">
                <el-button type="primary" plain>
                  <el-icon class="mr-1"><Plus /></el-icon>
                  插入字段
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="field in fieldKeys"
                      :key="field"
                      :command="field"
                    >
                      {{ field }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="text-xs text-gray-500">
              <p>• 支持变量：{index}, {fieldName}, {timestamp}, {date}, {字段名}</p>
              <p>• 点击"插入字段"按钮可以快速插入您在 Step3 中定义的字段名</p>
            </div>
          </el-collapse-item>

          <el-collapse-item title="数据JSON文件结构" name="data">
            <el-input
              v-model="packageConfig.structure.data"
              placeholder="data.json"
              class="font-mono mb-2"
            />
            <div class="text-xs text-gray-500">
              <p>• 使用 {index} 则为每个数据项一个JSON文件</p>
              <p>• 不使用 {index} 则为单个JSON文件包含所有数据</p>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-card>

      <!-- 高级设置 -->
      <el-card shadow="never">
        <template #header>
          <div class="flex items-center gap-2">
            <el-icon><Tools /></el-icon>
            <span>高级设置</span>
          </div>
        </template>
        <div class="space-y-4">
          <el-form-item label="最大文件大小（MB）">
            <el-input-number
              v-model="packageConfig.download.maxFileSize"
              :min="1"
              :max="100"
              :step="1"
            />
            <span class="text-sm text-gray-500 ml-2">超过此大小的文件将跳过下载</span>
          </el-form-item>

          <el-form-item label="下载超时（秒）">
            <el-input-number
              v-model="packageConfig.download.timeout"
              :min="5"
              :max="300"
              :step="5"
            />
            <span class="text-sm text-gray-500 ml-2">单个文件的下载超时时间</span>
          </el-form-item>
        </div>
      </el-card>
    </div>

    <div v-else class="text-center py-8 text-gray-500">
      <el-icon size="48" class="mb-2"><Warning /></el-icon>
      <p>没有可打包的数据</p>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          @click="handlePackage"
          :loading="packaging"
        >
          <el-icon class="mr-1"><Box /></el-icon>
          开始打包
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { List, Setting, FolderOpened, Tools, Picture, Link, Warning, Box, Plus } from '@element-plus/icons-vue';
import { packageResultApi, type PackageResultRes } from '@/api/task';

interface Props {
  visible: boolean;
  results: any[];
  executionId?: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:visible', visible: boolean): void;
  (e: 'package-complete', packagePath: string): void;
}>();

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
});

const packaging = ref(false);
const activeCollapse = ref(['images', 'files', 'texts']);

// 获取所有字段名
const fieldKeys = computed(() => {
  if (!props.results || props.results.length === 0) return [];
  const keys = new Set<string>();
  props.results.forEach((item) => {
    Object.keys(item).forEach((key) => keys.add(key));
  });
  return Array.from(keys);
});

// 字段类型映射
const fieldTypeMap = reactive<Record<string, 'image' | 'file' | 'text'>>({});

// 选中的字段列表（用于控制哪些字段要下载/保存）
const selectedFields = ref<string[]>([]);

// 常见图片后缀匹配：在整个字符串里查找，兼容带参数的链接
const hasImageExtension = (value: string) => {
  const lowerValue = value.toLowerCase();
  if (lowerValue.startsWith('data:image/')) return true;
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|avif)(?=($|[?#@&]))/.test(lowerValue);
};

// 自动识别字段类型
const detectFieldType = (fieldName: string): 'image' | 'file' | 'text' => {
  if (fieldTypeMap[fieldName]) {
    return fieldTypeMap[fieldName];
  }

  // 分析字段值来判断类型
  const sampleItem = props.results.find(item => item[fieldName]);
  if (!sampleItem) return 'text';

  const value = sampleItem[fieldName];
  if (typeof value === 'string') {
    const isLink = value.startsWith('http://') || value.startsWith('https://') || value.startsWith('//');
    if (hasImageExtension(value)) return 'image';
    if (isLink) return 'file';
  }
  return 'text';
};

const getFieldType = (fieldName: string): 'image' | 'file' | 'text' => {
  return detectFieldType(fieldName);
};

const getFieldTypeLabel = (type: 'image' | 'file' | 'text'): string => {
  switch (type) {
    case 'image':
      return '图片';
    case 'file':
      return '链接';
    case 'text':
      return '文本';
    default:
      return '未知';
  }
};

const toggleFieldType = (fieldName: string) => {
  const currentType = getFieldType(fieldName);
  // 切换类型：image -> file -> text -> image
  if (currentType === 'image') {
    fieldTypeMap[fieldName] = 'file';
  } else if (currentType === 'file') {
    fieldTypeMap[fieldName] = 'text';
  } else {
    fieldTypeMap[fieldName] = 'image';
  }
};

// 全选/全不选
const selectAllFields = () => {
  selectedFields.value = [...fieldKeys.value];
};

const deselectAllFields = () => {
  selectedFields.value = [];
};

// 字段选择变化处理
const handleFieldSelectionChange = () => {
  // 可以在这里添加额外的逻辑
};

// 打包配置
const packageConfig = reactive({
  structure: {
    images: 'images/{index}_{fieldName}.{ext}',
    files: 'files/{index}_{fieldName}.{ext}',
    texts: 'texts/{index}_{fieldName}.txt',
    data: '', // 默认为空，不生成JSON文件，用户可以在配置中手动设置
  },
  download: {
    images: true, // 这个值会被动态计算，这里只是占位
    files: true, // 这个值会被动态计算，这里只是占位
    texts: true, // 这个值会被动态计算，这里只是占位
    maxFileSize: 10, // MB
    timeout: 30, // 秒
  },
  fieldMapping: {} as {
    imageFields?: string[];
    fileFields?: string[];
    textFields?: string[];
  },
});

// 自动生成字段映射和默认选中所有字段
watch(
  () => props.results,
  () => {
    if (props.results && props.results.length > 0) {
      // 默认选中所有字段
      selectedFields.value = [...fieldKeys.value];
    }
  },
  { immediate: true }
);

// 插入字段到路径模板
const insertField = (type: 'images' | 'files' | 'texts', fieldName: string) => {
  const template = `{${fieldName}}`;
  const currentValue = packageConfig.structure[type] || '';
  
  // 如果当前值为空，使用默认模板
  if (!currentValue) {
    if (type === 'images') {
      packageConfig.structure[type] = `images/${template}.{ext}`;
    } else if (type === 'files') {
      packageConfig.structure[type] = `files/${template}.{ext}`;
    } else {
      packageConfig.structure[type] = `texts/${template}.txt`;
    }
  } else {
    // 追加到当前值末尾
    packageConfig.structure[type] = currentValue + template;
  }
  
  ElMessage.success(`已插入字段: {${fieldName}}`);
};

const handlePackage = async () => {
  if (!props.executionId) {
    ElMessage.error('执行ID不存在');
    return;
  }

  if (selectedFields.value.length === 0) {
    ElMessage.warning('请至少选择一个字段');
    return;
  }

  try {
    packaging.value = true;

    // 根据用户选择的字段和字段类型更新映射
    // 只处理用户选中的字段
    const imageFields: string[] = [];
    const fileFields: string[] = [];
    const textFields: string[] = [];

    selectedFields.value.forEach((field) => {
      const type = fieldTypeMap[field] || detectFieldType(field);
      if (type === 'image') {
        imageFields.push(field);
      } else if (type === 'file') {
        fileFields.push(field);
      } else {
        textFields.push(field);
      }
    });

    const config = {
      structure: packageConfig.structure,
      download: {
        images: imageFields.length > 0, // 只有选中了图片字段才下载图片
        files: fileFields.length > 0, // 只有选中了文件字段才下载文件
        texts: textFields.length > 0, // 只有选中了文本字段才保存文本
        maxFileSize: packageConfig.download.maxFileSize * 1024 * 1024, // 转换为字节
        timeout: packageConfig.download.timeout * 1000, // 转换为毫秒
      },
      fieldMapping: {
        imageFields,
        fileFields,
        textFields,
      },
    };

    const result: PackageResultRes = await packageResultApi(props.executionId!, config);

    ElMessage.success('打包成功');
    emit('package-complete', result.packagePath);
  } catch (error: any) {
    ElMessage.error(`打包失败: ${error.message || '未知错误'}`);
    console.error('Package error:', error);
  } finally {
    packaging.value = false;
  }
};
</script>

<style scoped>
.font-mono {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}
</style>

