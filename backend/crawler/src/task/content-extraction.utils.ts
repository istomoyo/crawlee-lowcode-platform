import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

export type HtmlContentFormat = 'text' | 'html' | 'markdown' | 'smart';

const REMOVABLE_SELECTOR = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'canvas',
  'button',
  'input',
  'select',
  'textarea',
  'nav',
  'aside',
  'footer',
  'header nav',
  '[role="navigation"]',
  '[role="complementary"]',
  '[aria-hidden="true"]',
  '.advertisement',
  '.ads',
  '.ad',
  '.banner',
  '.breadcrumb',
  '.comments',
  '.comment',
  '.recommend',
  '.recommendation',
  '.related',
  '.share',
  '.toolbar',
  '.sidebar',
  '.popup',
  '.modal',
] as const;

const UNWRAP_SELECTOR = ['form'] as const;
const NOISE_SELECTOR = [
  '#share-2',
  '[id^="share-"]',
  '[id^="share_"]',
  '[class*="share-"]',
  '.articleAuthor',
  '.articleAuthor2',
  '.dtl_page',
  '.prev-next',
  '.post-nav',
  '.article-nav',
] as const;
const DECORATIVE_MEDIA_SELECTOR = [
  '.dtl_tit .cont img',
  '.article-meta img',
  '.meta img',
  '.articleAuthor img',
  '.dtl_page img',
] as const;

const PRIORITY_SELECTOR = [
  'article',
  'main',
  '[itemprop="articleBody"]',
  '[role="main"]',
  '.article-content',
  '.article-body',
  '.post-content',
  '.post-body',
  '.entry-content',
  '.entry-body',
  '.blog-content',
  '.blog-post',
  '.markdown-body',
  '.content-body',
  '.rich-text',
  '#article',
  '#content',
  '#post',
  '#main-content',
] as const;

const CANDIDATE_SELECTOR = [
  'article',
  'main',
  'section',
  'div',
  'td',
  'blockquote',
] as const;

const turndownService = createTurndownService();

export function formatHtmlFragment(
  html: string | null | undefined,
  contentFormat: HtmlContentFormat = 'text',
  pageUrl?: string,
): string | null {
  if (!html || !String(html).trim()) {
    return null;
  }

  switch (contentFormat) {
    case 'html':
      return html.trim();
    case 'markdown':
      return convertHtmlFragmentToMarkdown(html, pageUrl, false);
    case 'smart':
      return convertHtmlFragmentToMarkdown(html, pageUrl, true);
    case 'text':
    default:
      return convertHtmlFragmentToText(html, pageUrl);
  }
}

function createTurndownService() {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });

  service.addRule('figure', {
    filter: ['figure'],
    replacement(content) {
      return `\n\n${content.trim()}\n\n`;
    },
  });

  service.addRule('lineBreak', {
    filter: ['br'],
    replacement() {
      return '  \n';
    },
  });

  service.addRule('removeEmptyLinks', {
    filter(node) {
      return (
        node.nodeName === 'A' &&
        !node.textContent?.trim() &&
        !(node as HTMLAnchorElement).getAttribute('href')
      );
    },
    replacement() {
      return '';
    },
  });

  return service;
}

function convertHtmlFragmentToText(
  html: string,
  pageUrl?: string,
): string | null {
  const root = buildSanitizedRoot(html, pageUrl, false);
  const text = normalizeText(root.textContent || '');
  return text || null;
}

function convertHtmlFragmentToMarkdown(
  html: string,
  pageUrl?: string,
  preferPrimaryContent = false,
): string | null {
  const root = buildSanitizedRoot(html, pageUrl, preferPrimaryContent);
  const output = normalizeMarkdown(
    turndownService.turndown(root.innerHTML || root.outerHTML || ''),
  );

  if (output) {
    return output;
  }

  return normalizeText(root.textContent || '') || null;
}

function buildSanitizedRoot(
  html: string,
  pageUrl?: string,
  preferPrimaryContent = false,
): HTMLElement {
  const dom = new JSDOM(`<body>${html}</body>`, {
    url: pageUrl || 'https://example.com/',
  });
  const { document } = dom.window;
  const body = document.body;

  absolutizeAssetUrls(document, pageUrl);
  removeUnwantedNodes(body);
  dropLikelyBoilerplate(body);

  const selectedRoot =
    preferPrimaryContent && isArticleLike(body)
      ? selectPrimaryContent(body)
      : body;

  const sanitizedRoot = selectedRoot.cloneNode(true) as HTMLElement;
  removeUnwantedNodes(sanitizedRoot);
  pruneEmptyNodes(sanitizedRoot);

  return sanitizedRoot;
}

function absolutizeAssetUrls(document: Document, pageUrl?: string) {
  if (!pageUrl) {
    return;
  }

  const absolutize = (value: string | null): string | null => {
    if (!value) {
      return value;
    }

    try {
      return new URL(value, pageUrl).href;
    } catch {
      return value;
    }
  };

  document.querySelectorAll<HTMLElement>('[href]').forEach((node) => {
    const href = absolutize(node.getAttribute('href'));
    if (href) {
      node.setAttribute('href', href);
    }
  });

  document.querySelectorAll<HTMLElement>('[src]').forEach((node) => {
    const src = absolutize(node.getAttribute('src'));
    if (src) {
      node.setAttribute('src', src);
    }
  });
}

function removeUnwantedNodes(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(UNWRAP_SELECTOR.join(',')).forEach((node) => {
    while (node.firstChild) {
      node.parentNode?.insertBefore(node.firstChild, node);
    }
    node.remove();
  });

  root.querySelectorAll(REMOVABLE_SELECTOR.join(',')).forEach((node) => {
    node.remove();
  });

  root.querySelectorAll(NOISE_SELECTOR.join(',')).forEach((node) => {
    node.remove();
  });

  root.querySelectorAll(DECORATIVE_MEDIA_SELECTOR.join(',')).forEach((node) => {
    node.remove();
  });
}

function pruneEmptyNodes(root: HTMLElement) {
  root.querySelectorAll('*').forEach((node) => {
    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    const keep =
      ['img', 'video', 'audio', 'picture', 'pre', 'code', 'iframe'].includes(
        tagName,
      ) || element.querySelector('img,video,audio,picture,pre,code');

    if (keep) {
      return;
    }

    if (!normalizeText(element.textContent || '')) {
      element.remove();
    }
  });
}

function dropLikelyBoilerplate(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR.join(',')).forEach((el) => {
    if (shouldPreserveCandidate(el)) {
      return;
    }

    const score = scoreElement(el);
    const textLength = normalizeText(el.textContent || '').length;
    if (textLength > 0 && score < 20) {
      el.remove();
    }
  });
}

function shouldPreserveCandidate(element: HTMLElement): boolean {
  const textLength = normalizeText(element.textContent || '').length;
  const className = `${element.className} ${element.id}`;
  const paragraphCount = element.querySelectorAll('p').length;
  const headingCount = element.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
  const mediaCount = element.querySelectorAll('img,video,picture,figure').length;

  return (
    /article|content|entry|post|story|body|markdown|rich/i.test(className) ||
    headingCount > 0 ||
    paragraphCount >= 2 ||
    mediaCount > 0 ||
    textLength >= 120
  );
}

function isArticleLike(root: HTMLElement): boolean {
  const text = normalizeText(root.textContent || '');
  const paragraphCount = root.querySelectorAll('p').length;
  const headingCount = root.querySelectorAll('h1,h2,h3').length;

  return (
    text.length >= 180 ||
    paragraphCount >= 3 ||
    headingCount >= 2 ||
    root.querySelector(PRIORITY_SELECTOR.join(',')) !== null
  );
}

function selectPrimaryContent(root: HTMLElement): HTMLElement {
  const explicitCandidates = Array.from(
    root.querySelectorAll<HTMLElement>(PRIORITY_SELECTOR.join(',')),
  );
  const allCandidates = Array.from(
    root.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR.join(',')),
  );
  const candidates = [
    ...explicitCandidates,
    ...allCandidates.filter((candidate) => !explicitCandidates.includes(candidate)),
  ];

  let bestCandidate: HTMLElement = root;
  let bestScore = scoreElement(root);

  for (const candidate of candidates) {
    const score = scoreElement(candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function scoreElement(element: HTMLElement): number {
  const text = normalizeText(element.textContent || '');
  const textLength = text.length;
  if (textLength < 80) {
    return -100;
  }

  const paragraphs = element.querySelectorAll('p').length;
  const headings = element.querySelectorAll('h1,h2,h3').length;
  const images = element.querySelectorAll('img').length;
  const listItems = element.querySelectorAll('li').length;
  const links = Array.from(element.querySelectorAll('a'));
  const linkTextLength = links.reduce(
    (sum, link) => sum + normalizeText(link.textContent || '').length,
    0,
  );
  const linkDensity = textLength > 0 ? linkTextLength / textLength : 1;
  const punctuationCount =
    text.match(/[，。！？；：,.!?;:]/g)?.length || 0;
  const classHint = /article|content|entry|post|story|body|markdown|rich/i.test(
    `${element.className} ${element.id}`,
  )
    ? 120
    : 0;
  const negativeHint = /comment|nav|footer|aside|share|related|recommend|menu|author|meta|toolbar|sidebar/i.test(
    `${element.className} ${element.id}`,
  )
    ? 160
    : 0;
  const listPenalty = listItems > Math.max(4, paragraphs * 3) ? 80 : 0;

  return (
    textLength * 0.65 +
    paragraphs * 28 +
    headings * 20 +
    images * 6 +
    punctuationCount * 2 -
    linkDensity * 260 +
    classHint -
    negativeHint -
    listPenalty
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeMarkdown(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
