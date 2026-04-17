import { FilePackageService } from './file-package.service';

describe('FilePackageService', () => {
  let service: FilePackageService;

  beforeEach(() => {
    service = new FilePackageService();
  });

  it('detects image and file fields from string arrays', () => {
    const result = (service as any).detectFieldTypes([
      {
        gallery: [
          'https://example.com/a.jpg',
          'https://example.com/b.png',
        ],
        attachments: [
          'https://example.com/report.pdf',
          'https://example.com/spec.docx',
        ],
        notes: ['第一段', '第二段'],
      },
    ]);

    expect(result.imageFields).toContain('gallery');
    expect(result.fileFields).toContain('attachments');
    expect(result.textFields).toContain('notes');
  });

  it('picks the first valid detail page url from an array field', () => {
    const detailUrl = (service as any).getItemDetailPageUrl(
      {
        detailLinks: [
          'not-a-url',
          'https://example.com/detail/1',
          'https://example.com/detail/2',
        ],
      },
      { detailPageField: 'detailLinks' },
    );

    expect(detailUrl).toBe('https://example.com/detail/1');
  });

  it('adds a value index suffix when packaging multiple urls without a placeholder', () => {
    const filePath = (service as any).applyValueIndexSuffix(
      'images/1_gallery.jpg',
      1,
      3,
      'images/{index}_{fieldName}.{ext}',
    );

    expect(filePath).toBe('images/1_gallery_2.jpg');
  });
});
