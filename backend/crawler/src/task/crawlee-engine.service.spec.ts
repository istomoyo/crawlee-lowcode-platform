import { Repository } from 'typeorm';
import { CrawleeEngineService } from './crawlee-engine.service';
import { Task } from './entities/task.entity';
import { Execution } from '../execution/entities/execution.entity';
import {
  CrawleeTaskConfig,
  NestedExtractContext,
  SelectorConfig,
} from './dto/execute-task.dto';
import { TaskGateway } from './task.gateway';
import { FilePackageService } from './file-package.service';
import { SystemSettingsService } from '../admin/system-settings.service';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notification/notification.service';

describe('CrawleeEngineService extraction semantics', () => {
  let service: CrawleeEngineService;
  let taskRepository: {
    find?: jest.Mock;
    save?: jest.Mock;
  };
  let executionRepository: {
    find?: jest.Mock;
    save?: jest.Mock;
  };
  let taskGateway: {
    broadcastTaskUpdate: jest.Mock;
  };

  beforeEach(() => {
    jest
      .spyOn(CrawleeEngineService.prototype as any, 'initializeCrawler')
      .mockImplementation(() => undefined);

    taskRepository = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
    };
    executionRepository = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
    };
    taskGateway = {
      broadcastTaskUpdate: jest.fn(),
    };

    service = new CrawleeEngineService(
      taskRepository as unknown as Repository<Task>,
      executionRepository as unknown as Repository<Execution>,
      taskGateway as unknown as TaskGateway,
      {} as FilePackageService,
      {} as SystemSettingsService,
      {} as MailService,
      {} as NotificationService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps top-level extraction count bound to the first-level item count', async () => {
    const selectors: SelectorConfig[] = [
      {
        name: 'title',
        selector: '.title',
        type: 'text',
      },
    ];

    const baseLocator = {
      count: jest.fn().mockResolvedValue(3),
      nth: jest.fn((index: number) => ({ index })),
    };
    const page = {
      locator: jest.fn().mockReturnValue(baseLocator),
    };

    jest
      .spyOn(service as any, 'extractDataFromElement')
      .mockImplementation(
        async (
          baseElement: { index: number },
          selector: SelectorConfig,
          itemData: Record<string, unknown>,
        ) => {
          itemData[selector.name] = `item-${baseElement.index + 1}`;
        },
      );

    const items = await (service as any).extractItemsByBaseSelector(
      page,
      '.task-row',
      selectors,
      99,
    );

    expect(page.locator).toHaveBeenCalledWith('.task-row');
    expect(items).toEqual([
      { title: 'item-1' },
      { title: 'item-2' },
      { title: 'item-3' },
    ]);
  });

  it('filters fully empty items from configured list extraction', async () => {
    const selectors: SelectorConfig[] = [
      {
        name: 'title',
        selector: '.title',
        type: 'text',
      },
    ];

    const baseLocator = {
      count: jest.fn().mockResolvedValue(2),
      nth: jest.fn((index: number) => ({
        index,
        count: jest.fn().mockResolvedValue(1),
      })),
    };
    const page = {
      locator: jest.fn().mockReturnValue(baseLocator),
    };

    jest
      .spyOn(service as any, 'waitForReadySelector')
      .mockResolvedValue(true);
    jest
      .spyOn(service as any, 'waitForPageSettled')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'extractDataFromElementWithRetries')
      .mockImplementation(
        async (
          baseElement: { index: number },
          selector: SelectorConfig,
          itemData: Record<string, unknown>,
        ) => {
          itemData[selector.name] = baseElement.index === 0 ? 'item-1' : null;
        },
      );

    const items = await (service as any).extractConfiguredListItemsFromCurrentPage(
      page,
      {
        crawlerType: 'playwright',
        urls: ['https://example.com/list'],
        baseSelector: '.task-row',
        selectors,
      },
    );

    expect(items).toEqual([{ title: 'item-1' }]);
  });

  it('defers nested extraction until after pagination completes', async () => {
    const page = {
      evaluate: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };
    const config: CrawleeTaskConfig = {
      crawlerType: 'playwright',
      urls: ['https://example.com/list'],
      baseSelector: '.task-row',
      selectors: [
        { name: 'title', selector: '.title', type: 'text' },
        { name: 'detailUrl', selector: '.detail', type: 'link' },
      ],
      nextPageSelector: '//a[@rel="next"]',
      maxPages: 2,
      nestedContexts: [
        {
          parentLink: 'detailUrl',
          baseSelector: '.comment',
          listOutputKey: 'comments',
          selectors: [
            { name: 'content', selector: '.content', type: 'text' },
          ],
        },
      ],
    };
    const extractConfiguredListItemsFromCurrentPageSpy = jest
      .spyOn(service as any, 'extractConfiguredListItemsFromCurrentPage')
      .mockResolvedValueOnce([
        { title: 'Page 1 item', detailUrl: 'https://example.com/detail/1' },
      ])
      .mockResolvedValueOnce([
        { title: 'Page 2 item', detailUrl: 'https://example.com/detail/2' },
      ]);
    const extractNestedContextsForItemsSpy = jest
      .spyOn(service as any, 'extractNestedContextsForItems')
      .mockResolvedValue(undefined);
    const advanceToNextPageSpy = jest
      .spyOn(service as any, 'advanceToNextPage')
      .mockResolvedValue(true);

    const items = await (service as any).extractConfiguredListItems(
      page,
      config,
      1,
    );

    expect(extractConfiguredListItemsFromCurrentPageSpy).toHaveBeenCalledTimes(2);
    expect(advanceToNextPageSpy).toHaveBeenCalledTimes(1);
    expect(extractNestedContextsForItemsSpy).toHaveBeenCalledTimes(1);
    expect(extractNestedContextsForItemsSpy).toHaveBeenCalledWith(
      [
        { title: 'Page 1 item', detailUrl: 'https://example.com/detail/1' },
        { title: 'Page 2 item', detailUrl: 'https://example.com/detail/2' },
      ],
      config.nestedContexts,
      config,
      1,
    );
    expect(items).toEqual([
      { title: 'Page 1 item', detailUrl: 'https://example.com/detail/1' },
      { title: 'Page 2 item', detailUrl: 'https://example.com/detail/2' },
    ]);
  });

  it('defers parentLink detail selectors until after pagination completes', async () => {
    const page = {
      evaluate: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };
    const config: CrawleeTaskConfig = {
      crawlerType: 'playwright',
      urls: ['https://example.com/list'],
      baseSelector: '.task-row',
      selectors: [
        { name: 'title', selector: '.title', type: 'text' },
        { name: 'detailUrl', selector: '.detail', type: 'link' },
        {
          name: 'summary',
          selector: '.summary',
          type: 'text',
          parentLink: 'detailUrl',
        },
      ],
      nextPageSelector: '//a[@rel="next"]',
      maxPages: 2,
    };
    jest
      .spyOn(service as any, 'extractConfiguredListItemsFromCurrentPage')
      .mockResolvedValueOnce([
        { title: 'Page 1 item', detailUrl: 'https://example.com/detail/1' },
      ])
      .mockResolvedValueOnce([
        { title: 'Page 2 item', detailUrl: 'https://example.com/detail/2' },
      ]);
    jest
      .spyOn(service as any, 'advanceToNextPage')
      .mockResolvedValue(true);
    const extractParentFieldsFromDetailPageSpy = jest
      .spyOn(service as any, 'extractParentFieldsFromDetailPage')
      .mockImplementation(
        async (
          linkUrl: string,
          selectorsToExtract: SelectorConfig[],
          itemData: Record<string, unknown>,
        ) => {
          itemData[selectorsToExtract[0].name] = `summary:${linkUrl.split('/').pop()}`;
        },
      );

    const items = await (service as any).extractConfiguredListItems(
      page,
      config,
      1,
    );

    expect(extractParentFieldsFromDetailPageSpy).toHaveBeenCalledTimes(2);
    expect(items).toEqual([
      {
        title: 'Page 1 item',
        detailUrl: 'https://example.com/detail/1',
        summary: 'summary:1',
      },
      {
        title: 'Page 2 item',
        detailUrl: 'https://example.com/detail/2',
        summary: 'summary:2',
      },
    ]);
  });

  it('uses the preview-aligned default viewport when runtime viewport is missing', () => {
    expect(
      (service as any).getEffectiveViewport({
        crawlerType: 'playwright',
        urls: ['https://example.com/list'],
      }),
    ).toEqual({
      width: 1366,
      height: 768,
    });
  });

  it('uses the preview-aligned default user agent when runtime user agent is missing', () => {
    expect(
      (service as any).getEffectiveUserAgent({
        crawlerType: 'playwright',
        urls: ['https://example.com/list'],
      }),
    ).toContain('Chrome/120.0.0.0');
  });

  it('treats relative XPath field selectors as XPath instead of CSS during extraction', async () => {
    const selector =
      "./div[contains(concat(' ', normalize-space(@class), ' '), ' flex ')]/a[@data-ga4-label='title_link']/div[@data-has-line-height='false']";
    const element = {
      count: jest.fn().mockResolvedValue(1),
      textContent: jest.fn().mockResolvedValue('Blue Archive'),
    };
    const first = jest.fn().mockReturnValue(element);
    const baseElement = {
      locator: jest.fn().mockReturnValue({ first }),
    };
    const extractedData: Record<string, unknown> = {};
    const page = {
      url: jest.fn().mockReturnValue('https://www.pixiv.net/collections'),
    };

    await (service as any).extractDataFromElement(
      baseElement,
      {
        name: 'name',
        selector,
        type: 'text',
      },
      extractedData,
      page,
    );

    expect(baseElement.locator).toHaveBeenCalledWith(`xpath=${selector}`);
    expect(extractedData).toEqual({
      name: 'Blue Archive',
    });
  });

  it('attaches nested detail collections as arrays on each parent item', async () => {
    const config: CrawleeTaskConfig = {
      crawlerType: 'playwright',
      urls: ['https://example.com/list'],
    };
    const nestedContext: NestedExtractContext = {
      parentLink: 'detailUrl',
      baseSelector: '.comment',
      listOutputKey: 'comments',
      selectors: [
        {
          name: 'content',
          selector: '.content',
          type: 'text',
        },
      ],
    };
    const items = [
      {
        title: 'Parent A',
        detailUrl: 'https://example.com/detail/a',
      },
      {
        title: 'Parent B',
        detailUrl: 'https://example.com/detail/b',
      },
    ];

    jest
      .spyOn(service as any, 'extractNestedContextItems')
      .mockImplementation(async (detailUrl: string) => {
        if (detailUrl.endsWith('/a')) {
          return [{ content: 'A-1' }, { content: 'A-2' }];
        }

        return [{ content: 'B-1' }];
      });

    await (service as any).extractNestedContextsForItems(
      items,
      [nestedContext],
      config,
      1,
    );

    expect(items).toEqual([
      {
        title: 'Parent A',
        detailUrl: 'https://example.com/detail/a',
        comments: [{ content: 'A-1' }, { content: 'A-2' }],
      },
      {
        title: 'Parent B',
        detailUrl: 'https://example.com/detail/b',
        comments: [{ content: 'B-1' }],
      },
    ]);
  });

  it('filters fully empty items from nested base selector extraction', async () => {
    const selectors: SelectorConfig[] = [
      {
        name: 'title',
        selector: '.title',
        type: 'text',
      },
    ];

    const baseLocator = {
      count: jest.fn().mockResolvedValue(2),
      nth: jest.fn((index: number) => ({ index })),
    };
    const page = {
      locator: jest.fn().mockReturnValue(baseLocator),
    };

    jest.spyOn(service as any, 'extractDataFromElement').mockImplementation(
      async (
        baseElement: { index: number },
        selector: SelectorConfig,
        itemData: Record<string, unknown>,
      ) => {
        itemData[selector.name] = baseElement.index === 0 ? 'item-1' : null;
      },
    );

    const items = await (service as any).extractItemsByBaseSelector(
      page,
      '.task-row',
      selectors,
      99,
    );

    expect(items).toEqual([{ title: 'item-1' }]);
  });

  it.skip('resolves nested parent links by parentLinkKey when labels repeat across levels', async () => {
    const config: CrawleeTaskConfig = {
      crawlerType: 'playwright',
      urls: ['https://example.com/list'],
    };
    const nestedContexts: NestedExtractContext[] = [
      {
        parentLink: '链接地址',
        baseSelector: '.comment',
        listOutputKey: 'children',
        selectors: [],
      },
      {
        parentLink: '链接地址',
        baseSelector: '.image',
        listOutputKey: 'images',
        selectors: [],
      },
    ];
    const rootItem: Record<string, unknown> = {
      链接地址: 'https://wrong.example/root-visible',
    };

    jest
      .spyOn(service as any, 'extractNestedContextItems')
      .mockImplementation(async (detailUrl: string) => {
        if (detailUrl.endsWith('/root')) {
          const childItem: Record<string, unknown> = {
            链接地址: 'https://wrong.example/child-visible',
          };
          return [childItem];
        }

        if (detailUrl.endsWith('/nested')) {
          return [{ src: 'https://img.example.com/1.jpg' }];
        }

        return [];
      });

    await (service as any).extractNestedContextsForItems(
      [rootItem],
      nestedContexts,
      config,
      1,
    );

    expect(rootItem.children).toEqual([
      {
        链接地址: 'https://wrong.example/child-visible',
        images: [{ src: 'https://img.example.com/1.jpg' }],
      },
    ]);
  });

  it('rejects duplicate selector names before the crawler starts', () => {
    const config: CrawleeTaskConfig = {
      crawlerType: 'playwright',
      urls: ['https://example.com/list'],
      selectors: [
        { name: '链接地址', selector: '.link-1', type: 'link' },
        { name: '链接地址', selector: '.link-2', type: 'link' },
      ],
    };

    expect(() => (service as any).assertUniqueSelectorNames(config)).toThrow(
      '字段名不能重复',
    );
  });

  it('does not reuse the top-level maxItems limit for nested child collections', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const detailPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn().mockReturnValue({
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      context: jest.fn(() => ({ close })),
    };
    const ctx: NestedExtractContext = {
      parentLink: 'detailUrl',
      baseSelector: '.comment',
      listOutputKey: 'comments',
      selectors: [
        {
          name: 'content',
          selector: '.content',
          type: 'text',
        },
      ],
    };
    const config: CrawleeTaskConfig = {
      crawlerType: 'playwright',
      urls: ['https://example.com/list'],
      maxItems: 1,
    };

    jest
      .spyOn(service as any, 'createDetachedDetailPage')
      .mockResolvedValue(detailPage);
    const extractItemsSpy = jest
      .spyOn(service as any, 'extractItemsByBaseSelector')
      .mockResolvedValue([]);

    await (service as any).extractNestedContextItems(
      'https://example.com/detail/1',
      ctx,
      config,
    );

    expect(extractItemsSpy).toHaveBeenCalledWith(
      detailPage,
      ctx.baseSelector,
      ctx.selectors,
      undefined,
      config,
    );
    expect(close).toHaveBeenCalled();
  });

  it('applies configured cookies before navigating nested detail pages', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const detailPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      context: jest.fn(() => ({ close })),
      isClosed: jest.fn().mockReturnValue(false),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn().mockReturnValue({
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    };
    const ctx: NestedExtractContext = {
      parentLink: 'detailUrl',
      baseSelector: '.comment',
      listOutputKey: 'comments',
      selectors: [],
    };
    const config: CrawleeTaskConfig = {
      crawlerType: 'playwright',
      urls: ['https://example.com/list'],
      useCookie: true,
      cookieString: 'session=abc',
    };

    jest
      .spyOn(service as any, 'createDetachedDetailPage')
      .mockResolvedValue(detailPage);
    const applyConfiguredCookiesSpy = jest
      .spyOn(service as any, 'applyConfiguredCookies')
      .mockResolvedValue(undefined);
    const waitBeforeNavigationSpy = jest
      .spyOn(service as any, 'waitBeforeNavigation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'waitForPageSettled')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'waitForReadySelector')
      .mockResolvedValue(true);
    jest
      .spyOn(service as any, 'extractItemsByBaseSelector')
      .mockResolvedValue([]);

    await (service as any).extractNestedContextItems(
      'https://example.com/detail/1',
      ctx,
      config,
    );

    expect(applyConfiguredCookiesSpy).toHaveBeenCalledWith(
      detailPage,
      'https://example.com/detail/1',
      config,
    );
    expect(waitBeforeNavigationSpy).toHaveBeenCalledWith(detailPage, config);
    expect(close).toHaveBeenCalled();
  });

  it('caps empty-value retries at two attempts', () => {
    expect(
      (service as any).getEmptyValueRetryCount({
        crawlerType: 'playwright',
        urls: ['https://example.com/list'],
        maxRetries: 9,
      }),
    ).toBe(2);
  });

  it('uses compact jpeg settings for persisted task screenshots', () => {
    const options = (service as any).getStoredTaskScreenshotOptions();

    expect(options).toMatchObject({
      fullPage: true,
      type: 'jpeg',
      quality: 68,
      scale: 'css',
      animations: 'disabled',
      caret: 'hide',
    });
  });

  it('fills text pre-actions and waits for the page to settle afterwards', async () => {
    const fill = jest.fn().mockResolvedValue(undefined);
    const waitFor = jest.fn().mockResolvedValue(undefined);
    const first = jest.fn().mockReturnValue({ waitFor, fill });
    const locator = jest.fn().mockReturnValue({ first });
    const page = {
      locator,
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };

    const waitForPageSettledSpy = jest
      .spyOn(service as any, 'waitForPageSettled')
      .mockResolvedValue(undefined);

    await (service as any).executePreActions(
      page,
      [
        {
          type: 'type',
          selector: '//input[@name="keyword"]',
          value: 'BlueArchive',
          timeout: 4321,
        },
      ],
      3000,
    );

    expect(locator).toHaveBeenCalledWith('xpath=//input[@name="keyword"]');
    expect(waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 4321 });
    expect(fill).toHaveBeenCalledWith('BlueArchive', { timeout: 4321 });
    expect(waitForPageSettledSpy).toHaveBeenCalledWith(page, 4321, 200);
  });

  it('skips optional page-layer pre-actions when their selector is missing', async () => {
    const waitFor = jest
      .fn()
      .mockRejectedValue(
        new Error(
          'locator.waitFor: Timeout 5000ms exceeded.\nCall log:\n  - waiting for locator(\'//button\').first() to be visible',
        ),
      );
    const first = jest.fn().mockReturnValue({ waitFor });
    const locator = jest.fn().mockReturnValue({ first });
    const page = {
      locator,
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };

    const waitForPageSettledSpy = jest
      .spyOn(service as any, 'waitForPageSettled')
      .mockResolvedValue(undefined);

    await expect(
      (service as any).executePreActions(
        page,
        [
          {
            type: 'click',
            selector: '//button',
            timeout: 5000,
          },
        ],
        3000,
        {
          ignoreMissingTargets: true,
        },
      ),
    ).resolves.toBeUndefined();

    expect(locator).toHaveBeenCalledWith('xpath=//button');
    expect(waitForPageSettledSpy).not.toHaveBeenCalled();
  });

  it('recovers interrupted executions as failed on startup', async () => {
    const staleTask = {
      id: 7,
      name: 'Pixiv task',
      url: 'https://www.pixiv.net',
      status: 'running',
      userId: 12,
    } as Task;
    const staleExecution = {
      id: 11,
      taskId: 7,
      status: 'running',
      log: 'still running',
      task: staleTask,
    } as Execution;

    executionRepository.find?.mockResolvedValue([staleExecution]);

    await service.onModuleInit();

    expect(executionRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 11,
        status: 'failed',
      }),
    ]);
    expect(taskRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 7,
        status: 'failed',
      }),
    ]);
    expect(taskGateway.broadcastTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 7,
        status: 'failed',
        progress: 0,
      }),
      12,
    );
  });

  it('does not treat a click as pagination success when the page state does not change', async () => {
    const click = jest.fn().mockResolvedValue(undefined);
    const waitFor = jest.fn().mockResolvedValue(undefined);
    const scrollIntoViewIfNeeded = jest.fn().mockResolvedValue(undefined);
    const paginationLocator = {
      waitFor,
      click,
      scrollIntoViewIfNeeded,
    };
    const baseContentLocator = {
      evaluate: jest.fn().mockResolvedValue('same-signature'),
    };
    const multiLocator = {
      count: jest.fn().mockResolvedValue(3),
      nth: jest.fn().mockReturnValue({
        evaluate: jest.fn().mockResolvedValue({
          disabled: false,
          visible: true,
          descriptor: '',
          href: '/collections?page=2',
          inNavigation: true,
          top: 900,
        }),
      }),
    };
    const page = {
      locator: jest.fn((selector: string) => {
        if (selector === '.ready') {
          return { first: jest.fn().mockReturnValue(baseContentLocator) };
        }
        return multiLocator;
      }),
      url: jest.fn().mockReturnValue('https://example.com/list?page=1'),
      waitForFunction: jest.fn().mockRejectedValue(new Error('no change')),
    };

    multiLocator.nth = jest
      .fn()
      .mockReturnValueOnce({
        evaluate: jest.fn().mockResolvedValue({
          disabled: false,
          visible: true,
          descriptor: '',
          href: '/collections?page=2',
          inNavigation: false,
          top: 300,
        }),
      })
      .mockReturnValueOnce({
        evaluate: jest.fn().mockResolvedValue({
          disabled: false,
          visible: true,
          descriptor: 'next page',
          href: '/collections?page=2',
          inNavigation: true,
          top: 900,
        }),
      })
      .mockReturnValueOnce({
        evaluate: jest.fn().mockResolvedValue({
          disabled: false,
          visible: true,
          descriptor: '',
          href: '/collections?page=3',
          inNavigation: true,
          top: 850,
        }),
      })
      .mockReturnValue(paginationLocator);

    jest
      .spyOn(service as any, 'waitForPageSettled')
      .mockResolvedValue(undefined);

    const moved = await (service as any).advanceToNextPage(
      page,
      '//a[@aria-disabled="false"]',
      6000,
      '.ready',
    );

    expect(moved).toBe(false);
    expect(click).toHaveBeenCalled();
  });
});
