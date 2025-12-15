//fronted\Crawler\src\stores\taskForm.ts

import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import type { Node, Edge } from "@vue-flow/core";

interface TreeNode {
  id: number;
  label: string;
  selector?: string;
  children?: TreeNode[];
  type: "field" | "image" | "link";
}

export const useTaskFormStore = defineStore("taskForm", () => {
  const form = reactive({
    name: "",
    url: "",
  });

  const selectedItem = ref<{
    xpath: string;
    base64?: string;
  } | null>(null);

  const treeData = reactive<TreeNode[]>([]);
  function resetForm() {
    form.name = "";
    form.url = "";
    selectedItem.value = null;
    treeData.length = 0;
  }

  return {
    form,
    selectedItem,
    treeData,
    resetForm,
  };
});
