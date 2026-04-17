<template>
  <div v-if="cards.length" class="grid gap-3">
    <section
      v-for="card in cards"
      :key="card.key"
      class="surface-card overflow-hidden border p-4 sm:p-5"
      :class="card.className"
    >
      <div class="flex items-start gap-3">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          :class="card.iconWrapClass"
        >
          <el-icon :size="18">
            <component :is="card.icon" />
          </el-icon>
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              {{ card.badge }}
            </span>
            <span
              v-if="card.timeRange"
              class="inline-chip !bg-white/70 !text-slate-600"
            >
              {{ card.timeRange }}
            </span>
          </div>
          <h3 class="mt-2 text-base font-bold text-slate-900 sm:text-lg">
            {{ card.title }}
          </h3>
          <p class="mt-1 text-sm leading-6 text-slate-600">
            {{ card.content }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Bell,
  InfoFilled,
  SuccessFilled,
  WarningFilled,
} from "@element-plus/icons-vue";
import type {
  AnnouncementVariant,
  MaintenanceVariant,
  PlatformInfo,
} from "@/api/admin";

const props = defineProps<{
  platformInfo?: PlatformInfo | null;
}>();

function variantMap(
  variant: AnnouncementVariant | MaintenanceVariant,
  maintenance = false,
) {
  switch (variant) {
    case "success":
      return {
        className: "border-emerald-200/80 bg-emerald-50/80",
        iconWrapClass: "bg-emerald-100 text-emerald-700",
        icon: SuccessFilled,
      };
    case "warning":
      return {
        className: "border-amber-200/80 bg-amber-50/90",
        iconWrapClass: "bg-amber-100 text-amber-700",
        icon: WarningFilled,
      };
    case "error":
      return {
        className: "border-rose-200/80 bg-rose-50/90",
        iconWrapClass: "bg-rose-100 text-rose-700",
        icon: WarningFilled,
      };
    default:
      return {
        className: maintenance
          ? "border-slate-200/80 bg-slate-50/90"
          : "border-indigo-200/80 bg-indigo-50/80",
        iconWrapClass: maintenance
          ? "bg-slate-100 text-slate-700"
          : "bg-indigo-100 text-indigo-700",
        icon: maintenance ? Bell : InfoFilled,
      };
  }
}

function formatRange(startAt?: string, endAt?: string) {
  const values = [startAt, endAt]
    .map((value) => {
      if (!value) {
        return "";
      }

      try {
        return new Date(value).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return value;
      }
    })
    .filter(Boolean);

  if (!values.length) {
    return "";
  }

  return values.join(" - ");
}

const cards = computed(() => {
  const info = props.platformInfo;
  if (!info) {
    return [];
  }

  const nextCards: Array<{
    key: string;
    badge: string;
    title: string;
    content: string;
    timeRange?: string;
    className: string;
    iconWrapClass: string;
    icon: typeof InfoFilled;
  }> = [];

  if (info.maintenance?.enabled) {
    nextCards.push({
      key: "maintenance",
      badge: "维护提示",
      title: info.maintenance.title || "平台维护中",
      content: info.maintenance.content || "部分功能可能受到影响。",
      timeRange: formatRange(info.maintenance.startAt, info.maintenance.endAt),
      ...variantMap(info.maintenance.variant, true),
    });
  }

  if (info.announcement?.enabled) {
    nextCards.push({
      key: "announcement",
      badge: "平台公告",
      title: info.announcement.title || "系统公告",
      content: info.announcement.content || "欢迎使用平台。",
      ...variantMap(info.announcement.variant),
    });
  }

  return nextCards;
});
</script>
