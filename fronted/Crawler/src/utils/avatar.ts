/**
 * 将数据库存储的相对路径转换为完整的头像 URL
 * @param avatarPath 数据库存储的头像路径，如 "/uploads/avatars/1-1766378891080.png"
 * @returns 完整的头像 URL，如 "http://localhost:3000/uploads/avatars/1-1766378891080.png"
 */
export function getAvatarUrl(avatarPath?: string | null): string | undefined {
  if (!avatarPath) return undefined;

  // 如果已经是完整 URL，直接返回
  if (avatarPath.startsWith("http://") || avatarPath.startsWith("https://")) {
    return avatarPath;
  }

  // 从环境变量获取服务器地址，默认为 localhost:3000
  const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  // 确保路径以 / 开头
  const path = avatarPath.startsWith("/") ? avatarPath : `/${avatarPath}`;

  return `${baseUrl}${path}`;
}

