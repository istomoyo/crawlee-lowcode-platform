import { BadRequestException } from '@nestjs/common';
import { LoggerService } from '../admin/logger.service';
import { TaskCookieCredentialService } from './task-cookie-credential.service';

describe('TaskCookieCredentialService', () => {
  const credentialRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const loggerService = {
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as LoggerService;

  let service: TaskCookieCredentialService;

  beforeEach(() => {
    jest.clearAllMocks();
    credentialRepository.create.mockImplementation((payload) => payload);
    service = new TaskCookieCredentialService(
      credentialRepository as any,
      loggerService,
    );
  });

  it('encrypts cookies on create and never returns plaintext in the summary', async () => {
    credentialRepository.findOne.mockResolvedValue(null);
    credentialRepository.save.mockImplementation(async (payload) => ({
      id: 1,
      ...payload,
      createdAt: new Date('2026-04-11T10:00:00.000Z'),
      updatedAt: new Date('2026-04-11T10:00:00.000Z'),
      lastUsedAt: null,
    }));

    const result = await service.createCredential(
      7,
      {
        name: '主账号',
        cookieString: 'session=abc; theme=dark',
        cookieDomain: 'https://Example.com/path',
      },
      {
        user: 'user@example.com',
      },
    );

    expect(credentialRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '主账号',
        cookieDomain: 'example.com',
        encryptedCookie: expect.any(String),
        iv: expect.any(String),
        authTag: expect.any(String),
        cookieCount: 2,
      }),
    );
    expect(result).toMatchObject({
      id: 1,
      name: '主账号',
      cookieDomain: 'example.com',
      cookieCount: 2,
      status: 'active',
      isExpired: false,
      isUsable: true,
    });
    expect((result as Record<string, unknown>).cookieString).toBeUndefined();
  });

  it('decrypts credentials only at runtime and records lastUsedAt', async () => {
    const encryptedPayload = service.sealCookieString('session=abc');
    credentialRepository.findOne.mockResolvedValue({
      id: 3,
      userId: 7,
      name: '运行凭证',
      cookieDomain: 'example.com',
      notes: null,
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date('2026-04-11T10:00:00.000Z'),
      updatedAt: new Date('2026-04-11T10:00:00.000Z'),
      ...encryptedPayload,
    });
    credentialRepository.save.mockResolvedValue(undefined);

    const result = await service.resolveCredentialCookie(7, 3);

    expect(result).toEqual({
      cookieString: 'session=abc',
      cookieDomain: 'example.com',
    });
    expect(credentialRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 3,
        lastUsedAt: expect.any(Date),
      }),
    );
  });

  it('can open sealed cookies for execution snapshots', () => {
    const sealedCookie = service.sealCookieString('session=abc');

    expect(
      service.openSealedCookie({
        encryptedCookie: sealedCookie.encryptedCookie,
        iv: sealedCookie.iv,
        authTag: sealedCookie.authTag,
      }),
    ).toBe('session=abc');
  });

  it('marks nearly expired credentials as expiring soon in the summary', async () => {
    credentialRepository.find.mockResolvedValue([
      {
        id: 9,
        userId: 7,
        name: '即将过期凭证',
        cookieDomain: 'example.com',
        cookieCount: 1,
        notes: null,
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        lastUsedAt: null,
        createdAt: new Date('2026-04-11T10:00:00.000Z'),
        updatedAt: new Date('2026-04-11T10:00:00.000Z'),
      },
    ]);

    await expect(service.listCredentials(7)).resolves.toEqual([
      expect.objectContaining({
        id: 9,
        status: 'expiring_soon',
        isExpired: false,
        isExpiringSoon: true,
        isUsable: true,
        statusMessage: 'Cookie 凭证即将过期，建议尽快更新',
      }),
    ]);
  });

  it('rejects expired credentials before decrypting them', async () => {
    const encryptedPayload = service.sealCookieString('session=abc');
    credentialRepository.findOne.mockResolvedValue({
      id: 5,
      userId: 7,
      name: '过期凭证',
      cookieDomain: 'example.com',
      notes: null,
      expiresAt: new Date(Date.now() - 60_000),
      lastUsedAt: null,
      createdAt: new Date('2026-04-11T10:00:00.000Z'),
      updatedAt: new Date('2026-04-11T10:00:00.000Z'),
      ...encryptedPayload,
    });

    await expect(service.resolveCredentialCookie(7, 5)).rejects.toThrow(
      new BadRequestException('Cookie 凭证已过期，请先更新后再使用'),
    );
  });
});
