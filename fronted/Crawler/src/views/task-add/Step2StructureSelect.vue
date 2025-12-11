<template>
  <el-card class="mt-6 p-4 flex flex-col h-full">
    <div v-if="loading" class="flex justify-center items-center flex-1">
      <el-spinner />
    </div>

    <div v-else class="flex-1 overflow-auto grid grid-cols-3 gap-4">
      <el-card
        v-for="(item, index) in listItems"
        :key="index"
        :class="['cursor-pointer', selectedIndex === index ? 'border-primary-500 border-2' : '']"
        @click="selectItem(index)"
      >
        <img :src="'data:image/png;base64,' + item.base64" alt="截图" class="w-full h-40 object-contain" />
        <p class="text-sm truncate mt-1">{{ item.xpath }}</p>
      </el-card>
    </div>

    <div class="mt-4 flex justify-end gap-2">
      <el-button @click="prevStep">上一步</el-button>
      <el-button type="primary" :disabled="selectedIndex === -1" @click="nextStep">
        下一步
      </el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { listPreviewApi } from '@/api/task';
import { useTaskFormStore } from '@/stores/taskForm';

interface ListItem {
  xpath: string;
  base64: string;
}

const router = useRouter();
const store = useTaskFormStore();

const loading = ref(false);
const listItems = reactive<ListItem[]>([]);
const selectedIndex = ref(-1);

async function fetchListItems() {
  if (!store.form.url) return;
  loading.value = true;
  try {
    const res = await listPreviewApi({ url: store.form.url });
    console.log('res :>> ', res);
    listItems.splice(0, listItems.length, ...res);
  } catch (err) {
    console.error(err);
  } finally {
    loading.value = false;
  }
}

function selectItem(index: number) {
  selectedIndex.value = index;
  store.selectedItem = listItems[index]!; // 保存选择到 Pinia
}

function prevStep() {
  router.back();
}

function nextStep() {
  if (selectedIndex.value === -1) return;

  // 跳到第三步
  router.push({
    path: '/crawleer/task-add/mapping',
  });
}

// 页面加载自动获取列表
onMounted(fetchListItems);
</script>

<style scoped>
.el-card {
  height: 100%;
}

img {
  max-width: 100%;
}
</style>
