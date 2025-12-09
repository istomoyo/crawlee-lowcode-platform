<template>
  <el-container style="height: 100vh">
    <el-header>
      <div class="header-left">后台管理系统</div>
      <el-button type="text" @click="logout">退出登录</el-button>
    </el-header>

    <el-container>
      <el-aside width="200px">
        <el-menu :default-active="activeMenu" router>
          <el-menu-item index="/tasks">任务列表</el-menu-item>
          <el-menu-item index="/users">用户管理</el-menu-item>
        </el-menu>
      </el-aside>

      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const activeMenu = ref(route.path)

watch(
  () => route.path,
  (val) => {
    activeMenu.value = val
  }
)

const logout = () => {
  localStorage.removeItem('token')
  router.push('/login')
}
</script>

<style scoped>
.header-left {
  float: left;
  font-size: 18px;
  color: #fff;
}
.el-header {
  background-color: #409eff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}
</style>
