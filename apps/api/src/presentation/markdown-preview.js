function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => (
    /^http:\/\//i.test(src.trim())
      ? `<span class="preview-blocked-image">[已阻止不安全图片：${alt || '未命名图片'}]</span>`
      : `<img src="${src}" alt="${alt}" />`
  ));
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return html;
}

function slugifyHeading(text, fallbackIndex) {
  const slug = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `section-${fallbackIndex}`;
}

export function extractMarkdownHeadings(markdown) {
  const source = String(markdown ?? '').replace(/\r\n/g, '\n');
  const headings = [];

  source.split('\n').forEach((line) => {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (!headingMatch) {
      return;
    }

    const title = headingMatch[2].trim();
    headings.push({
      level: headingMatch[1].length,
      title,
      id: slugifyHeading(title, headings.length + 1)
    });
  });

  return headings;
}

export function renderMarkdownPreview(markdown) {
  const source = String(markdown ?? '').replace(/\r\n/g, '\n').trim();

  if (!source) {
    return '<p class="preview-empty">Nothing to preview yet.</p>';
  }

  const blocks = source.split(/\n\s*\n/);

  const headings = extractMarkdownHeadings(source);
  let headingIndex = 0;

  return blocks.map((block) => {
    const lines = block.split('\n');

    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      const items = lines.map((line) => line.replace(/^\s*[-*]\s+/, '').trim());
      return `<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`;
    }

    if (lines[0].startsWith('```') && lines[lines.length - 1].startsWith('```')) {
      const code = lines.slice(1, -1).join('\n');
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }

    const headingMatch = lines[0].match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInlineMarkdown(headingMatch[2]);
      const heading = headings[headingIndex];
      headingIndex += 1;
      const rest = lines.slice(1).join(' ').trim();
      const paragraph = rest ? `<p>${renderInlineMarkdown(rest)}</p>` : '';
      return `<h${level} id="${heading?.id ?? `section-${headingIndex}`}">${content}</h${level}>${paragraph}`;
    }

    return `<p>${renderInlineMarkdown(lines.join('<br />'))}</p>`;
  }).join('');
}
