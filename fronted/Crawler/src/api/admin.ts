import request from "./request";

export interface UserItem {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "disabled";
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
  role: "user" | "admin";
  status: "active" | "disabled";
}

export interface UpdateUserData {
  username?: string;
  email?: string;
  role?: "user" | "admin";
  status?: "active" | "disabled";
}

export interface ApiResponse<T = unknown> {
  statusCode?: number;
  message?: string;
  data?: T;
}

export function getUsersApi(params: GetUsersParams): Promise<UserListResponse> {
  return request.get("/api/admin/users", { params });
}

export function createUserApi(data: CreateUserData): Promise<UserItem> {
  return request.post("/api/admin/users", data);
}

export function updateUserApi(
  id: number,
  data: UpdateUserData,
): Promise<UserItem> {
  return request.put(`/api/admin/users/${id}`, data);
}

export function deleteUserApi(id: number): Promise<void> {
  return request.delete(`/api/admin/users/${id}`);
}

export function toggleUserStatusApi(id: number): Promise<UserItem> {
  return request.put(`/api/admin/users/${id}/toggle-status`);
}

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
  } | null;
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

export function getTasksApi(params: GetTasksParams): Promise<TaskListResponse> {
  return request.get("/api/admin/tasks", { params });
}

export function stopTaskApi(taskId: number): Promise<void> {
  return request.put(`/api/admin/tasks/${taskId}/stop`);
}

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  module: string;
  user?: string;
  message: string;
  details?: unknown;
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

export function getLogsApi(params: GetLogsParams): Promise<LogListResponse> {
  return request.get("/api/admin/logs", { params });
}

export function clearLogsApi(): Promise<void> {
  return request.delete("/api/admin/logs");
}

export type AnnouncementVariant = "info" | "success" | "warning";
export type MaintenanceVariant = "info" | "success" | "warning" | "error";
export type CleanupMode = "safe" | "standard" | "deep";

export interface SystemSettings {
  basic: {
    systemName: string;
    systemDescription: string;
    adminEmail: string;
    language: string;
    announcementEnabled: boolean;
    announcementTitle: string;
    announcementContent: string;
    announcementVariant: AnnouncementVariant;
    maintenanceEnabled: boolean;
    maintenanceTitle: string;
    maintenanceContent: string;
    maintenanceVariant: MaintenanceVariant;
    maintenanceStartAt: string;
    maintenanceEndAt: string;
  };
  crawler: {
    defaultConcurrency: number;
    maxRequestsPerCrawl: number;
    requestTimeout: number;
    waitForTimeout: number;
  };
  storage: {
    datasetRetentionDays: number;
    screenshotRetentionDays: number;
    logRetentionDays: number;
    autoCleanup: boolean;
    cleanupTime: string;
    cleanupMode: CleanupMode;
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
    smtpHost?: string;
    smtpPort?: number;
    smtpUsername?: string;
    smtpPassword?: string;
    smtpSSL?: boolean;
    fromEmail?: string;
    fromName?: string;
  };
}

export interface SystemInfo {
  startTime: string;
  version: string;
  status: string;
  uptime: number;
}

export interface PlatformAnnouncement {
  enabled: boolean;
  title: string;
  content: string;
  variant: AnnouncementVariant;
}

export interface PlatformMaintenance {
  enabled: boolean;
  title: string;
  content: string;
  variant: MaintenanceVariant;
  startAt?: string;
  endAt?: string;
}

export interface PlatformInfo {
  systemName: string;
  systemDescription: string;
  announcement: PlatformAnnouncement;
  capabilities: {
    unsafeCustomJsEnabled: boolean;
  };
  maintenance?: PlatformMaintenance;
}

export function getSystemSettingsApi(): Promise<SystemSettings> {
  return request.get("/api/admin/settings");
}

export function updateSystemSettingsApi(
  settings: SystemSettings,
): Promise<SystemSettings> {
  return request.put("/api/admin/settings", settings);
}

export function getSystemInfoApi(): Promise<SystemInfo> {
  return request.get("/api/admin/system-info");
}

export function getPlatformInfoApi(): Promise<PlatformInfo> {
  return request.get("/api/platform/info");
}
