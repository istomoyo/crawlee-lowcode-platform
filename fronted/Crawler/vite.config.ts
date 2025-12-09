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
