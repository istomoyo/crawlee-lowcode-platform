import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Execution } from '../execution/entities/execution.entity';
import { NotificationService } from '../notification/notification.service';
import { TaskCookieCredentialService } from './task-cookie-credential.service';
import { CrawleeEngineService } from './crawlee-engine.service';
import { Task } from './entities/task.entity';
import { FilePackageService } from './file-package.service';
import { TaskGateway } from './task.gateway';
import {
  TaskService,
  getMissingPlaywrightBrowserMessage,
  isRelativeScopedXPath,
} from './task.service';

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(() => {
    service = new TaskService(
      {} as Repository<Task>,
      {} as Repository<Execution>,
      {} as CrawleeEngineService,
      {} as TaskGateway,
      {} as FilePackageService,
      {} as TaskCookieCredentialService,
      {} as NotificationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('uses compact jpeg settings for preview screenshots', () => {
    const options = (service as any).getCompactViewportScreenshotOptions();

    expect(options).toMatchObject({
      fullPage: false,
      type: 'jpeg',
      quality: 72,
      scale: 'css',
      animations: 'disabled',
      caret: 'hide',
    });
  });

  it('applies draft cookies to preview pages when enabled', async () => {
    const addCookies = jest.fn().mockResolvedValue(undefined);
    const page = {
      context: () => ({
        addCookies,
      }),
    };

    await (service as any).applyTaskCookiesToPage(page, 'https://sub.example.com/path', {
      useCookie: true,
      cookieString: 'session=abc123; theme=dark',
      cookieDomain: 'example.com',
    });

    expect(addCookies).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'session',
          value: 'abc123',
          domain: 'example.com',
          path: '/',
        }),
      ]),
    );
  });

  it('returns an install hint when the Playwright browser executable is missing', () => {
    const message = getMissingPlaywrightBrowserMessage(
      new Error(
        "browserType.launch: Executable doesn't exist at C:\\Users\\86183\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1200\\chrome-headless-shell.exe",
      ),
    );

    expect(message).toContain('npx playwright install chromium');
  });

  it('ignores non-browser-install errors when building the preview hint', () => {
    expect(getMissingPlaywrightBrowserMessage(new Error('navigation timeout'))).toBeNull();
  });

  it('detects item-scoped XPath expressions by their ./ prefix', () => {
    expect(isRelativeScopedXPath('./div[1]')).toBe(true);
    expect(isRelativeScopedXPath('.//a')).toBe(true);
    expect(isRelativeScopedXPath('xpath=.//img')).toBe(true);
    expect(isRelativeScopedXPath('//main')).toBe(false);
    expect(isRelativeScopedXPath('/html/body/main')).toBe(false);
  });

  it('keeps business errors when wrapping task operation failures', () => {
    const error = new BadRequestException('Cookie 凭证已过期，请先更新后再使用');

    expect((service as any).createTaskOperationError(error, '截图失败')).toBe(error);
  });

  it('converts missing browser errors into service unavailable hints', () => {
    expect(
      (service as any).createTaskOperationError(
        new Error(
          "browserType.launch: Executable doesn't exist at C:\\Users\\86183\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1200\\chrome-headless-shell.exe",
        ),
        '截图失败',
        { allowMissingBrowserHint: true },
      ),
    ).toBeInstanceOf(ServiceUnavailableException);
  });

  it('continues preview navigation after a domcontentloaded timeout when the page already navigated', async () => {
    const page = {
      goto: jest
        .fn()
        .mockRejectedValueOnce(
          new Error(
            'page.goto: Timeout 45000ms exceeded.\nCall log:\n  - navigating to "https://www.pixiv.net/collections/1", waiting until "domcontentloaded"',
          ),
        ),
      url: jest.fn().mockReturnValue('https://www.pixiv.net/collections/1'),
    };

    const waitForPreviewPageSettledSpy = jest
      .spyOn(service as any, 'waitForPreviewPageSettled')
      .mockResolvedValue(undefined);

    await expect(
      (service as any).navigatePreviewPage(
        page,
        'https://www.pixiv.net/collections/1',
      ),
    ).resolves.toBeUndefined();

    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(waitForPreviewPageSettledSpy).toHaveBeenCalledWith(page, undefined);
  });

  it('retries preview navigation with commit when timeout happens before navigation commits', async () => {
    const page = {
      goto: jest
        .fn()
        .mockRejectedValueOnce(
          new Error(
            'page.goto: Timeout 45000ms exceeded.\nCall log:\n  - navigating to "https://www.pixiv.net/collections/2", waiting until "domcontentloaded"',
          ),
        )
        .mockResolvedValueOnce(undefined),
      url: jest.fn().mockReturnValue('about:blank'),
    };

    const waitForPreviewPageSettledSpy = jest
      .spyOn(service as any, 'waitForPreviewPageSettled')
      .mockResolvedValue(undefined);

    await expect(
      (service as any).navigatePreviewPage(
        page,
        'https://www.pixiv.net/collections/2',
      ),
    ).resolves.toBeUndefined();

    expect(page.goto).toHaveBeenNthCalledWith(1, 'https://www.pixiv.net/collections/2', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    expect(page.goto).toHaveBeenNthCalledWith(2, 'https://www.pixiv.net/collections/2', {
      waitUntil: 'commit',
      timeout: 45000,
    });
    expect(waitForPreviewPageSettledSpy).toHaveBeenCalledWith(page, undefined);
  });
});
