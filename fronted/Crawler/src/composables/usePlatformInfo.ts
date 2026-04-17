import { ref } from "vue";
import {
  getPlatformInfoApi,
  type PlatformInfo,
} from "@/api/admin";

const platformInfo = ref<PlatformInfo | null>(null);
const loading = ref(false);
let fetchedOnce = false;

export function usePlatformInfo() {
  async function fetchPlatformInfo(force = false) {
    if (loading.value) {
      return platformInfo.value;
    }

    if (fetchedOnce && !force) {
      return platformInfo.value;
    }

    loading.value = true;
    try {
      platformInfo.value = await getPlatformInfoApi();
      fetchedOnce = true;
      return platformInfo.value;
    } finally {
      loading.value = false;
    }
  }

  return {
    platformInfo,
    platformInfoLoading: loading,
    fetchPlatformInfo,
  };
}
