<template>
  <el-card>
    <div style="margin-bottom: 10px">
      <el-button type="primary" @click="goCreate">新建任务</el-button>
    </div>
    <el-table :data="tasks" style="width: 100%" v-loading="loading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="title" label="标题" />
      <el-table-column prop="status" label="状态">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)">{{
            statusText(row.status)
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="editTask(row.id)"
            >编辑</el-button
          >
          <el-button size="small" type="danger" @click="deleteTask(row.id)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getTaskListApi, deleteTaskApi, TaskItem } from "@/api/task";
import { ElMessage, ElMessageBox } from "element-plus";

const router = useRouter();
const tasks = ref<TaskItem[]>([]);
const loading = ref(false);

const loadTasks = async () => {
  loading.value = true;
  try {
    tasks.value = await getTaskListApi();
  } finally {
    loading.value = false;
  }
};

const goCreate = () => {
  router.push("/tasks/edit");
};

const editTask = (id: number) => {
  router.push(`/tasks/edit/${id}`);
};

const deleteTask = async (id: number) => {
  try {
    await ElMessageBox.confirm("确定删除吗?", "提示");
    await deleteTaskApi(id);
    ElMessage.success("删除成功");
    loadTasks();
  } catch {}
};

const statusText = (status: number) => {
  return status === 0 ? "待办" : status === 1 ? "进行中" : "完成";
};

const statusType = (status: number) => {
  return status === 0 ? "info" : status === 1 ? "warning" : "success";
};

onMounted(loadTasks);
</script>
