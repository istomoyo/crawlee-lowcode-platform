import { Injectable, Logger } from '@nestjs/common';
import {
  PlaywrightCrawler,
  Dataset,
  KeyValueStore,
  RequestQueue,
  Configuration,
} from 'crawlee';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { Execution } from '../execution/entities/execution.entity';
import {
  CrawleeTaskConfig,
  NestedExtractContext,
  PreActionConfig,
  SelectorConfig,
  TaskNotificationConfig,
} from './dto/execute-task.dto';
import { TaskGateway } from './task.gateway';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
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
}

@Injectable()
export class CrawleeEngineService {
  private readonly logger = new Logger(CrawleeEngineService.name);
  private taskQueue: CrawlerTask[] = [];
  private isProcessing = false;
  private crawler: PlaywrightCrawler;
  private detachedDetailBrowser: playwright.Browser | null = null;
  private readonly activeTasks = new Map<number, ActiveCrawlerTask>();

  // 鍏ㄥ眬 Turndown 瀹炰緥锛岀敤浜庡皢 HTML 杞负 Markdown
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
      // 杞崲澶辫触鏃讹紝閫€鍥炲埌鍘熷鏂囨湰
      // 闈欐€佹柟娉曚腑鏃犳硶浣跨敤瀹炰緥 logger锛屼繚鐣?console.error
      if (typeof console !== 'undefined') {
        console.error('Markdown 杞崲澶辫触:', error);
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
  ) {
    // Extra safeguard: avoid Windows process listing parser crash in Crawlee systemInfoV2.
    Configuration.getGlobalConfig().set('systemInfoV2', false);
    this.initializeCrawler();
  }

  /**
   * 鍒濆鍖栫埇铏紩鎿?
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
        // 璇锋眰澶勭悊閫昏緫浼氬湪addTaskToQueue涓姩鎬佽缃?
        this.logger.debug(`Processing ${request.url}`);
      },
    });

    this.logger.log('Crawlee engine initialized');
  }

  /**
   * 娣诲姞浠诲姟鍒伴槦鍒?
   */
  async addTaskToQueue(task: CrawlerTask) {
    this.taskQueue.push(task);
    this.logger.log(
      `浠诲姟 ${task.taskId} 宸叉坊鍔犲埌闃熷垪锛屽綋鍓嶉槦鍒楅暱搴? ${this.taskQueue.length}`,
    );

    // 濡傛灉娌℃湁鍦ㄥ鐞嗭紝寮€濮嬪鐞嗛槦鍒?
    if (!this.isProcessing) {
      this.processQueue();
    }
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
        const errorMessage = error instanceof Error ? error.message : String(error || '鏈煡閿欒');
        const errorObj = error instanceof Error ? error : new Error(String(error || '鏈煡閿欒'));
        this.logger.error(`浠诲姟 ${crawlerTask.taskId} 鎵ц澶辫触:`, errorObj);
        await this.updateExecutionStatus(
          crawlerTask.executionId,
          'failed',
          `鎵ц澶辫触: ${errorMessage}`,
        );
      }
    }

    this.isProcessing = false;
    this.logger.log('鐖櫕浠诲姟闃熷垪澶勭悊瀹屾垚');
  }

  /**
   * 鎵ц鍗曚釜鐖櫕浠诲姟
   */
  private async executeCrawlerTask(crawlerTask: CrawlerTask) {
    const { taskId, executionId, config } = crawlerTask;
    const activeTask: ActiveCrawlerTask = {
      taskId,
      executionId,
      stopRequested: false,
    };
    this.activeTasks.set(taskId, activeTask);
    const stopWatcher = this.startTaskStopWatcher(activeTask);
    this.logger.log(`寮€濮嬫墽琛屼换鍔?${taskId}, 鎵цID: ${executionId}`);

    // 澹版槑鍙橀噺鐢ㄤ簬缁熻淇℃伅
    let totalExtractedItems = 0;
    let totalValidItems = 0;
    let screenshotRelativePath: string | null = null; // 鍦╡xecuteCrawlerTask鑼冨洿鍐呭０鏄?
    let screenshotFilePath: string | null = null; // 鍦╡xecuteCrawlerTask鑼冨洿鍐呭０鏄?
    const baseRequestUrl = config.urls?.[0] ?? '';

    // 鏇存柊鎵ц鐘舵€佷负杩愯涓?
    await this.updateExecutionStatus(
      executionId,
      'running',
      '姝ｅ湪鎵ц鐖櫕浠诲姟...',
    );

    try {
      // 鍒濆鍖栧瓨鍌?
      const dataset = config.datasetId
        ? await Dataset.open(config.datasetId)
        : await Dataset.open(`task-${taskId}-${Date.now()}`);

      const keyValueStore = config.keyValueStoreId
        ? await KeyValueStore.open(config.keyValueStoreId)
        : await KeyValueStore.open(`task-${taskId}-${Date.now()}`);

      // 鍒涘缓璇锋眰闃熷垪
      const requestQueue = await RequestQueue.open(
        `task-${taskId}-${Date.now()}`,
      );

      // 娣诲姞URL鍒伴槦鍒?
      for (const [index, url] of config.urls.entries()) {
        await requestQueue.addRequest({
          url,
          userData: { requestIndex: index + 1 },
        });
      }

      // 鑾峰彇浠诲姟淇℃伅鐢ㄤ簬骞挎挱
      const taskInfo = await this.taskRepository.findOne({
        where: { id: taskId },
      });

      // 淇濆瓨鏂规硶鐨勫紩鐢ㄤ互鍦ㄧ澶村嚱鏁颁腑浣跨敤
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
      const mapWithConcurrencyLimit = this.mapWithConcurrencyLimit.bind(this);
      const getDetailItemConcurrency =
        this.getDetailItemConcurrency.bind(this);
      const ensureTaskNotStopped = this.ensureTaskNotStopped.bind(this);

      // 鍒涘缓涓撶敤鐨刢rawler瀹炰緥
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

          // 杩涘害鏇存柊鍑芥暟 - 鎻愪緵鏇寸粏绮掑害鐨勮繘搴﹀弽棣?
          const updateDetailedProgress = async (currentProgress: number, message: string) => {
            // 璁＄畻鍏ㄥ眬杩涘害锛氬凡瀹屾垚鐨勮姹?+ 褰撳墠璇锋眰鐨勮繘搴?
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
            });
          };

          // 寮€濮嬪鐞嗚姹?
          await updateDetailedProgress(5, `寮€濮嬪鐞嗚姹?${requestIndex}/${totalRequests}: ${request.url}`);

          // 澹版槑灞€閮ㄥ彉閲?
          let extractedItems: any[] = [];
          let validItems: any[] = [];

          try {
            ensureTaskNotStopped(taskId);
            // 璁剧疆瑙嗗彛
            if (config.viewport) {
              await page.setViewportSize(config.viewport);
              await updateDetailedProgress(10, `璁剧疆瑙嗗彛: ${config.viewport.width}x${config.viewport.height}`);
            } else {
              await updateDetailedProgress(10, `璺宠繃瑙嗗彛璁剧疆`);
            }

            // 璁剧疆鐢ㄦ埛浠ｇ悊
            if (config.userAgent) {
              await page.setExtraHTTPHeaders({
                'User-Agent': config.userAgent,
              });
              await updateDetailedProgress(15, `璁剧疆鐢ㄦ埛浠ｇ悊`);
            } else {
              await updateDetailedProgress(15, `璺宠繃鐢ㄦ埛浠ｇ悊璁剧疆`);
            }

            // 鏍瑰眰鍓嶇疆鍔ㄤ綔锛氱偣鍑绘寜閽€佺瓑寰呭厓绱犵瓑
            if (config.preActions?.length) {
              await executePreActions(
                page,
                config.preActions,
                config.waitForTimeout || 30000,
              );
              await updateDetailedProgress(20, `鎵ц鍓嶇疆椤甸潰鍔ㄤ綔瀹屾垚`);
            } else {
              await updateDetailedProgress(20, `璺宠繃鍓嶇疆椤甸潰鍔ㄤ綔`);
            }

            // 绛夊緟閫夋嫨鍣?
            if (config.waitForSelector) {
              await page.waitForSelector(config.waitForSelector, {
                timeout: config.waitForTimeout || 30000,
              });
              await updateDetailedProgress(25, `绛夊緟鍏冪礌鍔犺浇: ${config.waitForSelector}`);
            } else {
              await updateDetailedProgress(25, `璺宠繃鍏冪礌绛夊緟`);
            }

            // 婊氬姩椤甸潰锛堝鐞嗘噿鍔犺浇锛?
            if (config.scrollEnabled) {
              await page.evaluate(
                async ({ scrollDistance, scrollDelay, maxScrollDistance }) => {
                  let scrolled = 0;
                  while (scrolled < maxScrollDistance) {
                    window.scrollBy(0, scrollDistance);
                    scrolled += scrollDistance;
                    // 绛夊緟涓€娈垫椂闂达紝璁╁唴瀹瑰姞杞?
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
              // 婊氬姩瀹屾垚鍚庯紝鍐嶇瓑寰呬竴涓嬭鍐呭瀹屽叏鍔犺浇
              await page.waitForTimeout(1000);
              await updateDetailedProgress(45, `瀹屾垚椤甸潰婊氬姩鍔犺浇`);
            } else {
              await updateDetailedProgress(45, `璺宠繃椤甸潰婊氬姩`);
            }

            // 绛夊緟椤甸潰鍔犺浇瀹屾垚 - 浣跨敤鏇村鏉剧殑绛栫暐
            try {
              // 鍏堢瓑寰匘OM鍐呭鍔犺浇瀹屾垚锛堟洿蹇級
              await page.waitForLoadState('domcontentloaded', {
                timeout: config.navigationTimeout || 30000,
              });

              // 鐒跺悗灏濊瘯绛夊緟缃戠粶绌洪棽锛屼絾濡傛灉瓒呮椂鍒欑户缁紙瀵逛簬鍔ㄦ€佺綉绔欐洿鍙嬪ソ锛?
              await page
                .waitForLoadState('networkidle', {
                  timeout: 10000, // 鍙瓑寰?0绉掔殑缃戠粶绌洪棽
                })
                .catch(() => {
                  logger.log(
                    `椤甸潰 ${request.url} 缃戠粶璇锋眰鏈畬鍏ㄧ┖闂诧紝缁х画澶勭悊`,
                  );
                });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error || '鏈煡閿欒');
              logger.log(
                `椤甸潰 ${request.url} 鍔犺浇瓒呮椂锛屼絾缁х画澶勭悊: ${errorMessage}`,
              );
            }

            // 绛夊緟椤甸潰瀹屽叏鍔犺浇
            await page.waitForTimeout(2000);
            await updateDetailedProgress(55, `绛夊緟椤甸潰鍐呭鍔犺浇瀹屾垚`);

            // 鍩虹淇℃伅
            const pageData = {
              url: request.url,
              title: await page.title(),
              statusCode: response?.status() || 200,
              crawledAt: new Date().toISOString(),
            };

            // 寮€濮嬫暟鎹彁鍙?
            await updateDetailedProgress(65, 'Starting data extraction');

      if (config.baseSelector && config.selectors) {
              // 浣跨敤鍩虹閫夋嫨鍣ㄦ壘鍒版墍鏈夐」鐩?
              // 澶勭悊XPath閫夋嫨鍣細Playwright闇€瑕佷娇鐢?xpath= 鍓嶇紑
              let baseElements;
              if (config.baseSelector.startsWith('//') || config.baseSelector.startsWith('.//')) {
                // XPath閫夋嫨鍣?
                const xpathSelector = config.baseSelector.startsWith('.//') 
                  ? config.baseSelector.substring(1) // 绉婚櫎.鍓嶇紑
                  : config.baseSelector;
                baseElements = page.locator(`xpath=${xpathSelector}`);
                logger.log(`浣跨敤XPath鍩虹閫夋嫨鍣? ${xpathSelector}`);
              } else {
                // CSS閫夋嫨鍣?
                baseElements = page.locator(config.baseSelector);
                logger.log(`浣跨敤CSS鍩虹閫夋嫨鍣? ${config.baseSelector}`);
              }
              
          const itemCount = await baseElements.count();
        logger.log(`鍩虹椤规€绘暟: ${itemCount}, 鎻愬彇涓婇檺: ${config.maxItems ?? itemCount}`);

        logger.log(`鎵惧埌 ${itemCount} 涓熀纭€鍏冪礌`);

              // 闄愬埗鎻愬彇鏁伴噺
        const maxExtract = config.maxItems ? Math.min(itemCount, config.maxItems) : itemCount;
              logger.log(`鍩虹椤规彁鍙栦笂闄愶細${maxExtract}`);

        // 淇濆瓨褰撳墠鍒楄〃椤甸潰鐨刄RL锛岀敤浜庡悗缁繑鍥?
        const listPageUrl = page.url();
        logger.log(`鍒楄〃椤甸潰URL: ${listPageUrl}`);

        // 绗竴姝ワ細鍏堟彁鍙栨墍鏈夊垪琛ㄩ」鐨勫熀鏈俊鎭紙涓嶅寘鍚玴arentLink鐨勫瓧娈碉級
        const listItemsData: any[] = [];
        for (let i = 0; i < maxExtract; i++) {
                const itemData: any = {};
                const baseElement = baseElements.nth(i);
        logger.log(`姝ｅ湪鎻愬彇绗?${i + 1} 鏉℃暟鎹殑鍩烘湰淇℃伅 (鍩虹椤?${itemCount} 鐨勭 ${i + 1} 涓?` );

                // 璋冭瘯锛氭鏌aseElement鏄惁瀛樺湪
                const elementCount = await baseElement.count();
                const elementExists = elementCount > 0;
                logger.log(`澶勭悊绗?${i + 1} 涓厓绱狅紝鍏冪礌瀛樺湪: ${elementExists}, count: ${elementCount}`);
                
                if (!elementExists) {
                  logger.warn(`绗?${i + 1} 涓熀纭€鍏冪礌涓嶅瓨鍦紝璺宠繃`);
                  continue; // 璺宠繃涓嶅瓨鍦ㄧ殑鍏冪礌
                }

                // 鍙彁鍙栨墍鏈夐潪瀛愯妭鐐圭殑閫夋嫨鍣紙鍖呮嫭link绫诲瀷鐨勮妭鐐癸級
                const linkSelectors = config.selectors.filter(s => !s.parentLink);
                for (const selectorConfig of linkSelectors) {
                  await extractDataFromElementWithRetries(
                    baseElement,
                    selectorConfig,
                    itemData,
                    page,
                    config,
                  );
                }

                logger.log(`绗?${i + 1} 涓厓绱犲熀鏈俊鎭?`, itemData);
                listItemsData.push(itemData);
              }

        logger.log(`Extracted base info for ${listItemsData.length} list items`);

        // 绗簩姝ワ細瀵规瘡涓垪琛ㄩ」锛屽鏋滈渶瑕佹彁鍙杙arentLink瀛楁锛屽垯瀵艰埅鍒板瓙閾炬帴鎻愬彇
        const childSelectors = config.selectors.filter(s => s.parentLink);
        if (childSelectors.length > 0) {
          const detailItemConcurrency = getDetailItemConcurrency(
            config,
            listItemsData.length,
            totalRequests,
          );
          logger.log(
            `Starting detail-page extraction for ${childSelectors.length} parentLink fields with in-page concurrency ${detailItemConcurrency}`,
          );
          const childSelectorsByLinkField = new Map<string, SelectorConfig[]>();
          for (const selectorConfig of childSelectors) {
            if (!selectorConfig.parentLink) continue;
            const grouped = childSelectorsByLinkField.get(selectorConfig.parentLink) || [];
            grouped.push(selectorConfig);
            childSelectorsByLinkField.set(selectorConfig.parentLink, grouped);
          }
          
          await mapWithConcurrencyLimit(
            listItemsData,
            detailItemConcurrency,
            async (itemData, i) => {
              logger.log(`Processing detail content for list item ${i + 1}/${listItemsData.length}`);
              
              for (const [linkFieldName, selectorGroup] of childSelectorsByLinkField.entries()) {
                const linkUrl = itemData[linkFieldName];
                if (linkUrl && typeof linkUrl === 'string') {
                  try {
                    await extractParentFieldsFromDetailPage(
                      linkUrl,
                      selectorGroup,
                      itemData,
                      config,
                    );
                    for (const selectorConfig of selectorGroup) {
                      logger.log(`Extracted field ${selectorConfig.name}: ${itemData[selectorConfig.name]}`);
                    }
                  } catch (error) {
                    logger.error(`Failed to extract detail fields for parentLink=${linkFieldName}:`, error);
                    for (const selectorConfig of selectorGroup) {
                      itemData[selectorConfig.name] = null;
                    }
                  }
                } else {
                  for (const selectorConfig of selectorGroup) {
                    itemData[selectorConfig.name] = null;
                  }
                  logger.warn(`Missing parent link value for parentLink=${linkFieldName}`);
                }
              }
              
              logger.log(`Completed list item ${i + 1}`, itemData);
            },
          );
        }

        // 灏嗘墍鏈夊垪琛ㄩ」鏁版嵁娣诲姞鍒癳xtractedItems
        extractedItems = listItemsData;

        // 绗笁姝ワ細鎸?nestedContexts 閫掑綊鎻愬彇澶氱骇椤甸潰鏁版嵁
        if (config.nestedContexts?.length) {
          await extractNestedContextsForItems(
            extractedItems,
            config.nestedContexts,
            config,
            1,
          );
        }

              logger.log(`Successfully extracted ${extractedItems.length} records`);
            } else if (config.selectors) {
              // 鍚戝悗鍏煎锛氬鏋滄病鏈夊熀纭€閫夋嫨鍣紝浣跨敤鍘熸湁閫昏緫
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


            // 妫€鏌ユ暟鎹€婚噺闄愬埗
            let currentCount = await dataset
              .getInfo()
              .then((info) => info?.itemCount || 0);

            if (config.maxItems && currentCount >= config.maxItems) {
              logger.log(
                `Reached max item limit ${config.maxItems}, skipping data persistence for this page`, 
              );
              return; // 璺宠繃鏁版嵁淇濆瓨锛屼絾涓嶄腑鏂暣涓换鍔?
            }

            // 杩囨护鍜岄獙璇佹暟鎹」
            validItems = extractedItems.filter(itemData => {
              // 妫€鏌ユ槸鍚︽墍鏈夊瓧娈甸兘涓虹┖鎴杗ull
              const hasValidField = Object.values(itemData).some(value =>
                value !== null && value !== undefined && value !== '' && value !== 'null'
              );

              if (!hasValidField) {
                logger.log(`杩囨护鎺夌┖鏁版嵁椤?`, itemData);
                return false;
              }

              return true;
            });

            // 妫€鏌ユ槸鍚︽湁浠讳綍鏈夋晥鏁版嵁
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

            // 鑾峰彇鎵€鏈塱mage绫诲瀷鐨勫瓧娈靛悕锛岀敤浜庡悗缁鐞?
            const imageFields = (config.selectors || [])
              .filter(selector => selector.type === 'image')
              .map(selector => selector.name);

            // 淇濆瓨杩囨护鍚庣殑鏁版嵁椤?
            for (const itemData of validItems) {
              if (config.maxItems && currentCount >= config.maxItems) {
                break; // 杈惧埌闄愬埗锛屽仠姝繚瀛?
              }

              // 鍦↗SON妯″紡涓嬶紝纭繚image瀛楁淇濆瓨鐨勬槸鍥剧墖瀵瑰簲鐨刄RL
              // 閬嶅巻鎵€鏈塱mage绫诲瀷瀛楁锛岀‘淇濆€兼槸鏈夋晥鐨刄RL瀛楃涓?
              for (const imageField of imageFields) {
                if (itemData.hasOwnProperty(imageField)) {
                  const value = itemData[imageField];
                  // 纭繚鍊兼槸鏈夋晥鐨刄RL瀛楃涓诧紙浠ttp://鎴杊ttps://寮€澶达級
                  if (value && typeof value === 'string') {
                    const trimmedValue = value.trim();
                    // 楠岃瘉鏄惁涓烘湁鏁堢殑URL鏍煎紡
                    if (trimmedValue && (trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://'))) {
                      // 鍊煎凡缁忔槸鏈夋晥鐨刄RL锛屼繚瀛楿RL瀛楃涓?
                      itemData[imageField] = trimmedValue;
                    } else {
                      // 濡傛灉涓嶆槸鏈夋晥鐨刄RL鏍煎紡锛岃缃负null
                      itemData[imageField] = null;
                      logger.log(`瀛楁 ${imageField} 鐨勫€?"${trimmedValue}" 涓嶆槸鏈夋晥鐨刄RL鏍煎紡锛屽凡璁剧疆涓簄ull`);
                    }
                  } else if (value !== null && value !== undefined) {
                    // 濡傛灉涓嶆槸瀛楃涓茬被鍨嬶紝璁剧疆涓簄ull
                    itemData[imageField] = null;
                    logger.log(`瀛楁 ${imageField} 鐨勫€间笉鏄瓧绗︿覆绫诲瀷锛屽凡璁剧疆涓簄ull`);
                  }
                }
              }

              // 鍙繚瀛樼敤鎴疯嚜瀹氫箟鐨勯€夋嫨鍣ㄦ暟鎹紝涓嶆坊鍔犱换浣曟棤鍏冲瓧娈?
              await dataset.pushData(itemData);
              currentCount++;
            }

            logger.log(`Extracted ${extractedItems.length} records and kept ${validItems.length} valid records`);

            // 绱姞鍒版€荤粺璁?
            totalExtractedItems += extractedItems.length;
            totalValidItems += validItems.length;

            // 鏁版嵁淇濆瓨瀹屾垚锛屽紑濮嬫埅鍥?
            await updateDetailedProgress(85, 'Data saved, generating screenshot');

            // 鍙繚瀛樼涓€涓猆RL锛坆ase URL锛夌殑鎴浘璺緞鍒版暟鎹簱
            const shouldSavePrimaryScreenshot =
              !screenshotRelativePath &&
              (requestIndex === 1 || isSameUrl(request.url, baseRequestUrl));

            try {
              if (page.isClosed()) {
                logger.warn(`椤甸潰宸插叧闂紝璺宠繃鎴浘 (璇锋眰 ${requestIndex}/${totalRequests})`);
              } else if (shouldSavePrimaryScreenshot) {
                // 纭繚鍦ㄥ垪琛ㄩ〉闈㈡埅鍥撅紙濡傛灉鎻愬彇浜唒arentLink瀛楁锛屽彲鑳藉凡缁忓鑸埌瀛愰摼鎺ワ級
                // 瀵逛簬baseSelector鐨勬儏鍐碉紝纭繚鍥炲埌鍘熷鍒楄〃椤甸潰
                if (config.baseSelector && page.url() !== request.url) {
                  logger.log(`褰撳墠涓嶅湪鍒楄〃椤甸潰锛屽鑸洖鍒楄〃椤甸潰杩涜鎴浘: ${request.url}`);
                  await page.goto(request.url, {
                    waitUntil: 'domcontentloaded',
                    timeout: config.navigationTimeout || 60000,
                  });
                  await page.waitForTimeout(2000);
                }

                const screenshot = await page.screenshot({
                  fullPage: true,
                  type: 'png',
                });

                const screenshotFilename = `task_${taskId}_exec_${executionId}_screenshot.png`;
                screenshotFilePath = `uploads/screenshots/${screenshotFilename}`;
                screenshotRelativePath = `screenshots/${screenshotFilename}`;

                const screenshotDir = 'uploads/screenshots';
                await fs.mkdir(screenshotDir, { recursive: true });
                await fs.writeFile(screenshotFilePath, screenshot);
                
                logger.log(`宸蹭繚瀛榖ase URL鎴浘: ${screenshotRelativePath}`);
                
                const screenshotKey = `screenshot-${request.id}`;
                await keyValueStore.setValue(screenshotKey, screenshot);
              } else {
                const screenshot = await page.screenshot({
                  fullPage: true,
                  type: 'png',
                });
                const screenshotKey = `screenshot-${request.id}`;
                await keyValueStore.setValue(screenshotKey, screenshot);
                logger.log(`璺宠繃闈瀊ase URL鐨勬埅鍥句繚瀛?(璇锋眰 ${requestIndex}/${totalRequests})`);
              }
            } catch (screenshotError) {
              logger.warn(
                `鎴浘闃舵澶辫触锛屽凡蹇界暐骞剁户缁换鍔? ${
                  screenshotError instanceof Error
                    ? screenshotError.message
                    : String(screenshotError)
                }`,
              );
            }

            await updateDetailedProgress(95, `鎴浘鐢熸垚瀹屾垚`);

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error || '鏈煡閿欒');
            const errorObj = error instanceof Error ? error : new Error(String(error || '鏈煡閿欒'));
            if (
              requestIndex === 1 &&
              !screenshotRelativePath &&
              !page.isClosed?.()
            ) {
              try {
                logger.warn(`椤甸潰澶勭悊澶辫触锛屽皾璇曞厹搴曚繚瀛橀椤垫埅鍥? ${request.url}`);
                const screenshot = await page.screenshot({
                  fullPage: true,
                  type: 'png',
                });
                const screenshotFilename = `task_${taskId}_exec_${executionId}_screenshot.png`;
                screenshotFilePath = `uploads/screenshots/${screenshotFilename}`;
                screenshotRelativePath = `screenshots/${screenshotFilename}`;
                await fs.mkdir('uploads/screenshots', { recursive: true });
                await fs.writeFile(screenshotFilePath, screenshot);
                await keyValueStore.setValue(`screenshot-${request.id}`, screenshot);
              } catch (fallbackScreenshotError) {
                logger.warn(
                  `鍏滃簳鎴浘澶辫触: ${
                    fallbackScreenshotError instanceof Error
                      ? fallbackScreenshotError.message
                      : String(fallbackScreenshotError)
                  }`,
                );
              }
            }
            logger.error(`澶勭悊椤甸潰澶辫触 ${request.url}: ${errorMessage}`, errorObj);
            throw errorObj;
          }
        },
      });

      // 鎵ц鐖櫕
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

      // 鑾峰彇缁熻淇℃伅
      const datasetInfo = await dataset.getInfo();
      const stats = taskCrawler.stats;

      // 鑾峰彇鎵€鏈夌埇鍙栫殑鏁版嵁
      const allData = await dataset.getData();
      const itemCount = allData.items.length;

      // 濡傛灉鏈€缁堢粨鏋滄暟缁勯暱搴︿负 0锛岃涓轰换鍔″け璐?
      if (Array.isArray(allData?.items) && allData.items.length === 0) {
        const errorMessage = 'Task failed: no valid data collected (final result array length was 0)';
        this.logger.error(errorMessage);
        throw new Error(errorMessage);
      }

      // 缁熶竴淇濆瓨涓篔SON鏂囦欢
      const path = require('path');
      const resultFilename = `task_${taskId}_exec_${executionId}_results.json`;
      const resultFilePath = `uploads/results/${resultFilename}`;

      // 纭繚鐩綍瀛樺湪
      const resultDir = path.dirname(resultFilePath);
      await fs.mkdir(resultDir, { recursive: true });

      // 鍐欏叆缁撴灉鏂囦欢
      await fs.writeFile(resultFilePath, JSON.stringify(allData.items, null, 2));

      // 鏇存柊鎵ц璁板綍锛屼繚瀛樼粨鏋滄枃浠惰矾寰?
      await this.executionRepository.update(executionId, {
        resultPath: resultFilePath,
      });

      // 鏇存柊鎵ц鐘舵€佷负鎴愬姛
      const totalRequests = config.urls.length;
      const filteredItemCount = totalValidItems; // 浣跨敤杩囨护鍚庣殑鏁版嵁鏁伴噺
      let resultMessage = `Execution succeeded: processed ${totalRequests}/${totalRequests} requests and collected ${filteredItemCount} valid records`;

      if (config.maxItems && filteredItemCount >= config.maxItems) {
        resultMessage += ` (杈惧埌鏈€澶ф暟閲忛檺鍒?${config.maxItems})`;
      }

      if (totalExtractedItems > totalValidItems) {
        resultMessage += ` (宸茶繃婊?${totalExtractedItems - totalValidItems} 鏉＄┖鏁版嵁)`;
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

      await this.updateExecutionStatus(executionId, 'success', resultMessage);

      // 鏇存柊浠诲姟鐨勬埅鍥捐矾寰勶紙鎴浘宸插湪requestHandler涓繚瀛橈級
      try {
        logger.log(`鍑嗗鏇存柊鎴浘璺緞 - screenshotFilePath: ${screenshotFilePath}, screenshotRelativePath: ${screenshotRelativePath}`);
        
        // 妫€鏌ユ枃浠舵槸鍚﹀瓨鍦?
        if (screenshotFilePath && existsSync(screenshotFilePath)) {
          // 鏇存柊浠诲姟鐨剆creenshotPath锛堜繚瀛樼浉瀵硅矾寰勶級
          await this.taskRepository.update(taskId, {
            screenshotPath: screenshotRelativePath ?? undefined,
          });

          logger.log(`鎴浘璺緞宸叉洿鏂板埌鏁版嵁搴? ${screenshotRelativePath}`);
        } else {
          logger.warn(`鎴浘鏂囦欢涓嶅瓨鍦ㄦ垨璺緞涓虹┖ - screenshotFilePath: ${screenshotFilePath}, exists: ${screenshotFilePath ? existsSync(screenshotFilePath) : false}`);
        }
      } catch (error) {
        logger.error('鏇存柊鎴浘璺緞澶辫触:', error);
      }

      // 鑾峰彇浠诲姟淇℃伅鐢ㄤ簬骞挎挱
      const taskSuccessInfo = await this.taskRepository.findOne({
        where: { id: taskId },
      });

      // 骞挎挱浠诲姟瀹屾垚鐘舵€?
      this.taskGateway.broadcastTaskUpdate({
        taskId,
        taskName: taskSuccessInfo?.name,
        taskUrl: taskSuccessInfo?.url,
        status: 'success',
        progress: 100,
      });

      this.logger.log(`浠诲姟 ${taskId} 鎵ц瀹屾垚: ${resultMessage}, 缁撴灉淇濆瓨鑷? ${resultFilePath}`);

      // 鏇存柊Task鐨別ndTime
      await this.taskRepository.update(taskId, {
        status: 'success',
        endTime: new Date(),
      });

      // 娓呯悊璧勬簮
      await this.sendTaskExecutionNotification({
        taskId,
        executionId,
        config,
        status: 'success',
        log: resultMessage,
        itemCount: filteredItemCount,
        previewItems: allData.items,
      });
      await requestQueue.drop();
      // 娉ㄦ剰锛欴ataset鍜孠eyValueStore閫氬父淇濈暀鐢ㄤ簬鍚庣画鍒嗘瀽
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error || '鏈煡閿欒');
      const errorObj = error instanceof Error ? error : new Error(String(error || '鏈煡閿欒'));
      if (this.isTaskStopRequested(taskId)) {
        await this.finalizeStoppedTask(
          taskId,
          executionId,
          config,
          this.getTaskStopReason(taskId),
        );
        return;
      }
      this.logger.error(`浠诲姟 ${taskId} 鎵ц澶辫触:`, errorObj);
      await this.updateExecutionStatus(
        executionId,
        'failed',
        `鎵ц澶辫触: ${errorMessage}`,
      );

      // 鏇存柊Task鐨別ndTime鍜岀姸鎬?
      await this.taskRepository.update(taskId, {
        status: 'failed',
        endTime: new Date(),
      });

      // 鑾峰彇浠诲姟淇℃伅鐢ㄤ簬骞挎挱
      await this.sendTaskExecutionNotification({
        taskId,
        executionId,
        config,
        status: 'failed',
        log: errorMessage,
      });

      const taskFailedInfo = await this.taskRepository.findOne({
        where: { id: taskId },
      });

      // 骞挎挱浠诲姟澶辫触鐘舵€?
      this.taskGateway.broadcastTaskUpdate({
        taskId,
        taskName: taskFailedInfo?.name,
        taskUrl: taskFailedInfo?.url,
        status: 'failed',
        progress: 0,
      });

      throw error;
    } finally {
      clearInterval(stopWatcher);
      this.activeTasks.delete(taskId);
      await this.closeDetachedDetailBrowser();
    }
  }

  /**
   * 浠庨€夋嫨鍣ㄦ彁鍙栨暟鎹?
   */
  private async extractDataFromSelector(
    page: any,
    selectorConfig: SelectorConfig,
    extractedData: any,
  ) {
    const { name, selector, type, contentFormat } = selectorConfig;

    try {
      if (page?.isClosed?.()) {
        extractedData[name] = null;
        return;
      }

      // 澶勭悊涓嶅悓绫诲瀷鐨勯€夋嫨鍣紝杞崲涓?Playwright 鏀寔鐨勬牸寮?
      let finalSelector: string;
      if (selector.startsWith('.//')) {
        finalSelector = `xpath=${selector}`;
      } else if (selector.startsWith('//')) {
        // XPath缁濆璺緞
        finalSelector = `xpath=${selector}`;
      } else {
        // CSS閫夋嫨鍣ㄦ垨鍏朵粬
        finalSelector = selector;
      }

      // 绠€鍖栭€昏緫锛氭瘡涓€夋嫨鍣ㄥ彧鎻愬彇涓€涓€硷紝濡傛灉鎵句笉鍒板垯璁句负null
      const element = page.locator(finalSelector).first();
      let value: string | null = null;

      switch (type) {
        case 'text': {
          const format = contentFormat || 'text';
          if (format === 'html' || format === 'markdown' || format === 'smart') {
            // 鍏堟嬁鍒板厓绱?HTML锛屽啀鏍规嵁閰嶇疆鍐冲畾鏄惁杞负 Markdown
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
          // 灏嗙浉瀵筓RL杞崲涓虹粷瀵筓RL
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // 濡傛灉URL杞崲澶辫触锛屼繚鎸佸師鍊?
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
          break;
        case 'image':
          // 鍏堝皾璇曡幏鍙?src 灞炴€?
          value = await element.getAttribute('src');
          // 濡傛灉 src 涓虹┖锛屽皾璇曡幏鍙?data-src锛堟噿鍔犺浇鍥剧墖锛?
          if (!value) {
            value = await element.getAttribute('data-src');
          }
          // 濡傛灉杩樻槸涓虹┖锛屽皾璇曡幏鍙?data-original锛堝彟涓€绉嶆噿鍔犺浇鏂瑰紡锛?
          if (!value) {
            value = await element.getAttribute('data-original');
          }
          // 灏嗙浉瀵筓RL杞崲涓虹粷瀵筓RL
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // 濡傛灉URL杞崲澶辫触锛屼繚鎸佸師鍊?
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
          break;
        default:
          value = await element.textContent();
      }

      extractedData[name] = this.applySelectorTransform(
        selectorConfig,
        value,
        extractedData,
        page.url(),
      );
    } catch (error) {
      // 濡傛灉鎵句笉鍒板厓绱狅紝璁句负null浣嗕笉鎶涘嚭閿欒
      extractedData[name] = null;
    }
  }

  /**
   * 浠庢寚瀹氬厓绱犱腑鎻愬彇鏁版嵁锛堢浉瀵逛簬鍩虹鍏冪礌锛?
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
        extractedData[name] = null;
        return;
      }

      let element;

      // 澶勭悊涓嶅悓绫诲瀷鐨勯€夋嫨鍣?
      if (selector.startsWith('.//')) {
        // XPath鐩稿璺緞锛氱浉瀵逛簬baseElement锛屼繚鐣?//鍓嶇紑
        element = baseElement.locator(`xpath=${selector}`).first();
      } else if (selector.startsWith('//')) {
        // XPath缁濆璺緞锛氫粠椤甸潰鏍硅妭鐐规煡鎵撅紝閬垮厤娣卞眰宓屽鏃跺湪 baseElement 涓婁笅鏂囦腑鍖归厤涓嶅埌
        element = page.locator(`xpath=${selector}`).first();
      } else {
        // CSS閫夋嫨鍣ㄦ垨鍏朵粬锛氱浉瀵逛簬baseElement
        element = baseElement.locator(selector).first();
      }

      // 璋冭瘯锛氭鏌ュ厓绱犳槸鍚﹀瓨鍦?
      const count = await element.count();
      this.logger.debug(`Field ${name}: selector "${selector}" matched ${count} elements relative to the base element`);

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
          // 灏嗙浉瀵筓RL杞崲涓虹粷瀵筓RL
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // 濡傛灉URL杞崲澶辫触锛屼繚鎸佸師鍊?
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
          break;
        case 'image':
          // 鍏堝皾璇曡幏鍙?src 灞炴€?
          value = await element.getAttribute('src');
          // 濡傛灉 src 涓虹┖锛屽皾璇曡幏鍙?data-src锛堟噿鍔犺浇鍥剧墖锛?
          if (!value) {
            value = await element.getAttribute('data-src');
          }
          // 濡傛灉杩樻槸涓虹┖锛屽皾璇曡幏鍙?data-original锛堝彟涓€绉嶆噿鍔犺浇鏂瑰紡锛?
          if (!value) {
            value = await element.getAttribute('data-original');
          }
          // 灏嗙浉瀵筓RL杞崲涓虹粷瀵筓RL
          if (value) {
            try {
              const pageUrl = page.url();
              value = new URL(value, pageUrl).href;
            } catch (urlError) {
              // 濡傛灉URL杞崲澶辫触锛屼繚鎸佸師鍊?
              this.logger.warn(`Failed to resolve relative URL "${value}"`, urlError);
            }
          }
          break;
        default:
          value = await element.textContent();
      }

      extractedData[name] = this.applySelectorTransform(
        selectorConfig,
        value,
        extractedData,
        page.url(),
      );
      this.logger.debug(`瀛楁 ${name}: 鎻愬彇鍊?"${extractedData[name]}"`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error || 'unknown');
      if (!/Target page, context or browser has been closed/i.test(errorMessage)) {
        this.logger.error(`瀛楁 ${name} 鎻愬彇閿欒`, error);
      }
      // 濡傛灉鎵句笉鍒板厓绱狅紝璁句负null浣嗕笉鎶涘嚭閿欒
      extractedData[name] = null;
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
        `字段 ${selectorConfig.name} 第 ${attempt} 次重试，当前值: ${currentValue ?? 'null'}`,
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
      extractedData[selectorConfig.name] = null;
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

  private async tryExtractFromBaseElement(
    baseElement: any,
    selectorConfig: SelectorConfig,
    page: any,
  ): Promise<any> {
    const tempData: Record<string, any> = {};
    await this.extractDataFromElement(
      baseElement,
      { ...selectorConfig, parentLink: undefined },
      tempData,
      page,
    );
    return tempData[selectorConfig.name];
  }

  private async tryExtractFromCandidateBases(
    detailPage: any,
    selectorConfig: SelectorConfig,
  ): Promise<any> {
    const candidateBaseSelectors: string[] = [];
    if (selectorConfig.detailBaseSelector?.trim()) {
      candidateBaseSelectors.push(selectorConfig.detailBaseSelector.trim());
    } else {
      // 浠呭湪鏃ч厤缃己灏?detailBaseSelector 鏃讹紝浣跨敤鏈夐檺鍏滃簳鍊欓€?
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
        for (let i = 0; i < count; i++) {
          const value = await this.tryExtractFromBaseElement(
            baseLocator.nth(i),
            selectorConfig,
            detailPage,
          );

          if (
            this.hasMeaningfulValue(value) &&
            !this.isLikelyGlobalNavigationValue(selectorConfig.type, value)
          ) {
            return value;
          }
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
      for (let i = 0; i < detailBaseCount; i++) {
        const candidateValue = await this.tryExtractFromBaseElement(
          detailBaseLocator.nth(i),
          tempSelectorConfig,
          detailPage,
        );
        if (
          this.hasMeaningfulValue(candidateValue) &&
          !this.isLikelyGlobalNavigationValue(selectorConfig.type, candidateValue)
        ) {
          return candidateValue;
        }
      }
      return null;
    }

    const tempData: Record<string, any> = {};
    await this.extractDataFromSelector(detailPage, tempSelectorConfig, tempData);
    let value = tempData[selectorConfig.name];

    if (
      this.hasMeaningfulValue(value) &&
      !this.isLikelyGlobalNavigationValue(selectorConfig.type, value)
    ) {
      return value;
    }

    if (selectorConfig.selector.startsWith('.//')) {
      const candidateValue = await this.tryExtractFromCandidateBases(
        detailPage,
        selectorConfig,
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
    try {
      await this.applyConfiguredCookies(detailPage, linkUrl, config);
      await this.waitBeforeNavigation(detailPage, config);
      await detailPage.goto(linkUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.navigationTimeout || 60000,
      });
      await detailPage.waitForTimeout(300);

      for (const selectorConfig of selectorConfigs) {
        const value = await this.extractSelectorValueFromDetailPageWithRetries(
          detailPage,
          selectorConfig,
          itemData,
          config,
        );
        itemData[selectorConfig.name] = value;
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
      args: ['--disable-blink-features=AutomationControlled'],
    });

    return this.detachedDetailBrowser;
  }

  private async createDetachedDetailPage(config: CrawleeTaskConfig): Promise<any> {
    const browser = await this.ensureDetachedDetailBrowser(config);
    const context = await browser.newContext({
      viewport: config.viewport || { width: 1920, height: 1080 },
      userAgent: config.userAgent || undefined,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    return context.newPage();
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
    return !(
      value === null ||
      value === undefined ||
      value === '' ||
      value === 'null'
    );
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
    return Math.max(0, Math.min(config.maxRetries ?? 2, 5));
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
        `详情字段 ${selectorConfig.name} 第 ${attempt} 次重试，当前值: ${value ?? 'null'}`,
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

  private toPlaywrightSelector(
    selectorType: PreActionConfig['selectorType'],
    selector: string,
  ): string {
    if (selectorType === 'xpath') {
      if (selector.startsWith('xpath=')) return selector;
      return `xpath=${selector.startsWith('.//') ? selector.substring(1) : selector}`;
    }
    return selector;
  }

  private async executePreActions(
    page: any,
    actions: PreActionConfig[],
    defaultTimeout: number,
  ): Promise<void> {
    for (const action of actions) {
      const timeout = action.timeout ?? defaultTimeout;

      if (action.type === 'wait_for_timeout') {
        const waitTime = Math.max(0, action.timeout ?? 1000);
        await page.waitForTimeout(waitTime);
        continue;
      }

      if (!action.selector) {
        this.logger.warn(`鍓嶇疆鍔ㄤ綔 ${action.type} 缂哄皯 selector锛屽凡璺宠繃`);
        continue;
      }

      const finalSelector = this.toPlaywrightSelector(
        action.selectorType,
        action.selector,
      );

      if (action.type === 'click') {
        const target = page.locator(finalSelector).first();
        await target.waitFor({ state: 'visible', timeout });
        await target.click({ timeout });
        continue;
      }

      if (action.type === 'wait_for_selector') {
        await page
          .locator(finalSelector)
          .first()
          .waitFor({ state: 'visible', timeout });
        continue;
      }

      this.logger.warn(`涓嶆敮鎸佺殑鍓嶇疆鍔ㄤ綔绫诲瀷: ${action.type}`);
    }
  }

  private getLocatorFromSelector(page: any, selector: string): any {
    if (selector.startsWith('//')) return page.locator(`xpath=${selector}`);
    if (selector.startsWith('.//')) return page.locator(`xpath=${selector.substring(1)}`);
    return page.locator(selector);
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
      items.push(itemData);
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

  private async extractNestedContextItems(
    detailUrl: string,
    ctx: NestedExtractContext,
    config: CrawleeTaskConfig,
  ): Promise<Record<string, any>[]> {
    const detailPage = await this.createDetachedDetailPage(config);
    try {
      await detailPage.goto(detailUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.navigationTimeout || 60000,
      });
      await detailPage.waitForTimeout(800);

      if (ctx.preActions?.length) {
        await this.executePreActions(
          detailPage,
          ctx.preActions,
          config.waitForTimeout || 30000,
        );
      }

      await this.maybeScrollForNested(detailPage, ctx);

      // 褰撳墠瀹炵幇鍏堟姄鍙栫涓€椤碉紱next 閰嶇疆鍙户缁墿灞曞埌缈婚〉绱Н
      const items = await this.extractItemsByBaseSelector(
        detailPage,
        ctx.baseSelector,
        ctx.selectors,
        ctx.scroll?.maxItems || config.maxItems,
        config,
      );
      return items;
    } finally {
      await detailPage.context().close().catch(() => undefined);
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

        const parentLinkValue = item[ctx.parentLink];
        if (!parentLinkValue || typeof parentLinkValue !== 'string') continue;

        try {
          const nestedItems = await this.extractNestedContextItems(
            parentLinkValue,
            ctx,
            config,
          );
          const outputKey = ctx.listOutputKey || 'items';
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
            `宓屽鎻愬彇澶辫触 parentLink=${ctx.parentLink} url=${parentLinkValue}`,
            error instanceof Error ? error.stack : String(error),
          );
          const outputKey = ctx.listOutputKey || 'items';
          if (!Array.isArray(item[outputKey])) {
            item[outputKey] = [];
          }
        }
      }
    }
  }

  /**
   * 鏇存柊鎵ц鐘舵€?
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
      this.logger.error(`鏇存柊鎵ц鐘舵€佸け璐?${executionId}:`, error);
    }
  }

  /**
   * 鑾峰彇闃熷垪鐘舵€?
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
      'running',
      `${stopReason} (interrupting current run...)`,
    );

    await Promise.allSettled([
      activeTask.crawler?.teardown() ?? Promise.resolve(),
      this.closeDetachedDetailBrowser(),
    ]);

    return 'running';
  }

  private startTaskStopWatcher(activeTask: ActiveCrawlerTask): NodeJS.Timeout {
    let checking = false;

    return setInterval(async () => {
      if (checking || activeTask.stopRequested) {
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
    await this.updateExecutionStatus(executionId, 'failed', stopReason);
    await this.taskRepository.update(taskId, {
      status: 'failed',
      endTime: new Date(),
    });

    const taskInfo = await this.taskRepository.findOne({
      where: { id: taskId },
    });

    this.taskGateway.broadcastTaskUpdate({
      taskId,
      taskName: taskInfo?.name,
      taskUrl: taskInfo?.url,
      status: 'failed',
      progress: 0,
    });

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
    const notification = this.normalizeNotificationConfig(
      options.config.notification,
    );

    if (!this.shouldSendNotification(notification, options.status)) {
      return;
    }

    try {
      const task = await this.taskRepository.findOne({
        where: { id: options.taskId },
        relations: ['user'],
      });

      const recipient = task?.user?.email?.trim();
      if (!task || !recipient) {
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
    taskName: string;
    taskUrl: string;
    executionId: number;
    status: 'success' | 'failed';
    log: string;
    itemCount?: number;
    previewItems: Record<string, any>[];
  }): { text: string; html: string } {
    const statusText = options.status === 'success' ? '成功' : '失败';
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
                `<p><strong>#${index + 1}</strong></p><pre>${this.escapeHtml(
                  this.stringifyPreviewItem(item),
                )}</pre>`,
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
        ${
          typeof options.itemCount === 'number'
            ? `<p><strong>结果条数:</strong> ${options.itemCount}</p>`
            : ''
        }
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
   * 鍋滄寮曟搸
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
