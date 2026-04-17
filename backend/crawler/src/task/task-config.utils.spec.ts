import {
  buildCookieHeader,
  createPlaywrightCookies,
  itemMatchesResultFilters,
  listUnsafeCustomJsFeatures,
  sanitizeResultFilters,
  sanitizeTaskConfig,
} from './task-config.utils';

describe('task-config utils', () => {
  describe('sanitizeTaskConfig', () => {
    it('removes legacy fields and normalizes filters, cookies, and notifications', () => {
      const sanitized = sanitizeTaskConfig({
        taskMode: 'behavior',
        useCookie: true,
        cookieString: ' session=abc; theme=dark ',
        cookieDomain: 'https://Sub.Example.com/path?a=1',
        proxyUrl: 'http://legacy-proxy',
        behaviorSteps: [
          {
            type: 'wait',
          },
          {
            type: 'loop',
            selector: '//article',
            children: [{ type: 'extract', field: 'title', selector: './/h2' }],
          },
        ],
        resultFilters: [
          {
            field: 'title',
            operator: 'contains',
            value: 'Crawler',
          },
          {
            field: 'score',
            functionCode: 'return helpers.toNumber(value) > 10;',
          },
          {
            field: '',
            operator: 'eq',
            value: 'ignored',
          },
        ],
        notification: {
          enabled: true,
          previewCount: 99,
        },
      });

      expect(sanitized).toMatchObject({
        taskMode: 'simple',
        useCookie: true,
        cookieString: 'session=abc; theme=dark',
        cookieDomain: 'sub.example.com',
        behaviorSteps: [],
        resultFilters: [
          {
            field: 'title',
            mode: 'operator',
            operator: 'contains',
            value: 'Crawler',
          },
          {
            field: 'score',
            mode: 'function',
            functionCode: 'return helpers.toNumber(value) > 10;',
          },
        ],
        notification: {
          enabled: true,
          onSuccess: true,
          onFailure: true,
          previewCount: 10,
        },
      });
      expect('proxyUrl' in sanitized).toBe(false);
    });

    it('keeps saved cookie credential references when cookie text is omitted', () => {
      const sanitized = sanitizeTaskConfig({
        crawlerType: 'playwright',
        urls: ['https://example.com/list'],
        useCookie: true,
        cookieCredentialId: 12,
      });

      expect(sanitized).toMatchObject({
        useCookie: true,
        cookieCredentialId: 12,
      });
      expect(sanitized.cookieString).toBeUndefined();
    });

    it('drops inline cookie strings when persisting task or template configs', () => {
      const sanitized = sanitizeTaskConfig(
        {
          crawlerType: 'playwright',
          urls: ['https://example.com/list'],
          useCookie: true,
          cookieString: 'session=abc123',
          cookieDomain: 'https://example.com',
        },
        { allowInlineCookieString: false },
      );

      expect(sanitized.useCookie).toBe(false);
      expect(sanitized.cookieString).toBeUndefined();
      expect(sanitized.cookieDomain).toBeUndefined();
    });

    it('keeps text-input pre-actions with their typed value', () => {
      const sanitized = sanitizeTaskConfig({
        crawlerType: 'playwright',
        urls: ['https://example.com/list'],
        preActions: [
          {
            type: 'type',
            selector: '//input[@name="keyword"]',
            value: 'BlueArchive',
            timeout: 4500,
          },
          {
            type: 'click',
            selector: '//button[@type="submit"]',
            timeout: 4500,
          },
        ],
      });

      expect(sanitized.preActions).toEqual([
        {
          type: 'type',
          selector: '//input[@name="keyword"]',
          value: 'BlueArchive',
          timeout: 4500,
        },
        {
          type: 'click',
          selector: '//button[@type="submit"]',
          timeout: 4500,
        },
      ]);
    });

    it('strips legacy link keys from selectors and nested contexts', () => {
      const sanitized = sanitizeTaskConfig({
        crawlerType: 'playwright',
        urls: ['https://example.com/list'],
        selectors: [
          {
            name: '链接地址',
            selector: './/a[1]',
            type: 'link',
            linkKey: 'legacy_link',
            parentLinkKey: 'legacy_parent',
          },
        ],
        nestedContexts: [
          {
            parentLink: '链接地址',
            parentLinkKey: 'legacy_link',
            baseSelector: '//article',
            selectors: [
              {
                name: '子链接',
                selector: './/a[1]',
                type: 'link',
                linkKey: 'child_link',
                parentLinkKey: 'legacy_link',
              },
            ],
          },
        ],
      });

      expect(sanitized.selectors).toEqual([
        {
          name: '链接地址',
          selector: './/a[1]',
          type: 'link',
          parentLink: undefined,
          preActions: [],
          contentFormat: undefined,
          detailBaseSelector: undefined,
          customTransformCode: undefined,
        },
      ]);
      expect(sanitized.nestedContexts).toEqual([
        {
          parentLink: '链接地址',
          baseSelector: '//article',
          listOutputKey: undefined,
          selectors: [
            {
              name: '子链接',
              selector: './/a[1]',
              type: 'link',
              preActions: [],
              contentFormat: undefined,
              customTransformCode: undefined,
            },
          ],
          maxDepth: undefined,
          preActions: [],
          next: undefined,
          scroll: undefined,
        },
      ]);
    });
  });

  describe('sanitizeResultFilters', () => {
    it('drops invalid rules and infers function mode from functionCode', () => {
      expect(
        sanitizeResultFilters([
          {
            field: 'title',
            operator: 'contains',
            value: 'OpenAI',
          },
          {
            field: 'score',
            functionCode: 'return true;',
          },
          {
            field: 'broken',
            operator: 'between',
          },
          {
            field: '',
            operator: 'eq',
            value: 'ignored',
          },
        ]),
      ).toEqual([
        {
          field: 'title',
          mode: 'operator',
          operator: 'contains',
          value: 'OpenAI',
        },
        {
          field: 'score',
          mode: 'function',
          functionCode: 'return true;',
        },
      ]);
    });
  });

  describe('itemMatchesResultFilters', () => {
    it('supports nested fields, localized numeric text, and empty checks', () => {
      const item = {
        title: 'OpenAI Crawler Agent',
        stats: {
          views: '1.2万',
        },
        summary: '   ',
      };

      expect(
        itemMatchesResultFilters(item, [
          {
            field: 'title',
            operator: 'contains',
            value: 'agent',
          },
          {
            field: 'stats.views',
            operator: 'gte',
            value: '10000',
          },
          {
            field: 'summary',
            operator: 'is_empty',
          },
        ]),
      ).toBe(true);
    });

    it('executes per-field function filters with helper utilities', () => {
      const item = {
        title: 'OpenAI Agent Platform',
        tags: ['crawler', 'agent'],
        score: '12',
      };

      expect(
        itemMatchesResultFilters(item, [
          {
            field: 'tags',
            mode: 'function',
            functionCode: `
              return helpers.length(value) >= 2
                && helpers.includes(item.title, 'agent')
                && helpers.toNumber(item.score) > 10;
            `,
          },
        ]),
      ).toBe(true);
    });

    it('fails safely when custom filter code throws', () => {
      expect(
        itemMatchesResultFilters(
          { title: 'safe fallback' },
          [
            {
              field: 'title',
              mode: 'function',
              functionCode: 'throw new Error("boom");',
            },
          ],
        ),
      ).toBe(false);
    });

    it('rejects custom filter execution when unsafe custom js is disabled', () => {
      const originalFlag = process.env.ALLOW_UNSAFE_CUSTOM_JS;
      process.env.ALLOW_UNSAFE_CUSTOM_JS = 'false';

      try {
        expect(() =>
          itemMatchesResultFilters(
            { score: '12' },
            [
              {
                field: 'score',
                mode: 'function',
                functionCode: 'return helpers.toNumber(value) > 10;',
              },
            ],
          ),
        ).toThrow(/disabled/i);
      } finally {
        if (originalFlag === undefined) {
          delete process.env.ALLOW_UNSAFE_CUSTOM_JS;
        } else {
          process.env.ALLOW_UNSAFE_CUSTOM_JS = originalFlag;
        }
      }
    });
  });

  describe('listUnsafeCustomJsFeatures', () => {
    it('detects result-filter and selector custom js usage', () => {
      expect(
        listUnsafeCustomJsFeatures({
          resultFilters: [
            {
              field: 'score',
              functionCode: 'return true;',
            },
          ],
          selectors: [
            {
              name: 'title',
              selector: '.title',
              type: 'text',
              customTransformCode: 'return value;',
            },
          ],
        }),
      ).toEqual(['结果筛选 JS 函数', '字段自定义处理 JS']);
    });
  });

  describe('cookie helpers', () => {
    it('only attaches cookie headers to matching domains', () => {
      expect(
        buildCookieHeader(
          'session=abc; theme=dark',
          'https://sub.example.com/detail/1',
          'example.com',
        ),
      ).toBe('session=abc; theme=dark');

      expect(
        buildCookieHeader(
          'session=abc; theme=dark',
          'https://another-site.com/detail/1',
          'example.com',
        ),
      ).toBeUndefined();
    });

    it('creates Playwright cookie payloads for both domain and URL scoped cookies', () => {
      expect(
        createPlaywrightCookies(
          'session=abc',
          'https://example.com/article',
          'example.com',
        ),
      ).toEqual([
        {
          name: 'session',
          value: 'abc',
          domain: 'example.com',
          path: '/',
          secure: true,
        },
      ]);

      expect(
        createPlaywrightCookies('session=abc', 'https://example.com/article'),
      ).toEqual([
        {
          name: 'session',
          value: 'abc',
          url: 'https://example.com',
        },
      ]);
    });
  });
});
