import request from "./request";

// 登录
export interface LoginParams {
  email: string;
  password: string;
}

export interface LoginRes {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    avatar?: string;
  };
}

export function loginApi(data: LoginParams) {
  return request.post<LoginRes>("/auth/login", data);
}

// 获取用户列表
export interface UserItem {
  id: number;
  username: string;
  email: string;
  avatar?: string;
  role: "admin" | "user";
  createdAt: string;
}

export function getUserListApi() {
  return request.get<UserItem[]>("/users");
}

// 获取单个用户信息
export function getUserDetailApi(id: number) {
  return request.get<UserItem>(`/users/${id}`);
}

// 创建用户
export interface CreateUserParams {
  username: string;
  email: string;
  password: string;
  role?: "admin" | "user";
}
export function createUserApi(data: CreateUserParams) {
  return request.post("/users", data);
}

// 更新用户
export interface UpdateUserParams {
  username?: string;
  email?: string;
  password?: string;
  role?: "admin" | "user";
}
export function updateUserApi(id: number, data: UpdateUserParams) {
  return request.patch(`/users/${id}`, data);
}

// 删除用户
export function deleteUserApi(id: number) {
  return request.delete(`/users/${id}`);
}
