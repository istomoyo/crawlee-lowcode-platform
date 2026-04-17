import { ElMessage } from "element-plus";
import { io, type Socket } from "socket.io-client";
import type { Ref } from "vue";
import type { TaskItem } from "../types/task";

let socket: Socket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let syncInFlight = false;
let terminalConnectErrorShown = false;

const maxReconnectAttempts = 5;
const reconnectDelay = 3000;

type TaskPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type TaskStatusPayload = {
  taskId: number;
  taskName?: string;
  taskUrl?: string;
  status: string;
  progress: number;
  screenshotPath?: string | null;
};

type TaskExecutionPayload = {
  taskId: number;
  taskName?: string;
  taskUrl?: string;
  execution: TaskItem["latestExecution"];
};

type TaskSocketOptions<T extends TaskItem> = {
  hydrateTask?: (task: TaskItem | T) => T;
  progressThrottleMs?: number;
};

function resolveSocketNamespaceUrl(): string {
  const configuredBaseUrl = (
    import.meta.env.VITE_API_BASE_URL as string | undefined
  )?.trim();

  if (configuredBaseUrl) {
    try {
      const parsed = new URL(configuredBaseUrl, window.location.origin);
      return `${parsed.origin}/tasks`;
    } catch {
      // fallback below
    }
  }

  return `${window.location.protocol}//${window.location.hostname}:3000/tasks`;
}

export function useTaskSocket<T extends TaskItem>(
  taskList: Ref<T[]>,
  pagination: Ref<TaskPagination>,
  fetchTaskList?: () => Promise<void>,
  options: TaskSocketOptions<T> = {},
) {
  const progressThrottleMs = options.progressThrottleMs ?? 160;
  const pendingStatusUpdates = new Map<number, TaskStatusPayload>();
  const statusTimers = new Map<number, number>();
  const lastAppliedProgressAt = new Map<number, number>();

  const hydrateTask = (task: TaskItem | T): T => {
    if (options.hydrateTask) {
      return options.hydrateTask(task);
    }

    return task as T;
  };

  const syncTaskList = async () => {
    if (!fetchTaskList || syncInFlight) return;
    syncInFlight = true;

    try {
      await fetchTaskList();
    } finally {
      syncInFlight = false;
    }
  };

  const replaceTaskItem = (
    taskId: number,
    updater: (currentTask: T) => TaskItem | T,
  ) => {
    const taskIndex = taskList.value.findIndex((task) => task.id === taskId);

    if (taskIndex === -1) {
      return false;
    }

    const currentTask = taskList.value[taskIndex];
    if (!currentTask) {
      return false;
    }
    const nextTask = hydrateTask(updater(currentTask));
    const nextTaskList = taskList.value.slice();

    nextTaskList[taskIndex] = nextTask;
    taskList.value = nextTaskList;

    return true;
  };

  const clearStatusTimer = (taskId: number) => {
    const timer = statusTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      statusTimers.delete(taskId);
    }
  };

  const applyTaskStatusUpdate = (payload: TaskStatusPayload) => {
    const nextProgress = Math.max(0, Math.min(100, Number(payload.progress) || 0));
    const found = replaceTaskItem(payload.taskId, (task) => ({
      ...task,
      status: payload.status as TaskItem["status"],
      progress: nextProgress,
      screenshotPath:
        payload.screenshotPath !== undefined
          ? payload.screenshotPath || undefined
          : task.screenshotPath,
      latestExecution: task.latestExecution
        ? { ...task.latestExecution, status: payload.status }
        : task.latestExecution,
    }));

    if (!found) {
      void syncTaskList();
      return;
    }

    if (payload.status === "success" || payload.status === "failed") {
      void syncTaskList();
    }
  };

  const flushTaskStatusUpdate = (taskId: number) => {
    const pendingPayload = pendingStatusUpdates.get(taskId);
    if (!pendingPayload) return;

    pendingStatusUpdates.delete(taskId);
    clearStatusTimer(taskId);
    lastAppliedProgressAt.set(taskId, Date.now());
    applyTaskStatusUpdate(pendingPayload);
  };

  const handleTaskStatusUpdate = (payload: TaskStatusPayload) => {
    const isTransientStatus =
      payload.status === "running" || payload.status === "stopping";

    if (!isTransientStatus) {
      pendingStatusUpdates.delete(payload.taskId);
      clearStatusTimer(payload.taskId);
      lastAppliedProgressAt.set(payload.taskId, Date.now());
      applyTaskStatusUpdate(payload);
      return;
    }

    const now = Date.now();
    const lastAppliedAt = lastAppliedProgressAt.get(payload.taskId) ?? 0;
    const remainingDelay = progressThrottleMs - (now - lastAppliedAt);

    if (remainingDelay <= 0) {
      lastAppliedProgressAt.set(payload.taskId, now);
      applyTaskStatusUpdate(payload);
      return;
    }

    pendingStatusUpdates.set(payload.taskId, payload);

    if (statusTimers.has(payload.taskId)) {
      return;
    }

    const timer = window.setTimeout(() => {
      statusTimers.delete(payload.taskId);
      flushTaskStatusUpdate(payload.taskId);
    }, remainingDelay);

    statusTimers.set(payload.taskId, timer);
  };

  const handleTaskExecutionUpdate = (payload: TaskExecutionPayload) => {
    const found = replaceTaskItem(payload.taskId, (task) => ({
      ...task,
      latestExecution: payload.execution
        ? { ...payload.execution }
        : payload.execution,
      lastExecutionTime: payload.execution?.startTime ?? task.lastExecutionTime,
    }));

    if (!found) {
      void syncTaskList();
    }
  };

  const handleTaskCreated = () => {
    void syncTaskList();
  };

  const handleTaskDeleted = () => {
    void syncTaskList();
  };

  const connectWebSocket = () => {
    if (socket?.connected) return;

    try {
      socket = io(resolveSocketNamespaceUrl(), {
        transports: ["websocket", "polling"],
        reconnection: false,
        withCredentials: true,
      });

      socket.on("connect", () => {
        reconnectAttempts = 0;
        terminalConnectErrorShown = false;
        ElMessage.success("实时任务更新已连接");
      });

      socket.on("task_update", (data: any) => {
        switch (data?.type) {
          case "TASK_STATUS_UPDATE":
            handleTaskStatusUpdate(data.payload);
            break;
          case "TASK_CREATED":
            handleTaskCreated();
            break;
          case "TASK_DELETED":
            handleTaskDeleted();
            break;
          case "TASK_EXECUTION_UPDATE":
            handleTaskExecutionUpdate(data.payload);
            break;
          default:
            break;
        }
      });

      socket.on("disconnect", (reason: string) => {
        if (
          reason === "io server disconnect" &&
          reconnectAttempts < maxReconnectAttempts
        ) {
          scheduleReconnect();
        }
      });

      socket.on("connect_error", (error: Error) => {
        const message = String(error?.message || "");
        const isTerminalAuthError =
          message.includes("Unauthorized") || message.includes("Forbidden origin");

        if (isTerminalAuthError) {
          if (!terminalConnectErrorShown) {
            terminalConnectErrorShown = true;
            ElMessage.warning(
              message.includes("Forbidden origin")
                ? "实时任务连接被当前来源地址拒绝"
                : "实时任务连接鉴权失败，请重新登录",
            );
          }
          return;
        }

        if (reconnectAttempts < maxReconnectAttempts) {
          scheduleReconnect();
        }
      });
    } catch {
      if (reconnectAttempts < maxReconnectAttempts) {
        scheduleReconnect();
      }
    }
  };

  const scheduleReconnect = () => {
    reconnectAttempts++;
    const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1);

    reconnectTimer = window.setTimeout(() => {
      connectWebSocket();
    }, delay);
  };

  const disconnectWebSocket = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    statusTimers.forEach((timer) => clearTimeout(timer));
    statusTimers.clear();
    pendingStatusUpdates.clear();
    lastAppliedProgressAt.clear();

    socket?.disconnect();
    socket = null;
  };

  return {
    connectWebSocket,
    disconnectWebSocket,
  };
}
