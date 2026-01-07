import { ElMessage } from "element-plus";
import { io, type Socket } from "socket.io-client";
import type { Ref } from "vue";
import type { TaskItem } from "../types/task";

// Socket.IO 连接状态
let socket: Socket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000; // 3秒重连延迟

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
  // Socket.IO连接管理
  const connectWebSocket = () => {
    if (socket && socket.connected) {
      return; // 已经连接
    }

    try {
      // 创建 Socket.IO 连接
      socket = io("http://localhost:3000/tasks", {
        transports: ["websocket", "polling"],
      });

      socket.on("connect", () => {
        console.log("Socket.IO连接已建立");
        reconnectAttempts = 0; // 重置重连次数
        ElMessage.success("实时更新已连接");
      });

      // 监听统一的 task_update 事件，根据 type 字段处理不同事件
      socket.on("task_update", (data: any) => {
        console.log("收到任务更新:", data);

        switch (data.type) {
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
            console.log("未知任务更新类型:", data.type);
        }
      });

      interface DisconnectPayload {
        reason: string;
      }

      socket.on("disconnect", (reason: DisconnectPayload["reason"]) => {
        console.log("Socket.IO连接已断开", reason);
        if (
          reason === "io server disconnect" &&
          reconnectAttempts < maxReconnectAttempts
        ) {
          scheduleReconnect();
        }
      });

      socket.on("connect_error", (error: Error) => {
        console.error("Socket.IO连接错误:", error);
        if (reconnectAttempts < maxReconnectAttempts) {
          scheduleReconnect();
        }
      });
    } catch (error) {
      console.error("创建Socket.IO连接失败:", error);
      if (reconnectAttempts < maxReconnectAttempts) {
        scheduleReconnect();
      }
    }
  };

  const scheduleReconnect = () => {
    reconnectAttempts++;
    const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1); // 指数退避

    console.log(
      `WebSocket将在 ${delay}ms 后重连 (尝试 ${reconnectAttempts}/${maxReconnectAttempts})`
    );

    reconnectTimer = window.setTimeout(() => {
      connectWebSocket();
    }, delay);
  };

  const disconnectWebSocket = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (socket) {
      socket.disconnect();
      socket = null;
    }
  };

  // 处理任务状态更新
  const handleTaskStatusUpdate = (payload: {
    taskId: number;
    taskName?: string;
    taskUrl?: string;
    status: string;
    progress: number;
  }) => {
    console.log("处理任务状态更新:", payload);

    // 使用taskId来匹配任务（唯一标识）
    const taskIndex = taskList.value.findIndex(
      (task) => task.id === payload.taskId
    );

    console.log("找到任务索引:", taskIndex, "任务ID:", payload.taskId, "任务数量:", taskList.value.length);

    if (taskIndex !== -1) {
      const task = taskList.value[taskIndex];
      if (task) {
        console.log("更新任务状态:", task.name, "ID:", task.id, "从", task.status, "到", payload.status, "进度:", payload.progress);
        task.status = payload.status as any;
        task.progress = payload.progress;

        // 如果任务完成或失败，刷新列表以获取最新状态（包括endTime等）
        if (payload.status === "success" || payload.status === "failed") {
          console.log("任务完成，刷新列表");
          if (fetchTaskList) {
            fetchTaskList();
          }
        }

        // 触发UI更新
        taskList.value = [...taskList.value];
      }
    } else {
      console.log("未找到匹配的任务ID:", payload.taskId, "任务名:", payload.taskName);
      console.log("当前任务列表ID:", taskList.value.map(t => ({ id: t.id, name: t.name, url: t.url })));
    }
  };

  // 处理新任务创建
  const handleTaskCreated = (payload: TaskItem) => {
    taskList.value.unshift(payload); // 添加到列表开头
    pagination.value.total++;
  };

  // 处理任务删除
  const handleTaskDeleted = (payload: { taskId: number; taskName?: string; taskUrl?: string }) => {
    // 使用taskId来匹配任务（唯一标识）
    const taskIndex = taskList.value.findIndex(
      (task) => task.id === payload.taskId
    );
    if (taskIndex !== -1) {
      taskList.value.splice(taskIndex, 1);
      pagination.value.total--;
      console.log("已删除任务ID:", payload.taskId);
    } else {
      console.log("未找到要删除的任务ID:", payload.taskId);
    }
  };

  // 处理任务执行更新
  const handleTaskExecutionUpdate = (payload: {
    taskId: number;
    taskName?: string;
    taskUrl?: string;
    execution: any;
  }) => {
    // 使用taskId来匹配任务（唯一标识）
    const taskIndex = taskList.value.findIndex(
      (task) => task.id === payload.taskId
    );
    if (taskIndex !== -1) {
      const task = taskList.value[taskIndex];
      if (task && payload.execution) {
        task.latestExecution = payload.execution;
        task.lastExecutionTime = payload.execution.startTime;
        // 触发UI更新
        taskList.value = [...taskList.value];
        console.log("已更新任务执行信息，任务ID:", payload.taskId);
      }
    } else {
      console.log("未找到要更新执行信息的任务ID:", payload.taskId);
    }
  };

  return {
    connectWebSocket,
    disconnectWebSocket,
  };
}
