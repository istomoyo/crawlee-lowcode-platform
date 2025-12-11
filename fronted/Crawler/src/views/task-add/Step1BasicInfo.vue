<script setup lang="ts">
import { useRouter } from "vue-router";
import { useTaskFormStore } from "@/stores/taskForm";
import { ref } from "vue";
import { previewScreenshotApi } from "@/api/task";
import { ElMessage } from "element-plus";
import { reactive } from "vue";

const router = useRouter();
const store = useTaskFormStore();
const loading = ref(false);
const previewBase64 = ref("");

// 表单验证规则
const formRef = ref();
const rules = reactive({
  name: [{ required: true, message: "任务名称不能为空", trigger: "blur" }],
  url: [
    { required: true, message: "初始 URL 不能为空", trigger: "blur" },
    { type: "url", message: "请输入合法 URL", trigger: "blur" },
  ],
});

// 用户失去焦点请求截图
async function fetchPreview() {
  if (!store.form.url || !/^https?:\/\//.test(store.form.url)) {
    previewBase64.value = "";
    return;
  }
  loading.value = true;
  try {
    const res = await previewScreenshotApi({ url: store.form.url });
    previewBase64.value = res.screenshotBase64;
  } catch {
    previewBase64.value = "";
  } finally {
    loading.value = false;
  }
}

function nextStep() {
  // 校验表单
  formRef.value.validate((valid: boolean) => {
    if (!valid) return;
    router.push({ path: "structure" });
  });
}
</script>

<template>
  <el-card class="mt-6 flex gap-6 h-full p-4 flex-col">
    <el-form
      ref="formRef"
      :model="store.form"
      :rules="rules"
      label-width="100px"
      class="flex-none w-80"
    >
      <el-form-item label="任务名称" prop="name">
        <el-input v-model="store.form.name" placeholder="请输入任务名称" />
      </el-form-item>
      <el-form-item label="初始 URL" prop="url">
        <el-input v-model="store.form.url" placeholder="https://example.com" />
      </el-form-item>
      <el-form-item>
        <el-button
          type="primary"
          @click="nextStep"
          :loading="loading"
          v-if="!!previewBase64"
        >
          下一步
        </el-button>
        <el-button
          type="primary"
          @click="fetchPreview"
          :loading="loading"
          class="div"
          v-else
        >
          获取预览图
        </el-button>
      </el-form-item>
    </el-form>

    <div
      class="flex-1 flex flex-col min-h-1/2 w-3/4 mx-auto shadow-2xl rounded-2xl overflow-hidden"
    >
      <el-image
        v-if="previewBase64"
        :src="previewBase64"
        :preview-src-list="[previewBase64]"
        show-progress
        fit="contain"
        class="flex-1 min-h-0"
      />
      <div
        v-else
        class="flex-1 flex items-center justify-center text-gray-400"
        v-loading="loading"
      >
        预览区域
      </div>
    </div>
  </el-card>
</template>
