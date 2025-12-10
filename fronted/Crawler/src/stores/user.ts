import { defineStore } from "pinia";
import { ref } from "vue";
import { getUserInfoApi } from "@/api/user";

export interface User {
  id: number;
  email: string;
  username: string;
  role: string;
  avatar?: string;
}

export const useUserStore = defineStore("user", () => {
  const user = ref<User | null>(null);
  const loading = ref<Promise<User | null> | null>(null); // 缓存请求

  const fetchUserInfo = async () => {
    // 如果已有请求正在进行，直接返回同一个 Promise
    if (loading.value) return await loading.value;

    // 如果已经有用户信息，直接返回
    if (user.value) return user.value;

    // 发起请求
    loading.value = (async () => {
      try {
        const res = await getUserInfoApi();
        user.value = res;
        return res;
      } catch (err) {
        user.value = null;
        return null;
      } finally {
        loading.value = null; // 请求完成后清空缓存
      }
    })();

    return await loading.value;
  };

  const logout = () => {
    user.value = null;
  };

  return { user, fetchUserInfo, logout };
});
