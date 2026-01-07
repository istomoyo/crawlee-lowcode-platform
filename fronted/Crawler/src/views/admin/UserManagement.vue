<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">用户管理</h1>
      <el-button type="primary" @click="showAddUserDialog">
        <el-icon><Plus /></el-icon>
        添加用户
      </el-button>
    </div>

    <!-- 搜索和筛选 -->
    <div class="mb-4 flex gap-4">
      <el-input
        v-model="searchQuery"
        placeholder="搜索用户名或邮箱"
        clearable
        style="width: 300px"
        @input="handleSearch"
      />
      <el-select v-model="statusFilter" placeholder="状态筛选" clearable style="width: 120px">
        <el-option label="全部" value="" />
        <el-option label="活跃" value="active" />
        <el-option label="禁用" value="disabled" />
      </el-select>
    </div>

    <!-- 用户列表 -->
    <el-table :data="userList" border stripe style="width: 100%" v-loading="loading">
      <el-table-column label="头像" width="80">
        <template #default="{ row }">
          <el-avatar :size="40" :src="getAvatarUrl(row.avatar)">
            {{ !getAvatarUrl(row.avatar) ? row.username?.[0]?.toUpperCase() : "" }}
          </el-avatar>
        </template>
      </el-table-column>
      <el-table-column prop="username" label="用户名" width="150" />
      <el-table-column prop="email" label="邮箱" min-width="200" />
      <el-table-column prop="role" label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="getRoleType(row.role)">
            {{ getRoleText(row.role) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'danger'">
            {{ row.status === 'active' ? '活跃' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="注册时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column prop="lastLoginAt" label="最后登录" width="180">
        <template #default="{ row }">
          {{ row.lastLoginAt ? formatDate(row.lastLoginAt) : '从未登录' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button
            size="small"
            type="warning"
            @click="editUser(row)"
            :disabled="row.id === currentUserId"
          >
            编辑
          </el-button>
          <el-button
            size="small"
            :type="row.status === 'active' ? 'danger' : 'success'"
            @click="toggleUserStatus(row)"
            :disabled="row.id === currentUserId"
          >
            {{ row.status === 'active' ? '禁用' : '启用' }}
          </el-button>
          <el-button
            size="small"
            type="danger"
            @click="deleteUser(row)"
            :disabled="row.id === currentUserId"
          >
            删除
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

    <!-- 添加/编辑用户对话框 -->
    <el-dialog
      v-model="userDialogVisible"
      :title="isEditing ? '编辑用户' : '添加用户'"
      width="500px"
    >
      <el-form :model="userForm" :rules="userRules" ref="userFormRef" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="userForm.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="userForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item v-if="!isEditing" label="密码" prop="password">
          <el-input
            v-model="userForm.password"
            type="password"
            placeholder="请输入密码"
          />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="userForm.role" placeholder="请选择角色">
            <el-option label="普通用户" value="user" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="userForm.status">
            <el-radio label="active">活跃</el-radio>
            <el-radio label="disabled">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="userDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitUserForm">
            {{ isEditing ? '更新' : '添加' }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { getAvatarUrl } from '@/utils/avatar'
import {
  getUsersApi,
  createUserApi,
  updateUserApi,
  deleteUserApi,
  toggleUserStatusApi,
  type UserItem,
  type UserListResponse,
  type CreateUserData,
  type UpdateUserData,
  type ApiResponse,
} from '@/api/admin'

// 响应式数据
const userList = ref<UserItem[]>([])
const loading = ref(false)
const searchQuery = ref('')
const statusFilter = ref('')
const currentUserId = ref<number | null>(null)

const userStore = useUserStore()

// 分页
const pagination = reactive({
  page: 1,
  limit: 10,
  total: 0,
})

// 用户表单
const userDialogVisible = ref(false)
const isEditing = ref(false)
const userFormRef = ref()
const userForm = reactive({
  id: null as number | null,
  username: '',
  email: '',
  password: '',
  role: 'user' as 'user' | 'admin',
  status: 'active' as 'active' | 'disabled',
})

// 表单验证规则
const userRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' },
  ],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
}

// 获取用户列表
const fetchUsers = async () => {
  try {
    loading.value = true
    const params = {
      search: searchQuery.value || undefined,
      status: statusFilter.value || undefined,
      page: pagination.page,
      limit: pagination.limit,
    }
    const response: UserListResponse = await getUsersApi(params)
    userList.value = response.items
    pagination.total = response.total
    pagination.page = response.page
    pagination.limit = response.limit
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '获取用户列表失败'
    ElMessage.error(errorMessage)
    // 如果出错，清空列表
    userList.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

// 搜索处理
const handleSearch = () => {
  pagination.page = 1
  fetchUsers()
}

// 分页处理
const handlePageChange = (page: number) => {
  pagination.page = page
  fetchUsers()
}

const handleSizeChange = (size: number) => {
  pagination.limit = size
  pagination.page = 1
  fetchUsers()
}

// 获取角色显示
const getRoleType = (role: string) => {
  return role === 'admin' ? 'danger' : 'primary'
}

const getRoleText = (role: string) => {
  return role === 'admin' ? '管理员' : '普通用户'
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

// 显示添加用户对话框
const showAddUserDialog = () => {
  isEditing.value = false
  Object.assign(userForm, {
    id: null,
    username: '',
    email: '',
    password: '',
    role: 'user',
    status: 'active',
  })
  userDialogVisible.value = true
}

// 编辑用户
const editUser = (user: UserItem) => {
  isEditing.value = true
  Object.assign(userForm, {
    id: user.id,
    username: user.username,
    email: user.email,
    password: '', // 编辑时不显示密码
    role: user.role,
    status: user.status,
  })
  userDialogVisible.value = true
}

// 切换用户状态
const toggleUserStatus = async (user: UserItem) => {
  try {
    const action = user.status === 'active' ? '禁用' : '启用'
    await ElMessageBox.confirm(`确定要${action}用户 "${user.username}" 吗？`, '提示', {
      type: 'warning',
    })

    const response: ApiResponse<UserItem> = await toggleUserStatusApi(user.id)

    // 更新本地数据
    const index = userList.value.findIndex(u => u.id === user.id)
    if (index !== -1) {
      userList.value[index] = response.data!
    }

    ElMessage.success(`${action}成功`)
  } catch (error) {
    if (error !== 'cancel') {
      const errorMessage = error instanceof Error ? error.message : '操作失败'
      ElMessage.error(errorMessage)
    }
  }
}

// 删除用户
const deleteUser = async (user: UserItem) => {
  try {
    await ElMessageBox.confirm(`确定要删除用户 "${user.username}" 吗？此操作不可恢复。`, '警告', {
      type: 'warning',
    })

    await deleteUserApi(user.id)

    // 从列表中移除用户
    const index = userList.value.findIndex(u => u.id === user.id)
    if (index !== -1) {
      userList.value.splice(index, 1)
      pagination.total--
    }

    ElMessage.success('删除成功')
  } catch (error) {
    if (error !== 'cancel') {
      const errorMessage = error instanceof Error ? error.message : '删除失败'
      ElMessage.error(errorMessage)
    }
  }
}

// 提交用户表单
const submitUserForm = async () => {
  try {
    await userFormRef.value.validate()

    if (isEditing.value) {
      // 更新用户
      const updateData: UpdateUserData = {
        username: userForm.username,
        email: userForm.email,
        role: userForm.role,
        status: userForm.status,
      }

      const response: ApiResponse<UserItem> = await updateUserApi(userForm.id!, updateData)

      // 更新本地数据
      const index = userList.value.findIndex(u => u.id === userForm.id)
      if (index !== -1) {
        userList.value[index] = response.data!
      }

      ElMessage.success('更新成功')
    } else {
      // 创建新用户
      const createData: CreateUserData = {
        username: userForm.username,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
        status: userForm.status,
      }

      const response: ApiResponse<UserItem> = await createUserApi(createData)

      // 添加到列表
      userList.value.unshift(response.data!)
      pagination.total++

      ElMessage.success('添加成功')
    }

    userDialogVisible.value = false
  } catch (error) {
    console.error('表单验证失败:', error)
    const errorMessage = error instanceof Error ? error.message : '操作失败'
    ElMessage.error(errorMessage)
  }
}

// 生命周期
onMounted(() => {
  currentUserId.value = userStore.user?.id || null
  fetchUsers()
})
</script>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
