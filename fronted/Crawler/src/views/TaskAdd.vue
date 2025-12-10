<template>
  <el-card>
    <el-form :model="form" ref="formRef" label-width="80px">
      <el-form-item label="标题">
        <el-input v-model="form.title" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="form.status" placeholder="请选择">
          <el-option label="待办" :value="0" />
          <el-option label="进行中" :value="1" />
          <el-option label="完成" :value="2" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="submit" :loading="loading"
          >提交</el-button
        >
        <el-button @click="cancel">取消</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script lang="ts" setup>
import { reactive, ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import {
  createTaskApi,
  updateTaskApi,
  getTaskDetailApi,
  CreateTaskParams,
  UpdateTaskParams,
} from "@/api/task";
import { ElMessage } from "element-plus";

const router = useRouter();
const route = useRoute();
const formRef = ref();
const loading = ref(false);

const form = reactive<CreateTaskParams & UpdateTaskParams>({
  title: "",
  description: "",
  status: 0,
});

const loadTask = async (id: number) => {
  const res = await getTaskDetailApi(id);
  form.title = res.title;
  form.description = res.description;
  form.status = res.status;
};

onMounted(() => {
  const id = route.params.id ? Number(route.params.id) : null;
  if (id) loadTask(id);
});

const submit = async () => {
  loading.value = true;
  try {
    const id = route.params.id ? Number(route.params.id) : null;
    if (id) {
      await updateTaskApi(id, form);
      ElMessage.success("更新成功");
    } else {
      await createTaskApi(form);
      ElMessage.success("创建成功");
    }
    router.push("/tasks");
  } finally {
    loading.value = false;
  }
};

const cancel = () => {
  router.push("/tasks");
};
</script>
