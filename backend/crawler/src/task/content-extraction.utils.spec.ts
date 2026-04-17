import { formatHtmlFragment } from './content-extraction.utils';

describe('content extraction utils', () => {
  it('preserves article content wrapped by form when converting to markdown', () => {
    const html = `
      <div class="dtl_l article">
        <script>console.log('ignore');</script>
        <form name="_newscontent_fromname">
          <div class="dtl_tit">
            <h1>Archive Committee Meeting</h1>
          </div>
          <div class="dtl_txt">
            <p>The university held the archive committee meeting on April 10.</p>
            <p style="text-align: center;">
              <img src="/images/example.jpg" alt="Meeting scene">
            </p>
            <h2>Key Tasks</h2>
            <p>The meeting emphasized high-quality delivery of annual priorities.</p>
          </div>
          <button type="button">Share</button>
        </form>
      </div>
    `;

    const markdown = formatHtmlFragment(
      html,
      'markdown',
      'https://news.nefu.edu.cn/info/1002/141192.htm',
    );

    expect(markdown).toContain('# Archive Committee Meeting');
    expect(markdown).toContain(
      'The university held the archive committee meeting on April 10.',
    );
    expect(markdown).toContain('## Key Tasks');
    expect(markdown).toContain(
      '![Meeting scene](https://news.nefu.edu.cn/images/example.jpg)',
    );
    expect(markdown).not.toContain('Share');
  });

  it('keeps readable text when a selected article fragment is wrapped by form', () => {
    const html = `
      <div class="dtl_l article">
        <form>
          <h1>Headline</h1>
          <p>Paragraph one.</p>
          <p>Paragraph two.</p>
        </form>
      </div>
    `;

    const text = formatHtmlFragment(html, 'text');

    expect(text).toContain('Headline');
    expect(text).toContain('Paragraph one.');
    expect(text).toContain('Paragraph two.');
  });

  it('removes share blocks, nav blocks and decorative metadata icons', () => {
    const html = `
      <div class="dtl_l article">
        <div class="dtl_tit">
          <h1>Archive Committee Meeting</h1>
          <div class="cont">
            <p><img src="/images/icon-time.png" alt="">Published: 2026-04-14 16:01:28</p>
            <p><img src="/images/icon-source.png" alt="">Source: Office</p>
            <div id="share-2">Share to:</div>
          </div>
        </div>
        <div class="dtl_txt">
          <p>Main paragraph.</p>
          <p><img src="/images/body.jpg" alt="Body image"></p>
        </div>
        <div class="articleAuthor articleAuthor2">
          <span>Editor: Someone</span>
        </div>
        <div class="dtl_page">
          <p>Previous: Older story</p>
        </div>
      </div>
    `;

    const markdown = formatHtmlFragment(
      html,
      'markdown',
      'https://news.nefu.edu.cn/info/1002/141192.htm',
    );

    expect(markdown).toContain('Published: 2026-04-14 16:01:28');
    expect(markdown).toContain('Source: Office');
    expect(markdown).toContain(
      '![Body image](https://news.nefu.edu.cn/images/body.jpg)',
    );
    expect(markdown).not.toContain('Share to:');
    expect(markdown).not.toContain('Editor: Someone');
    expect(markdown).not.toContain('Previous: Older story');
    expect(markdown).not.toContain('icon-time.png');
    expect(markdown).not.toContain('icon-source.png');
  });
});
