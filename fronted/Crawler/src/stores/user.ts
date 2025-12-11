import { defineStore } from "pinia";
import { ref } from "vue";
import { getUserInfoApi, loginApi, type LoginParams } from "@/api/user";

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

  // 初始化，优先从 sessionStorage 拿
  const init = async () => {
    const saved = sessionStorage.getItem("user");
    if (saved) {
      user.value = JSON.parse(saved);
      return user.value;
    }
    // sessionStorage 没有就去请求 profile
    return await fetchUserInfo();
  };

  // 请求 profile，依赖 cookie token
  const fetchUserInfo = async () => {
    if (user.value) return user.value;
    if (loading.value) return null; // 防止重复请求
    loading.value = true;
    try {
      const res = await getUserInfoApi();
      user.value = res;
      sessionStorage.setItem("user", JSON.stringify(res));
      return res;
    } catch {
      user.value = null;
      sessionStorage.removeItem("user");
      return null;
    } finally {
      loading.value = false;
    }
  };

  const login = async (params: LoginParams) => {
    const res = await loginApi(params);
    if (!res?.data?.user) throw new Error("登录失败");
    user.value = res.data.user;
    sessionStorage.setItem("user", JSON.stringify(res.data.user));
  };

  const logout = () => {
    user.value = null;
    sessionStorage.removeItem("user");
  };

  return { user, init, fetchUserInfo, login, logout };
});
