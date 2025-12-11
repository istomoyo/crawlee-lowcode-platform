// stores/taskForm.ts
import { defineStore } from "pinia";
import { reactive, ref } from "vue";

export const useTaskFormStore = defineStore("taskForm", () => {
  const form = reactive({
    name: "",
    url: "",
  });

  // 保存用户选择的列表项
  const selectedItem = ref<{ xpath: string; base64: string } | null>(null);

  function resetForm() {
    form.name = "";
    form.url = "";
    selectedItem.value = null;
  }

  return { form, selectedItem, resetForm };
});
