import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { TaskGateway } from './task.gateway';

describe('TaskGateway', () => {
  const originalAuthCookieName = process.env.AUTH_COOKIE_NAME;
  let gateway: TaskGateway;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let redis: jest.Mocked<Redis>;

  beforeEach(() => {
    process.env.AUTH_COOKIE_NAME = 'token';

    jwtService = {
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.secret') {
          return 'test-secret';
        }

        if (key === 'cors.origins') {
          return ['http://localhost:5173'];
        }

        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    redis = {
      get: jest.fn(),
    } as unknown as jest.Mocked<Redis>;

    gateway = new TaskGateway(jwtService, configService, redis);
    (gateway as any).server = {
      use: jest.fn(),
      to: jest.fn(() => ({
        emit: jest.fn(),
      })),
    };
  });

  afterAll(() => {
    if (originalAuthCookieName === undefined) {
      delete process.env.AUTH_COOKIE_NAME;
      return;
    }

    process.env.AUTH_COOKIE_NAME = originalAuthCookieName;
  });

  it('authenticates socket connections and stores the user context', async () => {
    const next = jest.fn();
    const server = {
      use: jest.fn(),
    } as any;

    jwtService.verifyAsync.mockResolvedValue({
      id: 7,
      loginToken: 'login-token',
      email: 'user@example.com',
      role: 'user',
    } as never);
    redis.get.mockResolvedValue('login-token');

    gateway.afterInit(server);
    const middleware = server.use.mock.calls[0]?.[0];

    const client = {
      handshake: {
        headers: {
          origin: 'http://localhost:5173',
          cookie: 'token=jwt-token',
        },
        auth: {},
      },
      data: {},
    } as any;

    await middleware(client, next);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('jwt-token', {
      secret: 'test-secret',
    });
    expect(client.data.userId).toBe(7);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects socket connections from untrusted origins', async () => {
    const next = jest.fn();
    const server = {
      use: jest.fn(),
    } as any;

    gateway.afterInit(server);
    const middleware = server.use.mock.calls[0]?.[0];

    const client = {
      handshake: {
        headers: {
          origin: 'https://evil.example.com',
        },
        auth: {},
      },
      data: {},
    } as any;

    await middleware(client, next);

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0]?.[0]?.message).toContain('Forbidden origin');
  });

  it('uses the configured auth cookie name when extracting websocket tokens', async () => {
    process.env.AUTH_COOKIE_NAME = 'auth_token';
    gateway = new TaskGateway(jwtService, configService, redis);

    const next = jest.fn();
    const server = {
      use: jest.fn(),
    } as any;

    jwtService.verifyAsync.mockResolvedValue({
      id: 7,
      loginToken: 'login-token',
      email: 'user@example.com',
      role: 'user',
    } as never);
    redis.get.mockResolvedValue('login-token');

    gateway.afterInit(server);
    const middleware = server.use.mock.calls[0]?.[0];

    const client = {
      handshake: {
        headers: {
          origin: 'http://localhost:5173',
          cookie: 'auth_token=jwt-token',
        },
        auth: {},
      },
      data: {},
    } as any;

    await middleware(client, next);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('jwt-token', {
      secret: 'test-secret',
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('broadcasts task updates only to the owner room', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    (gateway as any).server = { to };

    gateway.broadcastTaskCreated({ id: 11, name: 'Demo Task' }, 23);

    expect(to).toHaveBeenCalledWith('user:23');
    expect(emit).toHaveBeenCalledWith(
      'task_update',
      expect.objectContaining({
        type: 'TASK_CREATED',
        payload: expect.objectContaining({ id: 11 }),
      }),
    );
  });
});
