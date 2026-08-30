import { describe, expect, it } from 'vitest';
import {
  buildExportFileName,
  buildMarkdownImportItems,
  buildNoteExportHtml,
  createDuplicateTitle,
  deriveMarkdownImportTitle
} from '../src/index.js';

describe('framework-neutral note file actions', () => {
  it('derives import titles from H1 headings and de-duplicates sibling names', () => {
    expect(deriveMarkdownImportTitle('fallback.md', '# Heading\nBody')).toBe('Heading');
    expect(buildMarkdownImportItems([
      { fileName: 'one.md', rawMarkdown: '# Heading' },
      { fileName: 'two.markdown', rawMarkdown: '# Heading' }
    ], ['Heading'])).toEqual([
      { title: 'Heading 2', rawMarkdown: '# Heading', sourceType: 'markdown-import' },
      { title: 'Heading 3', rawMarkdown: '# Heading', sourceType: 'markdown-import' }
    ]);
  });
  it('reuses the legacy duplicate naming rule without collisions', () => {
    expect(createDuplicateTitle(['研究笔记 Copy'], '研究笔记')).toBe('研究笔记 Copy 2');
  });

  it('sanitizes exported file names', () => {
    expect(buildExportFileName('A/B: C', 'md')).toBe('A - B C.md');
  });

  it('builds a standalone rich HTML document and escapes its title', () => {
    const html = buildNoteExportHtml({ title: '<标题>', previewHtml: '<h1>正文</h1>' });
    expect(html).toContain('<title>&lt;标题&gt;</title>');
    expect(html).toContain('<article><h1>正文</h1></article>');
  });
});
