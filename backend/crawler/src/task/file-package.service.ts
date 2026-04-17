import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import axios from 'axios';
import * as playwright from 'playwright';
import { SelectorConfig } from './dto/execute-task.dto';
import { buildCookieHeader, createPlaywrightCookies } from './task-config.utils';

interface PackageConfig {
  structure?: {
    images?: string;
    files?: string;
    texts?: string;
    data?: string;
  };
  download?: {
    images?: boolean;
    files?: boolean;
    texts?: boolean;
    maxFileSize?: number;
    timeout?: number;
    strategy?: 'direct' | 'browser' | 'auto';
    browserFlow?: {
      detailPageField?: string;
      detailPageWaitSelector?: string;
      detailPageWaitTimeout?: number;
    };
  };
  // 字段映射配置（可选，如果不提供则自动识别）
  fieldMapping?: {
    imageFields?: string[]; // 指定哪些字段是图片
    fileFields?: string[]; // 指定哪些字段是文件（链接）
    textFields?: string[]; // 指定哪些字段是文本
  };
}

interface ItemData {
  [key: string]: any;
}

interface DownloadRequestContext {
  useCookie?: boolean;
  cookieString?: string;
  cookieDomain?: string;
  fallbackUrl?: string;
  downloadStrategy?: 'direct' | 'browser' | 'auto';
  browserFlow?: {
    detailPageField?: string;
    detailPageWaitSelector?: string;
    detailPageWaitTimeout?: number;
  };
  detailPageWaitSelector?: string;
  detailPageWaitTimeout?: number;
  browserRuntime?: BrowserDownloadRuntime;
}

interface BrowserDownloadSession {
  browser: playwright.Browser;
  context: playwright.BrowserContext;
  page: playwright.Page;
  currentReferrer?: string;
}

interface BrowserDownloadRuntime {
  session?: BrowserDownloadSession;
  queue?: Promise<unknown>;
}

@Injectable()
export class FilePackageService {
  private readonly logger = new Logger(FilePackageService.name);
  private readonly downloadUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  private isPixivAssetUrl(url: string): boolean {
    try {
      return /(^|\.)pximg\.net$/i.test(new URL(url).hostname);
    } catch {
      return /pximg\.net/i.test(url);
    }
  }

  private resolvePixivReferer(requestContext?: DownloadRequestContext): string {
    const fallbackUrl = requestContext?.fallbackUrl;
    if (fallbackUrl) {
      try {
        const parsed = new URL(fallbackUrl);
        if (/(^|\.)pixiv\.net$/i.test(parsed.hostname)) {
          return fallbackUrl;
        }
      } catch {
        // ignore invalid fallback url
      }
    }

    return 'https://www.pixiv.net/';
  }

  private buildDownloadHeaders(
    url: string,
    cookieHeader?: string,
    requestContext?: DownloadRequestContext,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': this.downloadUserAgent,
      Accept:
        'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };

    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    if (this.isPixivAssetUrl(url)) {
      headers.Referer = this.resolvePixivReferer(requestContext);
      headers.Origin = 'https://www.pixiv.net';
    }

    return headers;
  }

  private getDownloadStrategy(
    packageConfig?: PackageConfig,
  ): 'direct' | 'browser' | 'auto' {
    const strategy = packageConfig?.download?.strategy;
    if (strategy === 'direct' || strategy === 'browser') {
      return strategy;
    }
    return 'auto';
  }

  private getBrowserRuntime(
    requestContext?: DownloadRequestContext,
  ): BrowserDownloadRuntime | undefined {
    if (!requestContext) {
      return undefined;
    }

    if (!requestContext.browserRuntime) {
      requestContext.browserRuntime = {};
    }

    return requestContext.browserRuntime;
  }

  private getBrowserFlowConfig(
    packageConfig?: PackageConfig,
  ): DownloadRequestContext['browserFlow'] {
    const browserFlow = packageConfig?.download?.browserFlow;
    if (!browserFlow) {
      return undefined;
    }

    return {
      detailPageField: String(browserFlow.detailPageField || '').trim() || undefined,
      detailPageWaitSelector:
        String(browserFlow.detailPageWaitSelector || '').trim() || undefined,
      detailPageWaitTimeout:
        typeof browserFlow.detailPageWaitTimeout === 'number'
          ? browserFlow.detailPageWaitTimeout
          : undefined,
    };
  }

  private getItemDetailPageUrl(
    item: ItemData,
    browserFlow?: DownloadRequestContext['browserFlow'],
  ): string | undefined {
    const fieldName = String(browserFlow?.detailPageField || '').trim();
    if (!fieldName) {
      return undefined;
    }

    return this.normalizeFieldValues(item?.[fieldName]).find((value) =>
      this.isHttpUrl(value),
    );
  }

  private createItemDownloadRequestContext(
    baseRequestContext: DownloadRequestContext,
    item: ItemData,
  ): DownloadRequestContext {
    const detailPageUrl = this.getItemDetailPageUrl(
      item,
      baseRequestContext.browserFlow,
    );

    if (!detailPageUrl) {
      return baseRequestContext;
    }

    return {
      ...baseRequestContext,
      fallbackUrl: detailPageUrl,
      detailPageWaitSelector:
        baseRequestContext.browserFlow?.detailPageWaitSelector,
      detailPageWaitTimeout:
        baseRequestContext.browserFlow?.detailPageWaitTimeout,
      browserRuntime: baseRequestContext.browserRuntime,
    };
  }

  private getBrowserReferrerUrl(
    targetUrl: string,
    requestContext?: DownloadRequestContext,
  ): string {
    const fallbackUrl = String(requestContext?.fallbackUrl ?? '').trim();
    if (fallbackUrl) {
      return fallbackUrl;
    }

    if (this.isPixivAssetUrl(targetUrl)) {
      return 'https://www.pixiv.net/';
    }

    try {
      const parsed = new URL(targetUrl);
      return `${parsed.protocol}//${parsed.host}/`;
    } catch {
      return 'about:blank';
    }
  }

  private normalizeFieldValues(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.normalizeFieldValues(item));
    }

    if (typeof value !== 'string') {
      return [];
    }

    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  private isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private isLikelyImageUrl(value: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|@|#|$)/i.test(
      value.toLowerCase(),
    );
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeUrlForCompare(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private urlsReferToSameResource(actualUrl: string, targetUrl: string): boolean {
    const normalizedActual = this.normalizeUrlForCompare(actualUrl);
    const normalizedTarget = this.normalizeUrlForCompare(targetUrl);

    return (
      normalizedActual === normalizedTarget ||
      normalizedActual.startsWith(normalizedTarget) ||
      normalizedTarget.startsWith(normalizedActual)
    );
  }

  private isHtmlLikeContentType(contentType?: string): boolean {
    const normalized = String(contentType || '').toLowerCase();
    return (
      normalized.includes('text/html') ||
      normalized.includes('application/xhtml') ||
      normalized.includes('application/json') ||
      normalized.includes('text/plain')
    );
  }

  private isBinaryLikeContentType(contentType?: string): boolean {
    const normalized = String(contentType || '').toLowerCase();

    if (!normalized || this.isHtmlLikeContentType(normalized)) {
      return false;
    }

    return (
      normalized.startsWith('image/') ||
      normalized.startsWith('video/') ||
      normalized.startsWith('audio/') ||
      normalized.startsWith('font/') ||
      normalized.startsWith('application/octet-stream') ||
      normalized.startsWith('application/pdf') ||
      normalized.startsWith('application/zip') ||
      normalized.startsWith('application/x-') ||
      normalized.startsWith('application/vnd') ||
      normalized.startsWith('application/ms')
    );
  }

  private responseMatchesDownloadTarget(
    response: playwright.Response,
    targetUrl: string,
  ): boolean {
    if (this.urlsReferToSameResource(response.url(), targetUrl)) {
      return true;
    }

    let currentRequest: playwright.Request | null = response.request();
    while (currentRequest) {
      if (this.urlsReferToSameResource(currentRequest.url(), targetUrl)) {
        return true;
      }

      currentRequest = currentRequest.redirectedFrom();
    }

    return false;
  }

  private isBrowserDownloadResponseCandidate(
    response: playwright.Response,
    targetUrl: string,
  ): boolean {
    if (response.status() < 200 || response.status() >= 400) {
      return false;
    }

    const headers = response.headers();
    const contentType = headers['content-type'];
    const contentDisposition = String(
      headers['content-disposition'] || '',
    ).toLowerCase();
    const matchesTarget = this.responseMatchesDownloadTarget(response, targetUrl);
    const isNavigationResponse = response.request().isNavigationRequest();
    const isBinaryResponse = this.isBinaryLikeContentType(contentType);

    if (contentDisposition.includes('attachment')) {
      return true;
    }

    if (matchesTarget && !this.isHtmlLikeContentType(contentType)) {
      return true;
    }

    return isNavigationResponse && isBinaryResponse;
  }

  private async saveResponseToFile(
    response: playwright.Response,
    maxSize: number,
    destPath: string,
  ): Promise<boolean> {
    try {
      const declaredSize = Number(response.headers()['content-length'] || 0);
      if (declaredSize > maxSize) {
        this.logger.warn(
          `Browser response is larger than limit ${response.url()}: ${declaredSize}`,
        );
        return false;
      }

      const buffer = Buffer.from(await response.body());
      if (buffer.length > maxSize) {
        this.logger.warn(
          `Browser response exceeded size limit ${response.url()}: ${buffer.length}`,
        );
        return false;
      }

      return this.saveBufferToFile(buffer, destPath);
    } catch (error) {
      this.logger.warn(
        `Saving browser response failed ${response.url()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  private async savePlaywrightDownload(
    download: playwright.Download,
    maxSize: number,
    destPath: string,
  ): Promise<boolean> {
    try {
      const failure = await download.failure();
      if (failure) {
        this.logger.warn(`Playwright download failed: ${failure}`);
        return false;
      }

      const tempPath = await download.path();
      if (!tempPath) {
        return false;
      }

      const stats = await fs.stat(tempPath);
      if (stats.size > maxSize) {
        this.logger.warn(
          `Downloaded file is larger than limit ${download.url()}: ${stats.size}`,
        );
        return false;
      }

      const buffer = await fs.readFile(tempPath);
      return this.saveBufferToFile(buffer, destPath);
    } catch (error) {
      this.logger.warn(
        `Saving browser download failed ${download.url()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  private async waitForValue<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T | null> {
    if (timeoutMs <= 0) {
      return null;
    }

    return Promise.race([
      promise,
      this.delay(timeoutMs).then(() => null),
    ]) as Promise<T | null>;
  }

  private async triggerPageDownload(
    page: playwright.Page,
    targetUrl: string,
    target: '_blank' | '_self',
  ): Promise<void> {
    await page.evaluate(
      ({ downloadUrl, anchorTarget }) => {
        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.target = anchorTarget;
        anchor.rel = 'noopener noreferrer';
        anchor.style.display = 'none';

        const mountPoint = document.body || document.documentElement;
        mountPoint.appendChild(anchor);
        anchor.click();
        anchor.remove();
      },
      {
        downloadUrl: targetUrl,
        anchorTarget: target,
      },
    );
  }

  private async saveResponseCandidates(
    responses: playwright.Response[],
    maxSize: number,
    destPath: string,
  ): Promise<boolean> {
    for (let index = responses.length - 1; index >= 0; index -= 1) {
      if (await this.saveResponseToFile(responses[index], maxSize, destPath)) {
        return true;
      }
    }

    return false;
  }

  private async restoreBrowserReferrer(
    session: BrowserDownloadSession,
    referrerUrl: string,
    timeout: number,
  ): Promise<void> {
    if (
      referrerUrl === 'about:blank' ||
      session.page.isClosed() ||
      this.urlsReferToSameResource(session.page.url(), referrerUrl)
    ) {
      session.currentReferrer = referrerUrl;
      return;
    }

    await session.page
      .goto(referrerUrl, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(timeout, 10000),
      })
      .catch(() => undefined);
    session.currentReferrer = referrerUrl;
  }

  private async prepareBrowserEntryPage(
    session: BrowserDownloadSession,
    entryUrl: string,
    timeout: number,
    requestContext?: DownloadRequestContext,
  ): Promise<void> {
    if (entryUrl === 'about:blank') {
      session.currentReferrer = entryUrl;
      return;
    }

    if (!this.urlsReferToSameResource(session.page.url(), entryUrl)) {
      await session.page
        .goto(entryUrl, {
          waitUntil: 'domcontentloaded',
          timeout,
        })
        .catch(() => undefined);
    }

    const waitSelector = String(
      requestContext?.detailPageWaitSelector ||
        requestContext?.browserFlow?.detailPageWaitSelector ||
        '',
    ).trim();
    const waitTimeout =
      requestContext?.detailPageWaitTimeout ??
      requestContext?.browserFlow?.detailPageWaitTimeout ??
      Math.min(timeout, 8000);

    if (waitSelector) {
      await session.page
        .waitForSelector(waitSelector, {
          timeout: Math.min(waitTimeout, timeout),
          state: 'attached',
        })
        .catch(() => undefined);
    }

    session.currentReferrer = entryUrl;
  }

  private async runBrowserDownloadInQueue<T>(
    requestContext: DownloadRequestContext | undefined,
    task: () => Promise<T>,
  ): Promise<T> {
    const runtime = this.getBrowserRuntime(requestContext);
    if (!runtime) {
      return task();
    }

    const previous = runtime.queue ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    runtime.queue = current.then(
      () => undefined,
      () => undefined,
    );

    return current;
  }

  private async runBrowserDownloadAttempt(
    session: BrowserDownloadSession,
    url: string,
    destPath: string,
    maxSize: number,
    timeout: number,
    label: string,
    action: (page: playwright.Page) => Promise<void>,
  ): Promise<boolean> {
    const responseCandidates: playwright.Response[] = [];
    const seenResponses = new Set<string>();
    const responseHandler = (response: playwright.Response) => {
      if (!this.isBrowserDownloadResponseCandidate(response, url)) {
        return;
      }

      const responseKey = `${response.status()}:${response.url()}`;
      if (seenResponses.has(responseKey)) {
        return;
      }

      seenResponses.add(responseKey);
      responseCandidates.push(response);
    };

    session.context.on('response', responseHandler);
    const pageDownloadPromise = session.page
      .waitForEvent('download', { timeout })
      .catch(() => null);
    const popupPromise = session.context
      .waitForEvent('page', { timeout })
      .catch(() => null);
    let popupPage: playwright.Page | null = null;
    let popupDownloadPromise: Promise<playwright.Download | null> | null = null;

    try {
      await action(session.page);

      const quickWindow = Math.min(Math.max(Math.floor(timeout / 5), 1000), 2500);
      const popupWindow = Math.min(quickWindow, 1500);

      popupPage = await this.waitForValue(popupPromise, popupWindow);
      if (popupPage) {
        popupDownloadPromise = popupPage
          .waitForEvent('download', { timeout })
          .catch(() => null);

        await popupPage
          .waitForLoadState('domcontentloaded', { timeout: quickWindow })
          .catch(() => undefined);
      }

      const pageDownload = await this.waitForValue(
        pageDownloadPromise,
        quickWindow,
      );
      if (
        pageDownload &&
        (await this.savePlaywrightDownload(pageDownload, maxSize, destPath))
      ) {
        return true;
      }

      if (popupDownloadPromise) {
        const popupDownload = await this.waitForValue(
          popupDownloadPromise,
          quickWindow,
        );
        if (
          popupDownload &&
          (await this.savePlaywrightDownload(popupDownload, maxSize, destPath))
        ) {
          return true;
        }
      }

      await this.delay(Math.min(Math.max(Math.floor(timeout / 6), 400), 1500));
      if (
        responseCandidates.length > 0 &&
        (await this.saveResponseCandidates(responseCandidates, maxSize, destPath))
      ) {
        return true;
      }

      const remainingTimeout = Math.max(timeout - quickWindow * 2, 1000);

      if (!popupPage) {
        popupPage = await this.waitForValue(popupPromise, remainingTimeout);
        if (popupPage) {
          popupDownloadPromise = popupPage
            .waitForEvent('download', { timeout: remainingTimeout })
            .catch(() => null);
          await popupPage
            .waitForLoadState('domcontentloaded', {
              timeout: Math.min(remainingTimeout, 5000),
            })
            .catch(() => undefined);
        }
      }

      const latePageDownload = await this.waitForValue(
        pageDownloadPromise,
        remainingTimeout,
      );
      if (
        latePageDownload &&
        (await this.savePlaywrightDownload(latePageDownload, maxSize, destPath))
      ) {
        return true;
      }

      if (popupDownloadPromise) {
        const latePopupDownload = await this.waitForValue(
          popupDownloadPromise,
          remainingTimeout,
        );
        if (
          latePopupDownload &&
          (await this.savePlaywrightDownload(latePopupDownload, maxSize, destPath))
        ) {
          return true;
        }
      }

      if (
        responseCandidates.length > 0 &&
        (await this.saveResponseCandidates(responseCandidates, maxSize, destPath))
      ) {
        return true;
      }

      this.logger.debug(
        `Browser download attempt did not capture a file [${label}] ${url}`,
      );
      return false;
    } catch (error) {
      this.logger.warn(
        `Browser download attempt failed [${label}] ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    } finally {
      session.context.off('response', responseHandler);

      if (popupPage && !popupPage.isClosed()) {
        await popupPage.close().catch(() => undefined);
      }
    }
  }

  private async ensureBrowserDownloadSession(
    targetUrl: string,
    requestContext?: DownloadRequestContext,
    timeout: number = 30000,
  ): Promise<BrowserDownloadSession> {
    const runtime = this.getBrowserRuntime(requestContext);
    if (runtime?.session) {
      return runtime.session;
    }

    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext({
      acceptDownloads: true,
      userAgent: this.downloadUserAgent,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    const page = await context.newPage();
    const referrerUrl = this.getBrowserReferrerUrl(targetUrl, requestContext);

    if (requestContext?.useCookie && requestContext.cookieString) {
      const cookies = createPlaywrightCookies(
        requestContext.cookieString,
        referrerUrl === 'about:blank' ? targetUrl : referrerUrl,
        requestContext.cookieDomain,
      );

      if (cookies.length > 0) {
        await context
          .addCookies(
            cookies as unknown as Parameters<
              playwright.BrowserContext['addCookies']
            >[0],
          )
          .catch(() => undefined);
      }
    }

    if (referrerUrl !== 'about:blank') {
      await page
        .goto(referrerUrl, {
          waitUntil: 'domcontentloaded',
          timeout,
        })
        .catch(() => undefined);
    }

    const session: BrowserDownloadSession = {
      browser,
      context,
      page,
      currentReferrer: referrerUrl,
    };

    if (runtime) {
      runtime.session = session;
    }

    return session;
  }

  private async closeBrowserDownloadSession(
    requestContext?: DownloadRequestContext,
  ): Promise<void> {
    const runtime = this.getBrowserRuntime(requestContext);
    const session = runtime?.session;
    if (!session) {
      return;
    }

    await session.context.close().catch(() => undefined);
    await session.browser.close().catch(() => undefined);
    runtime.session = undefined;
    runtime.queue = undefined;
  }

  private async saveBufferToFile(
    buffer: Buffer,
    destPath: string,
  ): Promise<boolean> {
    try {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, buffer);
      return true;
    } catch (error) {
      this.logger.warn(
        `保存下载内容失败 ${destPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  private async downloadFileViaBrowser(
    url: string,
    destPath: string,
    maxSize: number,
    timeout: number,
    requestContext?: DownloadRequestContext,
  ): Promise<boolean> {
    return this.runBrowserDownloadInQueue(requestContext, async () => {
      try {
      const session = await this.ensureBrowserDownloadSession(
        url,
        requestContext,
        timeout,
      );
      const entryUrl = this.getBrowserReferrerUrl(url, requestContext);

      await this.prepareBrowserEntryPage(
        session,
        entryUrl,
        timeout,
        requestContext,
      );

      const attempts: Array<{
        label: string;
        action: (page: playwright.Page) => Promise<void>;
      }> = [
        {
          label: 'popup-anchor-click',
          action: (page) => this.triggerPageDownload(page, url, '_blank'),
        },
        {
          label: 'same-tab-anchor-click',
          action: (page) => this.triggerPageDownload(page, url, '_self'),
        },
        {
          label: 'same-tab-navigation',
          action: async (page) => {
            await page
              .goto(url, {
                waitUntil: 'domcontentloaded',
                timeout,
              })
              .catch(() => undefined);
          },
        },
      ];

      for (const attempt of attempts) {
        const success = await this.runBrowserDownloadAttempt(
          session,
          url,
          destPath,
          maxSize,
          timeout,
          attempt.label,
          attempt.action,
        );

        await this.restoreBrowserReferrer(session, entryUrl, timeout);

        if (success) {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.warn(
        `浏览器模式下载失败 ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
    });
  }

  private async downloadFileDirect(
    url: string,
    destPath: string,
    maxSize: number,
    timeout: number,
    requestContext?: DownloadRequestContext,
  ): Promise<boolean> {
    try {
      const cookieHeader =
        requestContext?.useCookie && requestContext.cookieString
          ? buildCookieHeader(
              requestContext.cookieString,
              url,
              requestContext.cookieDomain,
              requestContext.fallbackUrl,
            )
          : undefined;

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: timeout,
        maxContentLength: maxSize,
        maxBodyLength: maxSize,
        headers: this.buildDownloadHeaders(url, cookieHeader, requestContext),
      });

      await fs.mkdir(path.dirname(destPath), { recursive: true });

      const writer = fsSync.createWriteStream(destPath);
      response.data.pipe(writer);

      return new Promise((resolve) => {
        writer.on('finish', () => resolve(true));
        writer.on('error', () => resolve(false));
        response.data.on('error', () => resolve(false));
      });
    } catch {
      return false;
    }
  }

  private async downloadResource(
    url: string,
    destPath: string,
    maxSize: number = 10 * 1024 * 1024,
    timeout: number = 30000,
    requestContext?: DownloadRequestContext,
  ): Promise<boolean> {
    const strategy = requestContext?.downloadStrategy ?? 'auto';

    if (strategy === 'browser') {
      return this.downloadFileViaBrowser(
        url,
        destPath,
        maxSize,
        timeout,
        requestContext,
      );
    }

    const directSuccess = await this.downloadFileDirect(
      url,
      destPath,
      maxSize,
      timeout,
      requestContext,
    );

    if (directSuccess || strategy === 'direct') {
      return directSuccess;
    }

    this.logger.debug(`Direct download failed, falling back to browser mode: ${url}`);
    return this.downloadFileViaBrowser(
      url,
      destPath,
      maxSize,
      timeout,
      requestContext,
    );
  }

  /**
   * 下载文件
   */
  private async downloadFile(
    url: string,
    destPath: string,
    maxSize: number = 10 * 1024 * 1024, // 默认10MB
    timeout: number = 30000, // 默认30秒
    requestContext?: DownloadRequestContext,
  ): Promise<boolean> {
    try {
      const cookieHeader =
        requestContext?.useCookie && requestContext.cookieString
          ? buildCookieHeader(
              requestContext.cookieString,
              url,
              requestContext.cookieDomain,
              requestContext.fallbackUrl,
            )
          : undefined;

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: timeout,
        maxContentLength: maxSize,
        maxBodyLength: maxSize,
        headers: this.buildDownloadHeaders(url, cookieHeader, requestContext),
      });

      // 确保目录存在
      const dir = path.dirname(destPath);
      await fs.mkdir(dir, { recursive: true });

      // 创建写入流
      const writer = fsSync.createWriteStream(destPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(true));
        writer.on('error', (error) => {
          this.logger.warn(`下载文件失败 ${url}:`, error.message);
          resolve(false);
        });
        response.data.on('error', (error) => {
          this.logger.warn(`下载文件失败 ${url}:`, error.message);
          resolve(false);
        });
      });
    } catch (error) {
      this.logger.warn(`下载文件失败 ${url}:`, error.message);
      return false;
    }
  }

  /**
   * 清理文件名，移除非法字符
   */
  private sanitizeFileName(fileName: string): string {
    // 移除或替换非法字符
    return fileName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 200); // 限制文件名长度
  }

  /**
   * 转义正则表达式中的特殊字符
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 解析文件路径模板，支持变量替换
   */
  private parsePathTemplate(
    template: string,
    itemData: ItemData,
    index: number,
    fieldName?: string,
    timestamp?: string,
    valueIndex?: number,
  ): string {
    let result = template;

    // 替换基础变量
    result = result.replace(/{index}/g, String(index + 1));
    result = result.replace(/{valueIndex}/g, String((valueIndex ?? 0) + 1));
    result = result.replace(/{timestamp}/g, timestamp || Date.now().toString());
    result = result.replace(/{date}/g, new Date().toISOString().split('T')[0]);

    // 替换{fieldName}变量（当前字段名）
    if (fieldName) {
      const escapedFieldName = this.escapeRegExp(fieldName);
      result = result.replace(new RegExp(`\\{${escapedFieldName}\\}`, 'g'), fieldName);
    }

    // 替换其他字段值（优先级更高，会覆盖{fieldName}的值）
    for (const key in itemData) {
      if (itemData.hasOwnProperty(key) && itemData[key]) {
        // 处理字段值：清理非法字符，但保留点号（因为可能用于扩展名）
        // 注意：点号不会被替换，这样可以支持文件名中包含点号的情况
        const value = String(itemData[key])
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
          .replace(/\s+/g, '_')
          .substring(0, 100);
        // 转义 key 中的正则表达式特殊字符
        const escapedKey = this.escapeRegExp(key);
        result = result.replace(new RegExp(`\\{${escapedKey}\\}`, 'g'), value);
      }
    }

    this.logger.debug(`路径模板解析: "${template}" -> "${result}"`);
    return result;
  }

  private applyValueIndexSuffix(
    filePath: string,
    valueIndex: number,
    totalValues: number,
    template: string,
  ): string {
    if (totalValues <= 1 || template.includes('{valueIndex}')) {
      return filePath;
    }

    const extension = path.extname(filePath);
    const basePath = extension
      ? filePath.slice(0, -extension.length)
      : filePath;

    return `${basePath}_${valueIndex + 1}${extension}`;
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(url: string, defaultExt: string = 'jpg'): string {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      
      // 移除 @ 符号及其后面的参数（如B站图片URL格式：xxx.jpg@672w_378h_1c_!web-home-common-cover）
      // 移除 ? 查询参数
      // 移除 # 锚点
      pathname = pathname.split('@')[0].split('?')[0].split('#')[0];
      
      const ext = path.extname(pathname).toLowerCase().slice(1);
      return ext || defaultExt;
    } catch {
      return defaultExt;
    }
  }

  /**
   * 根据JSON数据自动识别字段类型
   */
  private detectFieldTypes(items: ItemData[], fieldMapping?: PackageConfig['fieldMapping']) {
    if (!items || items.length === 0) {
      return { imageFields: [], fileFields: [], textFields: [] };
    }

    // 如果提供了字段映射，直接使用
    if (fieldMapping) {
      return {
        imageFields: fieldMapping.imageFields || [],
        fileFields: fieldMapping.fileFields || [],
        textFields: fieldMapping.textFields || [],
      };
    }

    // 自动识别字段类型
    const imageFields = new Set<string>();
    const fileFields = new Set<string>();
    const textFields = new Set<string>();

    // 分析前几个数据项来确定字段类型
    const sampleItems = items.slice(0, Math.min(5, items.length));

    for (const item of sampleItems) {
      for (const [key, value] of Object.entries(item)) {
        if (value === null || value === undefined || value === '') continue;

        const normalizedValues = this.normalizeFieldValues(value);
        if (normalizedValues.length === 0) {
          continue;
        }

        const urlValues = normalizedValues.filter((entry) => this.isHttpUrl(entry));
        if (urlValues.length > 0) {
          if (urlValues.some((entry) => this.isLikelyImageUrl(entry))) {
            imageFields.add(key);
          } else {
            fileFields.add(key);
          }
          continue;
        }

        if (normalizedValues.some((entry) => entry.length > 0)) {
          textFields.add(key);
        }
      }
    }

    return {
      imageFields: Array.from(imageFields),
      fileFields: Array.from(fileFields),
      textFields: Array.from(textFields),
    };
  }

  /**
   * 打包数据为压缩文件（使用字段映射）
   */
  async packageDataFromJson(
    items: ItemData[],
    packageConfig: PackageConfig,
    outputPath: string,
    taskId: number,
    executionId: number,
    requestContext?: DownloadRequestContext,
  ): Promise<string> {
    const timestamp = Date.now().toString();
    const tempDir = path.join(
      process.cwd(),
      'uploads',
      'temp',
      `package_${taskId}_${executionId}_${timestamp}`,
    );
    const downloadRequestContext: DownloadRequestContext = {
      ...(requestContext || {}),
      downloadStrategy: this.getDownloadStrategy(packageConfig),
      browserFlow: this.getBrowserFlowConfig(packageConfig),
      browserRuntime: {},
    };

    try {
      // 创建临时目录
      await fs.mkdir(tempDir, { recursive: true });

      const structure = packageConfig.structure || {};
      const download = packageConfig.download || {};
      const maxFileSize = download.maxFileSize || 10 * 1024 * 1024; // 10MB
      const timeout = download.timeout || 30000; // 30秒

      // 自动识别字段类型
      const { imageFields, fileFields, textFields } = this.detectFieldTypes(items, packageConfig.fieldMapping);

      this.logger.log(`识别到字段类型 - 图片: ${imageFields.join(', ')}, 文件: ${fileFields.join(', ')}, 文本: ${textFields.join(', ')}`);

      // 创建下载任务列表
      const downloadTasks: Array<Promise<void>> = [];

      // 处理每个数据项
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemDownloadRequestContext = this.createItemDownloadRequestContext(
          downloadRequestContext,
          item,
        );

        // 下载图片
        if (download.images !== false && imageFields.length > 0) {
          for (const fieldName of imageFields) {
            const imageUrls = this.normalizeFieldValues(item[fieldName]).filter((value) =>
              this.isHttpUrl(value),
            );
            if (imageUrls.length > 0) {
              const imageTemplate = structure.images || 'images/{index}_{fieldName}.{ext}';
              imageUrls.forEach((imageUrl, valueIndex) => {
                const ext = this.getFileExtension(imageUrl, 'jpg');
                let imagePath = this.parsePathTemplate(
                  imageTemplate,
                  item,
                  i,
                  fieldName,
                  timestamp,
                  valueIndex,
                );
                if (!path.extname(imagePath)) {
                  imagePath = `${imagePath}.${ext}`;
                } else {
                  imagePath = imagePath.replace(/{ext}/g, ext);
                }
                imagePath = this.applyValueIndexSuffix(
                  imagePath,
                  valueIndex,
                  imageUrls.length,
                  imageTemplate,
                );

                const fullImagePath = path.join(tempDir, imagePath);

                downloadTasks.push(
                  this.downloadResource(
                    imageUrl,
                    fullImagePath,
                    maxFileSize,
                    timeout,
                    itemDownloadRequestContext,
                  ).then((success) => {
                    if (success) {
                      this.logger.log(`已下载图片: ${imagePath}`);
                    }
                  }),
                );
              });
            }
          }
        }

        // 下载文件（从fileFields）
        if (download.files !== false && fileFields.length > 0) {
          for (const fieldName of fileFields) {
            const fileUrls = this.normalizeFieldValues(item[fieldName]).filter((value) =>
              this.isHttpUrl(value),
            );
            if (fileUrls.length > 0) {
              const fileTemplate = structure.files || 'files/{index}_{fieldName}.{ext}';
              fileUrls.forEach((fileUrl, valueIndex) => {
                const ext = this.getFileExtension(fileUrl, 'bin');
                let filePath = this.parsePathTemplate(
                  fileTemplate,
                  item,
                  i,
                  fieldName,
                  timestamp,
                  valueIndex,
                );
                if (!path.extname(filePath)) {
                  filePath = `${filePath}.${ext}`;
                } else {
                  filePath = filePath.replace(/{ext}/g, ext);
                }
                filePath = this.applyValueIndexSuffix(
                  filePath,
                  valueIndex,
                  fileUrls.length,
                  fileTemplate,
                );

                const fullFilePath = path.join(tempDir, filePath);

                downloadTasks.push(
                  this.downloadResource(
                    fileUrl,
                    fullFilePath,
                    maxFileSize,
                    timeout,
                    itemDownloadRequestContext,
                  ).then((success) => {
                    if (success) {
                      this.logger.log(`已下载文件: ${filePath}`);
                    }
                  }),
                );
              });
            }
          }
        }

        // 保存文本为文件
        if (download.texts !== false && textFields.length > 0) {
          for (const fieldName of textFields) {
            const textValues = this.normalizeFieldValues(item[fieldName]).filter((value) =>
              !this.isHttpUrl(value),
            );
            if (textValues.length > 0) {
              const textValue = Array.isArray(item[fieldName])
                ? textValues.join('\n\n')
                : textValues[0];
              const textTemplate = structure.texts || 'texts/{index}_{fieldName}.txt';
              let textPath = this.parsePathTemplate(textTemplate, item, i, fieldName, timestamp);
              
              // 检查解析后的路径是否有扩展名
              // path.extname() 会返回最后一个点号后的内容（包括点号），如 ".md", ".txt"
              const ext = path.extname(textPath);
              this.logger.log(`[文本文件] 模板: "${textTemplate}" -> 路径: "${textPath}" -> 扩展名: "${ext}"`);
              
              // 如果模板中没有扩展名，才添加默认的 .txt 扩展名
              // 这样可以支持用户自定义扩展名，如 .md, .html 等
              if (!ext || ext === '') {
                textPath = `${textPath}.txt`;
                this.logger.log(`[文本文件] 路径无扩展名，添加默认 .txt: "${textPath}"`);
              } else {
                this.logger.log(`[文本文件] 保留模板中的扩展名: "${ext}"`);
              }
              
              const fullTextPath = path.join(tempDir, textPath);
              
              // 确保目录存在
              await fs.mkdir(path.dirname(fullTextPath), { recursive: true });
              
              // 写入文本文件
              await fs.writeFile(fullTextPath, textValue, 'utf-8');
              this.logger.log(`[文本文件] 已保存: ${textPath}`);
            }
          }
        }
      }

      // 等待所有下载任务完成
      await Promise.all(downloadTasks);

      // 保存数据JSON文件（仅当用户明确配置了structure.data时才生成）
      if (structure.data && structure.data.trim()) {
        const dataTemplate = structure.data;
        // 判断是单文件还是每个数据项一个文件
        if (dataTemplate.includes('{index}')) {
          // 每个数据项一个JSON文件
          for (let i = 0; i < items.length; i++) {
            const dataPath = path.join(tempDir, this.parsePathTemplate(dataTemplate, items[i], i, undefined, timestamp));
            if (!path.extname(dataPath)) {
              const fullDataPath = `${dataPath}.json`;
              await fs.writeFile(fullDataPath, JSON.stringify(items[i], null, 2), 'utf-8');
            } else {
              await fs.writeFile(dataPath, JSON.stringify(items[i], null, 2), 'utf-8');
            }
          }
        } else {
          // 单个JSON文件包含所有数据
          const dataPath = path.join(tempDir, this.parsePathTemplate(dataTemplate, items[0] || {}, 0, undefined, timestamp));
          const finalDataPath = path.extname(dataPath) ? dataPath : `${dataPath}.json`;
          await fs.writeFile(finalDataPath, JSON.stringify(items, null, 2), 'utf-8');
        }
      }
      // 不再默认生成data.json，只有当用户明确配置了structure.data时才生成

      // 创建ZIP压缩文件
      const zipPath = outputPath;
      await this.createZipArchive(tempDir, zipPath);

      // 清理临时目录
      await this.cleanupDirectory(tempDir);
      await this.closeBrowserDownloadSession(downloadRequestContext);

      this.logger.log(`打包完成: ${zipPath}`);
      return zipPath;
    } catch (error) {
      this.logger.error('打包失败:', error);
      // 清理临时目录
      try {
        await this.cleanupDirectory(tempDir);
      } catch (cleanupError) {
        this.logger.error('清理临时目录失败:', cleanupError);
      }
      await this.closeBrowserDownloadSession(downloadRequestContext);
      throw error;
    }
  }

  /**
   * 打包数据为压缩文件（使用选择器配置）
   */
  async packageData(
    items: ItemData[],
    selectors: SelectorConfig[],
    packageConfig: PackageConfig,
    outputPath: string,
    taskId: number,
    executionId: number,
    requestContext?: DownloadRequestContext,
  ): Promise<string> {
    const timestamp = Date.now().toString();
    const tempDir = path.join(
      process.cwd(),
      'uploads',
      'temp',
      `package_${taskId}_${executionId}_${timestamp}`,
    );
    const downloadRequestContext: DownloadRequestContext = {
      ...(requestContext || {}),
      downloadStrategy: this.getDownloadStrategy(packageConfig),
      browserFlow: this.getBrowserFlowConfig(packageConfig),
      browserRuntime: {},
    };

    try {
      // 创建临时目录
      await fs.mkdir(tempDir, { recursive: true });

      const structure = packageConfig.structure || {};
      const download = packageConfig.download || {};
      const maxFileSize = download.maxFileSize || 10 * 1024 * 1024; // 10MB
      const timeout = download.timeout || 30000; // 30秒

      // 识别不同类型的选择器
      const imageSelectors = selectors.filter((s) => s.type === 'image');
      const linkSelectors = selectors.filter((s) => s.type === 'link');
      const textSelectors = selectors.filter((s) => s.type === 'text');

      // 创建下载任务列表
      const downloadTasks: Array<Promise<void>> = [];

      // 处理每个数据项
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemDownloadRequestContext = this.createItemDownloadRequestContext(
          downloadRequestContext,
          item,
        );

        // 下载图片
        if (download.images !== false && imageSelectors.length > 0) {
          for (const selector of imageSelectors) {
            const imageUrls = this.normalizeFieldValues(item[selector.name]).filter((value) =>
              this.isHttpUrl(value),
            );
            if (imageUrls.length > 0) {
              const imageTemplate = structure.images || 'images/{index}_{fieldName}.{ext}';
              imageUrls.forEach((imageUrl, valueIndex) => {
                const ext = this.getFileExtension(imageUrl, 'jpg');
                let imagePath = this.parsePathTemplate(
                  imageTemplate,
                  item,
                  i,
                  selector.name,
                  timestamp,
                  valueIndex,
                );
                if (!path.extname(imagePath)) {
                  imagePath = `${imagePath}.${ext}`;
                } else {
                  imagePath = imagePath.replace(/{ext}/g, ext);
                }
                imagePath = this.applyValueIndexSuffix(
                  imagePath,
                  valueIndex,
                  imageUrls.length,
                  imageTemplate,
                );

                const fullImagePath = path.join(tempDir, imagePath);

                downloadTasks.push(
                  this.downloadResource(
                    imageUrl,
                    fullImagePath,
                    maxFileSize,
                    timeout,
                    itemDownloadRequestContext,
                  ).then((success) => {
                    if (success) {
                      this.logger.log(`已下载图片: ${imagePath}`);
                    }
                  }),
                );
              });
            }
          }
        }

        // 下载文件（从link字段）
        if (download.files !== false && linkSelectors.length > 0) {
          for (const selector of linkSelectors) {
            const fileUrls = this.normalizeFieldValues(item[selector.name]).filter((value) =>
              this.isHttpUrl(value),
            );
            if (fileUrls.length > 0) {
              const fileTemplate = structure.files || 'files/{index}_{fieldName}.{ext}';
              fileUrls.forEach((fileUrl, valueIndex) => {
                const ext = this.getFileExtension(fileUrl, 'bin');
                let filePath = this.parsePathTemplate(
                  fileTemplate,
                  item,
                  i,
                  selector.name,
                  timestamp,
                  valueIndex,
                );
                if (!path.extname(filePath)) {
                  filePath = `${filePath}.${ext}`;
                } else {
                  filePath = filePath.replace(/{ext}/g, ext);
                }
                filePath = this.applyValueIndexSuffix(
                  filePath,
                  valueIndex,
                  fileUrls.length,
                  fileTemplate,
                );

                const fullFilePath = path.join(tempDir, filePath);

                downloadTasks.push(
                  this.downloadResource(
                    fileUrl,
                    fullFilePath,
                    maxFileSize,
                    timeout,
                    itemDownloadRequestContext,
                  ).then((success) => {
                    if (success) {
                      this.logger.log(`已下载文件: ${filePath}`);
                    }
                  }),
                );
              });
            }
          }
        }

        // 保存文本为文件
        if (download.texts !== false && textSelectors.length > 0) {
          for (const selector of textSelectors) {
            const textValues = this.normalizeFieldValues(item[selector.name]).filter((value) =>
              !this.isHttpUrl(value),
            );
            if (textValues.length > 0) {
              const textValue = Array.isArray(item[selector.name])
                ? textValues.join('\n\n')
                : textValues[0];
              const textTemplate = structure.texts || 'texts/{index}_{fieldName}.txt';
              let textPath = this.parsePathTemplate(textTemplate, item, i, selector.name, timestamp);
              
              // 检查解析后的路径是否有扩展名
              // path.extname() 会返回最后一个点号后的内容（包括点号），如 ".md", ".txt"
              const ext = path.extname(textPath);
              this.logger.log(`[文本文件] 模板: "${textTemplate}" -> 路径: "${textPath}" -> 扩展名: "${ext}"`);
              
              // 如果模板中没有扩展名，才添加默认的 .txt 扩展名
              // 这样可以支持用户自定义扩展名，如 .md, .html 等
              if (!ext || ext === '') {
                textPath = `${textPath}.txt`;
                this.logger.log(`[文本文件] 路径无扩展名，添加默认 .txt: "${textPath}"`);
              } else {
                this.logger.log(`[文本文件] 保留模板中的扩展名: "${ext}"`);
              }
              
              const fullTextPath = path.join(tempDir, textPath);
              
              // 确保目录存在
              await fs.mkdir(path.dirname(fullTextPath), { recursive: true });
              
              // 写入文本文件
              await fs.writeFile(fullTextPath, textValue, 'utf-8');
              this.logger.log(`[文本文件] 已保存: ${textPath}`);
            }
          }
        }
      }

      // 等待所有下载任务完成
      await Promise.all(downloadTasks);

      // 保存数据JSON文件（仅当用户明确配置了structure.data时才生成）
      if (structure.data && structure.data.trim()) {
        const dataTemplate = structure.data;
        // 判断是单文件还是每个数据项一个文件
        if (dataTemplate.includes('{index}')) {
          // 每个数据项一个JSON文件
          for (let i = 0; i < items.length; i++) {
            const dataPath = path.join(tempDir, this.parsePathTemplate(dataTemplate, items[i], i, undefined, timestamp));
            if (!path.extname(dataPath)) {
              const fullDataPath = `${dataPath}.json`;
              await fs.writeFile(fullDataPath, JSON.stringify(items[i], null, 2), 'utf-8');
            } else {
              await fs.writeFile(dataPath, JSON.stringify(items[i], null, 2), 'utf-8');
            }
          }
        } else {
          // 单个JSON文件包含所有数据
          const dataPath = path.join(tempDir, this.parsePathTemplate(dataTemplate, items[0] || {}, 0, undefined, timestamp));
          const finalDataPath = path.extname(dataPath) ? dataPath : `${dataPath}.json`;
          await fs.writeFile(finalDataPath, JSON.stringify(items, null, 2), 'utf-8');
        }
      }
      // 不再默认生成data.json，只有当用户明确配置了structure.data时才生成

      // 创建ZIP压缩文件
      const zipPath = outputPath;
      await this.createZipArchive(tempDir, zipPath);

      // 清理临时目录
      await this.cleanupDirectory(tempDir);
      await this.closeBrowserDownloadSession(downloadRequestContext);

      this.logger.log(`打包完成: ${zipPath}`);
      return zipPath;
    } catch (error) {
      this.logger.error('打包失败:', error);
      // 清理临时目录
      try {
        await this.cleanupDirectory(tempDir);
      } catch (cleanupError) {
        this.logger.error('清理临时目录失败:', cleanupError);
      }
      await this.closeBrowserDownloadSession(downloadRequestContext);
      throw error;
    }
  }

  /**
   * 创建ZIP压缩文件
   */
  private async createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 确保输出目录存在
      const outputDir = path.dirname(outputPath);
      fs.mkdir(outputDir, { recursive: true }).then(() => {
        const output = fsSync.createWriteStream(outputPath);
        const archive = archiver('zip', {
          zlib: { level: 9 }, // 最高压缩级别
        });

        output.on('close', () => {
          this.logger.log(`ZIP文件创建完成，大小: ${archive.pointer()} 字节`);
          resolve();
        });

        archive.on('error', (err) => {
          reject(err);
        });

        archive.pipe(output);

        // 添加目录中的所有文件到ZIP
        archive.directory(sourceDir, false);

        archive.finalize();
      }).catch(reject);
    });
  }

  /**
   * 清理目录
   */
  private async cleanupDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(`清理目录失败 ${dirPath}:`, error.message);
    }
  }
}

