import axios from "axios";
import type {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import router from "@/router";
import { useUserStore } from "@/stores/user";

const request: AxiosInstance = axios.create({
  baseURL: "",
  timeout: 300000,
  withCredentials: true,
});

request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => config,
  (error) => Promise.reject(error),
);

request.interceptors.response.use(
  (response: AxiosResponse) => {
    const payload = response.data;
    return payload?.data ?? payload;
  },
  (error) => {
    if (error.response) {
      const responseData = error.response.data || {};
      const code = responseData.code ?? responseData.statusCode;
      const url = error.config?.url || "";
      const message = Array.isArray(responseData.message)
        ? responseData.message.filter(Boolean).join("；")
        : String(responseData.message || responseData.error || "").trim();

      if (code === 401 && !url.includes("/logout")) {
        const userStore = useUserStore();
        userStore.user = null;
        userStore.checked = false;
        sessionStorage.removeItem("user");
        router.replace("/login");
      }

      if (message) {
        error.message = message;
      }
    }

    return Promise.reject(error);
  },
);

export default request;
