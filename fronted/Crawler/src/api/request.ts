import axios from "axios";
import type {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { ElMessage } from "element-plus";
import router from "@/router";
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
    if (res.code === 200 && res.message) {
      ElMessage.success(res.message);
    }
    return res.data;
  },
  (error) => {
    if (error.response) {
      const { code, message } = error.response.data;
      if (code === 401) {
        ElMessage.error(message || "未授权，请登录");
        // ⚡ 不直接调用 store.user
        router.replace("/login");
      } else {
        ElMessage.error(message || "请求失败");
      }
    } else {
      ElMessage.error("无法连接服务器");
    }
    return Promise.reject(error);
  }
);

export default request;
