<template>
  <el-dialog
    v-model="dialogVisible"
    title="保存为模板"
    width="min(92vw, 520px)"
    :close-on-click-modal="false"
  >
    <div class="page-shell">
      <section class="toolbar-card p-4">
        <p class="metric-label">来源任务</p>
        <h3 class="section-title mt-1">{{ task?.name || "未选择任务" }}</h3>
        <p class="mt-2 text-sm leading-6 text-slate-600">
          保存后可在模板中心复用这套抓取配置，也可以继续编辑和分类管理。
        </p>
      </section>

      <el-form label-position="top" :model="form" class="grid gap-4">
        <el-form-item label="模板名称" required>
          <el-input
            v-model="form.name"
            maxlength="60"
            show-word-limit
            placeholder="例如：电商商品详情模板"
          />
        </el-form-item>

        <el-form-item label="分类">
          <el-input
            v-model="form.category"
            maxlength="30"
            placeholder="例如：内容采集 / 资讯 / 商品"
          />
        </el-form-item>

        <el-form-item label="说明">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="4"
            maxlength="180"
            show-word-limit
            placeholder="说明模板适用的网站结构、字段范围或使用建议"
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          保存模板
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { createTaskTemplateFromTaskApi } from "@/api/task";
import type { TaskItem } from "@/types/task";

const props = defineProps<{
  modelValue: boolean;
  task: TaskItem | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "saved"): void;
}>();

const saving = ref(false);

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const form = reactive({
  name: "",
  category: "",
  description: "",
});

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      form.name = props.task ? `${props.task.name} 模板` : "";
      form.category = props.task?.folder || "";
      form.description = "";
    }
  },
);

async function handleSave() {
  if (!props.task?.id) {
    ElMessage.warning("当前任务不存在，无法保存模板");
    return;
  }

  if (!form.name.trim()) {
    ElMessage.warning("请输入模板名称");
    return;
  }

  try {
    saving.value = true;
    await createTaskTemplateFromTaskApi({
      taskId: props.task.id,
      name: form.name.trim(),
      category: form.category.trim() || undefined,
      description: form.description.trim() || undefined,
    });
    ElMessage.success("模板已保存");
    emit("saved");
    dialogVisible.value = false;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存模板失败");
  } finally {
    saving.value = false;
  }
}
</script>
