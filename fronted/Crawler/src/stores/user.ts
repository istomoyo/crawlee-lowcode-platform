import { defineStore } from "pinia";
import { computed, ref } from "vue";
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

type LoginResponse = {
  user: User;
};

export const useUserStore = defineStore("user", () => {
  const user = ref<User | null>(null);
  const loading = ref(false);
  const checked = ref(false);
  let fetchPromise: Promise<User | null> | null = null;

  const isAdmin = computed(() => user.value?.role === "admin");

  async function init() {
    if (checked.value) {
      return user.value;
    }

    const userStr = sessionStorage.getItem("user");
    if (userStr) {
      try {
        user.value = JSON.parse(userStr) as User;
        checked.value = true;
        return user.value;
      } catch {
        sessionStorage.removeItem("user");
      }
    }

    return await fetchUserInfo();
  }

  async function fetchUserInfo() {
    if (fetchPromise) {
      return await fetchPromise;
    }

    fetchPromise = (async () => {
      loading.value = true;
      try {
        const profile = await getUserInfoApi();
        user.value = profile;
        sessionStorage.setItem("user", JSON.stringify(profile));
        return profile;
      } catch {
        user.value = null;
        sessionStorage.removeItem("user");
        return null;
      } finally {
        loading.value = false;
        checked.value = true;
        fetchPromise = null;
      }
    })();

    return await fetchPromise;
  }

  async function login(params: LoginParams) {
    const response = (await loginApi(params)) as unknown as LoginResponse;
    user.value = response.user;
    checked.value = true;
    sessionStorage.setItem("user", JSON.stringify(response.user));
    return response.user;
  }

  async function logout() {
    try {
      await logoutApi();
    } catch (error) {
      console.error("Logout API failed:", error);
    } finally {
      user.value = null;
      checked.value = false;
      sessionStorage.removeItem("user");
    }
  }

  return {
    user,
    loading,
    checked,
    isAdmin,
    init,
    fetchUserInfo,
    login,
    logout,
  };
});
