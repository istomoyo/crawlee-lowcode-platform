import { Injectable, Logger } from '@nestjs/common';
import {
  PlaywrightCrawler,
  Dataset,
  KeyValueStore,
  RequestQueue,
  Configuration,
} from 'crawlee';
import { OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { Execution } from '../execution/entities/execution.entity';
import {
  BehaviorExtractType,
  BehaviorStep,
  CrawleeTaskConfig,
  NestedExtractContext,
  PreActionConfig,
  SelectorConfig,
  TaskNotificationConfig,
} from './dto/execute-task.dto';
import { TaskGateway } from './task.gateway';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import * as path from 'path';
import { FilePackageService } from './file-package.service';
import TurndownService from 'turndown';
import * as playwright from 'playwright';
import {
  createPlaywrightCookies,
  itemMatchesResultFilters,
} from './task-config.utils';
import { formatHtmlFragment } from './content-extraction.utils';
import { SystemSettingsService } from '../admin/system-settings.service';
import { SettingKey } from '../admin/entities/system-setting.entity';
import { MailService, MailTransportConfig } from '../mail/mail.service';
import { NotificationService } from '../notification/notification.service';
import { isUnsafeCustomJsEnabled } from '../config/runtime-security';

const DEFAULT_RUNTIME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_RUNTIME_VIEWPORT = { width: 1366, height: 768 };

interface CrawlerTask {
  taskId: number;
  executionId: number;
  config: CrawleeTaskConfig;
}

interface ActiveCrawlerTask {
  taskId: number;
  executionId: number;
  crawler?: PlaywrightCrawler;
  stopRequested: boolean;
  stopReason?: string;
  terminalStatus?: 'success' | 'failed';
  terminalReason?: string;
}

interface BehaviorExecutionContext {
  page: any;
  scope?: any;
  currentItem?: Record<string, any>;
  results: Record<string, any>[];
  config: CrawleeTaskConfig;
}

@Injectable()
export class CrawleeEngineService implements OnModuleInit {
  private readonly logger = new Logger(CrawleeEngineService.name);
  private taskQueue: CrawlerTask[] = [];
  private isProcessing = false;
  private crawler: PlaywrightCrawler;
  private detachedDetailBrowser: playwright.Browser | null = null;
  private readonly activeTasks = new Map<number, ActiveCrawlerTask>();

  // Shared Turndown instance for converting HTML fragments to Markdown.
  private static turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });

  private static convertHtmlToMarkdown(html: string | null | undefined): string | null {
    if (!html) return null;
    try {
      const markdown = CrawleeEngineService.turndownService.turndown(html);
      return markdown.trim();
    } catch (error) {
      // Fall back to the original HTML when conversion fails.
      // Static methods cannot use the instance logger, so keep console.error here.
      if (typeof console !== 'undefined') {
        console.error('Markdown conversion failed:', error);
      }
      return html;
    }
  }

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    private readonly taskGateway: TaskGateway,
    private readonly filePackageService: FilePackageService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
  ) {
    // Extra safeguard: avoid Windows process listing parser crash in Crawlee systemInfoV2.
    Configuration.getGlobalConfig().set('systemInfoV2', false);
    this.initializeCrawler();
  }

  async onModuleInit() {
    await this.recoverInterruptedExecutions();
  }

  /**
   * 鍒濆鍖栭粯璁?Crawlee 寮曟搸
   */
  private initializeCrawler() {
    this.crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: 100,
      maxConcurrency: 5,
      launchContext: {
        launchOptions: {
          headless: true,
        },
      },
      async requestHandler({ request, page, response }) {
        // The real request handling logic is configured per task in addTaskToQueue.
        this.logger.debug(`Processing ${request.url}`);
      },
    });

    this.logger.log('Crawlee engine initialized');
  }

  private async recoverInterruptedExecutions() {
    try {
      const staleExecutions = await this.executionRepository.find({
        where: [{ status: 'running' }, { status: 'stopping' }],
        relations: ['task'],
      });

      if (staleExecutions.length === 0) {
        return;
      }

      const recoveredAt = new Date();
      const recoveryMessage =
        'Server interrupted unexpectedly. This execution was marked as failed during startup recovery.';
      const tasksToSave = new Map<number, Task>();

      for (const execution of staleExecutions) {
        execution.status = 'failed';
        execution.log = recoveryMessage;
        execution.endTime = recoveredAt;

        const task = execution.task;
        if (
          task &&
          (task.status === 'pending' ||
            task.status === 'running' ||
            task.status === 'stopping')
        ) {
          task.status = 'failed';
          task.endTime = recoveredAt;
          tasksToSave.set(task.id, task);
        }
      }

      await this.executionRepository.save(staleExecutions);

      if (tasksToSave.size > 0) {
        const recoveredTasks = Array.from(tasksToSave.values());
        await this.taskRepository.save(recoveredTasks);

        for (const task of recoveredTasks) {
          this.taskGateway.broadcastTaskUpdate(
            {
              taskId: task.id,
              taskName: task.name,
              taskUrl: task.url,
              status: 'failed',
              progress: 0,
              screenshotPath: task.screenshotPath,
            },
            task.userId,
          );
        }
      }

      this.logger.warn(
        `Recovered ${staleExecutions.length} interrupted execution(s) as failed during startup`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to recover interrupted executions on startup: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * 灏嗕换鍔″姞鍏ラ槦鍒?   */
  async addTaskToQueue(task: CrawlerTask) {
    this.taskQueue.push(task);
    this.logger.log(
      `Task ${task.taskId} queued. Current queue length: ${this.taskQueue.length}`,
    );

    // 如果当前没有正在处理的任务，立即启动队列处理。
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private getStoredTaskScreenshotOptions(): playwright.PageScreenshotOptions {
    return {
      fullPage: true,
      type: 'jpeg',
      quality: 68,
      scale: 'css',
      animations: 'disabled',
      caret: 'hide',
    };
  }

  private getUploadsRootDir(): string {
    return path.resolve(__dirname, '..', '..', 'uploads');
  }

  private getScreenshotStoragePaths(taskId: number, executionId: number) {
    const screenshotFilename = `task_${taskId}_exec_${executionId}_screenshot.jpg`;
    return {
      filename: screenshotFilename,
      absoluteDir: path.join(this.getUploadsRootDir(), 'screenshots'),
      absoluteFilePath: path.join(
        this.getUploadsRootDir(),
        'screenshots',
        screenshotFilename,
      ),
      relativePath: `screenshots/${screenshotFilename}`,
    };
  }

  /**
   * 澶勭悊浠诲姟闃熷垪
   */
  private async processQueue() {
    if (this.isProcessing || this.taskQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.logger.log('Starting crawler task queue');

    while (this.taskQueue.length > 0) {
      const crawlerTask = this.taskQueue.shift();
      if (!crawlerTask) continue;

      try {
        await this.executeCrawlerTask(crawlerTask);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error || 'Unknown error');
        const errorObj =
          error instanceof Error
            ? error
            : new Error(String(error || 'Unknown error'));
        this.logger.error(`Task ${crawlerTask.taskId} failed while processing queue:`, errorObj);
        await this.updateExecutionStatus(
          crawlerTask.executionId,
          'failed',
          `Task failed: ${errorMessage}`,
        );
      }
    }

    this.isProcessing = false;
    this.logger.log('Crawler task queue processing completed');
  }

  /**
   * 鎵ц鍗曚釜鐖櫕浠诲姟
   */
  private async executeCrawlerTask(crawlerTask: CrawlerTask) {
    const { taskId, executionId, config } = crawlerTask;
    this.assertUniqueSelectorNames(config);
    const activeTask: ActiveCrawlerTask = {
      taskId,
      executionId,
      stopRequested: false,
    };
    this.activeTasks.set(taskId, activeTask);
    const stopWatcher = this.startTaskStopWatcher(activeTask);
    await this.taskRepository.update(taskId, {
      status: 'running',
      endTime: null as unknown as Date,
    });
    this.logger.log(`Starting task ${taskId}, execution ${executionId}`);

    // Track aggregated extraction stats for the final summary.
    let totalExtractedItems = 0;
    let totalValidItems = 0;
    let screenshotRelativePath: string | null = null; // Saved within executeCrawlerTask scope.
    let screenshotFilePath: string | null = null; // Saved within executeCrawlerTask scope.
    const baseRequestUrl = config.urls?.[0] ?? '';

    // Mark execution as running before the crawl starts.
    await this.updateExecutionStatus(
      executionId,
      'running',
      'Crawler task is running...',
    );

    try {
      // Initialize storage.
      const dataset = config.datasetId
        ? await Dataset.open(config.datasetId)
        : await Dataset.open(`task-${taskId}-${Date.now()}`);

      const keyValueStore = config.keyValueStoreId
        ? await KeyValueStore.open(config.keyValueStoreId)
        : await KeyValueStore.open(`task-${taskId}-${Date.now()}`);

      // Create request queue.
      const requestQueue = await RequestQueue.open(
        `task-${taskId}-${Date.now()}`,
      );

      // Seed initial URLs.
      for (const [index, url] of config.urls.entries()) {
        await requestQueue.addRequest({
          url,
          userData: { requestIndex: index + 1 },
        });
      }

      // Load task info for websocket broadcasts.
      const taskInfo = await this.taskRepository.findOne({
        where: { id: taskId },
        select: ['id', 'name', 'url', 'userId'],
      });

      // Capture helpers for use inside the request handler closure.
      const updateExecutionStatus = this.updateExecutionStatus.bind(this);
      const updateTaskStatus = this.taskRepository.update.bind(this.taskRepository);
      const broadcastTaskUpdate = this.taskGateway.broadcastTaskUpdate.bind(
        this.taskGateway,
      );
      const logger = this.logger;
      const extractDataFromElement = this.extractDataFromElement.bind(this);
      const extractDataFromSelector = this.extractDataFromSelector.bind(this);
      const isSameUrl = this.isSameUrl.bind(this);
      const hasMeaningfulValue = this.hasMeaningfulValue.bind(this);
      const executePreActions = this.executePreActions.bind(this);
      const extractParentFieldFromDetailPage =
        this.extractParentFieldFromDetailPage.bind(this);
      const extractParentFieldsFromDetailPage =
        this.extractParentFieldsFromDetailPage.bind(this);
      const extractDataFromElementWithRetries =
        this.extractDataFromElementWithRetries.bind(this);
      const extractNestedContextsForItems =
        this.extractNestedContextsForItems.bind(this);
      const extractConfiguredListItems =
        this.extractConfiguredListItems.bind(this);
      const mapWithConcurrencyLimit = this.mapWithConcurrencyLimit.bind(this);
      const getDetailItemConcurrency =
        this.getDetailItemConcurrency.bind(this);
      const executeBehaviorSteps = this.executeBehaviorSteps.bind(this);
      const ensureTaskNotStopped = this.ensureTaskNotStopped.bind(this);
      const isTaskStopRequested = this.isTaskStopRequested.bind(this);
      const isTaskTerminal = this.isTaskTerminal.bind(this);
      const waitForPageSettled = this.waitForPageSettled.bind(this);
      const waitForReadySelector = this.waitForReadySelector.bind(this);
      const getEffectiveViewport = this.getEffectiveViewport.bind(this);
      const getEffectiveUserAgent = this.getEffectiveUserAgent.bind(this);
      const getStoredTaskScreenshotOptions =
        this.getStoredTaskScreenshotOptions.bind(this);
      const getScreenshotStoragePaths =
        this.getScreenshotStoragePaths.bind(this);

      // Create a dedicated crawler instance for this task.
      const taskCrawler = new PlaywrightCrawler({
        requestQueue,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl || 1,
        maxConcurrency: config.maxConcurrency || 1,
        maxRequestRetries: Math.max(0, config.maxRetries ?? 3),
        requestHandlerTimeoutSecs: Math.max(
          300,
          Math.ceil((config.navigationTimeout || 60000) / 1000) * 4,
        ),
        launchContext: {
          launchOptions: {
            headless: config.headless !== false,
          },
        },
        preNavigationHooks: [
          async ({ page, request }) => {
            ensureTaskNotStopped(taskId);
            const viewport = getEffectiveViewport(config);
            await page.setViewportSize(viewport).catch(() => undefined);
            await page
              .setExtraHTTPHeaders({
                'User-Agent': getEffectiveUserAgent(config),
              })
              .catch(() => undefined);
            await this.applyConfiguredCookies(page, request.url, config);
            await this.waitBeforeNavigation(page, config);
          },
        ],
        async requestHandler({ request, page, response }) {
          ensureTaskNotStopped(taskId);
          const requestIndexFromMeta = Number(request.userData?.requestIndex);
          const requestIndexByUrl =
            config.urls.findIndex((configuredUrl) =>
              isSameUrl(configuredUrl, request.url),
            ) + 1;
          const requestIndex =
            Number.isFinite(requestIndexFromMeta) && requestIndexFromMeta > 0
              ? requestIndexFromMeta
              : requestIndexByUrl > 0
                ? requestIndexByUrl
                : 1;
          const totalRequests = Math.max(1, config.urls.length);

          // Update progress with per-request detail and overall aggregation.
          const updateDetailedProgress = async (currentProgress: number, message: string) => {
            if (isTaskStopRequested(taskId) || isTaskTerminal(taskId)) {
              return;
            }

            // Combine completed request progress with the current request progress.
            const baseProgress = ((requestIndex - 1) / totalRequests) * 100;
            const totalProgress = Math.max(
              0,
              Math.min(
                100,
                Math.round(baseProgress + currentProgress / totalRequests),
              ),
            );

            await updateExecutionStatus(executionId, 'running', message);

            broadcastTaskUpdate({
              taskId,
              taskName: taskInfo?.name,
              taskUrl: taskInfo?.url,
              status: 'running',
              progress: totalProgress,
            }, taskInfo?.userId);
          };

          // Start processing the current request.
          await updateDetailedProgress(
            5,
            `Starting request ${requestIndex}/${totalRequests}: ${request.url}`,
          );

          // Request-scoped extraction buffers.
          let extractedItems: any[] = [];
          let validItems: any[] = [];

          try {
            ensureTaskNotStopped(taskId);
            const viewport = getEffectiveViewport(config);
            await updateDetailedProgress(
              10,
              `Viewport ready: ${viewport.width}x${viewport.height}`,
            );

            await updateDetailedProgress(
              15,
              `User-Agent ready: ${getEffectiveUserAgent(config)}`,
            );

            // Execute task-level pre-actions such as clicks and waits.
            if (config.preActions?.length) {
              await executePreActions(
                page,
                config.preActions,
                config.waitForTimeout || 30000,
              );
              await updateDetailedProgress(20, 'Completed page pre-actions');
            } else {
              await updateDetailedProgress(20, 'Skipped page pre-actions');
            }

            const contentReadySelector = String(
              config.waitForSelector ||
                (config.baseSelector && config.selectors ? config.baseSelector : '') ||
                '',
            ).trim();

            // Wait for a stable anchor element when configured.
            if (contentReadySelector) {
              const selectorReady = await waitForReadySelector(
                page,
                contentReadySelector,
                config.waitForTimeout || config.navigationTimeout || 30000,
                config.waitForSelector ? 'visible' : 'attached',
              );
              if (config.waitForSelector && !selectorReady) {
                throw new Error(
                  `Configured waitForSelector did not appear: ${contentReadySelector}`,
                );
              }
              await updateDetailedProgress(
                25,
                `Content selector ready: ${contentReadySelector}`,
              );
            } else {
              await updateDetailedProgress(25, 'No content-ready selector configured');
            }

            // Scroll the page to trigger lazy-loaded content when needed.
            const shouldDeferListScroll = Boolean(
              config.baseSelector && config.selectors,
            );
            if (config.scrollEnabled && !shouldDeferListScroll) {
              await page.evaluate(
                async ({ scrollDistance, scrollDelay, maxScrollDistance }) => {
                  let scrolled = 0;
                  while (scrolled < maxScrollDistance) {
                    window.scrollBy(0, scrollDistance);
                    scrolled += scrollDistance;
                    await new Promise((resolve) =>
                      setTimeout(resolve, scrollDelay),
                    );
                  }
                },
                {
                  scrollDistance: config.scrollDistance || 1000,
                  scrollDelay: config.scrollDelay || 1000,
                  maxScrollDistance: config.maxScrollDistance || 10000,
                },
              );
              await page.waitForTimeout(1000);
              await updateDetailedProgress(45, 'Completed page scrolling');
            } else {
              await updateDetailedProgress(45, 'Skipped page scrolling');
            }

            await waitForPageSettled(
              page,
              config.waitForTimeout || config.navigationTimeout || 30000,
              1200,
            );

            if (contentReadySelector) {
              await waitForReadySelector(
                page,
                contentReadySelector,
                config.waitForTimeout || config.navigationTimeout || 30000,
                config.waitForSelector ? 'visible' : 'attached',
              );
            }

            await updateDetailedProgress(55, 'Page settled; extraction will start');

            const pageData = {
              url: request.url,
              title: await page.title(),
              statusCode: response?.status() || 200,
              crawledAt: new Date().toISOString(),
            };

            await updateDetailedProgress(65, '开始提取数据');

            if (config.taskMode === 'behavior' && config.behaviorSteps?.length) {
              extractedItems = await executeBehaviorSteps(page, config);
              logger.log(
                `Behavior mode extracted ${extractedItems.length} records`,
              );
            } else if (config.baseSelector && config.selectors) {
              extractedItems = await extractConfiguredListItems(
                page,
                config,
                totalRequests,
              );
              logger.log(
                `Configured list mode extracted ${extractedItems.length} records`,
              );
            } else if (config.selectors) {
              const extractedData: any = {
                _page: pageData,
              };
              for (const selectorConfig of config.selectors) {
                await extractDataFromSelector(
                  page,
                  selectorConfig,
                  extractedData,
                );
              }
              extractedItems = [extractedData];
            }
            // Enforce maxItems across the whole dataset.
            let currentCount = await dataset
              .getInfo()
              .then((info) => info?.itemCount || 0);

            if (config.maxItems && currentCount >= config.maxItems) {
              logger.log(
                `Reached max item limit ${config.maxItems}, skipping data persistence for this page`, 
              );
              return; // Skip persistence for this page, but do not abort the whole task.
            }

            // Filter invalid or empty records.
            validItems = extractedItems.filter(itemData => {
              // Drop records where all fields are empty or null.
              const hasValidField = Object.values(itemData).some((value) =>
                hasMeaningfulValue(value),
              );

              if (!hasValidField) {
                logger.log('过滤掉空数据项', itemData);
                return false;
              }

              return true;
            });

            if (validItems.length === 0) {
              const errorMessage = 'Task failed: no valid data extracted; all extracted fields were empty';
              logger.error(errorMessage);
              throw new Error(errorMessage);
            }

            const itemsBeforeFilter = validItems.length;
            validItems = validItems.filter((itemData) =>
              itemMatchesResultFilters(itemData, config.resultFilters),
            );

            if (itemsBeforeFilter !== validItems.length) {
              logger.log(
                `Result filters removed ${itemsBeforeFilter - validItems.length} records on ${request.url}`,
              );
            }

            if (itemsBeforeFilter > 0 && validItems.length === 0) {
              logger.log(
                `All records on ${request.url} were filtered out by result filters`,
              );
            }

            // Track image-type fields so we can normalize them to URLs only.
            const imageFields = (config.selectors || [])
              .filter(selector => selector.type === 'image')
              .map(selector => selector.name);

            // Persist filtered data.
            for (const itemData of validItems) {
              if (config.maxItems && currentCount >= config.maxItems) {
                break; // Stop saving once maxItems is reached.
              }

              // In JSON mode, image fields should always store resolved URLs.
              // Normalize each image field to a valid URL string or null.
              for (const imageField of imageFields) {
                if (itemData.hasOwnProperty(imageField)) {
                  const value = itemData[imageField];
                  // Keep only valid http/https URLs.
                  if (value && typeof value === 'string') {
                    const trimmedValue = value.trim();
                    // Validate URL shape.
                    if (trimmedValue && (trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://'))) {
                      // Already a valid URL; keep the trimmed string.
                      itemData[imageField] = trimmedValue;
                    } else {
                      // Invalid URL value; normalize to null.
                      itemData[imageField] = null;
                      logger.log(
                        `Field ${imageField} has invalid URL "${trimmedValue}", normalized to null`,
                      );
                    }
                  } else if (value !== null && value !== undefined) {
                    // Non-string image values are normalized to null.
                    itemData[imageField] = null;
                    logger.log(
                      `Field ${imageField} is not a string URL, normalized to null`,
                    );
                  }
                }
              }

              // Only persist user-defined selector fields.
              await dataset.pushData(itemData);
              currentCount++;
            }

            logger.log(`Extracted ${extractedItems.length} records and kept ${validItems.length} valid records`);

            // Aggregate totals for the final execution summary.
            totalExtractedItems += extractedItems.length;
            totalValidItems += validItems.length;

            // Data has been saved; try generating a representative screenshot.
            await updateDetailedProgress(85, 'Data saved, generating screenshot');

            // Only persist the primary screenshot for the first/base request.
            const shouldSavePrimaryScreenshot =
              !screenshotRelativePath &&
              (requestIndex === 1 || isSameUrl(request.url, baseRequestUrl));

            try {
              if (page.isClosed()) {
                logger.warn(`页面已关闭，跳过截图（请求 ${requestIndex}/${totalRequests}）`);
              } else if (shouldSavePrimaryScreenshot) {
                if (config.baseSelector && page.url() !== request.url) {
                  logger.log(`当前不在列表页，先返回后再截图: ${request.url}`);
                  await page.goto(request.url, {
                    waitUntil: 'domcontentloaded',
                    timeout: config.navigationTimeout || 60000,
                  });
                  await page.waitForTimeout(2000);
                }

                const screenshot = await page.screenshot(
                  getStoredTaskScreenshotOptions(),
                );

                const screenshotPaths = getScreenshotStoragePaths(
                  taskId,
                  executionId,
                );
                screenshotFilePath = screenshotPaths.absoluteFilePath;
                screenshotRelativePath = screenshotPaths.relativePath;

                await fs.mkdir(screenshotPaths.absoluteDir, { recursive: true });
                await fs.writeFile(screenshotPaths.absoluteFilePath, screenshot);

                logger.log(`已保存主截图: ${screenshotRelativePath}`);

                const screenshotKey = `screenshot-${request.id}`;
                await keyValueStore.setValue(screenshotKey, screenshot);
              } else {
                const screenshot = await page.screenshot(
                  getStoredTaskScreenshotOptions(),
                );
                await keyValueStore.setValue(`screenshot-${request.id}`, screenshot);
              }
            } catch (screenshotError) {
              logger.warn(
                `截图阶段失败，已忽略并继续任务: ${
                  screenshotError instanceof Error
                    ? screenshotError.message
                    : String(screenshotError)
                }`,
              );
            }

            await updateDetailedProgress(95, '截图生成完成');

          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error || 'Unknown error');
            const errorObj =
              error instanceof Error
                ? error
                : new Error(String(error || 'Unknown error'));
            if (
              requestIndex === 1 &&
              !screenshotRelativePath &&
              !page.isClosed?.()
            ) {
              try {
                logger.warn(`页面处理失败，尝试兜底保存首屏截图: ${request.url}`);
                const screenshot = await page.screenshot(
                  getStoredTaskScreenshotOptions(),
                );
                const screenshotPaths = getScreenshotStoragePaths(
                  taskId,
                  executionId,
                );
                screenshotFilePath = screenshotPaths.absoluteFilePath;
                screenshotRelativePath = screenshotPaths.relativePath;
                await fs.mkdir(screenshotPaths.absoluteDir, { recursive: true });
                await fs.writeFile(screenshotPaths.absoluteFilePath, screenshot);
                await keyValueStore.setValue(`screenshot-${request.id}`, screenshot);
              } catch (fallbackScreenshotError) {
                logger.warn(
                  `兜底截图失败: ${
                    fallbackScreenshotError instanceof Error
                      ? fallbackScreenshotError.message
                      : String(fallbackScreenshotError)
                  }`,
                );
              }
            }
            logger.error(`Failed to process page ${request.url}: ${errorMessage}`, errorObj);
            throw errorObj;
          }
        },
      });

      // Run the task-scoped crawler.
      activeTask.crawler = taskCrawler;
      await taskCrawler.run();

      if (this.isTaskStopRequested(taskId)) {
        await this.finalizeStoppedTask(
          taskId,
          executionId,
          config,
          this.getTaskStopReason(taskId),
        );
        await requestQueue.drop().catch(() => undefined);
        return;
      }

      // Collect summary stats.
      const datasetInfo = await dataset.getInfo();
      const stats = taskCrawler.stats;

      // Load the extracted data for result packaging and notifications.
      const allData = await dataset.getData();
      const itemCount = allData.items.length;

      // Treat an empty final result array as a task failure.
      if (Array.isArray(allData?.items) && allData.items.length === 0) {
        const errorMessage = 'Task failed: no valid data collected (final result array length was 0)';
        this.logger.error(errorMessage);
        throw new Error(errorMessage);
      }

      // Persist results as a JSON file.
      const path = require('path');
      const resultFilename = `task_${taskId}_exec_${executionId}_results.json`;
      const resultFilePath = `uploads/results/${resultFilename}`;

      // Ensure the output directory exists.
      const resultDir = path.dirname(resultFilePath);
      await fs.mkdir(resultDir, { recursive: true });

      // Write result file.
      await fs.writeFile(resultFilePath, JSON.stringify(allData.items, null, 2));

      // Store the result file path on the execution record.
      await this.executionRepository.update(executionId, {
        resultPath: resultFilePath,
      });

      // Mark execution as successful.
      const totalRequests = config.urls.length;
      const filteredItemCount = totalValidItems; // Use the post-filter item count.
      let resultMessage = `Execution succeeded: processed ${totalRequests}/${totalRequests} requests and collected ${filteredItemCount} valid records`;

      if (config.maxItems && filteredItemCount >= config.maxItems) {
        resultMessage += ` (reached max item limit ${config.maxItems})`;
      }

      if (totalExtractedItems > totalValidItems) {
        resultMessage += ` (filtered out ${totalExtractedItems - totalValidItems} empty record(s))`;
      }

      if (this.isTaskStopRequested(taskId)) {
        await this.finalizeStoppedTask(
          taskId,
          executionId,
          config,
          this.getTaskStopReason(taskId),
        );
        await requestQueue.drop().catch(() => undefined);
        return;
      }

      let broadcastedScreenshotPath: string | undefined =
        screenshotRelativePath ?? undefined;

      // Persist the already-generated screenshot path before the success sync refresh runs.
      try {
        logger.log(
          `Preparing to persist screenshot path. screenshotFilePath=${screenshotFilePath}, screenshotRelativePath=${screenshotRelativePath}`,
        );

        if (
          screenshotFilePath &&
          screenshotRelativePath &&
          existsSync(screenshotFilePath)
        ) {
          await this.taskRepository.update(taskId, {
            screenshotPath: screenshotRelativePath,
          });

          logger.log(`Screenshot path persisted: ${screenshotRelativePath}`);
        } else {
          logger.warn(
            `Screenshot file missing or empty path. screenshotFilePath=${screenshotFilePath}, exists=${
              screenshotFilePath ? existsSync(screenshotFilePath) : false
            }`,
          );
        }
      } catch (error) {
        logger.error('Failed to persist screenshot path:', error);
      }

      activeTask.terminalStatus = 'success';
      activeTask.terminalReason = resultMessage;
      const executionMarkedSuccess = await this.persistTerminalExecutionStatus(
        executionId,
        'success',
        resultMessage,
        resultFilePath,
      );

      if (!executionMarkedSuccess) {
        logger.warn(
          `Execution ${executionId} could not be verified as success; task ${taskId} will still be exposed as success`,
        );
      }

      await this.taskRepository
        .update(taskId, {
          status: 'success',
          endTime: new Date(),
        })
        .catch((error) => {
          logger.error('Failed to persist task success status:', error);
        });

      // Broadcast success before any slow fallback work so the UI leaves the running state promptly.
      try {
        this.taskGateway.broadcastTaskUpdate(
          {
            taskId,
            taskName: taskInfo?.name,
            taskUrl: taskInfo?.url,
            status: 'success',
            progress: 100,
            screenshotPath: broadcastedScreenshotPath,
          },
          taskInfo?.userId,
        );
      } catch (error) {
        logger.error('Failed to broadcast task success status:', error);
      }

      this.logger.log(
        `Task ${taskId} completed successfully: ${resultMessage}. Result saved to ${resultFilePath}`,
      );

      // Slow post-success housekeeping should not move the task back to failed.
      if ((!screenshotFilePath || !existsSync(screenshotFilePath)) && baseRequestUrl) {
        try {
          const fallbackCapture = await this.captureTaskScreenshotFallback(
            taskId,
            executionId,
            config,
            baseRequestUrl,
          );
          if (fallbackCapture) {
            screenshotFilePath = fallbackCapture.filePath;
            screenshotRelativePath = fallbackCapture.relativePath;
          }
        } catch (error) {
          logger.warn(
            `Post-success fallback screenshot failed for task ${taskId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (
        screenshotFilePath &&
        screenshotRelativePath &&
        existsSync(screenshotFilePath) &&
        screenshotRelativePath !== broadcastedScreenshotPath
      ) {
        try {
          await this.taskRepository.update(taskId, {
            screenshotPath: screenshotRelativePath,
          });

          broadcastedScreenshotPath = screenshotRelativePath;
          this.taskGateway.broadcastTaskUpdate(
            {
              taskId,
              taskName: taskInfo?.name,
              taskUrl: taskInfo?.url,
              status: 'success',
              progress: 100,
              screenshotPath: broadcastedScreenshotPath,
            },
            taskInfo?.userId,
          );
        } catch (error) {
          logger.error('Failed to persist post-success screenshot path:', error);
        }
      }

      await this.sendTaskExecutionNotification({
        taskId,
        executionId,
        config,
        status: 'success',
        log: resultMessage,
        itemCount: filteredItemCount,
        previewItems: allData.items,
      }).catch((error) => {
        logger.warn(
          `Success notification failed after task ${taskId} was already completed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
      await requestQueue.drop().catch((error) => {
        logger.warn(
          `Request queue cleanup failed after task ${taskId} completed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
      // Dataset and KeyValueStore are intentionally kept for later inspection.
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error || 'Unknown error');
      const errorObj =
        error instanceof Error
          ? error
          : new Error(String(error || 'Unknown error'));
      if (this.isTaskStopRequested(taskId)) {
        await this.finalizeStoppedTask(
          taskId,
          executionId,
          config,
          this.getTaskStopReason(taskId),
        );
        return;
      }
      activeTask.terminalStatus = 'failed';
      activeTask.terminalReason = `Task failed: ${errorMessage}`;
      await Promise.allSettled([
        activeTask.crawler?.teardown() ?? Promise.resolve(),
        this.closeDetachedDetailBrowser(),
      ]);
      this.logger.error(`Task ${taskId} execution failed:`, errorObj);
      await this.persistTerminalExecutionStatus(
        executionId,
        'failed',
        `Task failed: ${errorMessage}`,
      );

      // Update task status and endTime.
      await this.taskRepository.update(taskId, {
        status: 'failed',
        endTime: new Date(),
      });

      // Send failure notification and load task info for broadcast.
      await this.sendTaskExecutionNotification({
        taskId,
        executionId,
        config,
        status: 'failed',
        log: errorMessage,
      });

      const taskFailedInfo = await this.taskRepository.findOne({
        where: { id: taskId },
        select: ['id', 'name', 'url', 'userId', 'screenshotPath'],
      });

      // Broadcast failure status.
      this.taskGateway.broadcastTaskUpdate({
        taskId,
        taskName: taskFailedInfo?.name,
        taskUrl: taskFailedInfo?.url,
        status: 'failed',
        progress: 0,
        screenshotPath: taskFailedInfo?.screenshotPath ?? screenshotRelativePath,
      }, taskFailedInfo?.userId);

      throw error;
    } finally {
      clearInterval(stopWatcher);
      this.activeTasks.delete(taskId);
      await this.closeDetachedDetailBrowser();
    }
  }

  /**
   * Extract data from a page-level selector.
   */
  private async extractDataFromSelector(
    page: any,
    selectorConfig: SelectorConfig,
    extractedData: any,
  ) {
    const { name, selector, type, contentFormat } = selectorConfig;

    try {
      if (page?.isClosed?.()) {
        this.setExtractedFieldValue(extractedData, selectorConfig, null);
        return;
      }

      // Normalize selector syntax into a Playwright-compatible locator.
      let finalSelector: string;
      if (this.isXPathSelector(selector)) {
        finalSelector = `xpath=${this.toPageLevelXPath(selector)}`;
      } else {
        // CSS selector or other Playwright-supported selector.
        finalSelector = selector;
      }

      // Simplified mode: each selector extracts only one value; missing values become null.
      const element = page.locator(finalSelector).first();
      let value: string | null = null;

      switch (type) {
        case 'text': {
          const format = contentFormat || 'text';
          if (format === 'html' || format === 'markdown' || format === 'smart') {
            // Read the raw HTML first, then decide whether to format it as HTML/Markdown.
            const html = await element.innerHTML();
            value =
              format === 'html'
                ? html
                : formatHtmlFragment(html, format, page.url());
          } else {
            value = await element.textContent();
          }
          break;
        }
        case 'link':
          value = await element.getAttribute('href');
          // Resolve relative URLs against the current page URL.
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // If URL resolution fails, keep the original value.
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
          break;
        case 'image':
          // Try src first.
          value = await element.getAttribute('src');
          // Fall back to data-src for lazy-loaded images.
          if (!value) {
            value = await element.getAttribute('data-src');
          }
          // Fall back to data-original for another common lazy-load pattern.
          if (!value) {
            value = await element.getAttribute('data-original');
          }
          // Resolve relative URLs against the current page URL.
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // If URL resolution fails, keep the original value.
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
          break;
        default:
          value = await element.textContent();
      }

      this.setExtractedFieldValue(
        extractedData,
        selectorConfig,
        this.applySelectorTransform(
          selectorConfig,
          value,
          extractedData,
          page.url(),
        ),
      );
    } catch (error) {
      // If the element cannot be found, store null instead of throwing.
      this.setExtractedFieldValue(extractedData, selectorConfig, null);
    }
  }

  /**
   * Extract data from a selector relative to the current base element.
   */
  private async extractDataFromElement(
    baseElement: any,
    selectorConfig: SelectorConfig,
    extractedData: any,
    page: any,
  ) {
    const { name, selector, type, contentFormat } = selectorConfig;

    try {
      if (page?.isClosed?.()) {
        this.setExtractedFieldValue(extractedData, selectorConfig, null);
        return;
      }

      let element;

      // Normalize selector behavior relative to the base element.
      if (this.isXPathSelector(selector)) {
        const expression = this.getXPathExpression(selector);
        if (this.isRelativeXPathExpression(expression)) {
          // Relative XPath, evaluated against baseElement.
          element = baseElement.locator(`xpath=${expression}`).first();
        } else {
          // Absolute XPath, evaluated from the page root to avoid deep nesting mismatches.
          element = page.locator(`xpath=${expression}`).first();
        }
      } else {
        // CSS selector or other Playwright selector relative to baseElement.
        element = baseElement.locator(selector).first();
      }

      // Debug: check whether the element exists.
      const count = await element.count();
      this.logger.debug(`Field ${name}: selector "${selector}" matched ${count} elements relative to the base element`);

      if (count === 0) {
        this.setExtractedFieldValue(extractedData, selectorConfig, null);
        return;
      }

      let value: string | null = null;

      switch (type) {
        case 'text': {
          const format = contentFormat || 'text';
          if (format === 'html' || format === 'markdown' || format === 'smart') {
            const html = await element.innerHTML();
            value =
              format === 'html'
                ? html
                : formatHtmlFragment(html, format, page.url());
          } else {
            value = await element.textContent();
          }
          break;
        }
        case 'link':
          value = await element.getAttribute('href');
          // Resolve relative URLs against the current page URL.
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // If URL resolution fails, keep the original value.
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
          break;
        case 'image':
          // Try src first.
          value = await element.getAttribute('src');
          // Fall back to data-src for lazy-loaded images.
          if (!value) {
            value = await element.getAttribute('data-src');
          }
          // Fall back to data-original for another common lazy-load pattern.
          if (!value) {
            value = await element.getAttribute('data-original');
          }
          // Resolve relative URLs against the current page URL.
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // If URL resolution fails, keep the original value.
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
          break;
        default:
          value = await element.textContent();
      }

      this.setExtractedFieldValue(
        extractedData,
        selectorConfig,
        this.applySelectorTransform(
          selectorConfig,
          value,
          extractedData,
          page.url(),
        ),
      );
      this.logger.debug(`Field ${name}: extracted value "${extractedData[name]}"`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error || 'unknown');
      if (!/Target page, context or browser has been closed/i.test(errorMessage)) {
        this.logger.error(`Field ${name} extraction failed`, error);
      }
      // If the element cannot be found, store null instead of throwing.
      this.setExtractedFieldValue(extractedData, selectorConfig, null);
    }
  }

  private async extractDataFromElementWithRetries(
    baseElement: any,
    selectorConfig: SelectorConfig,
    extractedData: Record<string, any>,
    page: any,
    config: CrawleeTaskConfig,
  ): Promise<void> {
    await this.extractDataFromElement(
      baseElement,
      selectorConfig,
      extractedData,
      page,
    );

    let currentValue = extractedData[selectorConfig.name];
    const retryCount = this.getEmptyValueRetryCount(config);

    for (
      let attempt = 1;
      attempt <= retryCount &&
      this.shouldRetrySelectorValue(selectorConfig, currentValue);
      attempt++
    ) {
      const retryDelayMs = this.getRetryDelayMs(config, attempt);
      this.logger.debug(
        `Field ${selectorConfig.name} retry ${attempt}: current value ${currentValue ?? 'null'}`,
      );
      await this.waitBeforeRetry(page, retryDelayMs);
      if (page?.isClosed?.()) {
        break;
      }

      await this.extractDataFromElement(
        baseElement,
        selectorConfig,
        extractedData,
        page,
      );
      currentValue = extractedData[selectorConfig.name];
    }

    if (this.shouldRetrySelectorValue(selectorConfig, currentValue)) {
      this.setExtractedFieldValue(extractedData, selectorConfig, null);
    }
  }

  private isLikelyGlobalNavigationValue(
    selectorType: SelectorConfig['type'],
    value: unknown,
  ): boolean {
    if (typeof value !== 'string' || !value) return false;
    const lower = value.toLowerCase();

    if (selectorType === 'image') {
      if (lower.endsWith('.svg')) return true;
      if (lower.includes('logo')) return true;
    }

    if (selectorType === 'link') {
      try {
        const url = new URL(value);
        const path = url.pathname.toLowerCase();
        if (path === '/' || path === '/en' || path === '/en/') return true;
      } catch {
        // ignore parse failure
      }
    }

    return false;
  }

  private getXPathExpression(selector: string): string {
    const normalized = String(selector || '').trim();
    return normalized.startsWith('xpath=')
      ? normalized.slice('xpath='.length)
      : normalized;
  }

  private isRelativeXPathExpression(expression: string): boolean {
    return expression.startsWith('.//') || expression.startsWith('./');
  }

  private isXPathSelector(selector?: string): boolean {
    const normalized = String(selector || '').trim();
    return (
      normalized.startsWith('xpath=') ||
      normalized.startsWith('//') ||
      normalized.startsWith('.//') ||
      normalized.startsWith('./')
    );
  }

  private toPageLevelXPath(selector: string): string {
    const expression = this.getXPathExpression(selector);
    return this.isRelativeXPathExpression(expression)
      ? expression.substring(1)
      : expression;
  }

  private getScopedLocator(
    scope: any,
    selector: string,
    page: any,
  ): any {
    if (this.isXPathSelector(selector)) {
      const expression = this.getXPathExpression(selector);
      if (this.isRelativeXPathExpression(expression)) {
        return scope.locator(`xpath=${expression}`);
      }
      return page.locator(`xpath=${expression}`);
    }

    return scope.locator(selector);
  }

  private async extractRawValueFromLocatorElement(
    element: any,
    selectorConfig: SelectorConfig,
    page: any,
  ): Promise<string | null> {
    const { type, contentFormat } = selectorConfig;

    switch (type) {
      case 'text': {
        const format = contentFormat || 'text';
        if (format === 'html' || format === 'markdown' || format === 'smart') {
          const html = await element.innerHTML();
          return format === 'html'
            ? html
            : formatHtmlFragment(html, format, page.url());
        }

        return await element.textContent();
      }
      case 'link': {
        const href = await element.getAttribute('href');
        if (!href) {
          return null;
        }

        try {
          return new URL(href, page.url()).href;
        } catch (urlError) {
          this.logger.warn(`Failed to resolve relative URL "${href}"`, urlError);
          return href;
        }
      }
      case 'image': {
        let src = await element.getAttribute('src');
        if (!src) {
          src = await element.getAttribute('data-src');
        }
        if (!src) {
          src = await element.getAttribute('data-original');
        }
        if (!src) {
          return null;
        }

        try {
          return new URL(src, page.url()).href;
        } catch (urlError) {
          this.logger.warn(`Failed to resolve relative URL "${src}"`, urlError);
          return src;
        }
      }
      default:
        return await element.textContent();
    }
  }

  private flattenCollectedValues(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.flattenCollectedValues(item));
    }

    return [value];
  }

  private createValueSignature(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private normalizeCollectedValues(
    selectorType: SelectorConfig['type'],
    values: unknown[],
  ): any {
    const dedupedValues: unknown[] = [];
    const seen = new Set<string>();

    for (const value of values) {
      if (!this.hasMeaningfulValue(value)) {
        continue;
      }

      if (this.isLikelyGlobalNavigationValue(selectorType, value)) {
        continue;
      }

      const signature = this.createValueSignature(value);
      if (seen.has(signature)) {
        continue;
      }

      seen.add(signature);
      dedupedValues.push(value);
    }

    if (dedupedValues.length === 0) {
      return null;
    }

    return dedupedValues.length === 1 ? dedupedValues[0] : dedupedValues;
  }

  private async extractValuesFromScope(
    scope: any,
    selectorConfig: SelectorConfig,
    itemData: Record<string, any>,
    page: any,
  ): Promise<any> {
    if (page?.isClosed?.()) {
      return null;
    }

    try {
      const locator = this.getScopedLocator(scope, selectorConfig.selector, page);
      const count = Math.min(await locator.count(), 50);
      if (count === 0) {
        return null;
      }

      const values: unknown[] = [];
      for (let i = 0; i < count; i++) {
        const rawValue = await this.extractRawValueFromLocatorElement(
          locator.nth(i),
          selectorConfig,
          page,
        );
        const transformedValue = this.applySelectorTransform(
          selectorConfig,
          rawValue,
          itemData,
          page.url(),
        );

        if (this.hasMeaningfulValue(transformedValue)) {
          values.push(...this.flattenCollectedValues(transformedValue));
        }
      }

      return this.normalizeCollectedValues(selectorConfig.type, values);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error || 'unknown');
      if (!/Target page, context or browser has been closed/i.test(errorMessage)) {
        this.logger.debug(
          `Failed to extract multi-value detail selector ${selectorConfig.name}: ${errorMessage}`,
        );
      }

      return null;
    }
  }

  private async tryExtractFromBaseElement(
    baseElement: any,
    selectorConfig: SelectorConfig,
    page: any,
    itemData: Record<string, any> = {},
  ): Promise<any> {
    return this.extractValuesFromScope(
      baseElement,
      { ...selectorConfig, parentLink: undefined },
      itemData,
      page,
    );
  }

  private async tryExtractFromCandidateBases(
    detailPage: any,
    selectorConfig: SelectorConfig,
    itemData: Record<string, any>,
  ): Promise<any> {
    const candidateBaseSelectors: string[] = [];
    if (selectorConfig.detailBaseSelector?.trim()) {
      candidateBaseSelectors.push(selectorConfig.detailBaseSelector.trim());
    } else {
      // Only use limited fallback candidates when legacy configs lack detailBaseSelector.
      candidateBaseSelectors.push(
        `//main//*[contains(@class,"relative") and contains(@class,"size-full")]`,
        `//main//article`,
        `//main//li`,
        `//main//figure`,
        `//main//div[.//a or .//img]`,
      );
    }

    for (const baseSelector of candidateBaseSelectors) {
      try {
        const baseLocator = this.getLocatorFromSelector(detailPage, baseSelector);
        const count = Math.min(await baseLocator.count(), 30);
        const collectedValues: unknown[] = [];
        for (let i = 0; i < count; i++) {
          const value = await this.tryExtractFromBaseElement(
            baseLocator.nth(i),
            selectorConfig,
            detailPage,
            itemData,
          );

          if (this.hasMeaningfulValue(value)) {
            collectedValues.push(...this.flattenCollectedValues(value));
          }
        }

        const normalizedValue = this.normalizeCollectedValues(
          selectorConfig.type,
          collectedValues,
        );
        if (this.hasMeaningfulValue(normalizedValue)) {
          return normalizedValue;
        }
      } catch {
        // skip invalid candidate selector
      }
    }

    return null;
  }

  private async extractParentFieldFromDetailPage(
    linkUrl: string,
    selectorConfig: SelectorConfig,
    itemData: Record<string, any>,
    config: CrawleeTaskConfig,
  ): Promise<void> {
    await this.extractParentFieldsFromDetailPage(
      linkUrl,
      [selectorConfig],
      itemData,
      config,
    );
  }

  private async extractSelectorValueFromDetailPage(
    detailPage: any,
    selectorConfig: SelectorConfig,
    itemData: Record<string, any>,
  ): Promise<any> {
    const tempSelectorConfig = {
      ...selectorConfig,
      parentLink: undefined,
    };

    if (selectorConfig.detailBaseSelector?.trim()) {
      const detailBaseLocator = this.getLocatorFromSelector(
        detailPage,
        selectorConfig.detailBaseSelector.trim(),
      );
      const detailBaseCount = Math.min(await detailBaseLocator.count(), 30);
      const collectedValues: unknown[] = [];
      for (let i = 0; i < detailBaseCount; i++) {
        const candidateValue = await this.tryExtractFromBaseElement(
          detailBaseLocator.nth(i),
          tempSelectorConfig,
          detailPage,
          itemData,
        );

        if (this.hasMeaningfulValue(candidateValue)) {
          collectedValues.push(...this.flattenCollectedValues(candidateValue));
        }
      }

      return this.normalizeCollectedValues(
        selectorConfig.type,
        collectedValues,
      );
    }

    let value = await this.extractValuesFromScope(
      detailPage,
      tempSelectorConfig,
      itemData,
      detailPage,
    );

    if (
      this.hasMeaningfulValue(value) &&
      !this.isLikelyGlobalNavigationValue(selectorConfig.type, value)
    ) {
      return value;
    }

    if (this.isRelativeXPathExpression(this.getXPathExpression(selectorConfig.selector))) {
      const candidateValue = await this.tryExtractFromCandidateBases(
        detailPage,
        selectorConfig,
        itemData,
      );
      if (this.hasMeaningfulValue(candidateValue)) {
        value = candidateValue;
      }
    }

    return this.hasMeaningfulValue(value) ? value : null;
  }

  private async extractParentFieldsFromDetailPage(
    linkUrl: string,
    selectorConfigs: SelectorConfig[],
    itemData: Record<string, any>,
    config: CrawleeTaskConfig,
  ): Promise<void> {
    const detailPage = await this.createDetachedDetailPage(config);
    const detailPreActions =
      selectorConfigs.find((selector) => selector.preActions?.length)?.preActions || [];
    const detailReadySelector =
      selectorConfigs.find((selector) => String(selector.detailBaseSelector || '').trim())
        ?.detailBaseSelector ||
      selectorConfigs.find((selector) => {
        const normalizedSelector = String(selector.selector || '').trim();
        return (
          normalizedSelector &&
          !this.isRelativeXPathExpression(this.getXPathExpression(normalizedSelector))
        );
      })?.selector;
    try {
      await this.applyConfiguredCookies(detailPage, linkUrl, config);
      await this.waitBeforeNavigation(detailPage, config);
      await detailPage.goto(linkUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.navigationTimeout || 60000,
      });
      await this.waitForPageSettled(
        detailPage,
        config.waitForTimeout || config.navigationTimeout || 30000,
      );

      if (detailPreActions.length) {
        await this.executePreActions(
          detailPage,
          detailPreActions,
          config.waitForTimeout || 30000,
          {
            ignoreMissingTargets: true,
          },
        );
        await this.waitForPageSettled(
          detailPage,
          config.waitForTimeout || config.navigationTimeout || 30000,
        );
      }

      if (detailReadySelector) {
        await this.waitForReadySelector(
          detailPage,
          detailReadySelector,
          config.waitForTimeout || config.navigationTimeout || 30000,
          'attached',
        );
      }

      for (const selectorConfig of selectorConfigs) {
        const value = await this.extractSelectorValueFromDetailPageWithRetries(
          detailPage,
          selectorConfig,
          itemData,
          config,
        );
        this.setExtractedFieldValue(itemData, selectorConfig, value);
      }
    } finally {
      await detailPage.context().close().catch(() => undefined);
    }
  }

  private async ensureDetachedDetailBrowser(
    config: CrawleeTaskConfig,
  ): Promise<playwright.Browser> {
    if (this.detachedDetailBrowser?.isConnected()) {
      return this.detachedDetailBrowser;
    }

    this.detachedDetailBrowser = await playwright.chromium.launch({
      headless: config.headless !== false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-logging',
        '--log-level=3',
      ],
    });

    return this.detachedDetailBrowser;
  }

  private async createDetachedDetailPage(config: CrawleeTaskConfig): Promise<any> {
    const browser = await this.ensureDetachedDetailBrowser(config);
    const context = await browser.newContext({
      viewport: this.getEffectiveViewport(config),
      userAgent: this.getEffectiveUserAgent(config),
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      ignoreHTTPSErrors: true,
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    return context.newPage();
  }

  private getEffectiveViewport(
    config?: Pick<CrawleeTaskConfig, 'viewport'>,
  ): { width: number; height: number } {
    const configuredWidth = Number(config?.viewport?.width);
    const configuredHeight = Number(config?.viewport?.height);

    if (configuredWidth > 0 && configuredHeight > 0) {
      return {
        width: configuredWidth,
        height: configuredHeight,
      };
    }

    return { ...DEFAULT_RUNTIME_VIEWPORT };
  }

  private getEffectiveUserAgent(
    config?: Pick<CrawleeTaskConfig, 'userAgent'>,
  ): string {
    return String(config?.userAgent || '').trim() || DEFAULT_RUNTIME_USER_AGENT;
  }

  private async closeDetachedDetailBrowser(): Promise<void> {
    if (!this.detachedDetailBrowser) return;
    await this.detachedDetailBrowser.close().catch(() => undefined);
    this.detachedDetailBrowser = null;
  }

  private applySelectorTransform(
    selectorConfig: SelectorConfig,
    rawValue: unknown,
    itemData: Record<string, any>,
    pageUrl: string,
  ): any {
    const normalizedValue =
      typeof rawValue === 'string' ? rawValue.trim() : rawValue ?? null;

    const code = selectorConfig.customTransformCode?.trim();
    if (!code) {
      return normalizedValue;
    }

    if (!isUnsafeCustomJsEnabled()) {
      throw new Error(
        `Field ${selectorConfig.name} customTransformCode is disabled by server policy`,
      );
    }

    try {
      const runner = new Function(
        'value',
        'item',
        'pageUrl',
        'rawValue',
        'helpers',
        `"use strict";\n${code}`,
      );
      const transformedValue = runner(
        normalizedValue,
        itemData,
        pageUrl,
        rawValue,
        this.createSelectorTransformHelpers(),
      );

      if (typeof transformedValue === 'undefined') {
        return normalizedValue;
      }

      const finalValue =
        typeof transformedValue === 'string'
        ? transformedValue.trim()
        : transformedValue ?? null;

      this.logger.debug(
        `Field ${selectorConfig.name} customTransformCode executed: ${String(normalizedValue)} -> ${String(finalValue)}`,
      );

      return finalValue;
    } catch (error) {
      this.logger.warn(
        `Field ${selectorConfig.name} customTransformCode execution failed; falling back to the original value`, 
        error instanceof Error ? error.stack : String(error),
      );
      return normalizedValue;
    }
  }

  private createSelectorTransformHelpers() {
    return {
      pixivImageToOriginal: (value: unknown, preferredExtension?: string) =>
        this.normalizePixivImageUrl(value, preferredExtension),
    };
  }

  private normalizePixivImageUrl(
    value: unknown,
    preferredExtension?: string,
  ): unknown {
    if (typeof value !== 'string' || !value.trim()) {
      return value ?? null;
    }

    let output = value.trim();

    if (!/pximg\.net/i.test(output)) {
      return output;
    }

    output = output
      .replace(/\/c\/[^/]+\//i, '/')
      .replace(/\/img-master\//i, '/img-original/')
      .replace(/\/custom-thumb\//i, '/img-original/');

    const normalizedExtension =
      typeof preferredExtension === 'string' && preferredExtension.trim()
        ? preferredExtension.startsWith('.')
          ? preferredExtension.trim()
          : `.${preferredExtension.trim()}`
        : null;

    if (normalizedExtension) {
      output = output
        .replace(/_square\d+\.[a-z0-9]+$/i, normalizedExtension)
        .replace(/_custom\d+\.[a-z0-9]+$/i, normalizedExtension)
        .replace(/_master\d+\.[a-z0-9]+$/i, normalizedExtension);
    }

    return output;
  }

  private hasMeaningfulValue(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.some((item) => this.hasMeaningfulValue(item));
    }

    return !(
      value === null ||
      value === undefined ||
      value === '' ||
      value === 'null'
    );
  }

  private hasMeaningfulItemData(itemData: Record<string, any>): boolean {
    return Object.values(itemData).some((value) => this.hasMeaningfulValue(value));
  }

  private shouldRetrySelectorValue(
    selectorConfig: SelectorConfig,
    value: unknown,
  ): boolean {
    return (
      !this.hasMeaningfulValue(value) ||
      this.isLikelyGlobalNavigationValue(selectorConfig.type, value)
    );
  }

  private getEmptyValueRetryCount(config: CrawleeTaskConfig): number {
    return Math.max(0, Math.min(config.maxRetries ?? 2, 2));
  }

  private getRetryDelayMs(
    config: CrawleeTaskConfig,
    attempt: number,
  ): number {
    const configuredInterval =
      typeof config.requestInterval === 'number' &&
      Number.isFinite(config.requestInterval)
        ? config.requestInterval
        : 400;
    const baseDelay = Math.max(200, Math.min(2000, configuredInterval));
    return Math.round(baseDelay * Math.min(1 + (attempt - 1) * 0.25, 2));
  }

  private async waitBeforeRetry(page: any, delayMs: number): Promise<void> {
    if (!page || page?.isClosed?.()) {
      return;
    }

    await page
      .waitForLoadState('networkidle', { timeout: Math.min(delayMs, 1500) })
      .catch(() => undefined);
    await page.waitForTimeout(delayMs).catch(() => undefined);
  }

  private async waitBeforeNavigation(
    page: any,
    config: CrawleeTaskConfig,
  ): Promise<void> {
    if (!page || page?.isClosed?.()) {
      return;
    }

    const delayMs = Math.max(
      0,
      Math.min(Number(config.requestInterval) || 0, 10_000),
    );

    if (delayMs > 0) {
      await page.waitForTimeout(delayMs).catch(() => undefined);
    }
  }

  private async waitForPageSettled(
    page: any,
    timeoutMs: number,
    extraDelayMs = 500,
  ): Promise<void> {
    if (!page || page?.isClosed?.()) {
      return;
    }

    const timeout = Math.max(500, Math.min(timeoutMs || 5000, 10000));

    await page
      .waitForLoadState('domcontentloaded', { timeout: Math.min(timeout, 5000) })
      .catch(() => undefined);
    await page
      .waitForLoadState('networkidle', { timeout })
      .catch(() => undefined);

    if (extraDelayMs > 0) {
      await page.waitForTimeout(extraDelayMs).catch(() => undefined);
    }
  }

  private async waitForReadySelector(
    page: any,
    selector: string | undefined,
    timeoutMs: number,
    state: 'attached' | 'visible' = 'attached',
  ): Promise<boolean> {
    const normalizedSelector = String(selector || '').trim();
    if (!normalizedSelector || !page || page?.isClosed?.()) {
      return false;
    }

    try {
      await this.getLocatorFromSelector(page, normalizedSelector)
        .first()
        .waitFor({
          state,
          timeout: Math.max(500, Math.min(timeoutMs || 5000, 30000)),
        });
      return true;
    } catch (error) {
      this.logger.debug(
        `Ready selector ${normalizedSelector} did not become ${state}: ${
          error instanceof Error ? error.message : String(error || 'unknown')
        }`,
      );
      return false;
    }
  }

  private async applyConfiguredCookies(
    page: any,
    targetUrl: string,
    config: CrawleeTaskConfig,
  ): Promise<void> {
    if (!config.useCookie || !config.cookieString || !page?.context) {
      return;
    }

    const cookies = createPlaywrightCookies(
      config.cookieString,
      targetUrl,
      config.cookieDomain,
    );

    if (cookies.length === 0) {
      return;
    }

    await page
      .context()
      .addCookies(
        cookies as unknown as Parameters<playwright.BrowserContext['addCookies']>[0],
      )
      .catch((error) => {
        this.logger.warn(
          `Failed to apply configured cookies for ${targetUrl}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  private getDetailItemConcurrency(
    config: CrawleeTaskConfig,
    itemCount: number,
    totalRequests = 1,
  ): number {
    if (itemCount <= 1) {
      return 1;
    }

    const configuredConcurrency = Math.max(1, config.maxConcurrency || 1);
    const perRequestBudget =
      totalRequests > 1
        ? Math.max(1, Math.floor(configuredConcurrency / totalRequests))
        : configuredConcurrency;

    return Math.max(1, Math.min(itemCount, perRequestBudget, 4));
  }

  private async mapWithConcurrencyLimit<T>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<void>,
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const limit = Math.max(1, Math.min(concurrency || 1, items.length));
    let currentIndex = 0;

    const worker = async () => {
      while (true) {
        const index = currentIndex++;
        if (index >= items.length) {
          return;
        }
        await mapper(items[index], index);
      }
    };

    await Promise.all(
      Array.from({ length: limit }, async () => {
        await worker();
      }),
    );
  }

  private async extractSelectorValueFromDetailPageWithRetries(
    detailPage: any,
    selectorConfig: SelectorConfig,
    itemData: Record<string, any>,
    config: CrawleeTaskConfig,
  ): Promise<any> {
    let value = await this.extractSelectorValueFromDetailPage(
      detailPage,
      selectorConfig,
      itemData,
    );
    const retryCount = this.getEmptyValueRetryCount(config);

    for (
      let attempt = 1;
      attempt <= retryCount &&
      this.shouldRetrySelectorValue(selectorConfig, value);
      attempt++
    ) {
      const retryDelayMs = this.getRetryDelayMs(config, attempt);
      this.logger.debug(
        `Detail field ${selectorConfig.name} retry ${attempt}: current value ${value ?? 'null'}`,
      );
      await this.waitBeforeRetry(detailPage, retryDelayMs);
      if (detailPage?.isClosed?.()) {
        break;
      }
      value = await this.extractSelectorValueFromDetailPage(
        detailPage,
        selectorConfig,
        itemData,
      );
    }

    return this.shouldRetrySelectorValue(selectorConfig, value) ? null : value;
  }

  private isSameUrl(left: string, right: string): boolean {
    if (!left || !right) return false;
    if (left === right) return true;

    const decodeSafe = (value: string) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };

    if (decodeSafe(left) === decodeSafe(right)) {
      return true;
    }

    try {
      const leftUrl = new URL(left);
      const rightUrl = new URL(right);
      leftUrl.hash = '';
      rightUrl.hash = '';
      return (
        leftUrl.href === rightUrl.href ||
        decodeSafe(leftUrl.href) === decodeSafe(rightUrl.href)
      );
    } catch {
      return false;
    }
  }

  private async executeBehaviorSteps(
    page: any,
    config: CrawleeTaskConfig,
  ): Promise<Record<string, any>[]> {
    const context: BehaviorExecutionContext = {
      page,
      results: [],
      config,
    };

    await this.executeBehaviorStepList(config.behaviorSteps || [], context);
    return this.collectBehaviorContextResults(context);
  }

  private async executeBehaviorStepList(
    steps: BehaviorStep[],
    context: BehaviorExecutionContext,
  ): Promise<void> {
    for (const step of steps) {
      await this.executeBehaviorStep(step, context);
    }
  }

  private async executeBehaviorStep(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<void> {
    switch (step.type) {
      case 'open':
        await this.runBehaviorOpenStep(step, context);
        break;
      case 'click':
        await this.runBehaviorClickStep(step, context);
        break;
      case 'type':
        await this.runBehaviorTypeStep(step, context);
        break;
      case 'wait':
        await this.runBehaviorWaitStep(step, context);
        break;
      case 'extract':
        await this.runBehaviorExtractStep(step, context);
        break;
      case 'scroll':
        await this.runBehaviorScrollStep(step, context);
        break;
      case 'loop':
        await this.runBehaviorLoopStep(step, context);
        break;
      case 'condition':
        await this.runBehaviorConditionStep(step, context);
        break;
      case 'customJS':
        await this.runBehaviorCustomJSStep(step, context);
        break;
      default:
        this.logger.warn(`Unsupported behavior step type: ${step.type}`);
        break;
    }

    if (step.waitAfter && step.waitAfter > 0) {
      await context.page.waitForTimeout(step.waitAfter);
    }
  }

  private getBehaviorStepTimeout(
    step: Pick<BehaviorStep, 'timeout'>,
    config: CrawleeTaskConfig,
    fallback = 10_000,
  ): number {
    return Math.max(
      0,
      Number(step.timeout ?? config.waitForTimeout ?? fallback) || fallback,
    );
  }

  private resolveBehaviorTemplate(
    template: string | undefined,
    currentItem?: Record<string, any>,
  ): string {
    const source = String(template ?? '');
    if (!source.includes('{{')) {
      return source;
    }

    return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, fieldPath) => {
      const value = this.getNestedBehaviorValue(currentItem, String(fieldPath));
      return value === null || value === undefined ? '' : String(value);
    });
  }

  private getNestedBehaviorValue(
    item: Record<string, any> | undefined,
    fieldPath: string,
  ): unknown {
    if (!item || !fieldPath) {
      return undefined;
    }

    return fieldPath.split('.').reduce<unknown>((current, segment) => {
      if (!segment) {
        return current;
      }

      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[segment];
      }

      return undefined;
    }, item);
  }

  private toBehaviorXPathSelector(
    selector: string,
    scoped: boolean,
  ): string {
    let normalized = selector.trim();
    if (normalized.startsWith('xpath=')) {
      return normalized;
    }

    if (scoped) {
      if (normalized.startsWith('//')) {
        normalized = `.${normalized}`;
      }
    } else if (
      normalized.startsWith('.//') ||
      normalized.startsWith('./')
    ) {
      normalized = normalized.slice(1);
    }

    return `xpath=${normalized}`;
  }

  private getBehaviorLocator(
    context: BehaviorExecutionContext,
    selector: string,
  ): any {
    const target = context.scope || context.page;
    return target.locator(
      this.toBehaviorXPathSelector(selector, Boolean(context.scope)),
    );
  }

  private getBehaviorDefaultLocator(
    context: BehaviorExecutionContext,
    selector?: string,
  ): any {
    if (selector?.trim()) {
      return this.getBehaviorLocator(context, selector);
    }

    if (context.scope) {
      return context.scope;
    }

    return context.page.locator('body');
  }

  private ensureBehaviorCurrentItem(
    context: BehaviorExecutionContext,
  ): Record<string, any> {
    if (!context.currentItem) {
      context.currentItem = {};
    }

    if (!context.results.includes(context.currentItem)) {
      context.results.push(context.currentItem);
    }

    return context.currentItem;
  }

  private collectBehaviorContextResults(
    context: BehaviorExecutionContext,
  ): Record<string, any>[] {
    const results = [...context.results];
    if (
      context.currentItem &&
      !results.includes(context.currentItem) &&
      Object.keys(context.currentItem).length > 0
    ) {
      results.push(context.currentItem);
    }
    return results;
  }

  private async runBehaviorOpenStep(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<void> {
    const url = this.resolveBehaviorTemplate(
      step.url || context.page.url(),
      context.currentItem,
    ).trim();
    if (!url) {
      return;
    }

    const timeout = this.getBehaviorStepTimeout(step, context.config, 60_000);
    const waitUntil =
      step.waitUntil === 'networkidle' ? 'networkidle' : 'domcontentloaded';

    await this.applyConfiguredCookies(context.page, url, context.config);
    await this.waitBeforeNavigation(context.page, context.config);
    await context.page.goto(url, {
      waitUntil,
      timeout,
    });
    context.scope = undefined;
  }

  private async runBehaviorClickStep(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<void> {
    if (!step.selector?.trim()) {
      return;
    }

    const timeout = this.getBehaviorStepTimeout(step, context.config);
    const target = this.getBehaviorLocator(context, step.selector).first();
    await target.waitFor({ state: 'visible', timeout });
    await target.click({ timeout });
  }

  private async runBehaviorTypeStep(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<void> {
    if (!step.selector?.trim()) {
      return;
    }

    const timeout = this.getBehaviorStepTimeout(step, context.config);
    const value = this.resolveBehaviorTemplate(step.value, context.currentItem);
    const target = this.getBehaviorLocator(context, step.selector).first();
    await target.waitFor({ state: 'visible', timeout });
    await target.fill(value, { timeout });
  }

  private async runBehaviorWaitStep(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<void> {
    const timeout = this.getBehaviorStepTimeout(step, context.config);

    if (step.waitUntil === 'timeout' || (!step.selector && !step.waitUntil)) {
      await context.page.waitForTimeout(timeout || 1000);
      return;
    }

    if (step.waitUntil === 'networkidle') {
      await context.page.waitForLoadState('networkidle', { timeout });
      return;
    }

    if (!step.selector?.trim()) {
      await context.page.waitForTimeout(timeout || 1000);
      return;
    }

    const target = this.getBehaviorLocator(context, step.selector).first();
    await target.waitFor({
      state:
        step.waitUntil === 'attached' || step.waitUntil === 'hidden'
          ? step.waitUntil
          : 'visible',
      timeout,
    });
  }

  private async runBehaviorExtractStep(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<void> {
    const field = String(step.field || '').trim();
    if (!field) {
      return;
    }

    const item = this.ensureBehaviorCurrentItem(context);
    item[field] = await this.extractBehaviorStepValue(step, context);
  }

  private async extractBehaviorStepValue(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<any> {
    const locator = this.getBehaviorDefaultLocator(context, step.selector);
    const count = Math.min(await locator.count(), 50);
    const values: unknown[] = [];

    for (let index = 0; index < count; index++) {
      const value = await this.extractBehaviorValueFromLocator(
        locator.nth(index),
        step.extractType || 'text',
        step.attribute,
      );
      if (this.hasMeaningfulValue(value)) {
        values.push(value);
      }
    }

    if (values.length === 0) {
      return null;
    }

    if (values.length === 1) {
      return values[0];
    }

    return values;
  }

  private async extractBehaviorValueFromLocator(
    locator: any,
    extractType: BehaviorExtractType,
    attribute?: string,
  ): Promise<any> {
    if (extractType === 'text') {
      return locator.evaluate((el: HTMLElement) => el.innerText?.trim() || '');
    }

    if (extractType === 'html') {
      const html = await locator.evaluate((el: HTMLElement) => el.innerHTML || '');
      return formatHtmlFragment(html);
    }

    if (extractType === 'markdown') {
      const html = await locator.evaluate((el: HTMLElement) => el.innerHTML || '');
      return CrawleeEngineService.convertHtmlToMarkdown(
        formatHtmlFragment(html),
      );
    }

    if (extractType === 'link') {
      return locator.evaluate((el: Element) =>
        el.getAttribute('href') || (el as HTMLAnchorElement).href || '',
      );
    }

    if (extractType === 'image') {
      return locator.evaluate((el: Element) => {
        const image = el as HTMLImageElement;
        return (
          image.currentSrc ||
          image.src ||
          el.getAttribute('src') ||
          el.getAttribute('data-src') ||
          ''
        );
      });
    }

    return locator.evaluate(
      (el: Element, attr: string | undefined) =>
        (attr ? el.getAttribute(attr) : null) ?? '',
      attribute,
    );
  }

  private async runBehaviorScrollStep(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<void> {
    const loops = Math.max(1, step.maxLoops || 1);
    const distance = Number(step.value) || 1000;
    const waitMs = Math.max(0, step.waitAfter || 400);

    if (step.selector?.trim()) {
      const target = this.getBehaviorLocator(context, step.selector).first();
      for (let index = 0; index < loops; index++) {
        await target.evaluate(
          (el: Element, amount: number) => {
            const scrollable = el as HTMLElement;
            scrollable.scrollTop += amount;
          },
          distance,
        );
        if (waitMs > 0) {
          await context.page.waitForTimeout(waitMs);
        }
      }
      return;
    }

    for (let index = 0; index < loops; index++) {
      await context.page.mouse.wheel(0, distance);
      if (waitMs > 0) {
        await context.page.waitForTimeout(waitMs);
      }
    }
  }

  private async runBehaviorLoopStep(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<void> {
    if (!step.children?.length) {
      return;
    }

    const collected: Record<string, any>[] = [];

    if (step.loopMode === 'times') {
      const iterations = Math.max(1, step.maxLoops || 1);
      for (let index = 0; index < iterations; index++) {
        const childContext: BehaviorExecutionContext = {
          page: context.page,
          scope: context.scope,
          currentItem: undefined,
          results: [],
          config: context.config,
        };
        await this.executeBehaviorStepList(step.children, childContext);
        collected.push(...this.collectBehaviorContextResults(childContext));
      }
    } else {
      if (!step.selector?.trim()) {
        return;
      }

      const baseLocator = this.getBehaviorLocator(context, step.selector);
      const total = await baseLocator.count();
      const limit = step.maxLoops ? Math.min(total, step.maxLoops) : total;

      for (let index = 0; index < limit; index++) {
        const childContext: BehaviorExecutionContext = {
          page: context.page,
          scope: baseLocator.nth(index),
          currentItem: undefined,
          results: [],
          config: context.config,
        };
        await this.executeBehaviorStepList(step.children, childContext);
        collected.push(...this.collectBehaviorContextResults(childContext));
      }
    }

    if (step.outputKey?.trim() && context.currentItem) {
      context.currentItem[step.outputKey.trim()] = collected;
      return;
    }

    context.results.push(...collected);
  }

  private async runBehaviorConditionStep(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<void> {
    const passed = await this.evaluateBehaviorCondition(step, context);
    await this.executeBehaviorStepList(
      passed ? step.children || [] : step.elseChildren || [],
      context,
    );
  }

  private async evaluateBehaviorCondition(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<boolean> {
    if (step.conditionType === 'customJS') {
      return Boolean(await this.executeBehaviorCustomCode(step.code, context));
    }

    const locator = step.selector?.trim()
      ? this.getBehaviorLocator(context, step.selector)
      : this.getBehaviorDefaultLocator(context);

    if (step.conditionType === 'not_exists') {
      return (await locator.count()) === 0;
    }

    if (step.conditionType === 'text_contains') {
      const actualText = String(
        await this.extractBehaviorValueFromLocator(locator.first(), 'text'),
      ).toLowerCase();
      const expectedText = this.resolveBehaviorTemplate(
        step.conditionValue,
        context.currentItem,
      ).toLowerCase();
      return actualText.includes(expectedText);
    }

    return (await locator.count()) > 0;
  }

  private async runBehaviorCustomJSStep(
    step: BehaviorStep,
    context: BehaviorExecutionContext,
  ): Promise<void> {
    const result = await this.executeBehaviorCustomCode(step.code, context);

    if (Array.isArray(result)) {
      for (const item of result) {
        if (item && typeof item === 'object') {
          context.results.push(item as Record<string, any>);
        }
      }
      return;
    }

    if (!result || typeof result !== 'object') {
      return;
    }

    if (context.currentItem) {
      Object.assign(this.ensureBehaviorCurrentItem(context), result);
      return;
    }

    context.results.push(result as Record<string, any>);
  }

  private async executeBehaviorCustomCode(
    code: string | undefined,
    context: BehaviorExecutionContext,
  ): Promise<any> {
    const source = String(code ?? '').trim();
    if (!source) {
      return undefined;
    }

    if (!isUnsafeCustomJsEnabled()) {
      throw new Error('Behavior custom JavaScript is disabled by server policy');
    }

    const helpers = {
      wait: async (ms: number) => context.page.waitForTimeout(Math.max(0, ms || 0)),
      locator: (selector: string) => this.getBehaviorLocator(context, selector),
      readText: async (selector?: string) =>
        this.extractBehaviorStepValue(
          { type: 'extract', extractType: 'text', selector },
          context,
        ),
      extract: async (
        selector: string | undefined,
        extractType: BehaviorExtractType = 'text',
        attribute?: string,
      ) =>
        this.extractBehaviorStepValue(
          { type: 'extract', selector, extractType, attribute },
          context,
        ),
      push: (item: Record<string, any>) => {
        if (item && typeof item === 'object') {
          context.results.push(item);
        }
      },
      resolve: (template: string) =>
        this.resolveBehaviorTemplate(template, context.currentItem),
    };

    const runner = new Function(
      'page',
      'scope',
      'item',
      'results',
      'helpers',
      `"use strict"; return (async () => { ${source} })();`,
    );

    return runner(
      context.page,
      context.scope,
      context.currentItem,
      context.results,
      helpers,
    );
  }

  private toPlaywrightSelector(
    selector: string,
  ): string {
    const normalized = selector.trim();
    if (
      normalized.startsWith('xpath=') ||
      normalized.startsWith('//') ||
      normalized.startsWith('.//') ||
      normalized.startsWith('./')
    ) {
      return normalized.startsWith('xpath=')
        ? normalized
        : `xpath=${normalized.startsWith('.') ? normalized.substring(1) : normalized}`;
    }
    return normalized;
  }

  private shouldIgnorePreActionError(
    error: unknown,
    ignoreMissingTargets?: boolean,
  ): boolean {
    if (!ignoreMissingTargets) {
      return false;
    }

    const message =
      error instanceof Error ? error.message : String(error || '');

    return (
      /locator\.waitFor: Timeout/i.test(message) ||
      /locator\.click: Timeout/i.test(message) ||
      /waiting for locator/i.test(message) ||
      /element is not attached to the dom/i.test(message) ||
      /element is not visible/i.test(message)
    );
  }

  private async executePreActions(
    page: any,
    actions: PreActionConfig[],
    defaultTimeout: number,
    options?: {
      ignoreMissingTargets?: boolean;
    },
  ): Promise<void> {
    for (const action of actions) {
      const timeout = action.timeout ?? defaultTimeout;

      if (action.type === 'wait_for_timeout') {
        const waitTime = Math.max(0, action.timeout ?? 1000);
        await page.waitForTimeout(waitTime);
        continue;
      }

      if (!action.selector) {
        this.logger.warn(`Pre-action ${action.type} is missing a selector and was skipped`);
        continue;
      }

      const finalSelector = this.toPlaywrightSelector(action.selector);
      try {
        if (action.type === 'click') {
          const target = page.locator(finalSelector).first();
          await target.waitFor({ state: 'visible', timeout });
          await target.click({ timeout });
          await this.waitForPageSettled(page, timeout, 300);
          continue;
        }

        if (action.type === 'type') {
          const target = page.locator(finalSelector).first();
          await target.waitFor({ state: 'visible', timeout });
          await target.fill(String(action.value ?? ''), { timeout });
          await this.waitForPageSettled(page, timeout, 200);
          continue;
        }

        if (action.type === 'wait_for_selector') {
          await page
            .locator(finalSelector)
            .first()
            .waitFor({ state: 'visible', timeout });
          continue;
        }

        this.logger.warn(`Unsupported pre-action type: ${action.type}`);
      } catch (error) {
        if (this.shouldIgnorePreActionError(error, options?.ignoreMissingTargets)) {
          this.logger.warn(
            `Optional pre-action ${action.type} skipped for selector ${action.selector}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }

        throw error;
      }
    }
  }

  private getLocatorFromSelector(page: any, selector: string): any {
    if (this.isXPathSelector(selector)) {
      return page.locator(`xpath=${this.toPageLevelXPath(selector)}`);
    }
    return page.locator(selector);
  }

  private async getElementSignature(locator: any): Promise<string | null> {
    return locator
      .evaluate((element: Element) => {
        const target = element as HTMLElement;
        return [
          target.getAttribute('href') || '',
          target.getAttribute('src') || '',
          target.textContent || '',
          target.outerHTML || '',
        ].join('||');
      })
      .catch(() => null);
  }

  private setExtractedFieldValue(
    itemData: Record<string, any>,
    selectorConfig: SelectorConfig,
    value: unknown,
  ) {
    itemData[selectorConfig.name] = value;
  }

  private getParentLinkValue(
    itemData: Record<string, any>,
    parentLink?: string,
  ): string | null {
    const namedValue = itemData[parentLink || ''];
    return typeof namedValue === 'string' && namedValue.trim()
      ? namedValue
      : null;
  }

  private assertUniqueSelectorNames(config: CrawleeTaskConfig): void {
    const counts = new Map<string, number>();
    const register = (value: unknown) => {
      const name = String(value ?? '').trim();
      if (!name) {
        return;
      }

      counts.set(name, (counts.get(name) || 0) + 1);
    };

    for (const selector of config.selectors || []) {
      register(selector?.name);
    }

    for (const context of config.nestedContexts || []) {
      for (const selector of context?.selectors || []) {
        register(selector?.name);
      }
    }

    const duplicates = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name);

    if (duplicates.length > 0) {
      throw new Error(`字段名不能重复: ${duplicates.join(', ')}`);
    }
  }

  private async resolveNextPageLocator(
    page: any,
    selector: string,
  ): Promise<{ locator: any; matchCount: number } | null> {
    const locator = this.getLocatorFromSelector(page, selector);
    const matchCount = await locator.count();
    if (matchCount === 0) {
      return null;
    }

    const inspectFrom = Math.max(0, matchCount - 120);
    const currentUrl = page.url();
    const rankedCandidates: Array<{ index: number; score: number; top: number }> = [];

    for (let index = inspectFrom; index < matchCount; index++) {
      const candidate = locator.nth(index);
      const metadata = await candidate
        .evaluate((element: Element) => {
          const target = element as HTMLElement;
          const style = window.getComputedStyle(target);
          const rect = target.getBoundingClientRect();
          const text = (target.innerText || target.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
          const ariaLabel = target.getAttribute('aria-label') || '';
          const title = target.getAttribute('title') || '';
          const rel = target.getAttribute('rel') || '';
          const className = target.getAttribute('class') || '';
          const descriptor = [text, ariaLabel, title, rel, className]
            .join(' ')
            .toLowerCase();
          const disabled =
            target.getAttribute('disabled') !== null ||
            target.getAttribute('aria-disabled') === 'true' ||
            target.classList.contains('disabled') ||
            target.getAttribute('aria-current') === 'page';
          const visible =
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none';

          return {
            disabled,
            visible,
            descriptor,
            href: target.getAttribute('href') || '',
            inNavigation: Boolean(
              target.closest(
                'nav,[role="navigation"],[aria-label*="pagination"],[class*="pagination"],[class*="pager"]',
              ),
            ),
            top: rect.top,
          };
        })
        .catch(() => null);

      if (!metadata?.visible || metadata.disabled) {
        continue;
      }

      let score = 0;
      if (metadata.inNavigation) {
        score += 50;
      }
      if (
        /(?:\bnext\b|next\s*page|下一页|下页|下一個|下一个|后一页|後一頁|更多|load\s*more|more|›|»|→)/i.test(
          metadata.descriptor,
        )
      ) {
        score += 120;
      }
      if (metadata.href && metadata.href !== currentUrl) {
        score += 10;
      }

      rankedCandidates.push({
        index,
        score,
        top: Number(metadata.top || 0),
      });
    }

    if (rankedCandidates.length === 0) {
      return null;
    }

    rankedCandidates.sort(
      (left, right) =>
        right.score - left.score || right.top - left.top || right.index - left.index,
    );

    return {
      locator: locator.nth(rankedCandidates[0].index),
      matchCount,
    };
  }

  private async extractItemsByBaseSelector(
    page: any,
    baseSelector: string,
    selectors: SelectorConfig[],
    maxItems?: number,
    config?: CrawleeTaskConfig,
  ): Promise<Record<string, any>[]> {
    const baseLocator = this.getLocatorFromSelector(page, baseSelector);
    const total = await baseLocator.count();
    const limit = maxItems ? Math.min(total, maxItems) : total;
    const items: Record<string, any>[] = [];

    for (let i = 0; i < limit; i++) {
      const baseElement = baseLocator.nth(i);
      const itemData: Record<string, any> = {};
      for (const selector of selectors) {
        if (config) {
          await this.extractDataFromElementWithRetries(
            baseElement,
            selector,
            itemData,
            page,
            config,
          );
        } else {
          await this.extractDataFromElement(baseElement, selector, itemData, page);
        }
      }
      if (this.hasMeaningfulItemData(itemData)) {
        items.push(itemData);
      }
    }

    return items;
  }

  private async maybeScrollForNested(page: any, ctx: NestedExtractContext): Promise<void> {
    if (!ctx.scroll) return;
    const maxScroll = Math.max(1, ctx.scroll.maxScroll || 1);
    const waitTime = Math.max(0, ctx.scroll.waitTime || 1000);
    for (let i = 0; i < maxScroll; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(waitTime);
    }
  }

  private async advanceToNextPage(
    page: any,
    selector: string | undefined,
    timeout: number,
    contentReadySelector?: string,
  ): Promise<boolean> {
    const normalizedSelector = String(selector || '').trim();
    if (!normalizedSelector) {
      return false;
    }

    try {
      const candidate = await this.resolveNextPageLocator(page, normalizedSelector);
      if (!candidate) {
        return false;
      }
      const locator = candidate.locator;
      const changeTimeout = Math.max(1500, Math.min(timeout, 12000));

      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      await locator.waitFor({ state: 'visible', timeout });
      const previousUrl = page.url();
      let previousFirstItemSignature: string | null = null;

      if (contentReadySelector) {
        const contentLocator = this.getLocatorFromSelector(page, contentReadySelector).first();
        previousFirstItemSignature = await this.getElementSignature(contentLocator);
      }

      await locator.click({ timeout });

      const urlChangedByWaiter = await page
        .waitForFunction(
          (previous: string) => window.location.href !== previous,
          previousUrl,
          { timeout: changeTimeout },
        )
        .then(() => true)
        .catch(() => false);

      let contentChangedByWaiter = false;
      if (contentReadySelector && previousFirstItemSignature) {
        contentChangedByWaiter = await page
          .waitForFunction(
            ({ selector: readySelector, previousSignature }) => {
              const locateElement = (input: string): Element | null => {
                if (input.startsWith('//')) {
                  return document.evaluate(
                    input,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null,
                  ).singleNodeValue as Element | null;
                }
                if (input.startsWith('.//') || input.startsWith('./')) {
                  return document.evaluate(
                    input.substring(1),
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null,
                  ).singleNodeValue as Element | null;
                }
                return document.querySelector(input);
              };

              const element = locateElement(readySelector);
              if (!element) {
                return false;
              }

              const target = element as HTMLElement;
              const currentSignature = [
                target.getAttribute('href') || '',
                target.getAttribute('src') || '',
                target.textContent || '',
                target.outerHTML || '',
              ].join('||');
              return currentSignature !== previousSignature;
            },
            {
              selector: contentReadySelector,
              previousSignature: previousFirstItemSignature,
            },
            { timeout: changeTimeout },
          )
          .then(() => true)
          .catch(() => false);
      }

      await this.waitForPageSettled(
        page,
        Math.min(timeout, 10000),
        candidate.matchCount > 1 ? 500 : 300,
      );

      const currentUrl = page.url();
      const urlChanged = urlChangedByWaiter || !this.isSameUrl(previousUrl, currentUrl);

      let contentChanged = contentChangedByWaiter;
      if (!contentChanged && contentReadySelector && previousFirstItemSignature) {
        const currentSignature = await this.getElementSignature(
          this.getLocatorFromSelector(page, contentReadySelector).first(),
        );
        contentChanged = Boolean(
          currentSignature && currentSignature !== previousFirstItemSignature,
        );
      }

      if (!urlChanged && !contentChanged) {
        this.logger.debug(
          `Next-page selector ${normalizedSelector} did not change the page state`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.debug(
        `Failed to advance by next selector ${normalizedSelector}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  private getNestedOutputKey(ctx: NestedExtractContext): string {
    const configured = String(ctx.listOutputKey || '').trim();
    if (configured) {
      return configured;
    }

    const parentLink = String(ctx.parentLink || '').trim().replace(/\s+/g, '_');
    return parentLink ? `${parentLink}_items` : 'items';
  }

  private async extractConfiguredListItemsFromCurrentPage(
    page: any,
    config: CrawleeTaskConfig,
  ): Promise<Record<string, any>[]> {
    await this.waitForReadySelector(
      page,
      config.baseSelector,
      config.waitForTimeout || config.navigationTimeout || 30000,
      'attached',
    );
    await this.waitForPageSettled(
      page,
      config.waitForTimeout || config.navigationTimeout || 30000,
      200,
    );

    let baseElements;
    if (this.isXPathSelector(config.baseSelector)) {
      const xpathSelector = this.toPageLevelXPath(config.baseSelector || '');
      baseElements = page.locator(`xpath=${xpathSelector}`);
      this.logger.log(`使用 XPath 基础选择器: ${xpathSelector}`);
    } else {
      baseElements = page.locator(config.baseSelector || '');
      this.logger.log(`使用 CSS 基础选择器: ${config.baseSelector}`);
    }

    const itemCount = await baseElements.count();
    this.logger.log(`基础项总数: ${itemCount}, 提取上限: ${config.maxItems ?? itemCount}`);

    const maxExtract = config.maxItems ? Math.min(itemCount, config.maxItems) : itemCount;
    const listItemsData: Record<string, any>[] = [];

    for (let i = 0; i < maxExtract; i++) {
      const itemData: Record<string, any> = {};
      const baseElement = baseElements.nth(i);
      const elementExists = (await baseElement.count()) > 0;

      if (!elementExists) {
        this.logger.warn(`第 ${i + 1} 个基础元素不存在，已跳过`);
        continue;
      }

      const directSelectors = (config.selectors || []).filter(
        (selector) => !selector.parentLink,
      );
      for (const selectorConfig of directSelectors) {
        await this.extractDataFromElementWithRetries(
          baseElement,
          selectorConfig,
          itemData,
          page,
          config,
        );
      }

      if (this.hasMeaningfulItemData(itemData)) {
        listItemsData.push(itemData);
      }
    }

    return listItemsData;
  }

  private async enrichCollectedItemsWithDetailData(
    items: Record<string, any>[],
    config: CrawleeTaskConfig,
    totalRequests: number,
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const childSelectors = (config.selectors || []).filter(
      (selector) => selector.parentLink,
    );
    if (childSelectors.length > 0) {
      const detailItemConcurrency = this.getDetailItemConcurrency(
        config,
        items.length,
        totalRequests,
      );
      const childSelectorsByLinkField = new Map<
        string,
        {
          parentLink?: string;
          selectors: SelectorConfig[];
        }
      >();

      for (const selectorConfig of childSelectors) {
        const parentLink = String(selectorConfig.parentLink || '').trim() || undefined;
        if (!parentLink) continue;

        const existingGroup = childSelectorsByLinkField.get(parentLink);
        if (existingGroup) {
          existingGroup.selectors.push(selectorConfig);
          continue;
        }

        childSelectorsByLinkField.set(parentLink, {
          parentLink,
          selectors: [selectorConfig],
        });
      }

      await this.mapWithConcurrencyLimit(
        items,
        detailItemConcurrency,
        async (itemData) => {
          for (const group of childSelectorsByLinkField.values()) {
            const linkUrl = this.getParentLinkValue(
              itemData,
              group.parentLink,
            );
            if (linkUrl && typeof linkUrl === 'string') {
              try {
                await this.extractParentFieldsFromDetailPage(
                  linkUrl,
                  group.selectors,
                  itemData,
                  config,
                );
              } catch (error) {
                this.logger.error(
                  `Failed to extract detail fields for parentLink=${
                    group.parentLink || 'unknown'
                  }:`,
                  error instanceof Error ? error.stack : String(error),
                );
                for (const selectorConfig of group.selectors) {
                  this.setExtractedFieldValue(itemData, selectorConfig, null);
                }
              }
            } else {
              for (const selectorConfig of group.selectors) {
                this.setExtractedFieldValue(itemData, selectorConfig, null);
              }
            }
          }
        },
      );
    }

    if (config.nestedContexts?.length) {
      await this.extractNestedContextsForItems(
        items,
        config.nestedContexts,
        config,
        1,
      );
    }
  }

  private async extractConfiguredListItems(
    page: any,
    config: CrawleeTaskConfig,
    totalRequests: number,
  ): Promise<Record<string, any>[]> {
    const collectedItems: Record<string, any>[] = [];
    const maxPages = Math.max(1, config.maxPages || 1);

    for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
      if (config.scrollEnabled) {
        await page.evaluate(
          async ({ scrollDistance, scrollDelay, maxScrollDistance }) => {
            let scrolled = 0;
            while (scrolled < maxScrollDistance) {
              window.scrollBy(0, scrollDistance);
              scrolled += scrollDistance;
              await new Promise((resolve) => setTimeout(resolve, scrollDelay));
            }
          },
          {
            scrollDistance: config.scrollDistance || 1000,
            scrollDelay: config.scrollDelay || 1000,
            maxScrollDistance: config.maxScrollDistance || 10000,
          },
        );
        await page.waitForTimeout(1000);
      }

      const currentPageItems = await this.extractConfiguredListItemsFromCurrentPage(
        page,
        config,
      );
      collectedItems.push(...currentPageItems);

      if (config.maxItems && collectedItems.length >= config.maxItems) {
        break;
      }

      if (!config.nextPageSelector || pageIndex >= maxPages) {
        break;
      }

      const moved = await this.advanceToNextPage(
        page,
        config.nextPageSelector,
        config.waitForTimeout || 30000,
        config.baseSelector,
      );
      if (!moved) {
        break;
      }
    }

    const finalItems = config.maxItems
      ? collectedItems.slice(0, config.maxItems)
      : collectedItems;

    await this.enrichCollectedItemsWithDetailData(
      finalItems,
      config,
      totalRequests,
    );

    return finalItems;
  }

  private async extractNestedContextItems(
    detailUrl: string,
    ctx: NestedExtractContext,
    config: CrawleeTaskConfig,
  ): Promise<Record<string, any>[]> {
    const detailPage = await this.createDetachedDetailPage(config);
    try {
      await this.applyConfiguredCookies(detailPage, detailUrl, config);
      await this.waitBeforeNavigation(detailPage, config);
      await detailPage.goto(detailUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.navigationTimeout || 60000,
      });
      await this.waitForPageSettled(
        detailPage,
        config.waitForTimeout || config.navigationTimeout || 30000,
      );

      if (ctx.preActions?.length) {
        await this.executePreActions(
          detailPage,
          ctx.preActions,
          config.waitForTimeout || 30000,
          {
            ignoreMissingTargets: true,
          },
        );
        await this.waitForPageSettled(
          detailPage,
          config.waitForTimeout || config.navigationTimeout || 30000,
        );
      }

      const collectedItems: Record<string, any>[] = [];
      const nestedMaxPages = Math.max(1, ctx.next?.maxPages || 1);

      for (let pageIndex = 1; pageIndex <= nestedMaxPages; pageIndex++) {
        await this.maybeScrollForNested(detailPage, ctx);
        await this.waitForReadySelector(
          detailPage,
          ctx.baseSelector,
          config.waitForTimeout || config.navigationTimeout || 30000,
          'attached',
        );
        await this.waitForPageSettled(
          detailPage,
          config.waitForTimeout || config.navigationTimeout || 30000,
          200,
        );

        const items = await this.extractItemsByBaseSelector(
          detailPage,
          ctx.baseSelector,
          ctx.selectors,
          ctx.scroll?.maxItems,
          config,
        );
        collectedItems.push(...items);

        if (!ctx.next?.selector || pageIndex >= nestedMaxPages) {
          break;
        }

        const moved = await this.advanceToNextPage(
          detailPage,
          ctx.next.selector,
          config.waitForTimeout || 30000,
          ctx.baseSelector,
        );
        if (!moved) {
          break;
        }
      }

      return collectedItems;
    } finally {
      await detailPage.context().close().catch(() => undefined);
    }
  }

  private async captureTaskScreenshotFallback(
    taskId: number,
    executionId: number,
    config: CrawleeTaskConfig,
    targetUrl: string,
  ): Promise<{ filePath: string; relativePath: string } | null> {
    if (!targetUrl) {
      return null;
    }

    const page = await this.createDetachedDetailPage(config);
    try {
      await this.applyConfiguredCookies(page, targetUrl, config);
      await this.waitBeforeNavigation(page, config);
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.navigationTimeout || 60000,
      });
      await this.waitForPageSettled(
        page,
        config.waitForTimeout || config.navigationTimeout || 30000,
      );

      if (config.preActions?.length) {
        await this.executePreActions(
          page,
          config.preActions,
          config.waitForTimeout || 30000,
        );
        await this.waitForPageSettled(
          page,
          config.waitForTimeout || config.navigationTimeout || 30000,
        );
      }

      if (config.waitForSelector) {
        await page
          .waitForSelector(config.waitForSelector, {
            timeout: config.waitForTimeout || 30000,
          })
          .catch(() => undefined);
      }

      if (config.scrollEnabled) {
        await page.evaluate(
          async ({ scrollDistance, scrollDelay, maxScrollDistance }) => {
            let scrolled = 0;
            while (scrolled < maxScrollDistance) {
              window.scrollBy(0, scrollDistance);
              scrolled += scrollDistance;
              await new Promise((resolve) => setTimeout(resolve, scrollDelay));
            }
          },
          {
            scrollDistance: config.scrollDistance || 1000,
            scrollDelay: config.scrollDelay || 1000,
            maxScrollDistance: config.maxScrollDistance || 10000,
          },
        );
      }

      await this.waitForPageSettled(page, config.waitForTimeout || 5000, 800);

      const screenshotBuffer = await page.screenshot(
        this.getStoredTaskScreenshotOptions(),
      );
      const screenshotPaths = this.getScreenshotStoragePaths(taskId, executionId);
      await fs.mkdir(screenshotPaths.absoluteDir, { recursive: true });
      await fs.writeFile(screenshotPaths.absoluteFilePath, screenshotBuffer);

      return {
        filePath: screenshotPaths.absoluteFilePath,
        relativePath: screenshotPaths.relativePath,
      };
    } catch (error) {
      this.logger.warn(
        `Fallback screenshot capture failed for task ${taskId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    } finally {
      await page.context().close().catch(() => undefined);
    }
  }

  private async extractNestedContextsForItems(
    items: Record<string, any>[],
    allContexts: NestedExtractContext[],
    config: CrawleeTaskConfig,
    depth: number,
  ): Promise<void> {
    for (const item of items) {
      for (const ctx of allContexts) {
        const maxDepth = ctx.maxDepth ?? 5;
        if (depth > maxDepth) continue;

        const parentLinkValue = this.getParentLinkValue(
          item,
          ctx.parentLink,
        );
        if (!parentLinkValue || typeof parentLinkValue !== 'string') continue;

        try {
          const nestedItems = await this.extractNestedContextItems(
            parentLinkValue,
            ctx,
            config,
          );
          const outputKey = this.getNestedOutputKey(ctx);
          item[outputKey] = nestedItems;

          if (nestedItems.length > 0) {
            await this.extractNestedContextsForItems(
              nestedItems,
              allContexts,
              config,
              depth + 1,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Nested extraction failed for parentLink=${ctx.parentLink} url=${parentLinkValue}`,
            error instanceof Error ? error.stack : String(error),
          );
          const outputKey = this.getNestedOutputKey(ctx);
          if (!Array.isArray(item[outputKey])) {
            item[outputKey] = [];
          }
        }
      }
    }
  }

  /**
   * 鏇存柊鎵ц鐘舵€?   */
  private async updateExecutionStatus(
    executionId: number,
    status: string,
    log: string,
  ) {
    try {
      await this.executionRepository.update(executionId, {
        status,
        log,
        endTime: new Date(),
      });
    } catch (error) {
      this.logger.error(`更新执行状态失败 ${executionId}:`, error);
    }
  }

  private async persistTerminalExecutionStatus(
    executionId: number,
    status: 'success' | 'failed',
    log: string,
    resultPath?: string,
  ): Promise<boolean> {
    const completedAt = new Date();

    try {
      const execution = await this.executionRepository.findOne({
        where: { id: executionId },
      });

      if (execution) {
        execution.status = status;
        execution.log = log;
        execution.endTime = completedAt;
        if (typeof resultPath !== 'undefined') {
          execution.resultPath = resultPath;
        }

        await this.executionRepository.save(execution);
      } else {
        await this.executionRepository.update(executionId, {
          status,
          log,
          endTime: completedAt,
          ...(typeof resultPath !== 'undefined' ? { resultPath } : {}),
        });
      }

      const persistedExecution = await this.executionRepository.findOne({
        where: { id: executionId },
      });

      const statusMatches = persistedExecution?.status === status;
      const resultPathMatches =
        typeof resultPath === 'undefined' ||
        persistedExecution?.resultPath === resultPath;

      if (statusMatches && resultPathMatches) {
        return true;
      }

      this.logger.warn(
        `Execution ${executionId} terminal status verification mismatch. expectedStatus=${status}, actualStatus=${
          persistedExecution?.status ?? 'missing'
        }, expectedResultPath=${resultPath ?? 'unchanged'}, actualResultPath=${
          persistedExecution?.resultPath ?? 'missing'
        }`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist terminal execution status ${executionId}:`,
        error,
      );
    }

    return false;
  }

  /**
   * 璇锋眰鍋滄浠诲姟
   */
  async requestTaskStop(
    taskId: number,
    stopReason = 'Task stopped by administrator',
  ): Promise<'running' | 'queued' | 'not_found'> {
    const queuedIndex = this.taskQueue.findIndex((task) => task.taskId === taskId);
    if (queuedIndex >= 0) {
      const [queuedTask] = this.taskQueue.splice(queuedIndex, 1);
      if (queuedTask) {
        await this.finalizeStoppedTask(
          queuedTask.taskId,
          queuedTask.executionId,
          queuedTask.config,
          stopReason,
        );
        return 'queued';
      }
    }

    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      return 'not_found';
    }

    activeTask.stopRequested = true;
    activeTask.stopReason = stopReason;

    await this.updateExecutionStatus(
      activeTask.executionId,
      'stopping',
      `${stopReason} (interrupting current run...)`,
    );

    await this.taskRepository.update(taskId, {
      status: 'stopping',
      endTime: null as unknown as Date,
    });

    const taskInfo = await this.taskRepository.findOne({
      where: { id: taskId },
      select: ['id', 'name', 'url', 'userId'],
    });

    this.taskGateway.broadcastTaskUpdate({
      taskId,
      taskName: taskInfo?.name,
      taskUrl: taskInfo?.url,
      status: 'stopping',
      progress: 95,
    }, taskInfo?.userId);

    await Promise.allSettled([
      activeTask.crawler?.teardown() ?? Promise.resolve(),
      this.closeDetachedDetailBrowser(),
    ]);

    return 'running';
  }

  private startTaskStopWatcher(activeTask: ActiveCrawlerTask): NodeJS.Timeout {
    let checking = false;

    return setInterval(async () => {
      if (checking || activeTask.stopRequested || activeTask.terminalStatus) {
        return;
      }

      checking = true;
      try {
        const task = await this.taskRepository.findOne({
          where: { id: activeTask.taskId },
          select: ['id', 'status'],
        });

        if (task?.status === 'failed') {
          activeTask.stopRequested = true;
          activeTask.stopReason ||= 'Task stopped by administrator';

          await Promise.allSettled([
            activeTask.crawler?.teardown() ?? Promise.resolve(),
            this.closeDetachedDetailBrowser(),
          ]);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check stop state for task ${activeTask.taskId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        checking = false;
      }
    }, 1000);
  }

  private isTaskStopRequested(taskId: number): boolean {
    return Boolean(this.activeTasks.get(taskId)?.stopRequested);
  }

  private isTaskTerminal(taskId: number): boolean {
    return Boolean(this.activeTasks.get(taskId)?.terminalStatus);
  }

  private getTaskStopReason(taskId: number): string {
    return (
      this.activeTasks.get(taskId)?.stopReason ||
      'Task stopped by administrator'
    );
  }

  private ensureTaskNotStopped(taskId: number): void {
    if (this.isTaskStopRequested(taskId)) {
      throw new Error(this.getTaskStopReason(taskId));
    }
  }

  private async finalizeStoppedTask(
    taskId: number,
    executionId: number,
    config: CrawleeTaskConfig,
    stopReason: string,
  ): Promise<void> {
    await this.persistTerminalExecutionStatus(executionId, 'failed', stopReason);
    await this.taskRepository.update(taskId, {
      status: 'failed',
      endTime: new Date(),
    });

    const taskInfo = await this.taskRepository.findOne({
      where: { id: taskId },
      select: ['id', 'name', 'url', 'userId'],
    });

    this.taskGateway.broadcastTaskUpdate({
      taskId,
      taskName: taskInfo?.name,
      taskUrl: taskInfo?.url,
      status: 'failed',
      progress: 0,
    }, taskInfo?.userId);

    await this.sendTaskExecutionNotification({
      taskId,
      executionId,
      config,
      status: 'failed',
      log: stopReason,
    });
  }

  private async sendTaskExecutionNotification(options: {
    taskId: number;
    executionId: number;
    config: CrawleeTaskConfig;
    status: 'success' | 'failed';
    log: string;
    itemCount?: number;
    previewItems?: Record<string, any>[];
  }): Promise<void> {
    try {
      const task = await this.taskRepository.findOne({
        where: { id: options.taskId },
        relations: ['user'],
      });

      if (!task) {
        return;
      }

      await this.notificationService.createTaskExecutionNotification({
        userId: task.userId,
        taskId: task.id,
        taskName: task.name,
        executionId: options.executionId,
        status: options.status,
        log: options.log,
        itemCount: options.itemCount,
      });

      const notification = this.normalizeNotificationConfig(
        options.config.notification,
      );

      if (!this.shouldSendNotification(notification, options.status)) {
        return;
      }

      const recipient = task.user?.email?.trim();
      if (!recipient) {
        return;
      }

      const emailSettings = await this.systemSettingsService.getSetting(
        SettingKey.EMAIL,
      );
      const transportConfig = this.buildMailTransportConfig(emailSettings);
      if (!transportConfig) {
        this.logger.warn(
          `Task ${options.taskId} notification skipped because email settings are incomplete`,
        );
        return;
      }

      const subject =
        options.status === 'success'
          ? `[Crawlee] Task succeeded: ${task.name}`
          : `[Crawlee] Task failed: ${task.name}`;
      const previewCount =
        options.status === 'success' ? notification.previewCount || 0 : 0;
      const previewItems =
        previewCount > 0
          ? (options.previewItems || []).slice(0, previewCount)
          : [];
      const payload = this.buildNotificationContent({
        taskName: task.name,
        taskUrl: task.url,
        executionId: options.executionId,
        status: options.status,
        log: options.log,
        itemCount: options.itemCount,
        previewItems,
      });

      await this.mailService.sendMail(
        recipient,
        subject,
        payload.text,
        payload.html,
        transportConfig,
      );
    } catch (error) {
      this.logger.warn(
        `Task ${options.taskId} notification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private normalizeNotificationConfig(
    notification?: TaskNotificationConfig,
  ): Required<TaskNotificationConfig> {
    return {
      enabled: Boolean(notification?.enabled),
      onSuccess:
        typeof notification?.onSuccess === 'boolean'
          ? notification.onSuccess
          : true,
      onFailure:
        typeof notification?.onFailure === 'boolean'
          ? notification.onFailure
          : true,
      previewCount: Math.max(
        0,
        Math.min(10, Number(notification?.previewCount ?? 3) || 3),
      ),
    };
  }

  private shouldSendNotification(
    notification: Required<TaskNotificationConfig>,
    status: 'success' | 'failed',
  ): boolean {
    if (!notification.enabled) {
      return false;
    }

    return status === 'success'
      ? notification.onSuccess
      : notification.onFailure;
  }

  private buildMailTransportConfig(
    settings: Record<string, any> | null | undefined,
  ): MailTransportConfig | null {
    if (!settings?.enableEmail) {
      return null;
    }

    const host = String(settings.smtpHost || '').trim();
    const user = String(settings.smtpUsername || '').trim();
    const pass = String(settings.smtpPassword || '').trim();
    const fromEmail = String(settings.fromEmail || user).trim();

    if (!host || !user || !pass || !fromEmail) {
      return null;
    }

    return {
      host,
      port: Number(settings.smtpPort) || 465,
      secure:
        typeof settings.smtpSSL === 'boolean'
          ? settings.smtpSSL
          : Number(settings.smtpPort) === 465,
      user,
      pass,
      fromEmail,
      fromName: String(settings.fromName || 'Crawlee System').trim(),
    };
  }

  private buildNotificationContent(options: {
    status: 'success' | 'failed' | 'stopped';
    taskName: string;
    taskUrl: string;
    executionId: number;
    log: string;
    itemCount?: number;
    previewItems: Record<string, any>[];
  }): { text: string; html: string } {
    const statusText = options.status === 'success' ? '成功' : options.status === 'stopped' ? '已停止' : '失败';
    const summaryLines = [
      `任务名称: ${options.taskName}`,
      `任务状态: ${statusText}`,
      `执行 ID: ${options.executionId}`,
      `任务地址: ${options.taskUrl}`,
    ];

    if (typeof options.itemCount === 'number') {
      summaryLines.push(`结果条数: ${options.itemCount}`);
    }

    summaryLines.push(`详情: ${options.log}`);

    const previewText =
      options.previewItems.length > 0
        ? `\n\n结果预览:\n${options.previewItems
            .map((item, index) => `#${index + 1}\n${this.stringifyPreviewItem(item)}`)
            .join('\n\n')}`
        : '';

    const text = `${summaryLines.join('\n')}${previewText}`;
    const htmlPreview =
      options.previewItems.length > 0
        ? `<h3>结果预览</h3>${options.previewItems
            .map(
              (item, index) =>
                `<p><strong>#${index + 1}</strong></p><pre>${this.escapeHtml(this.stringifyPreviewItem(item))}</pre>`,
            )
            .join('')}`
        : '';

    const html = `
      <div>
        <h2>任务${this.escapeHtml(statusText)}通知</h2>
        <p><strong>任务名称:</strong> ${this.escapeHtml(options.taskName)}</p>
        <p><strong>任务状态:</strong> ${this.escapeHtml(statusText)}</p>
        <p><strong>执行 ID:</strong> ${options.executionId}</p>
        <p><strong>任务地址:</strong> <a href="${this.escapeHtml(options.taskUrl)}">${this.escapeHtml(options.taskUrl)}</a></p>
        ${typeof options.itemCount === 'number' ? `<p><strong>结果条数:</strong> ${options.itemCount}</p>` : ''}
        <p><strong>详情:</strong> ${this.escapeHtml(options.log)}</p>
        ${htmlPreview}
      </div>
    `;

    return { text, html };
  }
  private stringifyPreviewItem(item: Record<string, any>): string {
    const text = JSON.stringify(item, null, 2) || '{}';
    return text.length > 4000 ? `${text.slice(0, 4000)}\n...` : text;
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getQueueStatus() {
    const activeQueueItems = Array.from(this.activeTasks.values()).map((task) => ({
      taskId: task.taskId,
      executionId: task.executionId,
      status: 'running' as const,
    }));
    const waitingQueueItems = this.taskQueue.map((task) => ({
      taskId: task.taskId,
      executionId: task.executionId,
      status: 'queued' as const,
    }));

    return {
      queueLength: activeQueueItems.length + waitingQueueItems.length,
      isProcessing: this.isProcessing || activeQueueItems.length > 0,
      queuedTasks: [...activeQueueItems, ...waitingQueueItems],
    };
  }

  /**
   * 閸嬫粍顒涘鏇熸惛
   */
  async stop() {
    this.taskQueue = [];
    this.isProcessing = false;
    await Promise.allSettled(
      Array.from(this.activeTasks.values()).map((task) =>
        task.crawler?.teardown() ?? Promise.resolve(),
      ),
    );
    this.activeTasks.clear();
    if (this.crawler) {
      await this.crawler.teardown();
    }
    this.logger.log('Crawlee engine stopped');
  }
}
