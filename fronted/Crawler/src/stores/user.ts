import { defineStore } from "pinia";
import { ref } from "vue";
import {
  getUserInfoApi,
  loginApi,
  logoutApi,
  type LoginParams,
} from "@/api/user";

export interface User {
  id: number;
  email: string;
  username: string;
  role: string;
  avatar?: string;
}

export const useUserStore = defineStore("user", () => {
  const user = ref<User | null>(null);
  const loading = ref(false);
  const checked = ref(false); // ⭐ 是否已经尝试过获取用户信息

  const init = async () => {
    if (checked.value) return user.value;
    // ⭐ 先读取 sessionStorage
    const userStr = sessionStorage.getItem("user");
    if (userStr) {
      user.value = JSON.parse(userStr);
      checked.value = true;
      return user.value;
    }
    // 没有再查API
    return await fetchUserInfo();
  };

  const fetchUserInfo = async () => {
    if (loading.value) return user.value;
    loading.value = true;

    try {
      const res = await getUserInfoApi();
      user.value = res;
      sessionStorage.setItem("user", JSON.stringify(res));
      return res;
    } catch (e: any) {
      // ⭐ 401：明确标记为“已检查且未登录”
      user.value = null;
      sessionStorage.removeItem("user");
      return null;
    } finally {
      loading.value = false;
      checked.value = true; // ⭐ 无论成功失败，都标记
    }
  };
  interface LoginResponse {
    user: User;
  }

  interface LoginResponse {
    user: User;
  }

  const login = async (params: LoginParams) => {
    const res = (await loginApi(params)) as unknown as LoginResponse;
    user.value = res.user;
    sessionStorage.setItem("user", JSON.stringify(user.value));
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch (error) {
      // 即使 API 调用失败，也继续执行本地清理
      console.error("登出 API 调用失败:", error);
    } finally {
      // 清理本地状态
      user.value = null;
      checked.value = false;
      sessionStorage.removeItem("user");
    }
  };

  return { user, init, fetchUserInfo, login, logout,checked };
});
