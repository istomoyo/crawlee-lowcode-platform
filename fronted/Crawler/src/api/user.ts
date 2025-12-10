import { da } from "element-plus/es/locales.mjs";
import request from "./request";

// 登录
export interface LoginParams {
  email: string;
  password: string;
}

export function loginApi(data: LoginParams) {
  return request.post("/api/user/login", data);
}

// 图形验证码响应
export interface CaptchaRes {
  captchaId: string;
  svg: string;
}

// 获取图形验证码
export function createCaptchaApi(): Promise<CaptchaRes> {
  return request.get("/api/user/captcha");
}
interface registerParams {
  username: string;
  email: string;
  password: string;
  code: string;
}
// 注册
export function registerApi(data: registerParams) {
  return request.post("/api/user/register", data);
}
// 发送邮箱验证码
export function sendEmailCodeApi(data: {
  email: string;
  captchaId: string;
  captchaText: string;
}) {
  return request.post("/api/user/send-code", data);
}

export interface UserInfo {
  id: number;
  email: string;
  username: string;
  role: string;
}
//获取用户详细信息
export function getUserInfoApi(): Promise<UserInfo> {
  return request.get("/api/user/profile");
}
