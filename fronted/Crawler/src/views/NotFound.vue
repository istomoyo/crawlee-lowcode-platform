<template>
  <div class="flex h-screen items-center justify-center bg-gray-50">
    <div class="text-center">
      <h1 class="text-6xl font-extrabold text-gray-800">404</h1>
      <p class="mt-4 text-xl text-gray-600">抱歉，你访问的页面不存在</p>
      <router-link
        to="/"
        class="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-2 text-white hover:bg-indigo-500"
      >
        返回首页
      </router-link>
    </div>
  </div>
</template>

<script lang="ts" setup>
// NotFound 页面不需要额外逻辑
</script>

<style scoped>
/* 可根据需要自定义样式 */
</style>
