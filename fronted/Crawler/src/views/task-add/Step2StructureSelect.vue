<template>
  <el-card class="mt-6 p-4 flex flex-col h-full">
    <!-- loading -->
    <div v-if="loading" class="text-center h-full">
      <svg
        class="mx-auto size-8 animate-spin text-indigo-600"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="mt-4">Loading...</p>
    </div>

    <!-- 内容 -->
    <div v-else class="flex-1 overflow-auto space-y-6">
      <!-- 自动识别 -->
      <div>
        <h3 class="font-bold mb-2">自动识别的列表项</h3>
        <div class="grid grid-cols-3 gap-4">
          <el-card
            v-for="(item, index) in listItems"
            :key="index"
            :class="[
              'cursor-pointer',
              selectedType === 'auto' && selectedIndex === index
                ? 'border-blue-500! border-2!'
                : '',
            ]"
            @click="selectAuto(index)"
          >
            <template #header>{{ item.xpath }}</template>
            <img
              :src="'data:image/png;base64,' + item.base64"
              class="w-full h-40 object-contain"
            />
            <p class="text-sm mt-1">数量：{{ item.matchCount }}</p>
          </el-card>
        </div>
      </div>

      <!-- 自定义 XPath -->
      <div>
        <h3 class="font-bold mb-2">自定义 XPath</h3>
        <el-input
          v-model="customXpath"
          placeholder="//div[@class='item']"
          clearable
          @focus="selectCustomXpath"
        />
      </div>

      <!-- 自定义 JSPath -->
      <div>
        <h3 class="font-bold mb-2">自定义 JSPath</h3>
        <el-input
          v-model="customJsPath"
          placeholder="document.querySelector('#commentapp > bili-comments')..."
          clearable
          @focus="selectCustomJsPath"
        />
      </div>
    </div>

    <!-- 底部按钮 -->
    <div class="mt-4 flex justify-end gap-2">
      <el-button @click="prevStep">上一步</el-button>
      <el-button
        type="primary"
        :disabled="!store.selectedItem"
        @click="nextStep"
      >
        下一步
      </el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { listPreviewApi } from "@/api/task";
import { useTaskFormStore } from "@/stores/taskForm";
import { ElMessageBox, ElMessage } from "element-plus";

interface ListItem {
  xpath: string;
  base64: string;
  selector: string;
  matchCount: number;
}

const router = useRouter();
const store = useTaskFormStore();

const loading = ref(false);
const listItems = reactive<ListItem[]>([]);
const selectedIndex = ref(-1);
const selectedType = ref<"auto" | "customXpath" | "customJsPath" | null>(null);
const customXpath = ref("");
const customJsPath = ref("");

// 调用前弹出输入框，让用户填写目标长宽比和允许误差
async function fetchListItems() {
  if (!store.form.url) return;

  try {
    const { value: ratioValues } = await ElMessageBox.prompt(
      "请输入目标长宽比和允许误差，使用两个输入框分别填写，例如目标长宽比 1，允许误差 0.3",
      "列表识别设置",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        inputValue: "1",
        inputPattern: /^\d+(\.\d+)?$/,
        inputErrorMessage: "请输入合法数字",
        inputPlaceholder: "目标长宽比",
      }
    );

    const targetAspectRatio = parseFloat(ratioValues);
    if (isNaN(targetAspectRatio)) throw new Error("目标长宽比错误");

    const { value: toleranceValue } = await ElMessageBox.prompt(
      "请输入允许误差",
      "列表识别设置",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        inputValue: "0.3",
        inputPattern: /^\d+(\.\d+)?$/,
        inputErrorMessage: "请输入合法数字",
        inputPlaceholder: "允许误差",
      }
    );

    const tolerance = parseFloat(toleranceValue);
    if (isNaN(tolerance)) throw new Error("允许误差错误");

    loading.value = true;
    const res = await listPreviewApi({
      url: store.form.url,
    });

    listItems.splice(0, listItems.length, ...res);
    console.log("res :>> ", res);
  } catch (err) {
    ElMessage.info("取消列表识别或输入错误");
  } finally {
    loading.value = false;
  }
}

/* 选自动 */
function selectAuto(index: number) {
  selectedIndex.value = index;
  selectedType.value = "auto";
  store.selectedItem = {
    xpath: listItems[index]!.xpath,
    base64: listItems[index]!.base64,
    jsPath: undefined,
  };
}

/* 选自定义 XPath */
function selectCustomXpath() {
  selectedIndex.value = -1;
  selectedType.value = "customXpath";
  store.selectedItem = {
    xpath: customXpath.value || "",
    base64: "",
    jsPath: undefined,
  };
}

/* 选自定义 JSPath */
function selectCustomJsPath() {
  selectedIndex.value = -1;
  selectedType.value = "customJsPath";
  store.selectedItem = {
    xpath: "",
    base64: "",
    jsPath: customJsPath.value || "",
  };
}

// watch 保持独立更新
watch(customXpath, (val) => {
  if (selectedType.value === "customXpath" && store.selectedItem) {
    store.selectedItem.xpath = val;
  }
});
watch(customJsPath, (val) => {
  if (selectedType.value === "customJsPath" && store.selectedItem) {
    store.selectedItem.jsPath = val;
  }
});

function prevStep() {
  router.back();
}

function nextStep() {
  router.push("/crawleer/task-add/mapping");
}

onMounted(fetchListItems);
</script>

<style scoped>
.el-card {
  height: 100%;
}
</style>
