import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import * as playwright from 'playwright';

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
    targetAspectRatio = 1, // 目标长宽比
    tolerance = 0.3, // 长宽比允许误差
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

      // 触发懒加载：分段滚动到一定距离，控制次数与延时
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
          // 新增长宽比范围过滤
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

          /** ⭐ 生成 XPath */
          const xpath = await el.evaluate((node) => {
            const el = node as HTMLElement;
            const tag = el.tagName.toLowerCase();
            const classList = (el.className || '').split(/\s+/).filter(Boolean);

            const semanticClass = classList.find((c) =>
              /(item|card|list|cell|box|entry|block)/i.test(c),
            );

            if (semanticClass) {
              return `//${tag}[contains(@class, '${semanticClass}')]`;
            }

            if (classList.length > 0) {
              const c = classList[0].slice(0, 4);
              return `//${tag}[contains(@class, '${c}')]`;
            }

            return `//${tag}`;
          });

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

      /** ⭐ 打分，根据接近 targetAspectRatio */
      const scored = candidates
        .map((c) => ({
          candidate: c,
          score:
            (c.hasImage ? 60 : 0) +
            c.childCount * 2 +
            c.tagTypeCount * 3 -
            Math.abs(targetAspectRatio - c.aspectRatio) * 10, // 接近目标长宽比得分
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
          (el, sel) =>
            (el as HTMLElement).shadowRoot?.querySelector(sel) ?? null,
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
}
