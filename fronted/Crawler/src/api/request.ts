import axios from "axios";
import type {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import router from "@/router";
import { useUserStore } from "@/stores/user";
// 创建 axios 实例
const request: AxiosInstance = axios.create({
  baseURL: "",
  timeout: 300000,
  withCredentials: true, // ✅ 允许发送 cookie
});

// 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 不再手动设置 Authorization
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data;
    // 移除前端的消息提示，由后端统一处理
    return res.data;
  },
  (error) => {
    if (error.response) {
      const { code } = error.response.data;
      const url = error.config?.url || "";

      // 如果是登出接口返回 401，不需要再次调用 logout（避免循环）
      if (code === 401 && !url.includes("/logout")) {
        // 401 未授权，清理所有用户状态
        const userStore = useUserStore();
        // 只清理本地状态，不调用 API（避免循环）
        userStore.user = null;
        userStore.checked = false;
        sessionStorage.removeItem("user");
        // 移除前端消息提示，后端已处理
        router.replace("/login");
      }
      // 其他错误由后端处理，不在前端重复显示
    }
    return Promise.reject(error);
  }
);

export default request;
