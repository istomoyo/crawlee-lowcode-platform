import axios from "axios"
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios"
import { ElMessage } from "element-plus"
import router from "@/router"

// 创建 axios 实例
const request: AxiosInstance = axios.create({
  baseURL: "http://localhost:3000",
  timeout: 5000
})

// 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("token")

    // Axios 1.x 正确初始化 headers
    if (!config.headers) {
      config.headers = {} as InternalAxiosRequestConfig['headers']
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      if (status === 401) {
        ElMessage.error("登录已过期，请重新登录")
        localStorage.removeItem("token")
        router.push("/login")
        return Promise.reject(error)
      }
      ElMessage.error(data?.message || "请求失败")
    } else {
      ElMessage.error("无法连接服务器")
    }
    return Promise.reject(error)
  }
)

export default request
