import { ElMessage } from "element-plus";
import { io, type Socket } from "socket.io-client";
import type { Ref } from "vue";
import type { TaskItem } from "../types/task";

let socket: Socket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let syncInFlight = false;

const maxReconnectAttempts = 5;
const reconnectDelay = 3000;

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

export function useTaskSocket(
  taskList: Ref<TaskItem[]>,
  pagination: Ref<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>,
  fetchTaskList?: () => Promise<void>
) {
  const syncTaskList = async () => {
    if (!fetchTaskList || syncInFlight) return;
    syncInFlight = true;
    try {
      await fetchTaskList();
    } finally {
      syncInFlight = false;
    }
  };

  const connectWebSocket = () => {
    if (socket?.connected) return;

    try {
      socket = io(resolveSocketNamespaceUrl(), {
        transports: ["websocket", "polling"],
        reconnection: false,
      });

      socket.on("connect", () => {
        reconnectAttempts = 0;
        ElMessage.success("实时任务更新已连接");
      });

      socket.on("task_update", (data: any) => {
        switch (data?.type) {
          case "TASK_STATUS_UPDATE":
            handleTaskStatusUpdate(data.payload);
            break;
          case "TASK_CREATED":
            handleTaskCreated(data.payload);
            break;
          case "TASK_DELETED":
            handleTaskDeleted(data.payload);
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

      socket.on("connect_error", () => {
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

    socket?.disconnect();
    socket = null;
  };

  const handleTaskStatusUpdate = (payload: {
    taskId: number;
    taskName?: string;
    taskUrl?: string;
    status: string;
    progress: number;
  }) => {
    const taskIndex = taskList.value.findIndex((task) => task.id === payload.taskId);
    const nextProgress = Math.max(0, Math.min(100, Number(payload.progress) || 0));

    if (taskIndex !== -1) {
      const task = taskList.value[taskIndex];
      if (task) {
        task.status = payload.status as TaskItem["status"];
        task.progress = nextProgress;
        if (task.latestExecution) {
          task.latestExecution.status = payload.status;
        }
        taskList.value = [...taskList.value];
      }

      if (payload.status === "success" || payload.status === "failed") {
        void syncTaskList();
      }
      return;
    }

    // 当前分页不存在该任务时，主动同步列表，避免“看起来不更新”
    void syncTaskList();
  };

  const handleTaskCreated = (payload: TaskItem) => {
    taskList.value.unshift(payload);
    pagination.value.total++;
    taskList.value = [...taskList.value];
  };

  const handleTaskDeleted = (payload: {
    taskId: number;
    taskName?: string;
    taskUrl?: string;
  }) => {
    const taskIndex = taskList.value.findIndex((task) => task.id === payload.taskId);
    if (taskIndex !== -1) {
      taskList.value.splice(taskIndex, 1);
      pagination.value.total--;
      taskList.value = [...taskList.value];
      return;
    }

    void syncTaskList();
  };

  const handleTaskExecutionUpdate = (payload: {
    taskId: number;
    taskName?: string;
    taskUrl?: string;
    execution: any;
  }) => {
    const taskIndex = taskList.value.findIndex((task) => task.id === payload.taskId);
    if (taskIndex !== -1) {
      const task = taskList.value[taskIndex];
      if (task && payload.execution) {
        task.latestExecution = payload.execution;
        task.lastExecutionTime = payload.execution.startTime;
        taskList.value = [...taskList.value];
      }
      return;
    }

    void syncTaskList();
  };

  return {
    connectWebSocket,
    disconnectWebSocket,
  };
}
