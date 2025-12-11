<template>
  <div class="p-4"> 
    <!-- 顶部工具栏 -->
    <div class="flex justify-between items-center mb-4">
      <el-input
        placeholder="搜索任务名称 / URL"
        clearable
        style="width: 260px"
      />
      <el-button type="primary">新增任务</el-button>
    </div>

    <!-- 表格 -->
    <el-table :data="mockData" border stripe style="width: 100%">
      <el-table-column prop="id" label="ID" width="70" />

      <el-table-column prop="name" label="任务名称" min-width="160" />

      <el-table-column
        prop="url"
        label="URL"
        min-width="220"
        show-overflow-tooltip
      />

      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <!-- <el-tag :type="statusType(row.status)" effect="dark">
            {{ row.status }}
          </el-tag> -->
        </template>
      </el-table-column>

      <el-table-column prop="createdAt" label="创建时间" width="180" />

      <el-table-column prop="updatedAt" label="更新时间" width="180" />

      <el-table-column label="操作" width="200">
        <template #default>
          <el-button size="small">编辑</el-button>
          <el-button size="small" type="danger">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="mt-4 flex justify-end">
      <el-pagination
        background
        layout="prev, pager, next"
        :total="100"
        :page-size="10"
      />
    </div>
  </div>
</template>

<script setup>
// —— 纯样式 DEMO 数据 ——
const mockData = [
  {
    id: 1,
    name: "爬取知乎热榜",
    url: "https://www.zhihu.com/hot",
    status: "pending",
    createdAt: "2025-01-01 12:00",
    updatedAt: "2025-01-01 12:00",
  },
  {
    id: 2,
    name: "爬取哔哩哔哩热门视频",
    url: "https://www.bilibili.com",
    status: "running",
    createdAt: "2025-01-01 12:00",
    updatedAt: "2025-01-01 12:03",
  },
  {
    id: 3,
    name: "爬取微博热搜",
    url: "https://weibo.com/hot",
    status: "success",
    createdAt: "2025-01-01 12:00",
    updatedAt: "2025-01-01 12:10",
  },
  {
    id: 4,
    name: "爬取豆瓣电影榜单",
    url: "https://douban.com/movie",
    status: "failed",
    createdAt: "2025-01-01 12:00",
    updatedAt: "2025-01-01 12:01",
  },
];

// 状态颜色
const statusType = (status) => {
  switch (status) {
    case "pending":
      return "";
    case "running":
      return "warning";
    case "success":
      return "success";
    case "failed":
      return "danger";
    default:
      return "";
  }
};
</script>

<style scoped></style>
