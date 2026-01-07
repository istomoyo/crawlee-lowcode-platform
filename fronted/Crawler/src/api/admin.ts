import request from './request';

// 用户管理相关的接口
export interface UserItem {
  id: number;
  username: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  avatar?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface GetUsersParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface UserListResponse {
  items: UserItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
}

export interface UpdateUserData {
  username?: string;
  email?: string;
  role?: 'user' | 'admin';
  status?: 'active' | 'disabled';
}

export interface ApiResponse<T = any> {
  statusCode: number;
  message: string;
  data?: T;
}

// ==================== 用户管理 APIs ====================

// 获取用户列表
export function getUsersApi(params: GetUsersParams): Promise<UserListResponse> {
  return request.get('/api/admin/users', { params });
}

// 创建用户
export function createUserApi(data: CreateUserData): Promise<ApiResponse<UserItem>> {
  return request.post('/api/admin/users', data);
}

// 更新用户
export function updateUserApi(id: number, data: UpdateUserData): Promise<ApiResponse<UserItem>> {
  return request.put(`/api/admin/users/${id}`, data);
}

// 删除用户
export function deleteUserApi(id: number): Promise<ApiResponse<void>> {
  return request.delete(`/api/admin/users/${id}`);
}

// 切换用户状态
export function toggleUserStatusApi(id: number): Promise<ApiResponse<UserItem>> {
  return request.put(`/api/admin/users/${id}/toggle-status`);
}

// ==================== 任务监控 APIs ====================

export interface TaskItem {
  id: number;
  name: string;
  url: string;
  status: string;
  progress?: number;
  createdAt: string;
  lastExecutionTime?: string;
  user: {
    id: number;
    username: string;
  };
  executions?: Array<{
    id: number;
    status: string;
    startTime: string;
    endTime?: string;
    log: string;
  }>;
}

export interface TaskStats {
  totalTasks: number;
  runningTasks: number;
  successTasks: number;
  failedTasks: number;
}

export interface GetTasksParams {
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface TaskListResponse {
  items: TaskItem[];
  stats: TaskStats;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 获取任务列表
export function getTasksApi(params: GetTasksParams): Promise<TaskListResponse> {
  return request.get('/api/admin/tasks', { params });
}

// 停止任务
export function stopTaskApi(taskId: number): Promise<ApiResponse<void>> {
  return request.put(`/api/admin/tasks/${taskId}/stop`);
}

// ==================== 系统日志 APIs ====================

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  module: string;
  user?: string;
  message: string;
  details?: any;
}

export interface LogStats {
  total: number;
  error: number;
  warn: number;
  info: number;
  debug: number;
}

export interface GetLogsParams {
  level?: LogLevel;
  module?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface LogListResponse {
  items: LogEntry[];
  stats: LogStats;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 获取系统日志
export function getLogsApi(params: GetLogsParams): Promise<LogListResponse> {
  return request.get('/api/admin/logs', { params });
}

// 清空系统日志
export function clearLogsApi(): Promise<ApiResponse<void>> {
  return request.delete('/api/admin/logs');
}

// ==================== 系统设置 APIs ====================

export interface SystemSettings {
  basic: {
    systemName: string;
    systemDescription: string;
    adminEmail: string;
    language: string;
  };
  crawler: {
    defaultConcurrency: number;
    maxRequestsPerCrawl: number;
    requestTimeout: number;
    waitForTimeout: number;
    enableProxy: boolean;
    proxyUrl: string;
  };
  storage: {
    datasetRetentionDays: number;
    screenshotRetentionDays: number;
    logRetentionDays: number;
    autoCleanup: boolean;
    cleanupTime: string;
  };
  security: {
    minPasswordLength: number;
    loginFailLockCount: number;
    lockDurationMinutes: number;
    enableTwoFactor: boolean;
    sessionTimeoutMinutes: number;
  };
  email: {
    enableEmail: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpUsername: string;
    smtpPassword: string;
    smtpSSL: boolean;
    fromEmail: string;
    fromName: string;
  };
}

export interface SystemInfo {
  startTime: string;
  version: string;
  status: string;
  uptime: number;
}

// 获取系统设置
export function getSystemSettingsApi(): Promise<SystemSettings> {
  return request.get('/api/admin/settings');
}

// 更新系统设置
export function updateSystemSettingsApi(settings: SystemSettings): Promise<ApiResponse<SystemSettings>> {
  return request.put('/api/admin/settings', settings);
}

// 获取系统信息
export function getSystemInfoApi(): Promise<SystemInfo> {
  return request.get('/api/admin/system-info');
}
