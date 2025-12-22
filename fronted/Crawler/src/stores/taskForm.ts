//fronted\Crawler\src\stores\taskForm.ts

import { defineStore } from "pinia";
import { reactive, ref } from "vue";

interface TreeNode {
  id: number;
  label: string;
  selector?: string;
  jsPath?: string;
  children?: TreeNode[];
  type: "field" | "image" | "link";
  samples?: string[];
}

export const useTaskFormStore = defineStore("taskForm", () => {
  const form = reactive({
    name: "",
    url: "",
  });

  const selectedItem = ref<{
    xpath?: string;
    base64?: string;
    jsPath?: string;
  } | null>(null);

  const treeData = reactive<TreeNode[]>([]);
  function serializeTree(nodes: TreeNode[]): Array<{
    label: string;
    type: "field" | "image" | "link";
    selector?: string;
    jsPath?: string;
    samples?: string[];
    children?: any[];
  }> {
    return nodes.map((n) => ({
      label: n.label,
      type: n.type,
      selector: n.selector,
      jsPath: n.jsPath,
      samples: n.samples,
      children: n.children ? serializeTree(n.children) : undefined,
    }));
  }

  function buildConfig() {
    return {
      name: form.name,
      startUrl: form.url,
      selector: {
        xpath: selectedItem.value?.xpath || "",
        jsPath: selectedItem.value?.jsPath || "",
      },
      mapping: serializeTree(treeData),
    };
  }

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
    buildConfig,
    resetForm,
  };
});
