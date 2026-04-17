import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { Repository } from 'typeorm';
import { LoggerService } from '../admin/logger.service';
import { resolveCookieVaultSecret } from '../config/runtime-security';
import {
  normalizeCookieDomain,
  parseCookieString,
} from './task-config.utils';
import {
  CreateTaskCookieCredentialDto,
  TaskCookieCredentialAuditDto,
  UpdateTaskCookieCredentialDto,
} from './dto/task-cookie-credential.dto';
import { TaskCookieCredential } from './entities/task-cookie-credential.entity';

export type SealedCookiePayload = {
  encryptedCookie: string;
  iv: string;
  authTag: string;
  cookieCount: number;
};

export type TaskCookieCredentialStatus = 'active' | 'expiring_soon' | 'expired';

type TaskCookieCredentialStatusSnapshot = {
  status: TaskCookieCredentialStatus;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isUsable: boolean;
  statusMessage: string;
};

@Injectable()
export class TaskCookieCredentialService {
  private readonly logger = new Logger(TaskCookieCredentialService.name);
  private readonly expiringSoonWindowMs = 7 * 24 * 60 * 60 * 1000;
  private readonly encryptionKey = createHash('sha256')
    .update(resolveCookieVaultSecret())
    .digest();

  constructor(
    @InjectRepository(TaskCookieCredential)
    private readonly credentialRepository: Repository<TaskCookieCredential>,
    private readonly loggerService: LoggerService,
  ) {}

  async listCredentials(userId: number) {
    const credentials = await this.credentialRepository.find({
      where: { userId },
      order: {
        updatedAt: 'DESC',
        createdAt: 'DESC',
      },
    });

    return credentials.map((credential) => this.toCredentialSummary(credential));
  }

  async getCredentialDetail(id: number, userId: number) {
    const credential = await this.requireCredential(id, userId);
    return this.toCredentialDetail(credential);
  }

  async createCredential(
    userId: number,
    payload: CreateTaskCookieCredentialDto,
    audit?: TaskCookieCredentialAuditDto,
  ) {
    await this.ensureCredentialNameAvailable(userId, payload.name);

    const encryptedPayload = this.sealCookieString(payload.cookieString);
    const credential = this.credentialRepository.create({
      userId,
      name: payload.name.trim(),
      cookieDomain: normalizeCookieDomain(payload.cookieDomain) || null,
      notes: String(payload.notes ?? '').trim() || null,
      expiresAt: this.normalizeOptionalDate(payload.expiresAt),
      ...encryptedPayload,
    });

    const savedCredential = await this.credentialRepository.save(credential);

    await this.loggerService.info(
      'task-cookie-credential',
      `创建 Cookie 凭证: ${savedCredential.name}`,
      {
        credentialId: savedCredential.id,
        credentialName: savedCredential.name,
        cookieDomain: savedCredential.cookieDomain,
        cookieCount: savedCredential.cookieCount,
        userId,
      },
      audit?.user,
      audit?.ip,
      audit?.userAgent,
    );

    return this.toCredentialSummary(savedCredential);
  }

  async updateCredential(
    id: number,
    userId: number,
    payload: UpdateTaskCookieCredentialDto,
    audit?: TaskCookieCredentialAuditDto,
  ) {
    const credential = await this.requireCredential(id, userId);

    if (payload.name !== undefined && payload.name.trim() !== credential.name) {
      await this.ensureCredentialNameAvailable(userId, payload.name, credential.id);
      credential.name = payload.name.trim();
    }

    if (payload.cookieDomain !== undefined) {
      credential.cookieDomain = normalizeCookieDomain(payload.cookieDomain) || null;
    }

    if (payload.notes !== undefined) {
      credential.notes = String(payload.notes ?? '').trim() || null;
    }

    if (payload.expiresAt !== undefined) {
      credential.expiresAt = this.normalizeOptionalDate(payload.expiresAt);
    }

    if (payload.cookieString !== undefined) {
      const encryptedPayload = this.sealCookieString(payload.cookieString);
      credential.encryptedCookie = encryptedPayload.encryptedCookie;
      credential.iv = encryptedPayload.iv;
      credential.authTag = encryptedPayload.authTag;
      credential.cookieCount = encryptedPayload.cookieCount;
    }

    const savedCredential = await this.credentialRepository.save(credential);

    await this.loggerService.info(
      'task-cookie-credential',
      `更新 Cookie 凭证: ${savedCredential.name}`,
      {
        credentialId: savedCredential.id,
        credentialName: savedCredential.name,
        cookieDomain: savedCredential.cookieDomain,
        cookieCount: savedCredential.cookieCount,
        userId,
      },
      audit?.user,
      audit?.ip,
      audit?.userAgent,
    );

    return this.toCredentialSummary(savedCredential);
  }

  async deleteCredential(
    id: number,
    userId: number,
    audit?: TaskCookieCredentialAuditDto,
  ) {
    const credential = await this.requireCredential(id, userId);
    await this.credentialRepository.delete({ id, userId });

    await this.loggerService.warn(
      'task-cookie-credential',
      `删除 Cookie 凭证: ${credential.name}`,
      {
        credentialId: credential.id,
        credentialName: credential.name,
        cookieDomain: credential.cookieDomain,
        userId,
      },
      audit?.user,
      audit?.ip,
      audit?.userAgent,
    );

    return {
      id: credential.id,
      name: credential.name,
    };
  }

  async resolveCredentialCookie(userId: number, id: number) {
    const credential = await this.requireCredential(id, userId);
    const statusSnapshot = this.getCredentialStatusSnapshot(credential);

    if (statusSnapshot.isExpired) {
      throw new BadRequestException(statusSnapshot.statusMessage);
    }

    credential.lastUsedAt = new Date();
    await this.credentialRepository.save(credential).catch((error) => {
      this.logger.warn(
        `Failed to update lastUsedAt for cookie credential ${credential.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    return {
      cookieString: this.decryptCookie(credential),
      cookieDomain: credential.cookieDomain || undefined,
    };
  }

  sealCookieString(cookieString: string): SealedCookiePayload {
    return this.encryptCookie(cookieString);
  }

  openSealedCookie(
    payload: Pick<SealedCookiePayload, 'encryptedCookie' | 'iv' | 'authTag'>,
  ): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

    const decryptedBuffer = Buffer.concat([
      decipher.update(Buffer.from(payload.encryptedCookie, 'base64')),
      decipher.final(),
    ]);

    return decryptedBuffer.toString('utf8');
  }

  private async requireCredential(id: number, userId: number) {
    const credential = await this.credentialRepository.findOne({
      where: { id, userId },
    });

    if (!credential) {
      throw new NotFoundException('Cookie 凭证不存在');
    }

    return credential;
  }

  private async ensureCredentialNameAvailable(
    userId: number,
    name: string,
    excludeId?: number,
  ) {
    const normalizedName = String(name ?? '').trim();
    if (!normalizedName) {
      throw new BadRequestException('Cookie 凭证名称不能为空');
    }

    const existing = await this.credentialRepository.findOne({
      where: {
        userId,
        name: normalizedName,
      },
    });

    if (existing && existing.id !== excludeId) {
      throw new BadRequestException('同名 Cookie 凭证已存在，请更换名称后重试');
    }
  }

  private normalizeOptionalDate(value?: string | null) {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }

    const normalizedDate = new Date(raw);
    if (Number.isNaN(normalizedDate.getTime())) {
      throw new BadRequestException('Cookie 凭证过期时间格式不正确');
    }

    return normalizedDate;
  }

  private encryptCookie(cookieString: string): SealedCookiePayload {
    const normalizedCookieString = String(cookieString ?? '').trim();
    if (!normalizedCookieString) {
      throw new BadRequestException('Cookie 内容不能为空');
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encryptedBuffer = Buffer.concat([
      cipher.update(normalizedCookieString, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      encryptedCookie: encryptedBuffer.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      cookieCount: Math.max(parseCookieString(normalizedCookieString).length, 1),
    };
  }

  private decryptCookie(credential: TaskCookieCredential): string {
    return this.openSealedCookie(credential);
  }

  private getCredentialStatusSnapshot(
    credential: Pick<TaskCookieCredential, 'expiresAt'>,
  ): TaskCookieCredentialStatusSnapshot {
    const expiresAt = credential.expiresAt;
    if (!expiresAt) {
      return {
        status: 'active',
        isExpired: false,
        isExpiringSoon: false,
        isUsable: true,
        statusMessage: 'Cookie 凭证可用',
      };
    }

    const expiresAtTime = expiresAt.getTime();
    if (Number.isNaN(expiresAtTime)) {
      return {
        status: 'active',
        isExpired: false,
        isExpiringSoon: false,
        isUsable: true,
        statusMessage: 'Cookie 凭证可用',
      };
    }

    const now = Date.now();
    if (expiresAtTime <= now) {
      return {
        status: 'expired',
        isExpired: true,
        isExpiringSoon: false,
        isUsable: false,
        statusMessage: 'Cookie 凭证已过期，请先更新后再使用',
      };
    }

    if (expiresAtTime - now <= this.expiringSoonWindowMs) {
      return {
        status: 'expiring_soon',
        isExpired: false,
        isExpiringSoon: true,
        isUsable: true,
        statusMessage: 'Cookie 凭证即将过期，建议尽快更新',
      };
    }

    return {
      status: 'active',
      isExpired: false,
      isExpiringSoon: false,
      isUsable: true,
      statusMessage: 'Cookie 凭证可用',
    };
  }

  private toCredentialSummary(credential: TaskCookieCredential) {
    const statusSnapshot = this.getCredentialStatusSnapshot(credential);

    return {
      id: credential.id,
      name: credential.name,
      cookieDomain: credential.cookieDomain || '',
      cookieCount: credential.cookieCount || 0,
      hasNotes: Boolean(String(credential.notes ?? '').trim()),
      expiresAt: credential.expiresAt || null,
      lastUsedAt: credential.lastUsedAt || null,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      ...statusSnapshot,
    };
  }

  private toCredentialDetail(credential: TaskCookieCredential) {
    return {
      ...this.toCredentialSummary(credential),
      notes: credential.notes || '',
    };
  }
}
