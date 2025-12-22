<template>
  <div class="p-6 h-full flex flex-col">
    <el-card class="max-w-4xl mx-auto w-full space-y-6">
      <h2 class="text-lg font-bold mb-4">个人信息</h2>

      <div class="flex gap-10 items-start flex-wrap">
        <!-- 头像 -->
        <div class="flex flex-col items-center gap-3">
          <el-tooltip content="点击更换头像" placement="bottom">
            <div class="cursor-pointer" @click="openCropper">
              <el-avatar :size="96" :src="avatarUrl">
                {{ !avatarUrl ? form.username?.[0] : "" }}
              </el-avatar>
            </div>
          </el-tooltip>
          <span class="text-xs text-gray-500">点击头像更换</span>
        </div>

        <!-- 基本信息 -->
        <div class="flex-1 min-w-[260px] space-y-6">
          <el-card shadow="never">
            <h3 class="font-bold mb-3 text-sm">基本信息</h3>
            <el-form :model="form" label-width="80px" class="max-w-md">
              <el-form-item label="邮箱">
                <el-input v-model="form.email" disabled />
              </el-form-item>
              <el-form-item label="用户名">
                <el-input v-model="form.username" />
              </el-form-item>
              <el-form-item>
                <el-button
                  type="primary"
                  :loading="savingProfile"
                  @click="saveProfile"
                >
                  保存资料
                </el-button>
              </el-form-item>
            </el-form>
          </el-card>

          <!-- 修改密码 -->
          <el-card shadow="never">
            <h3 class="font-bold mb-3 text-sm">修改密码</h3>
            <el-form :model="pwdForm" label-width="80px" class="max-w-md">
              <el-form-item label="旧密码">
                <el-input v-model="pwdForm.oldPassword" type="password" />
              </el-form-item>
              <el-form-item label="新密码">
                <el-input v-model="pwdForm.newPassword" type="password" />
              </el-form-item>
              <el-form-item label="确认密码">
                <el-input v-model="pwdForm.confirmPassword" type="password" />
              </el-form-item>
              <el-form-item>
                <el-button
                  type="primary"
                  :loading="savingPassword"
                  @click="savePassword"
                >
                  修改密码
                </el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </div>
      </div>
    </el-card>

    <!-- 裁剪弹窗 -->
    <el-dialog v-model="cropDialogVisible" title="更换头像" width="600px">
      <div class="space-y-4">
        <el-button type="primary" @click="fileInput?.click()">
          选择图片
        </el-button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onFileChange"
        />

        <div
          class="border rounded bg-gray-50 relative w-full min-h-[300px] overflow-hidden flex"
        >
          <img
            v-if="imageUrl"
            ref="cropperImg"
            :src="imageUrl"
            class="w-full h-full flex-1"
          />
          <span
            v-else
            class="absolute inset-0 flex items-center justify-center text-gray-400"
          >
            请先选择图片
          </span>
        </div>
      </div>

      <template #footer>
        <el-button @click="closeCropDialog">取消</el-button>
        <el-button
          type="primary"
          :loading="savingAvatar"
          @click="saveCroppedAvatar"
        >
          保存头像
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick, computed } from "vue";
import Cropper from "cropperjs";
import { ElMessage } from "element-plus";
import { useUserStore } from "@/stores/user";
import {
  getUserInfoApi,
  updateUserProfileApi,
  uploadAvatarApi,
  changePasswordApi,
  type UserInfo,
} from "@/api/user";
import { getAvatarUrl } from "@/utils/avatar";

/* ================= 用户信息 ================= */

const userStore = useUserStore();

const form = reactive<Partial<UserInfo>>({
  email: "",
  username: "",
  avatar: "",
});

const previewAvatar = ref("");
const savingProfile = ref(false);

// 计算完整的头像 URL
const avatarUrl = computed(() => getAvatarUrl(previewAvatar.value));

/* ================= 修改密码 ================= */

const pwdForm = reactive({
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
});

const savingPassword = ref(false);

/* ================= 裁剪相关 ================= */

const cropDialogVisible = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const cropperImg = ref<HTMLImageElement | null>(null);
const imageUrl = ref("");

let cropper: Cropper | null = null;
const savingAvatar = ref(false);

/* ================= 初始化 ================= */

onMounted(loadProfile);

async function loadProfile() {
  try {
    const info = await getUserInfoApi();
    form.email = info.email;
    form.username = info.username;
    form.avatar = info.avatar;
    previewAvatar.value = info.avatar || "";
  } catch {
    ElMessage.error("获取用户信息失败");
  }
}

/* ================= 裁剪逻辑 ================= */

function openCropper() {
  cropDialogVisible.value = true;
}

function closeCropDialog() {
  cropDialogVisible.value = false;

  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
  imageUrl.value = "";
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
  imageUrl.value = URL.createObjectURL(file);

  nextTick(() => {
    if (!cropperImg.value) return;

    if (cropper) {
      cropper.destroy();
      cropper = null;
    }

    cropper = new Cropper(cropperImg.value, {
      aspectRatio: 1,
      viewMode: 3,
      autoCropArea: 0.8,
      background: false,
      responsive: true,
      dragMode: "crop",
      zoomable: true,
    });
  });
}

async function saveCroppedAvatar() {
  if (!cropper) {
    ElMessage.warning("请先选择图片");
    return;
  }

  savingAvatar.value = true;
  try {
    const canvas = cropper.getCroppedCanvas({
      width: 256,
      height: 256,
    });

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );

    if (!blob) throw new Error();

    const file = new File([blob], "avatar.png", { type: "image/png" });
    const updated = await uploadAvatarApi(file);

    previewAvatar.value = updated.avatar ?? "";
    await userStore.fetchUserInfo();

    ElMessage.success("头像已更新");
    closeCropDialog();
  } catch {
    ElMessage.error("上传头像失败");
  } finally {
    savingAvatar.value = false;
  }
}

/* ================= 保存资料 ================= */

async function saveProfile() {
  if (!form.username) {
    ElMessage.warning("用户名不能为空");
    return;
  }
  savingProfile.value = true;
  try {
    await updateUserProfileApi({ username: form.username });
    await userStore.fetchUserInfo();
    ElMessage.success("资料已更新");
  } catch {
    ElMessage.error("更新资料失败");
  } finally {
    savingProfile.value = false;
  }
}

/* ================= 修改密码 ================= */

async function savePassword() {
  if (
    !pwdForm.oldPassword ||
    !pwdForm.newPassword ||
    !pwdForm.confirmPassword
  ) {
    ElMessage.warning("请填写完整密码信息");
    return;
  }

  if (pwdForm.newPassword !== pwdForm.confirmPassword) {
    ElMessage.error("两次输入的新密码不一致");
    return;
  }

  savingPassword.value = true;
  try {
    await changePasswordApi({ ...pwdForm });
    ElMessage.success("密码修改成功");
    pwdForm.oldPassword = "";
    pwdForm.newPassword = "";
    pwdForm.confirmPassword = "";
  } finally {
    savingPassword.value = false;
  }
}
</script>
