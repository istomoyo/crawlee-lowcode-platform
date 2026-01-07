import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  Logger,
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
import { FilePackageService } from './file-package.service';

// 默认“类真实浏览器”配置
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_VIEWPORT = { width: 1366, height: 768 };

/**
 * 创建带“拟真”设置的 Playwright Page
 * - 自定义 UA / 语言 / 时区
 * - 关闭 webdriver 痕迹
 * - 允许后续补充 headers / cookies
 */
async function createStealthPage(headless = true) {
  const browser = await playwright.chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    viewport: DEFAULT_VIEWPORT,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    geolocation: { longitude: 116.397, latitude: 39.917 },
    permissions: ['geolocation'],
  });

  // 注入常见反自动化补丁
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh', 'en-US', 'en'],
    });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
  });

  const page = await context.newPage();
  return { browser, page };
}

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
  private readonly logger = new Logger(TaskService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    private readonly crawleeEngineService: CrawleeEngineService,
    private readonly taskGateway: TaskGateway,
    private readonly filePackageService: FilePackageService,
  ) {}

  async capturePreviewScreenshot(url: string): Promise<string> {
    if (!/^https?:\/\//.test(url)) {
      throw new BadRequestException('URL 格式不正确');
    }

    let browser;
    try {
      const stealth = await createStealthPage(true);
      browser = stealth.browser;
      const page = stealth.page;

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => null);

      const buffer = await page.screenshot({ fullPage: false });
      return buffer.toString('base64');
    } catch (e) {
      this.logger.error('截图失败', e);
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
      const stealth = await createStealthPage(true);
      browser = stealth.browser;
      const page = stealth.page;

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
      this.logger.error('列表结构分析失败', err);
      throw new InternalServerErrorException('列表结构分析失败');
    } finally {
      if (browser) await browser.close();
    }
  }

  async parseByXpath(url: string, xpath: string, waitSelector?: string, contentFormat: 'text' | 'html' | 'markdown' | 'smart' = 'text') {
    this.logger.debug(`parseByXpath called with contentFormat: ${contentFormat}`);

    let browser: playwright.Browser | null = null;

    try {
      const stealth = await createStealthPage(true);
      browser = stealth.browser;
      const page = stealth.page;

      this.logger.debug(`Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // 等待额外时间让动态内容加载
      await page.waitForTimeout(2000);

      // 尝试等待网络空闲
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch (e) {
        this.logger.debug('Network idle timeout, continuing...');
      }

      if (waitSelector) {
        this.logger.debug(`Waiting for selector: ${waitSelector}`);
        await page
          .waitForSelector(waitSelector, { timeout: 5000 })
          .catch(() => null);
      }

      // 再次等待，确保动态内容加载完成
      await page.waitForTimeout(1000);

      // 如果需要 markdown 转换，注入 turndown 库
      if (contentFormat === 'markdown') {
        await page.addScriptTag({
          url: 'https://cdn.jsdelivr.net/npm/turndown@7.1.3/dist/turndown.js'
        });
        // 等待脚本加载
        await page.waitForTimeout(500);
      }

      // 添加调试信息
      const pageInfo = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        const articleElements = document.querySelectorAll('article');
        const postElements = document.querySelectorAll('[id="post"]');

        return {
          totalElements: allElements.length,
          articleCount: articleElements.length,
          postElementCount: postElements.length,
          bodyHTML: document.body ? document.body.innerHTML.substring(0, 500) : 'No body',
          title: document.title,
          url: window.location.href
        };
      });

      this.logger.debug('Page info:', pageInfo);

      const result = await page.evaluate(({ xpath, contentFormat }) => {
        // 浏览器端日志，保留用于调试
        if (typeof console !== 'undefined') {
          console.log(`Evaluating XPath: ${xpath}`);
        }
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

        // 使用 turndown 进行 markdown 转换
        function convertElementToMarkdown(element: HTMLElement): string {
          // 检查 turndown 是否已加载
          if (typeof (window as any).TurndownService === 'undefined') {
            console.error('TurndownService is not available');
            // 降级到简单文本提取
            return element.textContent?.trim() || '';
          }

          try {
            const turndownService = new (window as any).TurndownService({
              headingStyle: 'atx',
              codeBlockStyle: 'fenced',
              bulletListMarker: '-',
              emDelimiter: '*',
              strongDelimiter: '**',
            });

            // 转换 HTML 为 Markdown
            const markdown = turndownService.turndown(element.outerHTML || element.innerHTML);
            return markdown.trim();
          } catch (error) {
            console.error('Markdown conversion error:', error);
            // 降级到简单文本提取
            return element.textContent?.trim() || '';
          }
        }

        // 如果是markdown格式，直接转换第一个匹配的元素
        if (contentFormat === 'markdown') {
          // 浏览器端日志，保留用于调试
          if (typeof console !== 'undefined') {
            console.log(`Looking for markdown content with XPath: ${xpath}`);
          }

          const firstElement = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue as HTMLElement | null;

          // 浏览器端日志，保留用于调试
          if (typeof console !== 'undefined') {
            console.log(`Markdown XPath result:`, firstElement ? firstElement.tagName : 'null');
          }

          if (!firstElement) {
            return null;
          }

          const markdownContent = convertElementToMarkdown(firstElement);
          if (!markdownContent || isCssLike(markdownContent)) {
            return null;
          }

          return {
            xpath: xpath,
            texts: [{
              xpath: xpath,
              text: markdownContent,
              tag: firstElement.tagName.toLowerCase(),
            }],
            images: [],
            links: [],
          };
        }

        // 普通处理逻辑
        // 浏览器端日志，保留用于调试
        if (typeof console !== 'undefined') {
          console.log(`Looking for elements with XPath: ${xpath}`);
        }

        const iterator = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.ORDERED_NODE_ITERATOR_TYPE,
          null,
        );

        let el = iterator.iterateNext() as HTMLElement | null;
        // 浏览器端日志，保留用于调试
        if (typeof console !== 'undefined') {
          console.log(`First XPath result:`, el ? el.tagName : 'null');
        }

        while (el) {
          const texts: any[] = [];
          const images: any[] = [];
          const links: any[] = [];

          const tagName = el.tagName.toLowerCase();

          // 智能检测内容类型
          function detectContentType(element: HTMLElement): 'article' | 'list' | 'mixed' | 'simple' {
            const text = element.textContent?.trim() || '';
            const wordCount = text.split(/\s+/).length;

            // 检查是否包含典型的文章结构
            const hasHeadings = element.querySelectorAll('h1, h2, h3, h4, h5, h6').length > 0;
            const hasParagraphs = element.querySelectorAll('p').length > 2;
            const hasArticleTags = element.tagName.toLowerCase() === 'article' ||
                                  element.closest('article') !== null;
            const hasContentClass = /\b(content|post|article|entry|text)\b/i.test(element.className);

            if ((hasHeadings && hasParagraphs) || hasArticleTags || hasContentClass || wordCount > 100) {
              return 'article';
            }

            // 检查是否为列表
            const hasListItems = element.querySelectorAll('li').length > 2;
            if (hasListItems) {
              return 'list';
            }

            // 检查是否包含多种内容类型
            const hasImages = element.querySelectorAll('img').length > 0;
            const hasLinks = element.querySelectorAll('a').length > 1;
            if (hasImages || hasLinks) {
              return 'mixed';
            }

            return 'simple';
          }


          // 原有的简单HTML到Markdown转换
          function convertHtmlToMarkdown(html: string): string {
            return html
              .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
              .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
              .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
              .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
              .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n')
              .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n')
              .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
              .replace(/<br[^>]*\/?>/gi, '\n')
              .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
              .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
              .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
              .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
              .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
              .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
              .replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1')
              .replace(/<ol[^>]*>(.*?)<\/ol>/gi, '$1')
              .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
              .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n')
              .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n')
              .replace(/<[^>]+>/g, '')
              .trim();
          }

          // 节点自身文本
          let selfText: string | null = null;
          const contentType = detectContentType(el);

          if (contentFormat === 'text') {
            selfText = el.textContent?.trim() || null;
          } else if (contentFormat === 'html') {
            selfText = el.innerHTML?.trim() || null;
          } else if (contentFormat === 'smart') {
            // 智能提取模式 - 根据内容类型自动选择最佳格式
            if (contentType === 'article') {
              selfText = convertElementToMarkdown(el);
            } else if (contentType === 'list') {
              // 对于列表，使用Markdown列表格式
              selfText = convertElementToMarkdown(el);
            } else {
              // 对于简单内容，使用纯文本
              selfText = el.textContent?.trim() || null;
            }
          }
          if (selfText && !isCssLike(selfText)) {
            texts.push({
              xpath:
                el.children.length === 0
                  ? xpath
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
                  ? xpath
                  : getRelativeXPath(document.body, el),
              href: (el as HTMLAnchorElement).href,
            });
          }

          // 节点自身图片
          if (tagName === 'img' && (el as HTMLImageElement).src) {
            images.push({
              xpath:
                el.children.length === 0
                  ? xpath
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
            xpath:
              el.children.length === 0
                ? xpath
                : getRelativeXPath(document.body, el),
            texts,
            images,
            links,
          };
        }

        return null;
      }, { xpath, contentFormat });

      if (!result) return { count: 0, items: null };
      return { count: 1, items: result };
    } catch (e) {
      this.logger.error('XPath 解析失败', e);
      throw new InternalServerErrorException('XPath 解析失败');
    } finally {
      if (browser) await browser.close();
    }
  }

  async matchByXpath(url: string, xpath: string) {
    let browser: playwright.Browser | null = null;

    try {
      const stealth = await createStealthPage(true);
      browser = stealth.browser;
      const page = stealth.page;

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
      const stealth = await createStealthPage(true);
      browser = stealth.browser;
      const page = stealth.page;

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      const result = await page.evaluate((xpath) => {
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
          xpath,
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
            xpath: getRelativeXPath(document.body, baseEl),
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
    contentFormat: 'text' | 'html' | 'markdown' = 'text',
  ): Promise<{ count: number; items: ParseResult | null }> {
    let browser: playwright.Browser | null = null;

    try {
      const stealth = await createStealthPage(false);
      browser = stealth.browser;
      const page = stealth.page;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // 可选等待选择器
      if (waitSelector) {
        await page
          .waitForSelector(waitSelector, { timeout: 10000 })
          .catch(() => null);
      }

      // 如果需要 markdown 转换，注入 turndown 库
      if (contentFormat === 'markdown') {
        await page.addScriptTag({
          url: 'https://cdn.jsdelivr.net/npm/turndown@7.1.3/dist/turndown.js'
        });
        // 等待脚本加载
        await page.waitForTimeout(500);
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

      let elementHandle: playwright.ElementHandle<HTMLElement> | null = null;

      // 检查是否是我们的增强JSPath语法
      if (jsPath.startsWith('(() => {') && jsPath.endsWith('})()')) {
        // 处理我们自定义的Shadow DOM语法
        const result = await page.evaluate(jsPath);
        const elements = Array.isArray(result) ? result : [result];

        if (!elements || elements.length === 0 || !elements[0]) {
          return { count: 0, items: null };
        }

        // 假设结果是元素数组，取第一个
        elementHandle = elements[0] as any;
      } else {
        // 原有的JSPath解析逻辑
      const selectorRegex = /document\.querySelector\(["'](.+?)["']\)/g;
      const selectors: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = selectorRegex.exec(jsPath)) !== null) {
        selectors.push(match[1]);
      }
      if (!selectors.length) return { count: 0, items: null };

      // 第 0 层 host
        elementHandle = (await page.waitForSelector(selectors[0], {
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
      }

      if (!elementHandle) return { count: 0, items: null };

      // 提取文本 / 图片 / 链接
      const result = await elementHandle.evaluate((root: HTMLElement, contentFormat: string) => {
        // 使用 turndown 进行 markdown 转换
        function convertElementToMarkdown(element: HTMLElement): string {
          // 检查 turndown 是否已加载
          if (typeof (window as any).TurndownService === 'undefined') {
            console.error('TurndownService is not available');
            // 降级到简单文本提取
            return element.textContent?.trim() || '';
          }

          try {
            const turndownService = new (window as any).TurndownService({
              headingStyle: 'atx',
              codeBlockStyle: 'fenced',
              bulletListMarker: '-',
              emDelimiter: '*',
              strongDelimiter: '**',
            });

            // 转换 HTML 为 Markdown
            const markdown = turndownService.turndown(element.outerHTML || element.innerHTML);
            return markdown.trim();
          } catch (error) {
            console.error('Markdown conversion error:', error);
            // 降级到简单文本提取
            return element.textContent?.trim() || '';
          }
        }

        // 如果是markdown格式，直接转换整个元素为markdown
        if (contentFormat === 'markdown') {
          const markdownContent = convertElementToMarkdown(root);
          if (!markdownContent) {
            return null;
          }

          return {
            basePath: '',
            texts: [{
              xpath: '',
              text: markdownContent,
              tag: root.tagName.toLowerCase(),
            }],
            images: [],
            links: [],
          };
        }

        // 普通处理逻辑
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

          let t: string | null = null;
          if (contentFormat === 'text') {
            t = node.textContent?.trim() || null;
          } else if (contentFormat === 'html') {
            t = node.innerHTML?.trim() || null;
          } else if (contentFormat === 'smart') {
            // 智能提取模式
            t = node.textContent?.trim() || null;
          }
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
      }, contentFormat);

      if (!result) return { count: 0, items: null };
      return { count: 1, items: result };
    } catch (e) {
      this.logger.error('JSPath 解析失败', e);
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
        // Normalize potential nested wrappers like { config: { ... } }
        // This helps support payloads like:
        // { "name": "...", "url": "...", "config": { "name": "...", "urls": [...] } }
        if (config && typeof config === 'object') {
          const anyConfig: any = config as any;
          if (anyConfig.config && typeof anyConfig.config === 'object') {
            config = anyConfig.config as CrawleeTaskConfig;
          }
        }
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
          this.logger.log(`删除结果文件: ${execution.resultPath}`);
        } catch (error) {
          this.logger.warn(`删除结果文件失败: ${execution.resultPath}`, error);
        }
      }
    }

    // 删除截图文件
    if (task.screenshotPath) {
      try {
        const screenshotFullPath = `uploads/${task.screenshotPath}`;
        await fs.unlink(screenshotFullPath);
        this.logger.log(`删除截图文件: ${screenshotFullPath}`);
      } catch (error) {
        this.logger.warn(`删除截图文件失败: uploads/${task.screenshotPath}`, error);
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
        id: task.id, // 添加ID字段用于前端唯一标识
        name: task.name,
        url: task.url,
        status,
        progress,
        config: task.config,
        script: task.script,
        lastExecutionTime,
        createdAt: task.createdAt,
        endTime: task.endTime, // 改为 endTime
        screenshotPath: task.screenshotPath,
        latestExecution: latestExecution ? {
          id: latestExecution.id, // 添加执行ID，用于打包等操作
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
    if (execution.task.user?.id !== userId) {
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

  /**
   * 根据执行结果JSON文件进行打包
   */
  async packageExecutionResult(
    executionId: number,
    userId: number,
    packageConfig: any,
  ): Promise<string> {
    // 获取执行记录
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
      relations: ['task', 'task.user'],
    });

    if (!execution) {
      throw new BadRequestException('执行记录不存在');
    }

    // 检查任务是否属于当前用户
    if (execution.task.user?.id !== userId) {
      throw new BadRequestException('无权限访问此执行结果');
    }

    // 检查是否有结果文件
    if (!execution.resultPath) {
      throw new BadRequestException('执行结果不存在，无法打包');
    }

    // 检查结果文件是否为JSON
    if (!execution.resultPath.toLowerCase().endsWith('.json')) {
      throw new BadRequestException('只能打包JSON格式的执行结果');
    }

    const fs = require('fs').promises;
    
    try {
      // 读取JSON结果文件
      const fileContent = await fs.readFile(execution.resultPath, 'utf-8');
      const results = JSON.parse(fileContent);

      if (!Array.isArray(results) || results.length === 0) {
        throw new BadRequestException('结果数据为空，无法打包');
      }

      // 生成打包文件路径
      const path = require('path');
      const timestamp = Date.now();
      const packageFilename = `task_${execution.task.id}_exec_${executionId}_package_${timestamp}.zip`;
      const packagePath = `uploads/results/${packageFilename}`;

      // 确保目录存在
      const packageDir = path.dirname(packagePath);
      await fs.mkdir(packageDir, { recursive: true });

      // 调用打包服务
      await this.filePackageService.packageDataFromJson(
        results,
        packageConfig,
        packagePath,
        execution.task.id,
        executionId,
      );

      return packagePath;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(`打包失败: ${error.message}`);
    }
  }

  async getStatistics(userId: number) {
    try {
      this.logger.debug(`开始获取用户统计数据，userId: ${userId}`);

      // 获取用户的所有任务
      const tasks = await this.taskRepository.find({
        where: { user: { id: userId } },
        relations: ['user'],
      });
      this.logger.debug(`获取到任务数量: ${tasks.length}`);

      // 获取用户的所有执行记录
      const executions = await this.executionRepository
        .createQueryBuilder('execution')
        .leftJoinAndSelect('execution.task', 'task')
        .leftJoinAndSelect('task.user', 'user')
        .where('user.id = :userId', { userId })
        .orderBy('execution.startTime', 'DESC')
        .getMany();
      this.logger.debug(`获取到执行记录数量: ${executions.length}`);

      // 计算基础统计
      const totalTasks = tasks.length;
      const successTasks = tasks.filter(task => task.status === 'success').length;
      const runningTasks = tasks.filter(task => task.status === 'running').length;
      const failedTasks = tasks.filter(task => task.status === 'failed').length;
      const successRate = totalTasks > 0 ? Math.round((successTasks / totalTasks) * 100) : 0;

      // 生成趋势数据（最近7天）
      const trendData = this.generateTrendData(executions);

      // 生成成功率趋势数据
      const successRateData = this.generateSuccessRateData(executions);

      // 生成数据量分布（异步读取文件）
      const dataDistribution = await this.generateDataDistribution(executions);

      // 生成执行时间分布
      const timeDistribution = this.generateTimeDistribution(executions);

      // 生成任务类型分布
      const taskTypeDistribution = this.generateTaskTypeDistribution(tasks);

      // 获取最近执行记录 - 添加安全检查，使用真实数据量
      const recentExecutions = await Promise.all(
        executions.slice(0, 10).map(async (execution) => {
          // 确保 execution.task 存在
          if (!execution.task) {
            this.logger.warn(`Execution ${execution.id} has no associated task`);
            return null;
          }

          // 从结果文件读取真实数据量
          const resultCount = await this.getResultCount(execution.resultPath);

          return {
            id: execution.id,
            taskName: execution.task.name || '未知任务',
            url: execution.task.url || '',
            status: execution.status || 'unknown',
            resultCount: resultCount,
            createdAt: execution.startTime ? execution.startTime.toISOString() : new Date().toISOString(),
          };
        })
      );
      const filteredRecentExecutions = recentExecutions.filter(Boolean); // 过滤掉 null 值

      return {
        totalTasks,
        successTasks,
        runningTasks,
        failedTasks,
        successRate,
        trendData,
        successRateData,
        dataDistribution,
        timeDistribution,
        taskTypeDistribution,
        recentExecutions: filteredRecentExecutions,
      };
    } catch (error) {
      this.logger.error('获取统计数据失败', error);
      throw new InternalServerErrorException(`获取统计数据失败: ${error.message}`);
    }
  }

  private generateTrendData(executions: any[]) {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // 设置为当天的00:00:00
    
    // 生成最近7天的日期
    const dailyStats: Array<{ day: string; success: number; failed: number; total: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // 格式化日期为 "MM-DD" 格式
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${month}-${day}`;
      
      // 筛选当天的执行记录
      const dayExecutions = executions.filter(exec => {
        if (!exec.startTime) return false;
        try {
          const execDate = new Date(exec.startTime);
          execDate.setHours(0, 0, 0, 0);
          return execDate.getTime() === date.getTime();
        } catch (error) {
          this.logger.warn(`Invalid startTime for execution: ${exec.id}, ${exec.startTime}`);
          return false;
        }
      });

      dailyStats.push({
        day: dateStr,
        success: dayExecutions.filter(exec => exec.status === 'success').length,
        failed: dayExecutions.filter(exec => exec.status === 'failed').length,
        total: dayExecutions.length,
      });
    }

    return dailyStats;
  }

  private generateSuccessRateData(executions: any[]) {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // 设置为当天的00:00:00
    
    // 生成最近7天的日期
    const successRateData: Array<{ day: string; rate: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // 格式化日期为 "MM-DD" 格式
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${month}-${day}`;
      
      // 筛选当天的执行记录
      const dayExecutions = executions.filter(exec => {
        if (!exec.startTime) return false;
        try {
          const execDate = new Date(exec.startTime);
          execDate.setHours(0, 0, 0, 0);
          return execDate.getTime() === date.getTime();
        } catch (error) {
          return false;
        }
      });

      const successCount = dayExecutions.filter(exec => exec.status === 'success').length;
      const totalCount = dayExecutions.length;
      const rate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

      successRateData.push({
        day: dateStr,
        rate,
      });
    }

    return successRateData;
  }

  private async generateDataDistribution(executions: any[]) {
    // 异步读取所有执行记录的数据量
    const counts = await Promise.all(
      executions.map(exec => this.getResultCount(exec.resultPath))
    );

    const distribution = counts.reduce((acc, count) => {
      if (count === 0) return acc;
      else if (count <= 100) acc.small++;
      else if (count <= 1000) acc.medium++;
      else acc.large++;
      return acc;
    }, { small: 0, medium: 0, large: 0 });

    return [
      { name: '小数据量(0-100)', value: distribution.small, color: '#3B82F6' },
      { name: '中数据量(100-1000)', value: distribution.medium, color: '#10B981' },
      { name: '大数据量(1000+)', value: distribution.large, color: '#F59E0B' },
    ].filter(item => item.value > 0);
  }

  private generateTimeDistribution(executions: any[]) {
    const distribution = executions.reduce((acc, exec) => {
      if (!exec.startTime || !exec.endTime) return acc;

      try {
        const startTime = new Date(exec.startTime);
        const endTime = new Date(exec.endTime);

        // 确保日期有效
        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return acc;

        const duration = endTime.getTime() - startTime.getTime();
        const seconds = duration / 1000;

        if (seconds <= 30) acc.fast++;
        else if (seconds <= 120) acc.medium++;
        else if (seconds <= 600) acc.slow++;
        else acc.verySlow++;
      } catch (error) {
        this.logger.warn(`Failed to calculate duration for execution: ${exec.id}`, error);
        // 跳过这个执行记录
      }

      return acc;
    }, { fast: 0, medium: 0, slow: 0, verySlow: 0 });

    return [
      { name: '快速(<30s)', value: distribution.fast, color: '#10B981' },
      { name: '中等(30s-2min)', value: distribution.medium, color: '#3B82F6' },
      { name: '较慢(2-10min)', value: distribution.slow, color: '#F59E0B' },
      { name: '很慢(10min+)', value: distribution.verySlow, color: '#EF4444' },
    ].filter(item => item.value > 0);
  }

  private generateTaskTypeDistribution(tasks: any[]) {
    const distribution = tasks.reduce((acc, task) => {
      let crawlerType = 'playwright'; // 默认值

      if (task.config) {
        try {
          const config = JSON.parse(task.config);
          crawlerType = config.crawlerType || 'playwright';
        } catch (error) {
          this.logger.warn(`Failed to parse task config: ${task.id}`, error);
          // 使用默认值
        }
      }

      if (crawlerType === 'playwright') acc.playwright++;
      else if (crawlerType === 'cheerio') acc.cheerio++;
      else if (crawlerType === 'puppeteer') acc.puppeteer++;
      else acc.other++;

      return acc;
    }, { playwright: 0, cheerio: 0, puppeteer: 0, other: 0 });

    return [
      { name: '网页爬取', value: distribution.playwright, color: '#3B82F6' },
      { name: 'API接口', value: distribution.cheerio, color: '#10B981' },
      { name: '文件下载', value: distribution.puppeteer, color: '#F59E0B' },
      { name: '其他', value: distribution.other, color: '#8B5CF6' },
    ].filter(item => item.value > 0);
  }

  private async getResultCount(resultPath: string | null): Promise<number> {
    if (!resultPath) return 0;

    try {
      const fs = require('fs').promises;
      const fileContent = await fs.readFile(resultPath, 'utf-8');
      const results = JSON.parse(fileContent);
      return Array.isArray(results) ? results.length : 0;
    } catch (error) {
      this.logger.warn(`读取结果文件失败 ${resultPath}`, error);
      return 0;
    }
  }

  private getResultCountFromLog(log: string): number {
    if (!log) return 0;

    // 从日志中提取结果数量（作为后备方案）
    const countMatch = log.match(/(\d+)\s*条数据|(\d+)\s*results?|(\d+)\s*items?/i);
    if (countMatch) {
      return parseInt(countMatch[1] || countMatch[2] || countMatch[3] || '0') || 0;
    }

    return 0;
  }
}
