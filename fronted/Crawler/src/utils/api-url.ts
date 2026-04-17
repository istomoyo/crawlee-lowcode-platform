const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").trim().replace(/^\/+/, "");
}

function getApiBasePrefix() {
  return String(import.meta.env.VITE_API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

function getAssetBasePrefix() {
  const apiBasePrefix = getApiBasePrefix();
  if (!apiBasePrefix) {
    return "";
  }

  return apiBasePrefix.replace(/\/api$/i, "");
}

function joinAssetPath(path: string) {
  const normalizedPath = normalizePath(path);
  const assetBasePrefix = getAssetBasePrefix();

  if (!normalizedPath) {
    return undefined;
  }

  if (!assetBasePrefix) {
    return `/${normalizedPath}`;
  }

  return `${assetBasePrefix}/${normalizedPath}`;
}

function joinApiPath(path: string) {
  const normalizedPath = normalizePath(path);
  const apiBasePrefix = getApiBasePrefix();

  if (!normalizedPath) {
    return undefined;
  }

  if (!apiBasePrefix) {
    return normalizedPath.startsWith("api/")
      ? `/${normalizedPath}`
      : `/api/${normalizedPath}`;
  }

  return `${apiBasePrefix}/${normalizedPath.replace(/^api\//, "")}`;
}

export function resolveApiResourceUrl(resourcePath?: string | null) {
  if (!resourcePath) {
    return undefined;
  }

  if (ABSOLUTE_URL_PATTERN.test(resourcePath)) {
    return resourcePath;
  }

  return joinApiPath(resourcePath);
}

export function resolveUploadUrl(uploadPath?: string | null) {
  if (!uploadPath) {
    return undefined;
  }

  if (ABSOLUTE_URL_PATTERN.test(uploadPath)) {
    return uploadPath;
  }

  const normalizedPath = normalizePath(uploadPath);
  if (!normalizedPath) {
    return undefined;
  }

  if (
    normalizedPath.startsWith("uploads/") ||
    normalizedPath.startsWith("api/uploads/")
  ) {
    return joinAssetPath(normalizedPath.replace(/^api\//, ""));
  }

  if (
    normalizedPath.startsWith("screenshots/") ||
    normalizedPath.startsWith("avatars/") ||
    normalizedPath.startsWith("results/")
  ) {
    return joinAssetPath(`uploads/${normalizedPath}`);
  }

  return joinAssetPath(`uploads/${normalizedPath}`);
}
