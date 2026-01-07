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
import { FilePackageService } from './file-package.service';
import TurndownService from 'turndown';

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

  // 全局 Turndown 实例，用于将 HTML 转为 Markdown
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
      // 转换失败时，退回到原始文本
      // 静态方法中无法使用实例 logger，保留 console.error
      if (typeof console !== 'undefined') {
        console.error('Markdown 转换失败:', error);
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
        this.logger.debug(`Processing ${request.url}`);
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
        const errorMessage = error instanceof Error ? error.message : String(error || '未知错误');
        const errorObj = error instanceof Error ? error : new Error(String(error || '未知错误'));
        this.logger.error(`任务 ${crawlerTask.taskId} 执行失败:`, errorObj);
        await this.updateExecutionStatus(
          crawlerTask.executionId,
          'failed',
          `执行失败: ${errorMessage}`,
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

    // 声明变量用于统计信息
    let totalExtractedItems = 0;
    let totalValidItems = 0;
    let screenshotRelativePath: string | null = null; // 在executeCrawlerTask范围内声明
    let screenshotFilePath: string | null = null; // 在executeCrawlerTask范围内声明

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
      const updateTaskStatus = this.taskRepository.update.bind(this.taskRepository);
      const broadcastTaskUpdate = this.taskGateway.broadcastTaskUpdate.bind(
        this.taskGateway,
      );
      const logger = this.logger;
      const extractDataFromElement = this.extractDataFromElement.bind(this);
      const extractDataFromSelector = this.extractDataFromSelector.bind(this);

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

          // 进度更新函数 - 提供更细粒度的进度反馈
          const updateDetailedProgress = async (currentProgress: number, message: string) => {
            // 计算全局进度：已完成的请求 + 当前请求的进度
            const baseProgress = ((requestIndex - 1) / totalRequests) * 100;
            const totalProgress = Math.min(100, Math.round(baseProgress + (currentProgress / totalRequests)));

            await updateExecutionStatus(executionId, 'running', message);

            broadcastTaskUpdate({
              taskId,
              taskName: taskInfo?.name,
              taskUrl: taskInfo?.url,
              status: 'running',
              progress: totalProgress,
            });
          };

          // 开始处理请求
          await updateDetailedProgress(5, `开始处理请求 ${requestIndex}/${totalRequests}: ${request.url}`);

          // 声明局部变量
          let extractedItems: any[] = [];
          let validItems: any[] = [];

          try {
            // 设置视口
            if (config.viewport) {
              await page.setViewportSize(config.viewport);
              await updateDetailedProgress(10, `设置视口: ${config.viewport.width}x${config.viewport.height}`);
            } else {
              await updateDetailedProgress(10, `跳过视口设置`);
            }

            // 设置用户代理
            if (config.userAgent) {
              await page.setExtraHTTPHeaders({
                'User-Agent': config.userAgent,
              });
              await updateDetailedProgress(15, `设置用户代理`);
            } else {
              await updateDetailedProgress(15, `跳过用户代理设置`);
            }

            // 等待选择器
            if (config.waitForSelector) {
              await page.waitForSelector(config.waitForSelector, {
                timeout: config.waitForTimeout || 30000,
              });
              await updateDetailedProgress(25, `等待元素加载: ${config.waitForSelector}`);
            } else {
              await updateDetailedProgress(25, `跳过元素等待`);
            }

            // 滚动页面（处理懒加载）
            if (config.scrollEnabled) {
              await page.evaluate(
                async ({ scrollDistance, scrollDelay, maxScrollDistance }) => {
                  let scrolled = 0;
                  while (scrolled < maxScrollDistance) {
                    window.scrollBy(0, scrollDistance);
                    scrolled += scrollDistance;
                    // 等待一段时间，让内容加载
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
              // 滚动完成后，再等待一下让内容完全加载
              await page.waitForTimeout(1000);
              await updateDetailedProgress(45, `完成页面滚动加载`);
            } else {
              await updateDetailedProgress(45, `跳过页面滚动`);
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
              const errorMessage = error instanceof Error ? error.message : String(error || '未知错误');
              logger.log(
                `页面 ${request.url} 加载超时，但继续处理: ${errorMessage}`,
              );
            }

            // 等待页面完全加载
            await page.waitForTimeout(2000);
            await updateDetailedProgress(55, `等待页面内容加载完成`);

            // 基础信息
            const pageData = {
              url: request.url,
              title: await page.title(),
              statusCode: response?.status() || 200,
              crawledAt: new Date().toISOString(),
            };

            // 开始数据提取
            await updateDetailedProgress(65, `开始提取页面数据`);

      if (config.baseSelector && config.selectors) {
              // 使用基础选择器找到所有项目
              // 处理XPath选择器：Playwright需要使用 xpath= 前缀
              let baseElements;
              if (config.baseSelector.startsWith('//') || config.baseSelector.startsWith('.//')) {
                // XPath选择器
                const xpathSelector = config.baseSelector.startsWith('.//') 
                  ? config.baseSelector.substring(1) // 移除.前缀
                  : config.baseSelector;
                baseElements = page.locator(`xpath=${xpathSelector}`);
                logger.log(`使用XPath基础选择器: ${xpathSelector}`);
              } else {
                // CSS选择器
                baseElements = page.locator(config.baseSelector);
                logger.log(`使用CSS基础选择器: ${config.baseSelector}`);
              }
              
          const itemCount = await baseElements.count();
        logger.log(`基础项总数: ${itemCount}, 提取上限: ${config.maxItems ?? itemCount}`);

        logger.log(`找到 ${itemCount} 个基础元素`);

              // 限制提取数量
        const maxExtract = config.maxItems ? Math.min(itemCount, config.maxItems) : itemCount;
              logger.log(`基础项提取上限：${maxExtract}`);

        // 保存当前列表页面的URL，用于后续返回
        const listPageUrl = page.url();
        logger.log(`列表页面URL: ${listPageUrl}`);

        // 第一步：先提取所有列表项的基本信息（不包含parentLink的字段）
        const listItemsData: any[] = [];
        for (let i = 0; i < maxExtract; i++) {
                const itemData: any = {};
                const baseElement = baseElements.nth(i);
        logger.log(`正在提取第 ${i + 1} 条数据的基本信息 (基础项 ${itemCount} 的第 ${i + 1} 个)` );

                // 调试：检查baseElement是否存在
                const elementCount = await baseElement.count();
                const elementExists = elementCount > 0;
                logger.log(`处理第 ${i + 1} 个元素，元素存在: ${elementExists}, count: ${elementCount}`);
                
                if (!elementExists) {
                  logger.warn(`第 ${i + 1} 个基础元素不存在，跳过`);
                  continue; // 跳过不存在的元素
                }

                // 只提取所有非子节点的选择器（包括link类型的节点）
                const linkSelectors = config.selectors.filter(s => !s.parentLink);
                for (const selectorConfig of linkSelectors) {
                  await extractDataFromElement(
                    baseElement,
                    selectorConfig,
                    itemData,
                    page,
                  );
                }

                logger.log(`第 ${i + 1} 个元素基本信息:`, itemData);
                listItemsData.push(itemData);
              }

        logger.log(`成功提取 ${listItemsData.length} 条列表项的基本信息`);

        // 第二步：对每个列表项，如果需要提取parentLink字段，则导航到子链接提取
        const childSelectors = config.selectors.filter(s => s.parentLink);
        if (childSelectors.length > 0) {
          logger.log(`需要提取 ${childSelectors.length} 个parentLink字段，开始逐个处理`);
          
          for (let i = 0; i < listItemsData.length; i++) {
            const itemData = listItemsData[i];
            logger.log(`处理第 ${i + 1}/${listItemsData.length} 个列表项的详细内容`);
            
            // 对每个parentLink字段进行处理
            for (const selectorConfig of childSelectors) {
              const linkFieldName = selectorConfig.parentLink;
              if (!linkFieldName) {
                itemData[selectorConfig.name] = null;
                logger.warn(`字段 ${selectorConfig.name}: parentLink 为空`);
                continue;
              }

              const linkUrl = itemData[linkFieldName];

              if (linkUrl && typeof linkUrl === 'string') {
                try {
                  logger.log(`导航到子链接: ${linkUrl}`);
                  
                  // 导航到子链接页面
                  await page.goto(linkUrl, { 
                    waitUntil: 'domcontentloaded',
                    timeout: config.navigationTimeout || 60000 
                  });
                  
                  // 等待页面加载
                  await page.waitForTimeout(2000);
                  
                  // 提取数据（使用绝对路径选择器，因为已经在子页面了）
                  const tempSelectorConfig = {
                    ...selectorConfig,
                    parentLink: undefined // 清除parentLink，因为已经在子页面了
                  };
                  
                  await extractDataFromSelector(
                    page,
                    tempSelectorConfig,
                    itemData,
                  );
                  
                  logger.log(`已提取字段 ${selectorConfig.name} 的值: ${itemData[selectorConfig.name]}`);
                  
                  // 导航回列表页面
                  logger.log(`返回列表页面: ${listPageUrl}`);
                  await page.goto(listPageUrl, { 
                    waitUntil: 'domcontentloaded',
                    timeout: config.navigationTimeout || 60000 
                  });
                  
                  // 等待页面加载
                  await page.waitForTimeout(1000);
                  
                  // 重新获取baseElements（因为导航后元素可能失效）
                  if (config.baseSelector.startsWith('//') || config.baseSelector.startsWith('.//')) {
                    const xpathSelector = config.baseSelector.startsWith('.//') 
                      ? config.baseSelector.substring(1)
                      : config.baseSelector;
                    baseElements = page.locator(`xpath=${xpathSelector}`);
                  } else {
                    baseElements = page.locator(config.baseSelector);
                  }
                  
                } catch (error) {
                  logger.error(`提取字段 ${selectorConfig.name} 失败:`, error);
                  itemData[selectorConfig.name] = null;
                  
                  // 如果出错，尝试返回列表页面
                  try {
                    await page.goto(listPageUrl, { 
                      waitUntil: 'domcontentloaded',
                      timeout: config.navigationTimeout || 60000 
                    });
                    await page.waitForTimeout(1000);
                  } catch (navError) {
                    logger.error(`返回列表页面失败:`, navError);
                  }
                }
              } else {
                itemData[selectorConfig.name] = null;
                logger.warn(`字段 ${selectorConfig.name}: 找不到对应的链接字段 ${linkFieldName}`);
              }
            }
            
            logger.log(`第 ${i + 1} 个元素完整数据:`, itemData);
          }
        }

        // 将所有列表项数据添加到extractedItems
        extractedItems = listItemsData;

              logger.log(`成功提取 ${extractedItems.length} 条数据`);
            } else if (config.selectors) {
              // 向后兼容：如果没有基础选择器，使用原有逻辑
              const extractedData: any = {};
              for (const selectorConfig of config.selectors) {
                await extractDataFromSelector(
                  page,
                  selectorConfig,
                  extractedData,
                );
              }
              extractedItems = [extractedData];
            }


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

            // 过滤和验证数据项
            validItems = extractedItems.filter(itemData => {
              // 检查是否所有字段都为空或null
              const hasValidField = Object.values(itemData).some(value =>
                value !== null && value !== undefined && value !== '' && value !== 'null'
              );

              if (!hasValidField) {
                logger.log(`过滤掉空数据项:`, itemData);
                return false;
              }

              return true;
            });

            // 检查是否有任何有效数据
            if (validItems.length === 0) {
              const errorMessage = `任务失败：未找到任何有效数据，所有提取的字段都为空`;
              logger.error(errorMessage);
              throw new Error(errorMessage);
            }

            // 获取所有image类型的字段名，用于后续处理
            const imageFields = (config.selectors || [])
              .filter(selector => selector.type === 'image')
              .map(selector => selector.name);

            // 保存过滤后的数据项
            for (const itemData of validItems) {
              if (config.maxItems && currentCount >= config.maxItems) {
                break; // 达到限制，停止保存
              }

              // 在JSON模式下，确保image字段保存的是图片对应的URL
              // 遍历所有image类型字段，确保值是有效的URL字符串
              for (const imageField of imageFields) {
                if (itemData.hasOwnProperty(imageField)) {
                  const value = itemData[imageField];
                  // 确保值是有效的URL字符串（以http://或https://开头）
                  if (value && typeof value === 'string') {
                    const trimmedValue = value.trim();
                    // 验证是否为有效的URL格式
                    if (trimmedValue && (trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://'))) {
                      // 值已经是有效的URL，保存URL字符串
                      itemData[imageField] = trimmedValue;
                    } else {
                      // 如果不是有效的URL格式，设置为null
                      itemData[imageField] = null;
                      logger.log(`字段 ${imageField} 的值 "${trimmedValue}" 不是有效的URL格式，已设置为null`);
                    }
                  } else if (value !== null && value !== undefined) {
                    // 如果不是字符串类型，设置为null
                    itemData[imageField] = null;
                    logger.log(`字段 ${imageField} 的值不是字符串类型，已设置为null`);
                  }
                }
              }

              // 只保存用户自定义的选择器数据，不添加任何无关字段
              await dataset.pushData(itemData);
              currentCount++;
            }

            logger.log(`原始提取 ${extractedItems.length} 条数据，过滤后保存 ${validItems.length} 条有效数据`);

            // 累加到总统计
            totalExtractedItems += extractedItems.length;
            totalValidItems += validItems.length;

            // 数据保存完成，开始截图
            await updateDetailedProgress(85, `数据保存完成，开始生成截图`);

            // 只保存第一个URL（base URL）的截图路径到数据库
            if (requestIndex === 1) {
              // 确保在列表页面截图（如果提取了parentLink字段，可能已经导航到子链接）
              // 对于baseSelector的情况，确保回到原始列表页面
              if (config.baseSelector && page.url() !== request.url) {
                logger.log(`当前不在列表页面，导航回列表页面进行截图: ${request.url}`);
                await page.goto(request.url, { 
                  waitUntil: 'domcontentloaded',
                  timeout: config.navigationTimeout || 60000 
                });
                await page.waitForTimeout(2000);
              }

              // 截图保存到文件系统
              const screenshot = await page.screenshot({
                fullPage: true,
                type: 'png',
              });

              // 直接保存截图到文件系统
              // 使用taskId和executionId确保文件名唯一，防止同名冲突
              const screenshotFilename = `task_${taskId}_exec_${executionId}_screenshot.png`;
              screenshotFilePath = `uploads/screenshots/${screenshotFilename}`;
              screenshotRelativePath = `screenshots/${screenshotFilename}`;

              // 确保目录存在
              const screenshotDir = 'uploads/screenshots';
              await fs.mkdir(screenshotDir, { recursive: true });

              // 保存截图
              await fs.writeFile(screenshotFilePath, screenshot);
              
              logger.log(`已保存base URL截图: ${screenshotRelativePath}`);
              
              // 保存截图key到数据中（用于兼容性）
              const screenshotKey = `screenshot-${request.id}`;
              await keyValueStore.setValue(screenshotKey, screenshot);
            } else {
              // 对于非base URL，也保存截图到keyValueStore
              const screenshot = await page.screenshot({
                fullPage: true,
                type: 'png',
              });
              const screenshotKey = `screenshot-${request.id}`;
              await keyValueStore.setValue(screenshotKey, screenshot);
              logger.log(`跳过非base URL的截图保存 (请求 ${requestIndex}/${totalRequests})`);
            }

            await updateDetailedProgress(95, `截图生成完成`);

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error || '未知错误');
            const errorObj = error instanceof Error ? error : new Error(String(error || '未知错误'));
            logger.error(`处理页面失败 ${request.url}: ${errorMessage}`, errorObj);
            throw errorObj;
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

      // 如果最终结果数组长度为 0，视为任务失败
      if (Array.isArray(allData?.items) && allData.items.length === 0) {
        const errorMessage = `任务失败：未收集到任何有效数据（最终结果数组长度为 0）`;
        this.logger.error(errorMessage);
        throw new Error(errorMessage);
      }

      // 统一保存为JSON文件
      const path = require('path');
      const resultFilename = `task_${taskId}_exec_${executionId}_results.json`;
      const resultFilePath = `uploads/results/${resultFilename}`;

      // 确保目录存在
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
      const filteredItemCount = totalValidItems; // 使用过滤后的数据数量
      let resultMessage = `执行成功，已处理 ${totalRequests}/${totalRequests} 个请求，收集 ${filteredItemCount} 条有效数据`;

      if (config.maxItems && filteredItemCount >= config.maxItems) {
        resultMessage += ` (达到最大数量限制 ${config.maxItems})`;
      }

      if (totalExtractedItems > totalValidItems) {
        resultMessage += ` (已过滤 ${totalExtractedItems - totalValidItems} 条空数据)`;
      }

      await this.updateExecutionStatus(executionId, 'success', resultMessage);

      // 更新任务的截图路径（截图已在requestHandler中保存）
      try {
        logger.log(`准备更新截图路径 - screenshotFilePath: ${screenshotFilePath}, screenshotRelativePath: ${screenshotRelativePath}`);
        
        // 检查文件是否存在
        if (screenshotFilePath && existsSync(screenshotFilePath)) {
          // 更新任务的screenshotPath（保存相对路径）
          await this.taskRepository.update(taskId, {
            screenshotPath: screenshotRelativePath ?? undefined,
          });

          logger.log(`截图路径已更新到数据库: ${screenshotRelativePath}`);
        } else {
          logger.warn(`截图文件不存在或路径为空 - screenshotFilePath: ${screenshotFilePath}, exists: ${screenshotFilePath ? existsSync(screenshotFilePath) : false}`);
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
      const errorMessage = error instanceof Error ? error.message : String(error || '未知错误');
      const errorObj = error instanceof Error ? error : new Error(String(error || '未知错误'));
      this.logger.error(`任务 ${taskId} 执行失败:`, errorObj);
      await this.updateExecutionStatus(
        executionId,
        'failed',
        `执行失败: ${errorMessage}`,
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
  private async extractDataFromSelector(
    page: any,
    selectorConfig: SelectorConfig,
    extractedData: any,
  ) {
    const { name, selector, type, parentLink, contentFormat } = selectorConfig;

    try {
      let targetPage = page;

      // 如果有parentLink，需要导航到链接页面
      if (parentLink) {
        this.logger.debug(`字段 ${name}: 导航到父链接页面 ${parentLink}`);
        await page.goto(parentLink, { waitUntil: 'networkidle' });
        targetPage = page;
      }

      // 处理不同类型的选择器，转换为 Playwright 支持的格式
      let finalSelector: string;
      if (selector.startsWith('.//')) {
        // XPath相对路径：转换为绝对路径
        const xpathSelector = selector.substring(1); // 移除.前缀，变成 //
        finalSelector = `xpath=${xpathSelector}`;
      } else if (selector.startsWith('//')) {
        // XPath绝对路径
        finalSelector = `xpath=${selector}`;
      } else {
        // CSS选择器或其他
        finalSelector = selector;
      }

      // 简化逻辑：每个选择器只提取一个值，如果找不到则设为null
      const element = targetPage.locator(finalSelector).first();
      let value: string | null = null;

      switch (type) {
        case 'text': {
          const format = contentFormat || 'text';
          if (format === 'html' || format === 'markdown' || format === 'smart') {
            // 先拿到元素 HTML，再根据配置决定是否转为 Markdown
            const html = await element.innerHTML();
            if (format === 'markdown' || format === 'smart') {
              value = CrawleeEngineService.convertHtmlToMarkdown(html);
            } else {
              value = html;
            }
          } else {
            value = await element.textContent();
          }
          break;
        }
        case 'link':
          value = await element.getAttribute('href');
          // 将相对URL转换为绝对URL
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // 如果URL转换失败，保持原值
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
          break;
        case 'image':
          // 先尝试获取 src 属性
          value = await element.getAttribute('src');
          // 如果 src 为空，尝试获取 data-src（懒加载图片）
          if (!value) {
            value = await element.getAttribute('data-src');
          }
          // 如果还是为空，尝试获取 data-original（另一种懒加载方式）
          if (!value) {
            value = await element.getAttribute('data-original');
          }
          // 将相对URL转换为绝对URL
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // 如果URL转换失败，保持原值
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
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
   * 从指定元素中提取数据（相对于基础元素）
   */
  private async extractDataFromElement(
    baseElement: any,
    selectorConfig: SelectorConfig,
    extractedData: any,
    page: any,
  ) {
    const { name, selector, type, contentFormat } = selectorConfig;

    try {
      let element;

      // 处理不同类型的选择器
      if (selector.startsWith('.//')) {
        // XPath相对路径：相对于baseElement，保留.//前缀
        element = baseElement.locator(`xpath=${selector}`).first();
      } else if (selector.startsWith('//')) {
        // XPath绝对路径：相对于baseElement（但在baseElement上下文中，//会从baseElement开始查找）
        element = baseElement.locator(`xpath=${selector}`).first();
      } else {
        // CSS选择器或其他：相对于baseElement
        element = baseElement.locator(selector).first();
      }

      // 调试：检查元素是否存在
      const count = await element.count();
      this.logger.debug(`字段 ${name}: 选择器 "${selector}", 相对于基础元素找到 ${count} 个元素`);

      if (count === 0) {
        extractedData[name] = null;
        return;
      }

      let value: string | null = null;

      switch (type) {
        case 'text': {
          const format = contentFormat || 'text';
          if (format === 'html' || format === 'markdown' || format === 'smart') {
            const html = await element.innerHTML();
            if (format === 'markdown' || format === 'smart') {
              value = CrawleeEngineService.convertHtmlToMarkdown(html);
            } else {
              value = html;
            }
          } else {
            value = await element.textContent();
          }
          break;
        }
        case 'link':
          value = await element.getAttribute('href');
          // 将相对URL转换为绝对URL
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // 如果URL转换失败，保持原值
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
          break;
        case 'image':
          // 先尝试获取 src 属性
          value = await element.getAttribute('src');
          // 如果 src 为空，尝试获取 data-src（懒加载图片）
          if (!value) {
            value = await element.getAttribute('data-src');
          }
          // 如果还是为空，尝试获取 data-original（另一种懒加载方式）
          if (!value) {
            value = await element.getAttribute('data-original');
          }
          // 将相对URL转换为绝对URL
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // 如果URL转换失败，保持原值
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
          break;
        default:
          value = await element.textContent();
      }

      extractedData[name] = value ? value.trim() : null;
      this.logger.debug(`字段 ${name}: 提取值 "${extractedData[name]}"`);
    } catch (error) {
      this.logger.error(`字段 ${name} 提取错误`, error);
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
