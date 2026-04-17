import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import {
  getAllowedCorsOrigins,
  isOriginAllowed,
  resolveAuthCookieConfig,
} from '../config/runtime-security';

interface TaskUpdatePayload {
  taskId: number;
  taskName?: string;
  taskUrl?: string;
  status: string;
  progress: number;
  screenshotPath?: string | null;
  execution?: any;
}

interface TaskSocketJwtPayload {
  id: number;
  email?: string;
  role?: string;
  loginToken?: string;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/tasks',
})
export class TaskGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TaskGateway.name);
  private readonly connectedClients = new Map<string, Socket>();
  private readonly authCookieConfig = resolveAuthCookieConfig();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  afterInit(server: Server) {
    server.use(async (client, next) => {
      try {
        const originHeader = client.handshake.headers.origin;
        const origin = Array.isArray(originHeader)
          ? originHeader[0]
          : originHeader;
        const allowedOrigins =
          this.configService.get<string[]>('cors.origins') ||
          getAllowedCorsOrigins();

        if (!isOriginAllowed(origin, allowedOrigins)) {
          this.logger.warn(
            `Rejected task socket from origin: ${origin || 'unknown'}`,
          );
          return next(new Error('Forbidden origin'));
        }

        const token = this.extractAuthToken(client);
        if (!token) {
          return next(new Error('Unauthorized'));
        }

        const payload = await this.jwtService.verifyAsync<TaskSocketJwtPayload>(
          token,
          {
            secret: this.configService.get<string>('jwt.secret'),
          },
        );

        if (!payload?.id || !payload.loginToken) {
          return next(new Error('Unauthorized'));
        }

        const latestLoginToken = await this.redis.get(`user:token:${payload.id}`);
        if (!latestLoginToken || latestLoginToken !== payload.loginToken) {
          return next(new Error('Unauthorized'));
        }

        client.data.userId = payload.id;
        client.data.userEmail = payload.email;
        client.data.userRole = payload.role;
        next();
      } catch (error) {
        this.logger.warn(
          `Rejected task socket connection: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        next(new Error('Unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) {
    const userId = Number(client.data.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      client.disconnect(true);
      return;
    }

    client.join(this.getUserRoom(userId));
    this.connectedClients.set(client.id, client);
    this.logger.log(`Client connected: ${client.id}, userId: ${userId}`);

    client.emit('connected', {
      message: 'WebSocket connected',
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  broadcastTaskUpdate(update: TaskUpdatePayload, userId?: number) {
    if (!userId) {
      this.logger.warn(
        `Skipped task update broadcast for task ${update.taskId} because userId is missing`,
      );
      return;
    }

    this.logger.log(`Broadcast task update: ${JSON.stringify(update)}`);
    this.emitToUser(userId, 'TASK_STATUS_UPDATE', update);
  }

  broadcastTaskCreated(task: any, userId?: number) {
    if (!userId) {
      this.logger.warn(
        `Skipped task created broadcast for task ${task?.id ?? 'unknown'} because userId is missing`,
      );
      return;
    }

    this.logger.log(`Broadcast task created: ${task.id}`);
    this.emitToUser(userId, 'TASK_CREATED', task);
  }

  broadcastTaskDeleted(
    taskId: number,
    taskName?: string,
    taskUrl?: string,
    userId?: number,
  ) {
    if (!userId) {
      this.logger.warn(
        `Skipped task deleted broadcast for task ${taskId} because userId is missing`,
      );
      return;
    }

    this.logger.log(`Broadcast task deleted: ${taskId}`);
    this.emitToUser(userId, 'TASK_DELETED', { taskId, taskName, taskUrl });
  }

  broadcastTaskExecutionUpdate(
    taskId: number,
    execution: any,
    taskName?: string,
    taskUrl?: string,
    userId?: number,
  ) {
    if (!userId) {
      this.logger.warn(
        `Skipped task execution broadcast for task ${taskId} because userId is missing`,
      );
      return;
    }

    this.logger.log(`Broadcast task execution update: ${taskId}`);
    this.emitToUser(userId, 'TASK_EXECUTION_UPDATE', {
      taskId,
      taskName,
      taskUrl,
      execution,
    });
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Client ${client.id} subscribed: ${JSON.stringify(data)}`);
    client.emit('subscribed', {
      message: 'Subscribed successfully',
      timestamp: new Date().toISOString(),
    });
  }

  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  onModuleDestroy() {
    this.connectedClients.clear();
  }

  private getUserRoom(userId: number) {
    return `user:${userId}`;
  }

  private emitToUser(
    userId: number,
    type:
      | 'TASK_STATUS_UPDATE'
      | 'TASK_CREATED'
      | 'TASK_DELETED'
      | 'TASK_EXECUTION_UPDATE',
    payload: unknown,
  ) {
    this.server.to(this.getUserRoom(userId)).emit('task_update', {
      type,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  private extractAuthToken(client: Socket): string | undefined {
    const authToken =
      typeof client.handshake.auth?.token === 'string'
        ? client.handshake.auth.token.trim()
        : '';
    if (authToken) {
      return authToken;
    }

    const cookieHeader = client.handshake.headers.cookie;
    if (!cookieHeader) {
      return undefined;
    }

    const tokenCookie = String(cookieHeader)
      .split(';')
      .map((part) => part.trim())
      .find((part) =>
        part.startsWith(`${this.authCookieConfig.name}=`),
      );

    if (!tokenCookie) {
      return undefined;
    }

    return decodeURIComponent(
      tokenCookie.slice(`${this.authCookieConfig.name}=`.length),
    );
  }
}
