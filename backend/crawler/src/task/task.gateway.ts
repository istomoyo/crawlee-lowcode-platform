// backend\crawler\src\task\task.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

interface TaskUpdatePayload {
  taskId: number;
  taskName?: string;
  taskUrl?: string;
  status: string;
  progress: number;
  execution?: any;
}

@WebSocketGateway({
  cors: {
    origin: '*', // 在生产环境中应该更严格
  },
  namespace: '/tasks', // 使用 /ws/tasks 命名空间
})
export class TaskGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger(TaskGateway.name);
  private connectedClients = new Map<string, Socket>();

  handleConnection(client: Socket) {
    this.logger.log(`客户端连接: ${client.id}`);
    this.connectedClients.set(client.id, client);

    // 发送欢迎消息
    client.emit('connected', {
      message: 'WebSocket连接成功',
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`客户端断开连接: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  // 广播任务状态更新
  broadcastTaskUpdate(update: TaskUpdatePayload) {
    this.logger.log(`广播任务更新: ${JSON.stringify(update)}`);
    this.server.emit('task_update', {
      type: 'TASK_STATUS_UPDATE',
      payload: update,
      timestamp: new Date().toISOString(),
    });
  }

  // 广播新任务创建
  broadcastTaskCreated(task: any) {
    this.logger.log(`广播新任务创建: ${task.id}`);
    this.server.emit('task_update', {
      type: 'TASK_CREATED',
      payload: task,
      timestamp: new Date().toISOString(),
    });
  }

  // 广播任务删除
  broadcastTaskDeleted(taskId: number, taskName?: string, taskUrl?: string) {
    this.logger.log(`广播任务删除: ${taskId}`);
    this.server.emit('task_update', {
      type: 'TASK_DELETED',
      payload: { taskId, taskName, taskUrl },
      timestamp: new Date().toISOString(),
    });
  }

  // 广播任务执行更新
  broadcastTaskExecutionUpdate(taskId: number, execution: any, taskName?: string, taskUrl?: string) {
    this.logger.log(`广播任务执行更新: ${taskId}`);
    this.server.emit('task_update', {
      type: 'TASK_EXECUTION_UPDATE',
      payload: { taskId, taskName, taskUrl, execution },
      timestamp: new Date().toISOString(),
    });
  }

  // 客户端订阅消息（可选）
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`客户端 ${client.id} 订阅消息:`, data);
    client.emit('subscribed', {
      message: '订阅成功',
      timestamp: new Date().toISOString(),
    });
  }

  // 获取连接的客户端数量
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }
}
