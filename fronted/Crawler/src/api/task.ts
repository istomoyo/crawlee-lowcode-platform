import request from "./request";

// =======================
// 获取页面截图
// =======================
export interface ScreenshotRes {
  url: string;
  screenshotBase64: string;
}

export function previewScreenshotApi(data: {
  url: string;
}): Promise<ScreenshotRes> {
  return request.post("/api/task/preview-screenshot", data);
}
export function listPreviewApi(data: { url: string }): Promise<any> {
  return request.post("/api/task/list-preview", data);
}
