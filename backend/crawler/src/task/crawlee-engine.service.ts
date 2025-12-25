import { Injectable, Logger } from '@nestjs/common';
import {
  PlaywrightCrawler,
  Dataset,
  KeyValueStore,
  RequestQueue,
} from 'crawlee';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { Execution } from '../execution/entities/execution.entity';
import { CrawleeTaskConfig, SelectorConfig } from './dto/execute-task.dto';
import { TaskGateway } from './task.gateway';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';

interface CrawlerTask {
  taskId: number;
  executionId: number;
  config: CrawleeTaskConfig;
}

@Injectable()
export class CrawleeEngineService {
  private readonly logger = new Logger(CrawleeEngineService.name);
  private taskQueue: CrawlerTask[] = [];
  private isProcessing = false;
  private crawler: PlaywrightCrawler;

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    private readonly taskGateway: TaskGateway,
  ) {
    this.initializeCrawler();
  }

  /**
   * 初始化爬虫引擎
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
        // 请求处理逻辑会在addTaskToQueue中动态设置
        console.log(`Processing ${request.url}`);
      },
    });

    this.logger.log('Crawlee引擎初始化完成');
  }

  /**
   * 添加任务到队列
   */
  async addTaskToQueue(task: CrawlerTask) {
    this.taskQueue.push(task);
    this.logger.log(
      `任务 ${task.taskId} 已添加到队列，当前队列长度: ${this.taskQueue.length}`,
    );

    // 如果没有在处理，开始处理队列
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * 处理任务队列
   */
  private async processQueue() {
    if (this.isProcessing || this.taskQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.logger.log('开始处理爬虫任务队列');

    while (this.taskQueue.length > 0) {
      const crawlerTask = this.taskQueue.shift();
      if (!crawlerTask) continue;

      try {
        await this.executeCrawlerTask(crawlerTask);
      } catch (error) {
        this.logger.error(`任务 ${crawlerTask.taskId} 执行失败:`, error);
        await this.updateExecutionStatus(
          crawlerTask.executionId,
          'failed',
          `执行失败: ${error.message}`,
        );
      }
    }

    this.isProcessing = false;
    this.logger.log('爬虫任务队列处理完成');
  }

  /**
   * 执行单个爬虫任务
   */
  private async executeCrawlerTask(crawlerTask: CrawlerTask) {
    const { taskId, executionId, config } = crawlerTask;
    this.logger.log(`开始执行任务 ${taskId}, 执行ID: ${executionId}`);

    // 更新执行状态为运行中
    await this.updateExecutionStatus(
      executionId,
      'running',
      '正在执行爬虫任务...',
    );

    try {
      // 初始化存储
      const dataset = config.datasetId
        ? await Dataset.open(config.datasetId)
        : await Dataset.open(`task-${taskId}-${Date.now()}`);

      const keyValueStore = config.keyValueStoreId
        ? await KeyValueStore.open(config.keyValueStoreId)
        : await KeyValueStore.open(`task-${taskId}-${Date.now()}`);

      // 创建请求队列
      const requestQueue = await RequestQueue.open(
        `task-${taskId}-${Date.now()}`,
      );

      // 添加URL到队列
      for (const url of config.urls) {
        await requestQueue.addRequest({ url });
      }

      // 获取任务信息用于广播
      const taskInfo = await this.taskRepository.findOne({
        where: { id: taskId },
      });

      // 保存方法的引用以在箭头函数中使用
      const updateExecutionStatus = this.updateExecutionStatus.bind(this);
      const broadcastTaskUpdate = this.taskGateway.broadcastTaskUpdate.bind(
        this.taskGateway,
      );
      const logger = this.logger;

      // 创建专用的crawler实例
      const taskCrawler = new PlaywrightCrawler({
        requestQueue,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl || 1,
        maxConcurrency: config.maxConcurrency || 1,
        launchContext: {
          launchOptions: {
            headless: config.headless !== false,
            args: config.proxyUrl
              ? [`--proxy-server=${config.proxyUrl}`]
              : undefined,
          },
        },
        async requestHandler({ request, page, response }) {
          const requestIndex = config.urls.indexOf(request.url) + 1;
          const totalRequests = config.urls.length;
          const progress = Math.round((requestIndex / totalRequests) * 100);
          const progressMessage = `正在处理请求 ${requestIndex}/${totalRequests}: ${request.url}`;

          // 更新进度日志
          await updateExecutionStatus(
            executionId,
            'running',
            `${progressMessage} - 已处理 ${requestIndex - 1}/${totalRequests} 个请求`,
          );

          // 广播任务进度更新
          broadcastTaskUpdate({
            taskId,
            taskName: taskInfo?.name,
            taskUrl: taskInfo?.url,
            status: 'running',
            progress,
          });

          try {
            // 设置视口
            if (config.viewport) {
              await page.setViewportSize(config.viewport);
            }

            // 设置用户代理
            if (config.userAgent) {
              await page.setExtraHTTPHeaders({
                'User-Agent': config.userAgent,
              });
            }

            // 等待选择器
            if (config.waitForSelector) {
              await page.waitForSelector(config.waitForSelector, {
                timeout: config.waitForTimeout || 30000,
              });
            }

            // 滚动页面（处理懒加载）
            if (config.scrollEnabled) {
              await page.evaluate(
                ({ scrollDistance, scrollDelay, maxScrollDistance }) => {
                  let scrolled = 0;
                  while (scrolled < maxScrollDistance) {
                    window.scrollBy(0, scrollDistance);
                    scrolled += scrollDistance;
                    // 等待一段时间
                    return new Promise((resolve) =>
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
            }

            // 等待页面加载完成 - 使用更宽松的策略
            try {
              // 先等待DOM内容加载完成（更快）
              await page.waitForLoadState('domcontentloaded', {
                timeout: config.navigationTimeout || 30000,
              });

              // 然后尝试等待网络空闲，但如果超时则继续（对于动态网站更友好）
              await page
                .waitForLoadState('networkidle', {
                  timeout: 10000, // 只等待10秒的网络空闲
                })
                .catch(() => {
                  logger.log(
                    `页面 ${request.url} 网络请求未完全空闲，继续处理`,
                  );
                });
            } catch (error) {
              logger.log(
                `页面 ${request.url} 加载超时，但继续处理: ${error.message}`,
              );
            }

            // 额外等待一段时间，确保动态内容加载
            await page.waitForTimeout(2000);

            // 基础信息
            const pageData = {
              url: request.url,
              title: await page.title(),
              statusCode: response?.status() || 200,
              crawledAt: new Date().toISOString(),
            };

            // 根据选择器提取数据
            let extractedItems: any[] = [];

            if (config.baseSelector && config.selectors) {
              // 使用基础选择器找到所有项目
              const baseElements = page.locator(config.baseSelector);
              const itemCount = await baseElements.count();

              logger.log(`找到 ${itemCount} 个基础元素`);

              // 限制提取数量
              const maxExtract = config.maxItems ? Math.min(itemCount, config.maxItems) : itemCount;

              for (let i = 0; i < maxExtract; i++) {
                const itemData: any = {};
                const baseElement = baseElements.nth(i);

                // 调试：检查baseElement是否存在
                const elementExists = await baseElement.count() > 0;
                logger.log(`处理第 ${i + 1} 个元素，元素存在: ${elementExists}`);

                // 对每个字段，从对应的基础元素中提取
                for (const selectorConfig of config.selectors) {
                  await CrawleeEngineService.extractDataFromElement(
                    baseElement,
                    selectorConfig,
                    itemData,
                  );
                }

                logger.log(`第 ${i + 1} 个元素提取结果:`, itemData);
                extractedItems.push(itemData);
              }

              logger.log(`成功提取 ${extractedItems.length} 条数据`);
            } else if (config.selectors) {
              // 向后兼容：如果没有基础选择器，使用原有逻辑
              const extractedData: any = {};
              for (const selectorConfig of config.selectors) {
                await CrawleeEngineService.extractDataFromSelector(
                  page,
                  selectorConfig,
                  extractedData,
                );
              }
              extractedItems = [extractedData];
            }

            // 截图保存到文件系统
            const screenshot = await page.screenshot({
              fullPage: true,
              type: 'png',
            });

            // 直接保存截图到文件系统
            const screenshotFilename = `task-${taskId}-execution-${executionId}-screenshot.png`;
            const screenshotFilePath = `uploads/screenshots/${screenshotFilename}`;
            const screenshotRelativePath = `screenshots/${screenshotFilename}`;

            // 确保目录存在
            const screenshotDir = 'uploads/screenshots';
            await fs.mkdir(screenshotDir, { recursive: true });

            // 保存截图
            await fs.writeFile(screenshotFilePath, screenshot);

            // 保存截图key到数据中（用于兼容性）
            const screenshotKey = `screenshot-${request.id}`;
            await keyValueStore.setValue(screenshotKey, screenshot);

            // 检查数据总量限制
            let currentCount = await dataset
              .getInfo()
              .then((info) => info?.itemCount || 0);

            if (config.maxItems && currentCount >= config.maxItems) {
              logger.log(
                `已达到最大数量限制 ${config.maxItems}，跳过此页面的数据保存`,
              );
              return; // 跳过数据保存，但不中断整个任务
            }

            // 保存多个数据项
            for (const itemData of extractedItems) {
              if (config.maxItems && currentCount >= config.maxItems) {
                break; // 达到限制，停止保存
              }

              const result = {
                ...pageData,
                ...itemData,
                screenshotKey,
              };

              await dataset.pushData(result);
              currentCount++;
            }
          } catch (error) {
            console.error(`处理页面失败 ${request.url}:`, error);
            throw error;
          }
        },
      });

      // 执行爬虫
      await taskCrawler.run();

      // 获取统计信息
      const datasetInfo = await dataset.getInfo();
      const stats = taskCrawler.stats;

      // 获取所有爬取的数据
      const allData = await dataset.getData();
      const itemCount = allData.items.length;

      // 保存结果到JSON文件
      const resultFilename = `task-${taskId}-execution-${executionId}-results.json`;
      const resultFilePath = `uploads/results/${resultFilename}`;

      // 确保目录存在
      const path = require('path');
      const resultDir = path.dirname(resultFilePath);
      await fs.mkdir(resultDir, { recursive: true });

      // 写入结果文件
      await fs.writeFile(resultFilePath, JSON.stringify(allData.items, null, 2));

      // 更新执行记录，保存结果文件路径
      await this.executionRepository.update(executionId, {
        resultPath: resultFilePath,
      });

      // 更新执行状态为成功
      const totalRequests = config.urls.length;
      let resultMessage = `执行成功，已处理 ${totalRequests}/${totalRequests} 个请求，收集 ${itemCount} 条数据`;

      if (config.maxItems && itemCount >= config.maxItems) {
        resultMessage += ` (达到最大数量限制 ${config.maxItems})`;
      }

      await this.updateExecutionStatus(executionId, 'success', resultMessage);

      // 更新任务的截图路径（截图已在requestHandler中保存）
      try {
        const screenshotFilename = `task-${taskId}-execution-${executionId}-screenshot.png`;
        const screenshotFilePath = `uploads/screenshots/${screenshotFilename}`;
        const screenshotRelativePath = `screenshots/${screenshotFilename}`;

        // 检查文件是否存在
        if (existsSync(screenshotFilePath)) {
          // 更新任务的screenshotPath（保存相对路径）
          await this.taskRepository.update(taskId, {
            screenshotPath: screenshotRelativePath,
          });

          logger.log(`截图路径已更新: ${screenshotRelativePath}`);
        } else {
          logger.warn(`截图文件不存在: ${screenshotFilePath}`);
        }
      } catch (error) {
        logger.error('更新截图路径失败:', error);
      }

      // 获取任务信息用于广播
      const taskSuccessInfo = await this.taskRepository.findOne({
        where: { id: taskId },
      });

      // 广播任务完成状态
      this.taskGateway.broadcastTaskUpdate({
        taskId,
        taskName: taskSuccessInfo?.name,
        taskUrl: taskSuccessInfo?.url,
        status: 'success',
        progress: 100,
      });

      this.logger.log(`任务 ${taskId} 执行完成: ${resultMessage}, 结果保存至: ${resultFilePath}`);

      // 更新Task的endTime
      await this.taskRepository.update(taskId, {
        status: 'success',
        endTime: new Date(),
      });

      // 清理资源
      await requestQueue.drop();
      // 注意：Dataset和KeyValueStore通常保留用于后续分析
    } catch (error) {
      this.logger.error(`任务 ${taskId} 执行失败:`, error);
      await this.updateExecutionStatus(
        executionId,
        'failed',
        `执行失败: ${error.message}`,
      );

      // 更新Task的endTime和状态
      await this.taskRepository.update(taskId, {
        status: 'failed',
        endTime: new Date(),
      });

      // 获取任务信息用于广播
      const taskFailedInfo = await this.taskRepository.findOne({
        where: { id: taskId },
      });

      // 广播任务失败状态
      this.taskGateway.broadcastTaskUpdate({
        taskId,
        taskName: taskFailedInfo?.name,
        taskUrl: taskFailedInfo?.url,
        status: 'failed',
        progress: 0,
      });

      throw error;
    }
  }

  /**
   * 从选择器提取数据
   */
  private static async extractDataFromSelector(
    page: any,
    selectorConfig: SelectorConfig,
    extractedData: any,
  ) {
    const { name, selector, type } = selectorConfig;

    try {
      // 简化逻辑：每个选择器只提取一个值，如果找不到则设为null
      const element = page.locator(selector).first();
      let value;

      switch (type) {
        case 'text':
          value = await element.textContent();
          break;
        case 'link':
          value = await element.getAttribute('href');
          break;
        case 'image':
          value = await element.getAttribute('src');
          break;
        default:
          value = await element.textContent();
      }

      extractedData[name] = value ? value.trim() : null;
    } catch (error) {
      // 如果找不到元素，设为null但不抛出错误
      extractedData[name] = null;
    }
  }

  /**
   * 从指定元素中提取数据
   */
  private static async extractDataFromElement(
    baseElement: any,
    selectorConfig: SelectorConfig,
    extractedData: any,
  ) {
    const { name, selector, type } = selectorConfig;

    try {
      let element;

      // 处理不同类型的选择器
      if (selector.startsWith('.//')) {
        // XPath相对路径：转换为绝对XPath（相对于baseElement）
        const xpathSelector = selector.substring(1); // 移除.前缀，变成 //...
        element = baseElement.locator(`xpath=${xpathSelector}`).first();
      } else if (selector.startsWith('//')) {
        // XPath绝对路径：相对于baseElement
        element = baseElement.locator(`xpath=${selector}`).first();
      } else {
        // CSS选择器或其他
        element = baseElement.locator(selector).first();
      }

      // 调试：检查元素是否存在
      const count = await element.count();
      console.log(`字段 ${name}: 原始选择器 "${selector}", 找到元素数量: ${count}`);

      if (count === 0) {
        extractedData[name] = null;
        return;
      }

      let value;

      switch (type) {
        case 'text':
          value = await element.textContent();
          break;
        case 'link':
          value = await element.getAttribute('href');
          break;
        case 'image':
          value = await element.getAttribute('src');
          break;
        default:
          value = await element.textContent();
      }

      extractedData[name] = value ? value.trim() : null;
      console.log(`字段 ${name}: 提取值 "${extractedData[name]}"`);
    } catch (error) {
      console.error(`字段 ${name} 提取错误:`, error);
      // 如果找不到元素，设为null但不抛出错误
      extractedData[name] = null;
    }
  }

  /**
   * 更新执行状态
   */
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

  /**
   * 获取队列状态
   */
  getQueueStatus() {
    return {
      queueLength: this.taskQueue.length,
      isProcessing: this.isProcessing,
      queuedTasks: this.taskQueue.map((task) => ({
        taskId: task.taskId,
        executionId: task.executionId,
      })),
    };
  }

  /**
   * 停止引擎
   */
  async stop() {
    this.taskQueue = [];
    this.isProcessing = false;
    if (this.crawler) {
      await this.crawler.teardown();
    }
    this.logger.log('Crawlee引擎已停止');
  }
}
