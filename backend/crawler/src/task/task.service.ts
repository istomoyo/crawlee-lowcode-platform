import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import * as playwright from 'playwright';

interface ResultItem {
  css: string;
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
   * 返回页面主要内容块，CSS + base64
   */
  /**
   * 返回页面最有代表性的前 4 个元素，供预览
   */
  async captureListItemsByCss(
    url: string,
    maxItems = 4,
    minArea = 1000,
    maxArea = 500000,
  ): Promise<ResultItem[]> {
    if (!/^https?:\/\//.test(url)) {
      throw new BadRequestException('URL 格式不正确');
    }

    let browser;
    try {
      browser = await playwright.chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);

      const elements = await page.$$('body *');
      const candidates: Candidate[] = [];

      for (const el of elements) {
        try {
          if (!(await el.isVisible())) continue;

          const box = await el.boundingBox();
          if (!box) continue;

          const area = box.width * box.height;
          if (area < minArea || area > maxArea) continue;

          const aspectRatio = box.width / box.height;
          if (aspectRatio < 0.5 || aspectRatio > 2) continue; // 接近正方形优先

          const childCount = await el.evaluate(
            (node) => node.childElementCount,
          );

          if (childCount < 3) continue; // 太简单的排除

          const tags = (await el.evaluate((node: Element) => {
            const all = Array.from(node.querySelectorAll('*'));
            return all.map((c) => c.tagName.toLowerCase());
          })) as string[];

          const tagTypes = new Set<string>(tags);

          const hasImage = await el.evaluate(
            (node) => !!node.querySelector('img'),
          );

          const css = await page.evaluate((node) => {
            const createCssSelector = (el: Element): string => {
              if (el.id) return `#${el.id}`;
              let selector = el.tagName.toLowerCase();
              if (el.className && typeof el.className === 'string') {
                const cls = el.className.trim().replace(/\s+/g, '.');
                if (cls) selector += '.' + cls;
              }
              if (el.parentElement) {
                const siblings = Array.from(el.parentElement.children).filter(
                  (s) => s.tagName === el.tagName,
                );
                if (siblings.length > 1) {
                  const index = siblings.indexOf(el) + 1;
                  selector += `:nth-of-type(${index})`;
                }
                return createCssSelector(el.parentElement) + ' > ' + selector;
              }
              return selector;
            };
            return createCssSelector(node);
          }, el);

          candidates.push({
            handle: el,
            css,
            area,
            aspectRatio,
            childCount,
            tagTypes,
            hasImage,
          });
        } catch {
          continue;
        }
      }

      // 排序逻辑：
      // 1. 有图片优先
      // 2. 子元素复杂度
      // 3. 标签类型数量多
      candidates.sort((a, b) => {
        const scoreA = (a.hasImage ? 100 : 0) + a.childCount + a.tagTypes.size;
        const scoreB = (b.hasImage ? 100 : 0) + b.childCount + b.tagTypes.size;
        return scoreB - scoreA;
      });

      // 去重，避免 CSS 路径太相似
      const final: Candidate[] = [];
      for (const c of candidates) {
        if (final.length >= maxItems) break;
        if (
          !final.some(
            (f) =>
              f.css === c.css || f.css.includes(c.css) || c.css.includes(f.css),
          )
        ) {
          final.push(c);
        }
      }

      // 转 base64
      const result: ResultItem[] = [];
      for (const item of final) {
        try {
          await item.handle.scrollIntoViewIfNeeded();
          const buffer = await item.handle.screenshot({ type: 'png' });
          result.push({ css: item.css, base64: buffer.toString('base64') });
        } catch {
          continue;
        }
      }

      return result;
    } catch (err) {
      console.error('列表截图失败:', err);
      throw new InternalServerErrorException('列表截图失败');
    } finally {
      if (browser) await browser.close();
    }
  }
}
