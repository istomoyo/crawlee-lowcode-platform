import request from "./request";

// =======================
// 页面截图
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

// =======================
// 列表自动识别
// =======================
export function listPreviewApi(data: {
  url: string;
  targetAspectRatio?: number;
  tolerance?: number;
}): Promise<any> {
  return request.post("/api/task/list-preview", data);
}

// =======================
// XPath 解析（文本 / 图片 / 链接）
// =======================
export interface XpathParseText {
  xpath: string;
  text: string;
  type: string; // 可选：title / text 等
  tag: string;
}

export interface XpathParseImage {
  xpath: string;
  src: string;
}

export interface XpathParseLink {
  xpath: string;
  href: string;
}

export interface XpathParseItems {
  baseXpath: string;
  texts: XpathParseText[];
  images: XpathParseImage[];
  links: XpathParseLink[];
}

export interface XpathParseRes {
  count: number;
  items: XpathParseItems; // ✅ 对象，不是数组
}
export function xpathParseApi(data: {
  url: string;
  xpath: string;
}): Promise<XpathParseRes> {
  return request.post("/api/task/xpath-parse", data);
}


// =======================
// XPath 匹配结果（只返回数量 + 文本样例）
// =======================
export interface XpathMatchRes {
  count: number;
  samples: string[];
}

export function xpathMatchApi(data: {
  url: string;
  xpath: string;
}): Promise<XpathMatchRes> {
  return request.post("/api/task/xpath-match", data);
}

export function jsPathParseApi(data:{
  url: string;
  jsPath: string;
}): Promise<XpathMatchRes> {
  // TODO
    return request.post("/api/task/jspath-parse", data);

}