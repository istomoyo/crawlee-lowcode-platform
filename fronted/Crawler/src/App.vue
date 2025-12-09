<template>
  <!-- 根路由容器 -->
  <router-view />
</template>

<script lang="ts" setup>
// App.vue 本身不需要逻辑，路由渲染由 <router-view /> 完成
</script>

<style>
/* 全局样式可以在这里写，也可以在 main.ts 导入 element-plus 样式 */
body,
html,
#app {
  margin: 0;
  height: 100%;
}
</style>
