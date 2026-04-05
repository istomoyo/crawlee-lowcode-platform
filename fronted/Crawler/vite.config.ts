import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import * as path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"), // @ 对应 src
    },
  },
  build: {
    chunkSizeWarningLimit: 950,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("echarts")) {
            return "vendor-echarts";
          }

          if (id.includes("element-plus")) {
            return "vendor-element-plus";
          }

          if (
            id.includes("/vue/") ||
            id.includes("/@vue/") ||
            id.includes("vue-router") ||
            id.includes("pinia")
          ) {
            return "vendor-vue";
          }

          if (id.includes("@vue-flow/core")) {
            return "vendor-flow";
          }

          return "vendor-misc";
        },
      },
    },
  },
  server: {
    port: 5173, // 你可以改成自己想要的端口
    open: true, // 启动时自动打开浏览器
    proxy: {
      // 代理 /api 请求到后端
      "/api": {
        target: "http://localhost:3000", // 你的 NestJS 后端地址
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
