<template>
  <el-card>
    <div style="margin-bottom: 10px">
      <el-button type="primary" @click="goCreate">新建用户</el-button>
    </div>
    <el-table :data="users" style="width: 100%" v-loading="loading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="username" label="用户名" />
      <el-table-column prop="email" label="邮箱" />
      <el-table-column prop="role" label="角色" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" type="primary">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteUser(row.id)"
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
import { getUserListApi, deleteUserApi, UserItem } from "@/api/user";
import { ElMessage, ElMessageBox } from "element-plus";

const router = useRouter();
const users = ref<UserItem[]>([]);
const loading = ref(false);

const loadUsers = async () => {
  loading.value = true;
  try {
    users.value = await getUserListApi();
  } finally {
    loading.value = false;
  }
};

const goCreate = () => {
  router.push("/users/edit");
};

const deleteUser = async (id: number) => {
  try {
    await ElMessageBox.confirm("确定删除吗?", "提示");
    await deleteUserApi(id);
    ElMessage.success("删除成功");
    loadUsers();
  } catch {}
};

onMounted(loadUsers);
</script>
