import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import * as playwright from 'playwright';
import {
  PlaywrightCrawler,
  CheerioCrawler,
  Dataset,
  KeyValueStore,
  RequestQueue,
} from 'crawlee';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { Execution } from '../execution/entities/execution.entity';
import { CrawleeTaskConfig } from './dto/execute-task.dto';
import { CrawleeEngineService } from './crawlee-engine.service';
import { TaskGateway } from './task.gateway';

export interface ResultItem {
  xpath: string;
  matchCount: number;
  base64: string;
}

interface Candidate {
  handle: playwright.ElementHandle<HTMLElement | SVGElement>;
  css: string;
  area: number;
  aspectRatio: number;
  childCount: number;
  tagTypes: Set<string>;
  hasImage: boolean;
}

export interface NodeItem {
  xpath: string;
  text?: string;
  tag?: string;
  href?: string;
  src?: string;
}

export interface ParseResult {
  basePath: string;
  texts: NodeItem[];
  images: NodeItem[];
  links: NodeItem[];
}
@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    private readonly crawleeEngineService: CrawleeEngineService,
    private readonly taskGateway: TaskGateway,
  ) {}

  async capturePreviewScreenshot(url: string): Promise<string> {
    if (!/^https?:\/\//.test(url)) {
      throw new BadRequestException('URL 格式不正确');
    }

    let browser;
    try {
      browser = await playwright.chromium.launch({ headless: true });

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true, // 这里加
      });

      const page = await context.newPage();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      const buffer = await page.screenshot({ fullPage: false });
      return buffer.toString('base64');
    } catch (e) {
      console.error('截图失败:', e);
      throw new InternalServerErrorException('截图失败');
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * 返回页面最有代表性的前 4 个元素，供预览
   */
  async captureListItemsByXpath(
    url: string,
    maxItems = 3,
    minArea = 1000,
    maxArea = 500000,
    targetAspectRatio = 1,
    tolerance = 0.3,
  ): Promise<ResultItem[]> {
    if (!/^https?:\/\//.test(url)) {
      throw new BadRequestException('URL 格式不正确');
    }

    let browser: playwright.Browser | undefined;

    try {
      browser = await playwright.chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
      const page = await context.newPage();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      const scrollStep = 1000;
      const maxScrollDistance = 8000;
      let scrolled = 0;

      while (scrolled < maxScrollDistance) {
        await page.mouse.wheel(0, scrollStep);
        scrolled += scrollStep;
        await page.waitForTimeout(1000);
      }

      const elements = await page.$$('body *');

      type Candidate = {
        handle: playwright.ElementHandle<HTMLElement>;
        xpath: string;
        area: number;
        aspectRatio: number;
        childCount: number;
        tagTypeCount: number;
        hasImage: boolean;
      };

      const candidates: Candidate[] = [];

      for (const el of elements) {
        try {
          if (!(await el.isVisible())) continue;

          const box = await el.boundingBox();
          if (!box) continue;

          const area = box.width * box.height;
          if (area < minArea || area > maxArea) continue;

          const aspectRatio = box.width / box.height;
          if (
            aspectRatio < targetAspectRatio - tolerance ||
            aspectRatio > targetAspectRatio + tolerance
          )
            continue;

          const childCount = await el.evaluate(
            (node) => node.childElementCount,
          );
          if (childCount < 3) continue;

          const tagTypeCount = await el.evaluate((node) => {
            const tags = new Set<string>();
            node
              .querySelectorAll('*')
              .forEach((c) => tags.add(c.tagName.toLowerCase()));
            return tags.size;
          });
          if (tagTypeCount < 3) continue;

          const hasImage = await el.evaluate(
            (node) => !!node.querySelector('img'),
          );

          // const xpath = ...  // 移除这个重复声明


          // 检查父节点是否被该 xpath 命中，如果命中则持续增强 xpath 唯一性
          // 生成xpath工具，支持多策略
          const genXpath = async (el, mode = 0) => {
            return el.evaluate((node: HTMLElement, mode: number) => {
              const tag = node.tagName.toLowerCase();
              const classList = (node.className || '')
                .split(/\s+/)
                .filter(Boolean);
              // 语义关键词，优先挑最长且最特殊的 class 替换最近的"recent"这种误命中
              const keywordPattern = /(item|card|list|cell|box|entry|block)/i;
              const semanticClasses = classList.filter((c) =>
                keywordPattern.test(c),
              );
              // 按长度优先挑选
              const bestClass = semanticClasses.sort(
                (a, b) => b.length - a.length,
              )[0];
              if (mode === 0 && bestClass) {
                // 完整 class 匹配，且更精确分词，避免只命中片段
                return `//${tag}[contains(concat(' ', @class, ' '), ' ${bestClass} ')]`;
              }
              if ((mode === 0 || mode === 1) && classList.length > 0) {
                // 回退：兜底取第1个完整 class
                const c = classList[0];
                return `//${tag}[contains(concat(' ', @class, ' '), ' ${c} ')]`;
              }
              // mode 2: tag + nth-of-type
              if (node.parentElement) {
                const siblings = Array.from(node.parentElement.children).filter(
                  (s: Element) => s.tagName.toLowerCase() === tag,
                );
                if (siblings.length > 1) {
                  let idx = 1;
                  for (const sib of siblings) {
                    if (sib === node) break;
                    idx++;
                  }
                  return `//${tag}[${idx}]`;
                }
              }
              return `//${tag}`;
            }, mode);
          };

          // 生成parent的xpath
          const getParentXpath = async (el, mode = 0) => {
            return el.evaluate((node: HTMLElement, mode: number) => {
              const tag = node.tagName.toLowerCase();
              const classList = (node.className || '')
                .split(/\s+/)
                .filter(Boolean);
            const semanticClass = classList.find((c) =>
              /(item|card|list|cell|box|entry|block)/i.test(c),
            );
              if (mode === 0 && semanticClass) {
              return `//${tag}[contains(@class, '${semanticClass}')]`;
            }
              if ((mode === 0 || mode === 1) && classList.length > 0) {
              const c = classList[0].slice(0, 4);
              return `//${tag}[contains(@class, '${c}')]`;
            }
              if (node.parentElement) {
                const siblings = Array.from(node.parentElement.children).filter(
                  (s: Element) => s.tagName.toLowerCase() === tag,
                );
                if (siblings.length > 1) {
                  let idx = 1;
                  for (const sib of siblings) {
                    if (sib === node) break;
                    idx++;
                  }
                  return `//${tag}[${idx}]`;
                }
              }
            return `//${tag}`;
            }, mode);
          };

          let xpath = await genXpath(el, 0);
          let parentHandle = (await el.evaluateHandle(
            (node) => node.parentElement,
          )) as playwright.ElementHandle<HTMLElement>;
          let parentXpath = parentHandle
            ? await getParentXpath(parentHandle, 0)
            : '';
          let parentMatched = false,
            maxMode = 3,
            mode = 0;
          // 先查简单xpath是否撞父级，如果撞则 parentXpath+//+selfXpath
          while (parentHandle && mode < maxMode) {
            parentMatched = await parentHandle.evaluate((parent, xpath) => {
              if (!parent) return false;
              const r = document.evaluate(
                xpath,
                parent,
                null,
                XPathResult.ORDERED_NODE_ITERATOR_TYPE,
                null,
              );
              let node = r.iterateNext();
              while (node) {
                if (node === parent) {
                  return true;
                }
                node = r.iterateNext();
              }
              return false;
            }, xpath);
            if (!parentMatched) break;
            // 如果撞了，直接组合parentXpath与selfXpath:
            if (parentXpath && xpath) {
              xpath = parentXpath + '//' + xpath.replace(/^\//, '');
            } else {
              mode++;
              xpath = await genXpath(el, mode);
              parentXpath = await getParentXpath(parentHandle, mode);
            }
          }
          await parentHandle?.dispose();
            if (parentMatched) continue;

          candidates.push({
            handle: el as playwright.ElementHandle<HTMLElement>,
            xpath,
            area,
            aspectRatio,
            childCount,
            tagTypeCount,
            hasImage,
          });
        } catch {
          continue;
        }
      }

      const scored = candidates
        .map((c) => ({
          candidate: c,
          score:
            (c.hasImage ? 60 : 0) +
            c.childCount * 2 +
            c.tagTypeCount * 3 -
            Math.abs(targetAspectRatio - c.aspectRatio) * 10,
        }))
        .sort((a, b) => b.score - a.score);

      const results: ResultItem[] = [];
      const usedXpaths = new Set<string>();

      for (const { candidate } of scored) {
        if (results.length >= maxItems) break;

        const xpath = candidate.xpath;
        if (usedXpaths.has(xpath)) continue;

        const matchCount = await page.locator(`xpath=${xpath}`).count();

        if (matchCount < 3 || matchCount > 200) continue;

        try {
          await candidate.handle.scrollIntoViewIfNeeded();
          const buffer = await candidate.handle.screenshot({ type: 'png' });

          results.push({
            xpath,
            matchCount,
            base64: buffer.toString('base64'),
          });

          usedXpaths.add(xpath);
        } catch {
          continue;
        }
      }

      return results;
    } catch (err) {
      console.error('列表结构分析失败:', err);
      throw new InternalServerErrorException('列表结构分析失败');
    } finally {
      if (browser) await browser.close();
    }
  }

  async parseByXpath(url: string, xpath: string, waitSelector?: string) {
    let browser: playwright.Browser | null = null;

    try {
      browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      if (waitSelector) {
        await page
          .waitForSelector(waitSelector, { timeout: 5000 })
          .catch(() => null);
      }

      const result = await page.evaluate((baseXpath) => {
        function getRelativeXPath(base: Element, el: Element): string {
          const parts: string[] = [];
          while (el && el !== base) {
            let index = 1;
            let sib = el.previousElementSibling;
            while (sib) {
              if (sib.tagName === el.tagName) index++;
              sib = sib.previousElementSibling;
            }
            parts.unshift(`${el.tagName.toLowerCase()}[${index}]`);
            el = el.parentElement!;
          }
          return './/' + parts.join('/');
        }

        function isCssLike(text: string) {
          const t = text.trim();
          if (!t) return false;
          const hasBraces = /{[^}]*}/.test(t);
          const hasCssProp =
            /(color|font|margin|padding|display|position|width|height|background|border)\s*:/i.test(
              t,
            );
          const startsSelector = /^[.#][\w-]+\s*[{:]/.test(t);
          const manySemicolons = t.split(';').length >= 3;
          return (
            hasBraces || (hasCssProp && (startsSelector || manySemicolons))
          );
        }

        const iterator = document.evaluate(
          baseXpath,
          document,
          null,
          XPathResult.ORDERED_NODE_ITERATOR_TYPE,
          null,
        );

        let el = iterator.iterateNext() as HTMLElement | null;

        while (el) {
          const texts: any[] = [];
          const images: any[] = [];
          const links: any[] = [];

          const tagName = el.tagName.toLowerCase();

          // 节点自身文本
          const selfText = el.textContent?.trim();
          if (selfText && !isCssLike(selfText)) {
            texts.push({
              xpath:
                el.children.length === 0
                  ? baseXpath
                  : getRelativeXPath(document.body, el),
              text: selfText,
              tag: tagName,
            });
          }

          // 节点自身链接
          if (tagName === 'a' && (el as HTMLAnchorElement).href) {
            links.push({
              xpath:
                el.children.length === 0
                  ? baseXpath
                  : getRelativeXPath(document.body, el),
              href: (el as HTMLAnchorElement).href,
            });
          }

          // 节点自身图片
          if (tagName === 'img' && (el as HTMLImageElement).src) {
            images.push({
              xpath:
                el.children.length === 0
                  ? baseXpath
                  : getRelativeXPath(document.body, el),
              src: (el as HTMLImageElement).src,
            });
          }

          // 遍历子节点
          if (el.children.length > 0) {
            el.querySelectorAll('*').forEach((child) => {
              const tag = child.tagName.toLowerCase();
              const isUiControl =
                tag === 'button' ||
                child.getAttribute('role') === 'button' ||
                child.closest('button') ||
                child.hasAttribute('tabindex');
              if (isUiControl) return;

              if (tag === 'img' && (child as HTMLImageElement).src) {
                images.push({
                  xpath: getRelativeXPath(el!, child),
                  src: (child as HTMLImageElement).src,
                });
              }

              if (tag === 'a' && (child as HTMLAnchorElement).href) {
                links.push({
                  xpath: getRelativeXPath(el!, child),
                  href: (child as HTMLAnchorElement).href,
                });
              }

              if (child.children.length === 0) {
                const t = child.textContent?.trim();
                if (t && t.length >= 1 && !isCssLike(t)) {
                  texts.push({
                    xpath: getRelativeXPath(el!, child),
                    text: t,
                    tag,
                  });
                }
              }
            });
          }

          // ⭐ 如果目标元素不是 img，则 texts 必须长度不为0
          if (tagName !== 'img' && texts.length === 0) {
            el = iterator.iterateNext() as HTMLElement | null;
            continue;
          }

          // 返回第一个符合条件的元素
          return {
            baseXpath:
              el.children.length === 0
                ? baseXpath
                : getRelativeXPath(document.body, el),
            texts,
            images,
            links,
          };
        }

        return null;
      }, xpath);

      if (!result) return { count: 0, items: null };
      return { count: 1, items: result };
    } catch (e) {
      console.error('XPath 解析失败', e);
      throw new InternalServerErrorException('XPath 解析失败');
    } finally {
      if (browser) await browser.close();
    }
  }

  async matchByXpath(url: string, xpath: string) {
    let browser: playwright.Browser | null = null;

    try {
      browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      return await page.evaluate((xp) => {
        const snapshot = document.evaluate(
          xp,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );

        const texts: string[] = [];

        for (let i = 0; i < snapshot.snapshotLength; i++) {
          const node = snapshot.snapshotItem(i) as HTMLElement;
          const text = node?.textContent?.trim();
          if (text) texts.push(text);
        }

        return {
          count: snapshot.snapshotLength,
          samples: texts.slice(0, 10),
        };
      }, xpath);
    } catch (e) {
      throw new InternalServerErrorException('XPath 匹配失败');
    } finally {
      if (browser) await browser.close();
    }
  }
  // task.service.ts
  async parseByXpathAll(url: string, xpath: string) {
    let browser: playwright.Browser | null = null;

    try {
      browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage();

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      const result = await page.evaluate((baseXpath) => {
        function getRelativeXPath(base: Element, el: Element): string {
          const parts: string[] = [];
          while (el && el !== base) {
            let index = 1;
            let sib = el.previousElementSibling;
            while (sib) {
              if (sib.tagName === el.tagName) index++;
              sib = sib.previousElementSibling;
            }
            parts.unshift(`${el.tagName.toLowerCase()}[${index}]`);
            el = el.parentElement!;
          }
          return './/' + parts.join('/');
        }

        const iterator = document.evaluate(
          baseXpath,
          document,
          null,
          XPathResult.ORDERED_NODE_ITERATOR_TYPE,
          null,
        );

        const elements: HTMLElement[] = [];
        let el = iterator.iterateNext() as HTMLElement | null;
        while (el) {
          elements.push(el);
          el = iterator.iterateNext() as HTMLElement | null;
        }

        const items = elements.map((baseEl) => {
          const texts: any[] = [];
          const images: any[] = [];
          const links: any[] = [];

          baseEl.querySelectorAll('*').forEach((el) => {
            const tag = el.tagName.toLowerCase();

            // 排除 UI 控件
            const isUiControl =
              tag === 'button' ||
              el.getAttribute('role') === 'button' ||
              el.closest('button') ||
              el.hasAttribute('tabindex');
            if (isUiControl) return;

            // 图片
            if (tag === 'img' && (el as HTMLImageElement).src) {
              images.push({
                xpath: getRelativeXPath(baseEl, el),
                src: (el as HTMLImageElement).src,
              });
            }

            // 链接
            if (tag === 'a' && (el as HTMLAnchorElement).href) {
              links.push({
                xpath: getRelativeXPath(baseEl, el),
                href: (el as HTMLAnchorElement).href,
              });
            }

            // 文本（没有子元素）
            if (el.children.length === 0) {
              const text = el.textContent?.trim();
              if (text && text.length >= 1) {
                texts.push({
                  xpath: getRelativeXPath(baseEl, el),
                  text,
                  tag,
                });
              }
            }
          });

          return {
            baseXpath: getRelativeXPath(document.body, baseEl),
            texts,
            images,
            links,
          };
        });

        return items;
      }, xpath);

      return {
        count: result.length,
        items: result,
      };
    } catch (e) {
      throw new InternalServerErrorException('XPath 解析失败');
    } finally {
      if (browser) await browser.close();
    }
  }

  // task.service.ts
  async parseByJsPath(
    url: string,
    jsPath: string,
    waitSelector?: string,
  ): Promise<{ count: number; items: ParseResult | null }> {
    let browser: playwright.Browser | null = null;

    try {
      browser = await playwright.chromium.launch({ headless: false });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // 可选等待选择器
      if (waitSelector) {
        await page
          .waitForSelector(waitSelector, { timeout: 10000 })
          .catch(() => null);
      }

      // 滚动触发懒加载
      await page.evaluate(async () => {
        const distance = 2000;
        const delay = 2000;
        const maxScroll = 10000;
        let total = 0;

        while (total < maxScroll) {
          window.scrollBy(0, distance);
          total += distance;
          await new Promise((res) => setTimeout(res, delay));
        }
      });

      // JSPath 解析，分解每层 CSS selector
      const selectorRegex = /document\.querySelector\(["'](.+?)["']\)/g;
      const selectors: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = selectorRegex.exec(jsPath)) !== null) {
        selectors.push(match[1]);
      }
      if (!selectors.length) return { count: 0, items: null };

      // 第 0 层 host
      let elementHandle: playwright.ElementHandle<HTMLElement> | null =
        (await page.waitForSelector(selectors[0], {
          timeout: 10000,
        })) as playwright.ElementHandle<HTMLElement> | null;

      // 逐层 shadowRoot 查询
      for (let i = 1; i < selectors.length; i++) {
        if (!elementHandle) break;
        elementHandle = (await elementHandle.evaluateHandle(
          (el, sel) => el.shadowRoot?.querySelector(sel) ?? null,
          selectors[i],
        )) as playwright.ElementHandle<HTMLElement> | null;
      }

      if (!elementHandle) return { count: 0, items: null };

      // 提取文本 / 图片 / 链接
      const result = await elementHandle.evaluate((root: HTMLElement) => {
        const texts: NodeItem[] = [];
        const images: NodeItem[] = [];
        const links: NodeItem[] = [];

        function getRelativeXPath(base: Element, el: Element): string {
          const parts: string[] = [];
          while (el && el !== base) {
            let index = 1;
            let sib = el.previousElementSibling;
            while (sib) {
              if (sib.tagName === el.tagName) index++;
              sib = sib.previousElementSibling;
            }
            parts.unshift(`${el.tagName.toLowerCase()}[${index}]`);
            el = el.parentElement!;
          }
          return './/' + parts.join('/');
        }

        function isCssLike(text: string) {
          const t = text.trim();
          if (!t) return false;
          const hasBraces = /{[^}]*}/.test(t);
          const hasCssProp =
            /(color|font|margin|padding|display|position|width|height|background|border)\s*:/i.test(
              t,
            );
          const startsSelector = /^[.#][\w-]+\s*[{:]/.test(t);
          const manySemicolons = t.split(';').length >= 3;
          return (
            hasBraces || (hasCssProp && (startsSelector || manySemicolons))
          );
        }

        function traverse(node: HTMLElement) {
          const tag = node.tagName.toLowerCase();
          const ignoreTags = ['script', 'style', 'noscript', 'template'];
          if (ignoreTags.includes(tag)) return;

          const t = node.textContent?.trim();
          if (t && !isCssLike(t))
            texts.push({
              xpath: getRelativeXPath(document.body, node),
              text: t,
              tag,
            });
          if (tag === 'img' && (node as HTMLImageElement).src)
            images.push({
              xpath: getRelativeXPath(document.body, node),
              src: (node as HTMLImageElement).src,
            });
          if (tag === 'a' && (node as HTMLAnchorElement).href)
            links.push({
              xpath: getRelativeXPath(document.body, node),
              href: (node as HTMLAnchorElement).href,
            });

          // 遍历 children
          for (const c of Array.from(node.children)) traverse(c as HTMLElement);

          // 遍历 shadowRoot
          const shadowRoot = (node as HTMLElement).shadowRoot;
          if (shadowRoot) {
            for (const c of Array.from(shadowRoot.children))
              traverse(c as HTMLElement);
          }
        }

        traverse(root);

        if (texts.length === 0 && images.length === 0 && links.length === 0)
          return null;
        return { basePath: '', texts, images, links };
      });

      if (!result) return { count: 0, items: null };
      return { count: 1, items: result };
    } catch (e) {
      console.error('JSPath 解析失败', e);
      throw new InternalServerErrorException('JSPath 解析失败');
    } finally {
      if (browser) await browser.close();
    }
  }

  async executeTaskByCrawlee(
    taskId?: string,
    taskName?: string,
    url?: string,
    customConfig?: CrawleeTaskConfig,
    overrideConfig?: Partial<CrawleeTaskConfig>,
    userId?: number,
  ) {
    let task;

    if (taskId) {
      // 使用现有任务
      task = await this.taskRepository.findOne({
        where: { id: parseInt(taskId) },
        relations: ['user'],
      });
      if (!task) {
        throw new BadRequestException('任务不存在');
      }
      // 检查任务是否属于当前用户
      if (task.user.id !== userId) {
        throw new BadRequestException('无权限访问此任务');
      }
    } else {
      // 创建新任务
      if (!taskName || !url) {
        throw new BadRequestException('创建新任务需要提供任务名称和URL');
      }

      const newTask = this.taskRepository.create({
        name: taskName,
        url: url,
        config: customConfig ? JSON.stringify(customConfig) : '{}',
        status: 'pending',
        user: { id: userId } as any, // 设置用户关联
      });
      task = await this.taskRepository.save(newTask);

      // 广播新任务创建消息
      this.taskGateway.broadcastTaskCreated({
        id: task.id,
        name: task.name,
        url: task.url,
        status: task.status,
        progress: 0,
        lastExecutionTime: null,
        createdAt: task.createdAt.toISOString(),
        endTime: task.endTime?.toISOString() || null,
        latestExecution: null,
      });
    }

    // 创建执行记录
    const execution = this.executionRepository.create({
      task,
      taskId: task.id,
      status: 'running',
      log: '开始执行任务...',
    });
    await this.executionRepository.save(execution);

    try {
      // 解析配置
      let config: CrawleeTaskConfig;
      if (customConfig) {
        config = customConfig;
      } else if (task.config) {
        config = JSON.parse(task.config);
      } else {
        throw new BadRequestException('任务配置为空');
      }

      // 应用覆盖配置
      if (overrideConfig) {
        config = { ...config, ...overrideConfig };
      }

      // 设置默认值 - 默认使用PlaywrightCrawler
      const defaultConfig: CrawleeTaskConfig = {
        crawlerType: 'playwright', // 默认为PlaywrightCrawler
        urls: [task.url],
        maxRequestsPerCrawl: 1,
        maxConcurrency: 1,
        headless: true,
        viewport: { width: 1920, height: 1080 },
        scrollEnabled: false,
        scrollDistance: 1000,
        scrollDelay: 1000,
        maxScrollDistance: 10000,
      };

      config = { ...defaultConfig, ...config };

      // 将任务添加到Crawlee引擎队列
      await this.crawleeEngineService.addTaskToQueue({
        taskId: task.id,
        executionId: execution.id,
        config,
      });

      return {
        executionId: execution.id,
        status: 'queued',
        message: '任务已添加到爬虫队列，等待执行',
        queueStatus: this.crawleeEngineService.getQueueStatus(),
      };
    } catch (error) {
      // 更新执行状态为失败
      execution.status = 'failed';
      execution.log = `执行失败: ${error.message}`;
      await this.executionRepository.save(execution);

      throw new InternalServerErrorException(`任务执行失败: ${error.message}`);
    }
  }

  // 获取爬虫引擎状态
  getCrawlerEngineStatus() {
    return this.crawleeEngineService.getQueueStatus();
  }

  // 计算任务进度
  private calculateProgress(status: string, log?: string): number {
    if (status === 'success') {
      return 100;
    }

    if (status === 'failed') {
      return 0;
    }

    if (status === 'pending') {
      return 0;
    }

    if (status === 'running') {
      // 尝试从日志中解析进度
      if (log) {
        // 查找类似 "已处理 50/100 个请求" 的模式
        const progressMatch = log.match(/已处理\s*(\d+)\/(\d+)/);
        if (progressMatch) {
          const current = parseInt(progressMatch[1]);
          const total = parseInt(progressMatch[2]);
          if (total > 0) {
            return Math.round((current / total) * 100);
          }
        }

        // 查找类似 "处理中... 75%" 的模式
        const percentMatch = log.match(/(\d+)%/);
        if (percentMatch) {
          return Math.min(parseInt(percentMatch[1]), 95); // 最高95%，留5%给完成
        }
      }

      // 默认运行中进度
      return 50;
    }

    return 0;
  }

  async deleteTask(taskId: number, userId: number) {
    // 检查任务是否存在且属于当前用户
    const task = await this.taskRepository.findOne({
      where: { id: taskId, user: { id: userId } },
    });

    if (!task) {
      throw new BadRequestException('任务不存在或无权限访问');
    }

    // 删除相关的执行记录
    await this.executionRepository.delete({ task: { id: taskId } });

    // 删除任务
    await this.taskRepository.delete(taskId);

    // 广播任务删除消息
    this.taskGateway.broadcastTaskDeleted(taskId, task.name, task.url);

    return { message: '任务删除成功' };
  }

  async deleteTaskByNameAndUrl(taskName: string, taskUrl: string, userId: number) {
    // 检查任务是否存在且属于当前用户
    const task = await this.taskRepository.findOne({
      where: {
        name: taskName,
        url: taskUrl,
        user: { id: userId }
      },
    });

    if (!task) {
      throw new BadRequestException('任务不存在或无权限访问');
    }

    // 获取相关的执行记录（用于删除结果文件）
    const executions = await this.executionRepository.find({
      where: { taskId: task.id },
      select: ['resultPath'],
    });

    // 删除结果文件
    const fs = require('fs').promises;
    for (const execution of executions) {
      if (execution.resultPath) {
        try {
          await fs.unlink(execution.resultPath);
          console.log(`删除结果文件: ${execution.resultPath}`);
        } catch (error) {
          console.warn(`删除结果文件失败: ${execution.resultPath}`, error);
        }
      }
    }

    // 删除截图文件
    if (task.screenshotPath) {
      try {
        const screenshotFullPath = `uploads/${task.screenshotPath}`;
        await fs.unlink(screenshotFullPath);
        console.log(`删除截图文件: ${screenshotFullPath}`);
      } catch (error) {
        console.warn(`删除截图文件失败: uploads/${task.screenshotPath}`, error);
      }
    }

    // 删除相关的执行记录
    await this.executionRepository.delete({ taskId: task.id });

    // 删除任务
    await this.taskRepository.delete(task.id);

    // 广播任务删除消息
    this.taskGateway.broadcastTaskDeleted(task.id, task.name, task.url);

    return { message: '任务删除成功' };
  }

  async getTaskList(
    userId: number,
    options: {
      page: number;
      limit: number;
      search?: string;
    },
  ) {
    const { page, limit, search } = options;
    const skip = (page - 1) * limit;

    // 构建查询条件
    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .where('task.user.id = :userId', { userId })
      .orderBy('task.createdAt', 'DESC') // 改为按创建时间排序
      .skip(skip)
      .take(limit);

    // 添加搜索条件
    if (search) {
      queryBuilder.andWhere(
        '(task.name LIKE :search OR task.url LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // 获取任务列表
    const [tasks, total] = await queryBuilder.getManyAndCount();

    // 为每个任务获取最新的执行记录
    const taskIds = tasks.map(task => task.id);
    let latestExecutions: any[] = [];
    if (taskIds.length > 0) {
      latestExecutions = await this.executionRepository
        .createQueryBuilder('execution')
        .where('execution.taskId IN (:...taskIds)', { taskIds })
        .orderBy('execution.startTime', 'DESC')
        .getMany();
    }

    // 创建执行记录的Map，按任务ID分组
    const executionsByTaskId = new Map<number, typeof latestExecutions[0]>();
    for (const execution of latestExecutions) {
      if (!executionsByTaskId.has(execution.taskId)) {
        executionsByTaskId.set(execution.taskId, execution);
      }
    }

    // 构建返回数据
    const taskList = tasks.map(task => {
      const latestExecution = executionsByTaskId.get(task.id);

      // 计算任务状态
      let status = task.status;
      let progress = 0;
      let lastExecutionTime: Date | null = null;

      if (latestExecution) {
        // 如果有执行记录，使用执行记录的状态
        status = latestExecution.status;
        lastExecutionTime = latestExecution.startTime;

        // 计算进度（根据执行日志智能计算）
        progress = this.calculateProgress(status, latestExecution.log);
      }

      return {
        // 移除ID字段以提高安全性
        name: task.name,
        url: task.url,
        status,
        progress,
        lastExecutionTime,
        createdAt: task.createdAt,
        endTime: task.endTime, // 改为 endTime
        screenshotPath: task.screenshotPath,
        latestExecution: latestExecution ? {
          status: latestExecution.status,
          log: latestExecution.log,
          startTime: latestExecution.startTime,
          endTime: latestExecution.endTime,
          resultPath: latestExecution.resultPath, // 添加结果文件路径
        } : null,
      };
    });

    return {
      data: taskList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getExecutionResult(executionId: number, userId: number) {
    // 获取执行记录
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
      relations: ['task', 'task.user'],
    });

    if (!execution) {
      throw new BadRequestException('执行记录不存在');
    }

    // 检查任务是否属于当前用户
    if (execution.task.user.id !== userId) {
      throw new BadRequestException('无权限访问此执行结果');
    }

    // 如果有结果文件路径，读取文件内容
    if (execution.resultPath) {
      const fs = require('fs').promises;
      try {
        const fileContent = await fs.readFile(execution.resultPath, 'utf-8');
        const results = JSON.parse(fileContent);
        return {
          executionId: execution.id,
          taskId: execution.task.id,
          taskName: execution.task.name,
          status: execution.status,
          resultCount: results.length,
          results,
          createdAt: execution.startTime,
        };
      } catch (error) {
        throw new InternalServerErrorException('读取结果文件失败');
      }
    }

    return {
      executionId: execution.id,
      taskId: execution.task.id,
      taskName: execution.task.name,
      status: execution.status,
      resultCount: 0,
      results: [],
      createdAt: execution.startTime,
    };
  }
}
