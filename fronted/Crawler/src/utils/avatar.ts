import { resolveUploadUrl } from "@/utils/api-url";

export function getAvatarUrl(avatarPath?: string | null): string | undefined {
  if (!avatarPath) {
    return undefined;
  }

  if (avatarPath.startsWith("http://") || avatarPath.startsWith("https://")) {
    return avatarPath;
  }

  return resolveUploadUrl(avatarPath);
}
