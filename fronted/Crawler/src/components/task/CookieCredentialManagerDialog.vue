<script setup lang="ts">
import { computed } from "vue";
import CookieCredentialManagerPanel from "./CookieCredentialManagerPanel.vue";

const props = defineProps<{
  visible: boolean;
  selectedId?: number | null;
}>();

const emit = defineEmits<{
  "update:visible": [boolean];
  "update:selectedId": [number | null];
  refreshed: [];
}>();

const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit("update:visible", value),
});

const currentSelectionId = computed({
  get: () => props.selectedId ?? null,
  set: (value: number | null) => emit("update:selectedId", value),
});

function handleRefreshed() {
  emit("refreshed");
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    width="960px"
    top="6vh"
    class="cookie-credential-dialog"
    destroy-on-close
  >
    <template #header>
      <div class="dialog-header">
        <div>
          <div class="dialog-title">Cookie 凭证库</div>
          <p class="dialog-description">
            Cookie 明文只会在服务端加密保存，任务和模板里只保留凭证引用。
          </p>
        </div>
      </div>
    </template>

    <CookieCredentialManagerPanel
      :active="dialogVisible"
      v-model:selected-id="currentSelectionId"
      @refreshed="handleRefreshed"
    />
  </el-dialog>
</template>

<style scoped>
.dialog-header {
  padding-right: 1rem;
}

.dialog-title {
  color: #0f172a;
  font-size: 1.15rem;
  font-weight: 700;
}

.dialog-description {
  margin-top: 0.35rem;
  color: #64748b;
  font-size: 0.84rem;
  line-height: 1.6;
}

@media (max-width: 959px) {
  :deep(.cookie-credential-dialog .el-dialog) {
    width: min(96vw, 1040px) !important;
  }
}
</style>
