<template>
  <el-card class="mt-6">
    <div class="text-lg font-bold mb-4">字段映射</div>

    <div class="mb-4 text-sm">
      选中的结构 XPath：<span class="font-mono">{{ selected.xpath }}</span>
    </div>

    <el-form :model="fields" label-width="100px">
      <div
        v-for="(field, key) in fields"
        :key="key"
        class="mb-4 p-3 border rounded"
      >
        <el-form-item :label="key">
          <el-input v-model="field.xpath" placeholder="请输入 XPath"></el-input>
        </el-form-item>
      </div>
    </el-form>

    <el-button type="primary" @click="save">保存任务</el-button>
  </el-card>
</template>

<script setup>
import { reactive } from "vue";
</script>
