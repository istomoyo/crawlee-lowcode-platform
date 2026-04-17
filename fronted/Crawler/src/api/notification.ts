import request from "./request";

export type NotificationStatus = "all" | "unread" | "read";
export type NotificationLevel = "info" | "success" | "warning" | "error";

export interface NotificationItem {
  id: number;
  type: string;
  level: NotificationLevel;
  title: string;
  content: string;
  link?: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function getNotificationsApi(params?: {
  status?: NotificationStatus;
  page?: number;
  limit?: number;
}): Promise<NotificationListResponse> {
  return request.get("/api/notifications", { params });
}

export function markNotificationReadApi(
  notificationId: number,
): Promise<NotificationItem> {
  return request.put(`/api/notifications/${notificationId}/read`);
}

export function markAllNotificationsReadApi(): Promise<{ success: true }> {
  return request.put("/api/notifications/read-all");
}
