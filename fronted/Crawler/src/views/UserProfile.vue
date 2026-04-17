<template>
  <div v-loading="loadingProfile" class="page-shell">
    <header class="page-header">
      <div>
        <h1 class="page-title">个人资料</h1>
        <p class="page-description">统一管理头像、基础资料和账号安全设置，尽量把高频操作压缩到更直接的布局里。</p>
      </div>
    </header>

    <section class="surface-card profile-hero">
      <div class="profile-hero__avatar">
        <el-tooltip content="点击更换头像" placement="bottom">
          <button type="button" class="profile-avatar-trigger" @click="openCropper">
            <el-avatar :size="112" :src="avatarUrl">
              {{ !avatarUrl ? profileInitial : "" }}
            </el-avatar>
          </button>
        </el-tooltip>
        <span class="text-xs text-slate-500">点击头像可重新上传和裁剪</span>
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-chip">{{ form.role === "admin" ? "管理员" : "普通成员" }}</span>
          <span class="inline-chip">账号 ID {{ form.id || "--" }}</span>
        </div>

        <h2 class="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">
          {{ form.username || "未命名用户" }}
        </h2>
        <p class="mt-2 text-sm leading-6 text-slate-600">{{ form.email || "--" }}</p>

        <div class="profile-stats mt-5">
          <div class="toolbar-card p-4">
            <p class="metric-label">登录邮箱</p>
            <p class="detail-value">{{ form.email || "--" }}</p>
          </div>
          <div class="toolbar-card p-4">
            <p class="metric-label">头像状态</p>
            <p class="detail-value">{{ avatarUrl ? "已设置自定义头像" : "使用默认头像" }}</p>
          </div>
          <div class="toolbar-card p-4">
            <p class="metric-label">安全提醒</p>
            <p class="detail-value">建议定期更换密码并避免复用。</p>
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <article class="surface-card p-5 sm:p-6">
        <div class="page-header">
          <div>
            <h2 class="section-title">基础资料</h2>
            <p class="section-description">邮箱保持只读，用户名与头像可直接在当前页更新。</p>
          </div>
        </div>

        <el-form :model="form" label-position="top" class="mt-5 grid gap-4">
          <div class="profile-form-grid">
            <el-form-item label="邮箱">
              <el-input v-model="form.email" disabled />
            </el-form-item>
            <el-form-item label="用户名">
              <el-input v-model="form.username" />
            </el-form-item>
          </div>

          <div class="flex flex-wrap justify-end gap-2">
            <el-button plain @click="openCropper">更换头像</el-button>
            <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存资料</el-button>
          </div>
        </el-form>
      </article>

      <article class="surface-card p-5 sm:p-6">
        <div class="page-header">
          <div>
            <h2 class="section-title">修改密码</h2>
            <p class="section-description">保留现有密码接口，桌面端改成更紧凑的双列布局。</p>
          </div>
        </div>

        <el-form :model="pwdForm" label-position="top" class="mt-5 grid gap-4">
          <div class="profile-form-grid">
            <el-form-item label="旧密码">
              <el-input v-model="pwdForm.oldPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="pwdForm.newPassword" type="password" show-password />
            </el-form-item>
          </div>

          <el-form-item label="确认新密码">
            <el-input v-model="pwdForm.confirmPassword" type="password" show-password />
          </el-form-item>

          <div class="toolbar-card p-4">
            <p class="detail-label">密码建议</p>
            <p class="detail-value">至少使用 8 位以上组合密码，并避免和其他系统共用。</p>
          </div>

          <div class="flex justify-end">
            <el-button type="primary" :loading="savingPassword" @click="savePassword">修改密码</el-button>
          </div>
        </el-form>
      </article>
    </section>

    <el-dialog v-model="cropDialogVisible" title="更换头像" width="min(92vw, 680px)">
      <div class="grid gap-4">
        <div class="flex flex-wrap gap-2">
          <el-button type="primary" @click="fileInput?.click()">选择图片</el-button>
          <el-button plain @click="closeCropDialog">清空</el-button>
        </div>

        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onFileChange"
        />

        <div class="profile-cropper-shell">
          <img
            v-if="imageUrl"
            ref="cropperImg"
            :src="imageUrl"
            class="h-full w-full flex-1"
          />
          <span v-else class="absolute inset-0 flex items-center justify-center text-slate-400">
            请先选择图片
          </span>
        </div>
      </div>

      <template #footer>
        <el-button @click="closeCropDialog">取消</el-button>
        <el-button type="primary" :loading="savingAvatar" @click="saveCroppedAvatar">保存头像</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import Cropper from "cropperjs";
import { ElMessage } from "element-plus";
import { useUserStore } from "@/stores/user";
import {
  changePasswordApi,
  getUserInfoApi,
  updateUserProfileApi,
  uploadAvatarApi,
  type UserInfo,
} from "@/api/user";
import { getAvatarUrl } from "@/utils/avatar";

const userStore = useUserStore();
const loadingProfile = ref(false);

const form = reactive<Partial<UserInfo>>({
  id: 0,
  email: "",
  username: "",
  avatar: "",
  role: "",
});

const previewAvatar = ref("");
const savingProfile = ref(false);
const avatarUrl = computed(() => getAvatarUrl(previewAvatar.value));
const profileInitial = computed(() => form.username?.slice(0, 1).toUpperCase() || "U");

const pwdForm = reactive({
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
});
const savingPassword = ref(false);

const cropDialogVisible = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const cropperImg = ref<HTMLImageElement | null>(null);
const imageUrl = ref("");
const savingAvatar = ref(false);
let cropper: Cropper | null = null;

onMounted(() => {
  void loadProfile();
});

async function loadProfile() {
  try {
    loadingProfile.value = true;
    const info = await getUserInfoApi();
    form.id = info.id;
    form.email = info.email;
    form.username = info.username;
    form.avatar = info.avatar;
    form.role = info.role;
    previewAvatar.value = info.avatar || "";
  } catch {
    ElMessage.error("获取用户信息失败");
  } finally {
    loadingProfile.value = false;
  }
}

function openCropper() {
  cropDialogVisible.value = true;
}

function closeCropDialog() {
  cropDialogVisible.value = false;

  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value);
  }
  imageUrl.value = "";

  if (fileInput.value) {
    fileInput.value.value = "";
  }
}

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) {
    return;
  }

  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value);
  }
  imageUrl.value = URL.createObjectURL(file);

  nextTick(() => {
    if (!cropperImg.value) {
      return;
    }

    if (cropper) {
      cropper.destroy();
      cropper = null;
    }

    cropper = new Cropper(cropperImg.value, {
      aspectRatio: 1,
      viewMode: 1,
      autoCropArea: 0.82,
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
    const canvas = cropper.getCroppedCanvas({ width: 256, height: 256 });
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });

    if (!blob) {
      throw new Error("头像裁剪失败");
    }

    const file = new File([blob], "avatar.png", { type: "image/png" });
    const updated = await uploadAvatarApi(file);
    previewAvatar.value = updated.avatar ?? "";
    form.avatar = updated.avatar;
    await userStore.fetchUserInfo();
    ElMessage.success("头像已更新");
    closeCropDialog();
  } catch {
    ElMessage.error("上传头像失败");
  } finally {
    savingAvatar.value = false;
  }
}

async function saveProfile() {
  if (!form.username?.trim()) {
    ElMessage.warning("用户名不能为空");
    return;
  }

  savingProfile.value = true;
  try {
    await updateUserProfileApi({ username: form.username.trim() });
    await userStore.fetchUserInfo();
    ElMessage.success("资料已更新");
  } catch {
    ElMessage.error("更新资料失败");
  } finally {
    savingProfile.value = false;
  }
}

async function savePassword() {
  if (!pwdForm.oldPassword || !pwdForm.newPassword || !pwdForm.confirmPassword) {
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
  } catch {
    ElMessage.error("修改密码失败");
  } finally {
    savingPassword.value = false;
  }
}
</script>

<style scoped>
.profile-hero {
  display: grid;
  gap: 1.25rem;
  padding: 1.5rem;
  background:
    radial-gradient(circle at top right, rgba(12, 92, 171, 0.12), transparent 30%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
}

.profile-hero__avatar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.profile-avatar-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.profile-avatar-trigger :deep(.el-avatar) {
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
  border: 4px solid rgba(255, 255, 255, 0.95);
}

.profile-stats {
  display: grid;
  gap: 0.85rem;
}

.profile-form-grid {
  display: grid;
  gap: 1rem;
}

.profile-cropper-shell {
  position: relative;
  min-height: 340px;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.9));
}

@media (min-width: 1024px) {
  .profile-hero {
    grid-template-columns: 180px minmax(0, 1fr);
    align-items: center;
  }

  .profile-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .profile-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
