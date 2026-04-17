import { ref } from "vue";
import {
  getTaskCookieCredentialsApi,
  type TaskCookieCredentialSummary,
} from "@/api/task";

const credentials = ref<TaskCookieCredentialSummary[]>([]);
const loading = ref(false);
const loaded = ref(false);

export function useCookieCredentials() {
  async function fetchCookieCredentials(force = false) {
    if (loading.value) {
      return credentials.value;
    }

    if (loaded.value && !force) {
      return credentials.value;
    }

    loading.value = true;
    try {
      credentials.value = await getTaskCookieCredentialsApi();
      loaded.value = true;
      return credentials.value;
    } finally {
      loading.value = false;
    }
  }

  function clearCookieCredentials() {
    credentials.value = [];
    loaded.value = false;
  }

  return {
    credentials,
    cookieCredentialsLoading: loading,
    cookieCredentialsLoaded: loaded,
    fetchCookieCredentials,
    clearCookieCredentials,
  };
}
