import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { Execution } from '../execution/entities/execution.entity';
import { Task } from '../task/entities/task.entity';
import { LoggerService } from './logger.service';
import {
  CleanupMode,
  StorageSettingsDto,
} from './dto/system-settings.dto';
import { SettingKey } from './entities/system-setting.entity';
import { SystemSettingsService } from './system-settings.service';

interface CleanupSummary {
  mode: CleanupMode;
  deletedLogs: number;
  deletedExecutions: number;
  deletedResultFiles: number;
  deletedScreenshots: number;
  deletedOrphanResultFiles: number;
  deletedOrphanScreenshots: number;
  clearedScreenshotReferences: number;
  preservedLatestExecutions: number;
}

@Injectable()
export class ResourceCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceCleanupService.name);
  private timer?: NodeJS.Timeout;
  private isRunning = false;
  private lastRunSlot = '';

  constructor(
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly loggerService: LoggerService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.checkSchedule();
    }, 30_000);

    void this.checkSchedule();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async checkSchedule() {
    if (this.isRunning) {
      return;
    }

    const storageSettings = await this.getStorageSettings();
    if (!storageSettings.autoCleanup) {
      return;
    }

    const now = new Date();
    const currentTime = this.formatTime(now);
    if (currentTime !== storageSettings.cleanupTime) {
      return;
    }

    const runSlot = `${this.formatDate(now)}@${storageSettings.cleanupTime}`;
    if (this.lastRunSlot === runSlot) {
      return;
    }

    this.lastRunSlot = runSlot;
    await this.runCleanup(storageSettings);
  }

  private async runCleanup(storageSettings: StorageSettingsDto) {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    const summary: CleanupSummary = {
      mode: storageSettings.cleanupMode,
      deletedLogs: 0,
      deletedExecutions: 0,
      deletedResultFiles: 0,
      deletedScreenshots: 0,
      deletedOrphanResultFiles: 0,
      deletedOrphanScreenshots: 0,
      clearedScreenshotReferences: 0,
      preservedLatestExecutions: 0,
    };

    try {
      summary.deletedLogs =
        (await this.loggerService.cleanupOldLogs(
          storageSettings.logRetentionDays,
        )) ?? 0;

      const resultCleanup = await this.cleanupExecutionsAndResults(
        storageSettings.datasetRetentionDays,
        storageSettings.cleanupMode,
      );
      summary.deletedExecutions = resultCleanup.deletedExecutions;
      summary.deletedResultFiles = resultCleanup.deletedResultFiles;
      summary.preservedLatestExecutions = resultCleanup.preservedLatestExecutions;

      if (storageSettings.cleanupMode !== 'safe') {
        const screenshotCleanup = await this.cleanupScreenshots(
          storageSettings.screenshotRetentionDays,
        );
        summary.deletedScreenshots = screenshotCleanup.deletedScreenshots;
        summary.clearedScreenshotReferences =
          screenshotCleanup.clearedScreenshotReferences;
      }

      if (storageSettings.cleanupMode === 'deep') {
        const orphanCleanup = await this.cleanupOrphanFiles(storageSettings);
        summary.deletedOrphanResultFiles = orphanCleanup.deletedOrphanResultFiles;
        summary.deletedOrphanScreenshots = orphanCleanup.deletedOrphanScreenshots;
      }

      this.logger.log(`资源清理任务执行完成: ${JSON.stringify(summary)}`);
      await this.loggerService.info(
        'resource-cleanup',
        '定时资源清理执行完成',
        summary,
      );
    } catch (error) {
      const details = error instanceof Error ? error.stack || error.message : String(error);
      this.logger.error('资源清理任务执行失败', details);
      await this.loggerService.error(
        'resource-cleanup',
        '定时资源清理执行失败',
        { error: details },
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async cleanupExecutionsAndResults(
    retentionDays: number,
    mode: CleanupMode,
  ) {
    const cutoffDate = this.createCutoffDate(retentionDays);
    const latestExecutionIds =
      mode === 'safe' ? await this.getLatestExecutionIdsByTask() : new Set<number>();

    const expiredExecutions = await this.executionRepository
      .createQueryBuilder('execution')
      .select([
        'execution.id',
        'execution.taskId',
        'execution.status',
        'execution.resultPath',
        'execution.startTime',
        'execution.endTime',
      ])
      .where('execution.status != :runningStatus', { runningStatus: 'running' })
      .andWhere('execution.endTime < :cutoffDate', { cutoffDate })
      .orderBy('execution.endTime', 'ASC')
      .getMany();

    let deletedExecutions = 0;
    let deletedResultFiles = 0;
    let preservedLatestExecutions = 0;

    for (const execution of expiredExecutions) {
      if (latestExecutionIds.has(execution.id)) {
        preservedLatestExecutions += 1;
        continue;
      }

      if (execution.resultPath) {
        const deleted = await this.deleteFileIfExists(
          this.resolvePath(execution.resultPath),
        );
        if (deleted) {
          deletedResultFiles += 1;
        }
      }

      await this.executionRepository.delete(execution.id);
      deletedExecutions += 1;
    }

    return {
      deletedExecutions,
      deletedResultFiles,
      preservedLatestExecutions,
    };
  }

  private async cleanupScreenshots(retentionDays: number) {
    const cutoffDate = this.createCutoffDate(retentionDays);
    const tasks = await this.taskRepository
      .createQueryBuilder('task')
      .select([
        'task.id',
        'task.status',
        'task.createdAt',
        'task.screenshotPath',
      ])
      .where('task.screenshotPath IS NOT NULL')
      .andWhere('task.status != :runningStatus', { runningStatus: 'running' })
      .andWhere('task.createdAt < :cutoffDate', { cutoffDate })
      .getMany();

    let deletedScreenshots = 0;
    let clearedScreenshotReferences = 0;

    for (const task of tasks) {
      if (!task.screenshotPath) {
        continue;
      }

      const deleted = await this.deleteFileIfExists(
        this.resolveUploadPath(task.screenshotPath),
      );
      if (deleted) {
        deletedScreenshots += 1;
      }

      await this.taskRepository.update(task.id, {
        screenshotPath: null as unknown as string,
      });
      clearedScreenshotReferences += 1;
    }

    return {
      deletedScreenshots,
      clearedScreenshotReferences,
    };
  }

  private async cleanupOrphanFiles(storageSettings: StorageSettingsDto) {
    const resultCutoffDate = this.createCutoffDate(storageSettings.datasetRetentionDays);
    const screenshotCutoffDate = this.createCutoffDate(
      storageSettings.screenshotRetentionDays,
    );

    const referencedResultPaths = await this.getReferencedResultPaths();
    const referencedScreenshotPaths = await this.getReferencedScreenshotPaths();

    const deletedOrphanResultFiles = await this.deleteOrphanFiles(
      this.resolveUploadPath('results'),
      referencedResultPaths,
      resultCutoffDate,
    );
    const deletedOrphanScreenshots = await this.deleteOrphanFiles(
      this.resolveUploadPath('screenshots'),
      referencedScreenshotPaths,
      screenshotCutoffDate,
    );

    return {
      deletedOrphanResultFiles,
      deletedOrphanScreenshots,
    };
  }

  private async getLatestExecutionIdsByTask() {
    const executions = await this.executionRepository
      .createQueryBuilder('execution')
      .select(['execution.id', 'execution.taskId', 'execution.startTime'])
      .orderBy('execution.taskId', 'ASC')
      .addOrderBy('execution.startTime', 'DESC')
      .addOrderBy('execution.id', 'DESC')
      .getMany();

    const latestExecutionIds = new Set<number>();
    const seenTaskIds = new Set<number>();

    for (const execution of executions) {
      if (seenTaskIds.has(execution.taskId)) {
        continue;
      }

      latestExecutionIds.add(execution.id);
      seenTaskIds.add(execution.taskId);
    }

    return latestExecutionIds;
  }

  private async getReferencedResultPaths() {
    const executions = await this.executionRepository
      .createQueryBuilder('execution')
      .select(['execution.resultPath'])
      .where('execution.resultPath IS NOT NULL')
      .getMany();

    return new Set(
      executions
        .map((execution) => execution.resultPath)
        .filter((value): value is string => Boolean(value))
        .map((value) => path.normalize(this.resolvePath(value))),
    );
  }

  private async getReferencedScreenshotPaths() {
    const tasks = await this.taskRepository
      .createQueryBuilder('task')
      .select(['task.screenshotPath'])
      .where('task.screenshotPath IS NOT NULL')
      .getMany();

    return new Set(
      tasks
        .map((task) => task.screenshotPath)
        .filter((value): value is string => Boolean(value))
        .map((value) => path.normalize(this.resolveUploadPath(value))),
    );
  }

  private async deleteOrphanFiles(
    directoryPath: string,
    referencedPaths: Set<string>,
    cutoffDate: Date,
  ) {
    const files = await this.listFiles(directoryPath);
    let deletedCount = 0;

    for (const filePath of files) {
      const normalizedPath = path.normalize(filePath);
      if (referencedPaths.has(normalizedPath)) {
        continue;
      }

      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || stat.mtime >= cutoffDate) {
        continue;
      }

      const deleted = await this.deleteFileIfExists(filePath);
      if (deleted) {
        deletedCount += 1;
      }
    }

    return deletedCount;
  }

  private async listFiles(directoryPath: string): Promise<string[]> {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listFiles(fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  private async deleteFileIfExists(filePath: string) {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(`删除文件失败: ${filePath} (${code || 'unknown'})`);
      }
      return false;
    }
  }

  private async getStorageSettings(): Promise<StorageSettingsDto> {
    return this.systemSettingsService.getSetting(SettingKey.STORAGE);
  }

  private createCutoffDate(retentionDays: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    return cutoffDate;
  }

  private formatTime(date: Date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private resolvePath(relativeOrAbsolutePath: string) {
    if (path.isAbsolute(relativeOrAbsolutePath)) {
      return relativeOrAbsolutePath;
    }

    return path.resolve(process.cwd(), relativeOrAbsolutePath);
  }

  private resolveUploadPath(relativePath: string) {
    return path.resolve(process.cwd(), 'uploads', relativePath);
  }
}
