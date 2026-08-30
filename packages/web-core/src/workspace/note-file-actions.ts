function normalizeExistingTitles(items: string[]): Set<string> {
  return new Set(items.map((item) => String(item ?? '').trim()).filter(Boolean));
}

export function createDuplicateTitle(existingTitles: string[], sourceTitle: string): string {
  const taken = normalizeExistingTitles(existingTitles);
  const baseTitle = String(sourceTitle ?? '').trim() || 'Untitled Note';
  const copyBase = `${baseTitle} Copy`;
  if (!taken.has(copyBase)) return copyBase;
  let index = 2;
  while (taken.has(`${copyBase} ${index}`)) index += 1;
  return `${copyBase} ${index}`;
}

export function buildExportFileName(title: string, extension: string): string {
  const safeBase = String(title ?? '')
    .trim()
    .replace(/\//g, ' - ')
    .replace(/[\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled Note';
  return `${safeBase}.${String(extension ?? '').trim() || 'txt'}`;
}

export interface MarkdownImportSource {
  fileName: string;
  rawMarkdown: string;
}

export interface MarkdownImportItem {
  title: string;
  rawMarkdown: string;
  sourceType: 'markdown-import';
}

export function deriveMarkdownImportTitle(fileName: string, markdown: string): string {
  const heading = String(markdown ?? '').match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  const fallback = String(fileName ?? '').replace(/\.[^.]+$/, '').trim();
  return fallback || 'Imported Note';
}

export function buildMarkdownImportItems(
  sources: MarkdownImportSource[],
  existingTitles: string[] = []
): MarkdownImportItem[] {
  const taken = normalizeExistingTitles(existingTitles);
  return sources.map((source) => {
    const baseTitle = deriveMarkdownImportTitle(source.fileName, source.rawMarkdown);
    let title = baseTitle;
    let suffix = 2;
    while (taken.has(title)) {
      title = `${baseTitle} ${suffix}`;
      suffix += 1;
    }
    taken.add(title);
    return {
      title,
      rawMarkdown: source.rawMarkdown,
      sourceType: 'markdown-import'
    };
  });
}

export function buildNoteExportHtml(input: {
  title: string;
  previewHtml: string;
}): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      body { font-family: "Segoe UI", "PingFang SC", sans-serif; margin: 40px auto; max-width: 760px; color: #142033; line-height: 1.8; }
      h1, h2, h3 { line-height: 1.3; }
      pre { padding: 16px; background: #10182b; color: #eff4ff; overflow: auto; }
      code { font-family: Consolas, monospace; }
      blockquote { border-left: 3px solid #4c72ff; padding-left: 14px; color: #51607a; }
      img { max-width: 100%; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 8px 10px; border: 1px solid #d0d7e2; text-align: left; }
      th { background: #f0f4fa; }
    </style>
  </head>
  <body><article>${input.previewHtml}</article></body>
</html>`;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
