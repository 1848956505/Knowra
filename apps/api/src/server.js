import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import http from 'node:http';
import { renderMarkdownPreview } from './presentation/markdown-preview.js';

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, html) {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8'
  });
  response.end(html);
}

function sendBinary(response, statusCode, content, mimeType, fileName) {
  response.writeHead(statusCode, {
    'Content-Type': mimeType || 'application/octet-stream',
    'Content-Length': content.byteLength,
    'Content-Disposition': `inline; filename="${encodeURIComponent(fileName || 'attachment.bin')}"`
  });
  response.end(content);
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => {
      data += chunk;
    });
    request.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

function toQueryObject(url) {
  return Object.fromEntries(url.searchParams.entries());
}

function createWebAppHtml() {
  const initialMarkdown = '# Redis\n\nRedis 可以作为缓存和队列底座。';
  const initialPreview = renderMarkdownPreview(initialMarkdown);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>学习加速器 - 知识库</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Segoe UI", "PingFang SC", sans-serif; margin: 0; background: #f4f7fb; color: #172033; }
    .shell { max-width: 1100px; margin: 0 auto; padding: 32px 20px 48px; }
    .hero { display: flex; justify-content: space-between; gap: 24px; align-items: center; margin-bottom: 28px; }
    .hero-card, .card { background: white; border-radius: 20px; box-shadow: 0 12px 28px rgba(35, 51, 84, 0.08); }
    .hero-card { padding: 24px; flex: 1; }
    h1 { margin: 0 0 8px; font-size: 34px; }
    p { margin: 0; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 20px; }
    .card { padding: 20px; }
    form { display: grid; gap: 12px; }
    input, textarea, select, button { font: inherit; }
    input, textarea, select { width: 100%; border: 1px solid #d7deea; border-radius: 12px; padding: 10px 12px; box-sizing: border-box; background: #fbfcff; }
    textarea { min-height: 120px; resize: vertical; }
    button { border: 0; border-radius: 999px; padding: 11px 16px; background: #1e5eff; color: white; cursor: pointer; }
    button.secondary { background: #eef3ff; color: #1e3a8a; }
    button.danger { background: #fee2e2; color: #b91c1c; }
    .row { display: flex; gap: 12px; }
    .row > * { flex: 1; }
    .toolbar { display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .note-list { display: grid; gap: 12px; }
    .note-item { border: 1px solid #e6ebf5; border-radius: 16px; padding: 14px; background: #fcfdff; }
    .note-item h3 { margin: 0 0 6px; font-size: 18px; }
    .muted { color: #63708a; font-size: 14px; }
    .pill { display: inline-block; background: #eef3ff; color: #2947a9; border-radius: 999px; padding: 4px 10px; font-size: 12px; margin-right: 6px; margin-top: 6px; }
    .status { margin-top: 10px; min-height: 24px; color: #1d4ed8; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 20px; }
    .stack { display: grid; gap: 10px; }
    .mini-list { display: grid; gap: 8px; margin-top: 12px; }
    .mini-item { border: 1px solid #e6ebf5; border-radius: 12px; padding: 10px 12px; background: #fcfdff; }
    .mini-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .note-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .tiny { font-size: 12px; color: #6b7280; }
    .overview { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0 6px; }
    .overview-box { border: 1px solid #e6ebf5; border-radius: 16px; padding: 12px 14px; background: #fcfdff; }
    .overview-box strong { display: block; font-size: 22px; margin-top: 4px; }
    .recent-panel { margin-top: 18px; border-top: 1px solid #e6ebf5; padding-top: 18px; }
    .recent-item { border: 1px solid #e6ebf5; border-radius: 12px; padding: 10px 12px; background: #fcfdff; }
    .import-export-panel { margin-top: 18px; border-top: 1px solid #e6ebf5; padding-top: 18px; }
    .code-box { width: 100%; min-height: 140px; border: 1px solid #d7deea; border-radius: 12px; padding: 10px 12px; box-sizing: border-box; background: #fbfcff; font-family: Consolas, monospace; font-size: 13px; }
    .detail-panel { margin-top: 18px; border-top: 1px solid #e6ebf5; padding-top: 18px; }
    .detail-body { white-space: pre-wrap; line-height: 1.7; background: #fbfcff; border: 1px solid #e6ebf5; border-radius: 12px; padding: 12px; }
    .preview-panel { margin-top: 18px; border-top: 1px solid #e6ebf5; padding-top: 18px; }
    .preview-rendered { line-height: 1.7; background: #fbfcff; border: 1px solid #e6ebf5; border-radius: 12px; padding: 12px; }
    .preview-rendered h1, .preview-rendered h2, .preview-rendered h3 { margin: 0 0 12px; }
    .preview-rendered p, .preview-rendered ul, .preview-rendered pre { margin: 0 0 12px; }
    .preview-rendered pre { overflow-x: auto; padding: 12px; background: #172033; color: #f8fafc; border-radius: 10px; }
    .preview-rendered code { font-family: Consolas, monospace; }
    .preview-rendered img { max-width: 100%; border-radius: 12px; border: 1px solid #d7deea; }
    .preview-empty { color: #63708a; }
    .toc-list { display: grid; gap: 6px; margin-bottom: 12px; }
    .toc-item { color: #1e3a8a; text-decoration: none; font-size: 14px; }
    .toc-item.level-2 { padding-left: 12px; }
    .toc-item.level-3 { padding-left: 24px; }
    .attachment-link { color: #1e3a8a; text-decoration: none; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .hero { flex-direction: column; align-items: stretch; } }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="hero-card">
        <h1>学习加速器</h1>
        <p>这是当前的本地优先知识库 MVP。你可以直接在这里新建笔记、浏览笔记、搜索知识内容、维护目录和标签，数据会保存在本机的 JSON 文件里。</p>
      </div>
      <div class="hero-card">
        <div class="muted">当前能力</div>
        <p>笔记创建、删除、列表、搜索、目录创建与删除、标签创建与删除、默认知识空间初始化。</p>
      </div>
    </section>

    <section class="grid">
      <div class="card">
        <h2>新建笔记</h2>
        <form id="note-form">
          <input id="note-mode" type="hidden" value="create" />
          <div class="row">
            <input id="note-id" placeholder="笔记 ID（可留空自动生成）" value="" />
            <input id="space-id" placeholder="知识空间 ID" value="space-demo" required />
          </div>
          <div class="row">
            <input id="folder-id" placeholder="目录 ID" value="folder-default" required />
            <input id="tag-id" placeholder="可选标签 ID，例如 tag-db" />
          </div>
          <input id="title" placeholder="笔记标题" required />
          <textarea id="markdown" placeholder="Markdown 内容" required>${initialMarkdown}</textarea>
          <div class="row">
            <button type="submit" id="note-submit-button">保存笔记</button>
            <button type="button" class="secondary" id="reset-form">重置表单</button>
            <button type="button" class="secondary" id="init-space">初始化默认知识空间</button>
          </div>
        </form>
        <div class="preview-panel">
          <h3>Live Preview</h3>
          <div class="toc-list" id="editor-toc"></div>
          <div class="preview-rendered" id="editor-preview">${initialPreview}</div>
        </div>
        <div class="import-export-panel">
          <h3>Markdown 导入</h3>
          <div class="row">
            <input id="markdown-import-title" placeholder="导入标题（可留空自动提取）" />
            <input id="markdown-import-file" type="file" accept=".md,.markdown,text/markdown,text/plain" multiple />
          </div>
          <div class="row" style="margin-top: 12px;">
            <button type="button" id="import-markdown-button">导入 Markdown 为笔记</button>
          </div>
        </div>
        <div class="split">
          <div>
            <h3>目录管理</h3>
            <form id="folder-form">
              <input id="folder-mode" type="hidden" value="create" />
              <input id="folder-create-id" placeholder="目录 ID，例如 folder-db" value="folder-default" required />
              <input id="folder-name" placeholder="目录名称" value="默认目录" required />
              <select id="folder-parent-id">
                <option value="">Root Folder</option>
              </select>
              <div class="row">
                <button type="submit" id="folder-submit-button">创建目录</button>
                <button type="button" class="secondary" id="folder-reset">重置目录表单</button>
              </div>
            </form>
            <div class="mini-list" id="folder-list"></div>
          </div>
          <div>
            <h3>标签管理</h3>
            <form id="tag-form">
              <input id="tag-mode" type="hidden" value="create" />
              <input id="tag-create-id" placeholder="标签 ID，例如 tag-db" value="tag-db" required />
              <input id="tag-name" placeholder="标签名称" value="database" required />
              <input id="tag-color" placeholder="标签颜色" value="slate" />
              <div class="row">
                <button type="submit" id="tag-submit-button">创建标签</button>
                <button type="button" class="secondary" id="tag-reset">重置标签表单</button>
              </div>
            </form>
            <div class="mini-list" id="tag-list"></div>
          </div>
        </div>
        <div class="status" id="status"></div>
      </div>

      <div class="card">
        <h2>搜索与列表</h2>
        <div class="overview">
          <div class="overview-box">
            <span class="tiny">当前空间</span>
            <strong id="space-count">0</strong>
          </div>
          <div class="overview-box">
            <span class="tiny">目录数量</span>
            <strong id="folder-count">0</strong>
          </div>
          <div class="overview-box">
            <span class="tiny">标签数量</span>
            <strong id="tag-count">0</strong>
          </div>
        </div>
        <div class="toolbar">
          <input id="search-query" placeholder="输入关键词搜索" />
          <select id="filter-folder">
            <option value="">全部目录</option>
          </select>
          <select id="filter-tag">
            <option value="">全部标签</option>
          </select>
          <select id="sort-order">
            <option value="updatedAt:desc">Recent updates</option>
            <option value="createdAt:desc">Recently created</option>
            <option value="title:asc">Title A-Z</option>
            <option value="title:desc">Title Z-A</option>
          </select>
          <select id="page-size">
            <option value="5">5 per page</option>
            <option value="10" selected>10 per page</option>
            <option value="20">20 per page</option>
          </select>
          <button type="button" class="secondary" id="toggle-favorite-view">Favorites Only</button>
          <button type="button" class="secondary" id="toggle-deleted-view">Recycle Bin</button>
          <button type="button" id="search-button">搜索</button>
          <button type="button" class="secondary" id="refresh-button">刷新</button>
        </div>
        <div class="tiny" id="view-mode-indicator">Current view: active notes</div>
        <div class="mini-actions" style="margin: 10px 0 12px;">
          <button type="button" class="secondary" id="select-visible-notes">Select Visible</button>
          <button type="button" class="secondary" id="clear-selected-notes">Clear Selected</button>
          <input id="batch-tag-id" placeholder="Tag ID for batch apply" />
          <button type="button" class="secondary" id="batch-tag-button">Batch Add Tag</button>
          <button type="button" class="danger" id="batch-delete-button">Batch Delete</button>
          <span class="tiny" id="selected-notes-indicator">Selected: 0</span>
        </div>
        <div class="note-list" id="note-list"></div>
        <div class="mini-actions" style="margin-top: 12px;">
          <button type="button" class="secondary" id="prev-page-button">Previous</button>
          <button type="button" class="secondary" id="next-page-button">Next</button>
          <span class="tiny" id="page-indicator">Page 1</span>
        </div>
        <div class="detail-panel">
          <h3>Note Detail</h3>
          <div class="mini-item">
            <strong id="detail-title">未选择笔记</strong>
            <div class="tiny" id="detail-meta">选择一条笔记后可查看完整内容</div>
            <div class="mini-actions">
              <button type="button" class="secondary" id="detail-edit-button" disabled>加载到编辑表单</button>
              <button type="button" class="secondary" id="detail-clear-button">清空详情</button>
            </div>
            <div class="toc-list" id="detail-toc"></div>
            <div class="mini-list" id="detail-links"></div>
            <div class="import-export-panel">
              <h4>Attachments</h4>
              <div class="row">
                <input id="attachment-file" type="file" />
                <button type="button" class="secondary" id="upload-attachment-button">上传附件</button>
              </div>
              <div class="mini-list" id="detail-attachments"></div>
            </div>
            <div class="preview-rendered" id="detail-preview"><p class="preview-empty">Select a note to preview its rendered content.</p></div>
            <div class="detail-body" id="detail-body">这里会显示笔记的 Markdown 原文。</div>
          </div>
        </div>
        <div class="recent-panel">
          <h3>Recent Notes</h3>
          <div class="mini-list" id="recent-note-list"></div>
        </div>
        <div class="import-export-panel">
          <h3>Import / Export</h3>
          <div class="row">
            <button type="button" id="export-button">Export JSON</button>
            <button type="button" class="secondary" id="import-button">Import JSON</button>
          </div>
          <div style="margin-top: 12px;">
            <input id="import-file" type="file" accept="application/json" />
          </div>
          <textarea id="snapshot-box" class="code-box" placeholder="Exported knowledge base JSON will appear here, or paste JSON here to import."></textarea>
        </div>
      </div>
    </section>
  </div>
  <script>
    const statusEl = document.getElementById('status');
    const listEl = document.getElementById('note-list');
    const recentListEl = document.getElementById('recent-note-list');
    const folderListEl = document.getElementById('folder-list');
    const tagListEl = document.getElementById('tag-list');
    const form = document.getElementById('note-form');
    const folderForm = document.getElementById('folder-form');
    const tagForm = document.getElementById('tag-form');
    const noteSubmitButton = document.getElementById('note-submit-button');
    const folderSubmitButton = document.getElementById('folder-submit-button');
    const tagSubmitButton = document.getElementById('tag-submit-button');
    const folderParentEl = document.getElementById('folder-parent-id');
    const filterFolderEl = document.getElementById('filter-folder');
    const filterTagEl = document.getElementById('filter-tag');
    const sortOrderEl = document.getElementById('sort-order');
    const pageSizeEl = document.getElementById('page-size');
    const toggleFavoriteViewEl = document.getElementById('toggle-favorite-view');
    const toggleDeletedViewEl = document.getElementById('toggle-deleted-view');
    const batchTagIdEl = document.getElementById('batch-tag-id');
    const selectedNotesIndicatorEl = document.getElementById('selected-notes-indicator');
    const viewModeIndicatorEl = document.getElementById('view-mode-indicator');
    const snapshotBoxEl = document.getElementById('snapshot-box');
    const importFileEl = document.getElementById('import-file');
    const markdownImportFileEl = document.getElementById('markdown-import-file');
    const markdownImportTitleEl = document.getElementById('markdown-import-title');
    const pageIndicatorEl = document.getElementById('page-indicator');
    const detailTitleEl = document.getElementById('detail-title');
    const detailMetaEl = document.getElementById('detail-meta');
    const detailBodyEl = document.getElementById('detail-body');
    const detailPreviewEl = document.getElementById('detail-preview');
    const detailTocEl = document.getElementById('detail-toc');
    const detailLinksEl = document.getElementById('detail-links');
    const detailAttachmentsEl = document.getElementById('detail-attachments');
    const attachmentFileEl = document.getElementById('attachment-file');
    const detailEditButtonEl = document.getElementById('detail-edit-button');
    const editorPreviewEl = document.getElementById('editor-preview');
    const editorTocEl = document.getElementById('editor-toc');
    let currentPage = 1;
    let lastNotesCount = 0;
    let currentDetailNote = null;
    let visibleNoteIds = [];
    let selectedNoteIds = [];
    let favoriteOnlyMode = false;
    let recycleBinMode = false;

    function setStatus(message, isError = false) {
      statusEl.textContent = message;
      statusEl.style.color = isError ? '#b91c1c' : '#1d4ed8';
    }

    function currentSpaceId() {
      return document.getElementById('space-id').value.trim();
    }

    function getSortConfig() {
      const [sortBy, order] = sortOrderEl.value.split(':');
      return { sortBy, order };
    }

    function getPaginationConfig() {
      const limit = Number(pageSizeEl.value || '10');
      const offset = (currentPage - 1) * limit;
      return { limit, offset };
    }

    function updateViewModeUi() {
      toggleFavoriteViewEl.textContent = favoriteOnlyMode ? 'All Notes' : 'Favorites Only';
      toggleDeletedViewEl.textContent = recycleBinMode ? 'Back To Active' : 'Recycle Bin';
      if (recycleBinMode) {
        viewModeIndicatorEl.textContent = favoriteOnlyMode
          ? 'Current view: deleted favorite notes'
          : 'Current view: deleted notes';
        return;
      }

      viewModeIndicatorEl.textContent = favoriteOnlyMode
        ? 'Current view: favorite notes'
        : 'Current view: active notes';
    }

    function normalizeSelectedNotes() {
      const visible = new Set(visibleNoteIds);
      selectedNoteIds = selectedNoteIds.filter((noteId) => visible.has(noteId));
      selectedNotesIndicatorEl.textContent = 'Selected: ' + selectedNoteIds.length;
    }

    function formatDate(value) {
      if (!value) {
        return '-';
      }

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }

      return date.toLocaleString('zh-CN', {
        hour12: false
      });
    }

    function updatePageIndicator() {
      pageIndicatorEl.textContent = 'Page ' + currentPage + (lastNotesCount ? ' · ' + lastNotesCount + ' item(s)' : '');
    }

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderInlineMarkdown(text) {
      const inlineCodePattern = new RegExp(String.fromCharCode(96) + '([^' + String.fromCharCode(96) + ']+)' + String.fromCharCode(96), 'g');
      let html = escapeHtml(text);
      html = html.replace(/\!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
      html = html.replace(inlineCodePattern, '<code>$1</code>');
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
      return html;
    }

    function extractMarkdownHeadings(markdown) {
      const source = String(markdown || '').replace(/\r\n/g, '\n');
      const headings = [];

      source.split('\n').forEach((line) => {
        const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
        if (!headingMatch) {
          return;
        }

        const title = headingMatch[2].trim();
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
          .replace(/^-+|-+$/g, '') || ('section-' + (headings.length + 1));

        headings.push({
          level: headingMatch[1].length,
          title,
          id: slug
        });
      });

      return headings;
    }

    function renderMarkdownPreview(markdown) {
      const codeFence = String.fromCharCode(96).repeat(3);
      const source = String(markdown || '').replace(/\r\n/g, '\n').trim();

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
          return '<ul>' + items.map((item) => '<li>' + renderInlineMarkdown(item) + '</li>').join('') + '</ul>';
        }

        if (lines[0].startsWith(codeFence) && lines[lines.length - 1].startsWith(codeFence)) {
          const code = lines.slice(1, -1).join('\n');
          return '<pre><code>' + escapeHtml(code) + '</code></pre>';
        }

        const headingMatch = lines[0].match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const content = renderInlineMarkdown(headingMatch[2]);
          const heading = headings[headingIndex];
          headingIndex += 1;
          const rest = lines.slice(1).join(' ').trim();
          const paragraph = rest ? '<p>' + renderInlineMarkdown(rest) + '</p>' : '';
          return '<h' + level + ' id="section-' + (heading?.id || headingIndex) + '">' + content + '</h' + level + '>' + paragraph;
        }

        return '<p>' + renderInlineMarkdown(lines.join('<br />')) + '</p>';
      }).join('');
    }

    function renderToc(container, markdown) {
      const headings = extractMarkdownHeadings(markdown);

      if (!headings.length) {
        container.innerHTML = '<div class="tiny">No headings detected.</div>';
        return;
      }

      container.innerHTML = headings.map((heading) =>
        '<a class="toc-item level-' + heading.level + '" href="#section-' + heading.id + '">' + escapeHtml(heading.title) + '</a>'
      ).join('');
    }

    function renderLinkedNotes(container, notes) {
      if (!notes.length) {
        container.innerHTML = '<div class="tiny">No linked notes.</div>';
        return;
      }

      container.innerHTML = notes.map((note) =>
        '<div class="mini-item">' +
          '<strong>' + escapeHtml(note.title) + '</strong>' +
          '<div class="tiny">ID: ' + escapeHtml(note.id) + ' | Folder: ' + escapeHtml(note.folderId || '-') + '</div>' +
          '<div class="mini-actions"><button type="button" class="secondary" data-view-note="' + escapeHtml(note.id) + '">查看详情</button></div>' +
        '</div>'
      ).join('');
    }

    function renderAttachments(container, attachments) {
      if (!attachments.length) {
        container.innerHTML = '<div class="tiny">No attachments yet.</div>';
        return;
      }

      container.innerHTML = attachments.map((attachment) =>
        '<div class="mini-item">' +
          '<strong>' + escapeHtml(attachment.fileName) + '</strong>' +
          '<div class="tiny">Type: ' + escapeHtml(attachment.mimeType) + ' | Size: ' + attachment.size + ' bytes</div>' +
          '<div class="mini-actions">' +
            '<a class="attachment-link" href="/api/storage/attachments/' + encodeURIComponent(attachment.id) + '/content" target="_blank" rel="noreferrer">打开附件</a>' +
            '<button type="button" class="secondary" data-insert-attachment="' + encodeURIComponent(attachment.id) + '" data-attachment-name="' + escapeHtml(attachment.fileName) + '" data-attachment-mime="' + escapeHtml(attachment.mimeType) + '">插入到笔记</button>' +
            '<button type="button" class="danger" data-delete-attachment="' + encodeURIComponent(attachment.id) + '">删除附件</button>' +
          '</div>' +
        '</div>'
      ).join('');
    }

    function buildAttachmentMarkdown(attachment) {
      const url = '/api/storage/attachments/' + encodeURIComponent(attachment.id) + '/content';
      if ((attachment.mimeType || '').startsWith('image/')) {
        return '![' + attachment.fileName + '](' + url + ')';
      }

      return '[' + attachment.fileName + '](' + url + ')';
    }

    function insertAttachmentIntoEditor(attachment) {
      const markdownEl = document.getElementById('markdown');
      const snippet = buildAttachmentMarkdown(attachment);
      const currentValue = markdownEl.value || '';
      const separator = currentValue.trim() ? '\\n\\n' : '';
      markdownEl.value = currentValue + separator + snippet;
      updateEditorPreview();
      markdownEl.focus();
    }

    function fillNoteForm(note) {
      document.getElementById('note-id').value = note.id;
      document.getElementById('space-id').value = note.spaceId || '';
      document.getElementById('folder-id').value = note.folderId || '';
      document.getElementById('title').value = note.title;
      document.getElementById('markdown').value = note.rawMarkdown;
      document.getElementById('tag-id').value = (note.tagIds && note.tagIds[0]) || '';
      document.getElementById('note-mode').value = 'edit';
      noteSubmitButton.textContent = '更新笔记';
    }

    function favoriteLabel(note) {
      return note.favorite ? '★' : '☆';
    }

    function clearNoteDetail() {
      currentDetailNote = null;
      detailTitleEl.textContent = '未选择笔记';
      detailMetaEl.textContent = '选择一条笔记后可查看完整内容';
      detailTocEl.innerHTML = '<div class="tiny">No headings detected.</div>';
      detailLinksEl.innerHTML = '<div class="tiny">No linked notes.</div>';
      detailAttachmentsEl.innerHTML = '<div class="tiny">No attachments yet.</div>';
      detailPreviewEl.innerHTML = '<p class="preview-empty">Select a note to preview its rendered content.</p>';
      detailBodyEl.textContent = '这里会显示笔记的 Markdown 原文。';
      detailEditButtonEl.disabled = true;
      document.getElementById('upload-attachment-button').disabled = true;
    }

    function renderNoteDetail(note, linkedNotes = [], attachments = []) {
      currentDetailNote = note;
      detailTitleEl.textContent = note.title;
      detailMetaEl.textContent = 'ID: ' + note.id + ' | Folder: ' + (note.folderId || '-') + ' | Updated: ' + formatDate(note.updatedAt) + ' | Deleted: ' + (note.deleted ? 'yes' : 'no');
      renderToc(detailTocEl, note.rawMarkdown);
      renderLinkedNotes(detailLinksEl, linkedNotes);
      renderAttachments(detailAttachmentsEl, attachments);
      detailPreviewEl.innerHTML = renderMarkdownPreview(note.rawMarkdown);
      detailBodyEl.textContent = note.rawMarkdown;
      detailEditButtonEl.disabled = note.deleted;
      document.getElementById('upload-attachment-button').disabled = note.deleted;
    }

    function updateEditorPreview() {
      renderToc(editorTocEl, document.getElementById('markdown').value);
      editorPreviewEl.innerHTML = renderMarkdownPreview(document.getElementById('markdown').value);
    }

    async function loadNoteDetail(noteId) {
      const notePath = '/api/knowledge/notes/' + encodeURIComponent(noteId) + (recycleBinMode ? '?includeDeleted=true' : '');
      const [notePayload, linkedPayload, attachmentPayload] = await Promise.all([
        fetchJson(notePath),
        fetchJson('/api/knowledge/notes/' + encodeURIComponent(noteId) + '/links'),
        fetchJson('/api/storage/attachments?noteId=' + encodeURIComponent(noteId))
      ]);

      renderNoteDetail(notePayload.data, linkedPayload.data, attachmentPayload.data);
      return notePayload.data;
    }

    function renderNotes(notes) {
      if (!notes.length) {
        listEl.innerHTML = '<div class="muted">还没有笔记，先创建一条吧。</div>';
        return;
      }

      listEl.innerHTML = notes.map((note) => {
        const tags = (note.tagIds || []).map((tagId) =>
          '<span class="pill">' + tagId + ' <button type="button" data-remove-note-tag="' + note.id + '" data-tag-id="' + tagId + '" style="border:0;background:transparent;color:inherit;cursor:pointer;padding:0 0 0 6px;">×</button></span>'
        ).join('');
        return '<article class="note-item">' +
          '<h3>' + note.title + '</h3>' +
          '<div class="muted">ID: ' + note.id + ' | Space: ' + (note.spaceId || '-') + ' | Folder: ' + (note.folderId || '-') + '</div>' +
          '<div class="tiny">Updated: ' + formatDate(note.updatedAt) + ' | Created: ' + formatDate(note.createdAt) + '</div>' +
          '<p>' + note.plainText + '</p>' +
          tags +
          '<div class="note-actions">' +
            '<button type="button" class="secondary" data-view-note="' + note.id + '">查看详情</button>' +
            '<button type="button" class="danger" data-delete-note="' + note.id + '">删除笔记</button>' +
            '<button type="button" class="secondary" data-fill-note="' + note.id + '">回填到表单</button>' +
          '</div>' +
        '</article>';
      }).join('');
    }

    function renderNotes(notes) {
      visibleNoteIds = notes.map((note) => note.id);
      normalizeSelectedNotes();

      if (!notes.length) {
        listEl.innerHTML = recycleBinMode
          ? '<div class="muted">Recycle bin is empty.</div>'
          : favoriteOnlyMode
            ? '<div class="muted">No favorite notes yet.</div>'
            : '<div class="muted">No notes yet. Create your first note.</div>';
        return;
      }

      listEl.innerHTML = notes.map((note) => {
        const tags = (note.tagIds || []).map((tagId) =>
          '<span class="pill">' + tagId + ' <button type="button" data-remove-note-tag="' + note.id + '" data-tag-id="' + tagId + '" style="border:0;background:transparent;color:inherit;cursor:pointer;padding:0 0 0 6px;">脳</button></span>'
        ).join('');
        const primaryAction = note.deleted
          ? '<button type="button" class="secondary" data-restore-note="' + note.id + '">Restore note</button>'
          : '<button type="button" class="danger" data-delete-note="' + note.id + '">Delete note</button>';
        const favoriteAction = '<button type="button" class="secondary" data-toggle-favorite="' + note.id + '" data-favorite="' + (note.favorite ? 'false' : 'true') + '">' + (note.favorite ? 'Unfavorite' : 'Favorite') + '</button>';
        const editAction = note.deleted
          ? ''
          : '<button type="button" class="secondary" data-fill-note="' + note.id + '">Load into form</button>';
        return '<article class="note-item">' +
          '<label class="tiny" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><input type="checkbox" data-select-note="' + note.id + '"' + (selectedNoteIds.includes(note.id) ? ' checked' : '') + ' /> Select</label>' +
          '<h3>' + favoriteLabel(note) + ' ' + note.title + '</h3>' +
          '<div class="muted">ID: ' + note.id + ' | Space: ' + (note.spaceId || '-') + ' | Folder: ' + (note.folderId || '-') + ' | Deleted: ' + (note.deleted ? 'yes' : 'no') + '</div>' +
          '<div class="tiny">Updated: ' + formatDate(note.updatedAt) + ' | Created: ' + formatDate(note.createdAt) + '</div>' +
          '<p>' + note.plainText + '</p>' +
          tags +
          '<div class="note-actions">' +
            '<button type="button" class="secondary" data-view-note="' + note.id + '">View detail</button>' +
            favoriteAction +
            primaryAction +
            editAction +
          '</div>' +
        '</article>';
      }).join('');
    }

    function renderRecentNotes(notes) {
      if (!notes.length) {
        recentListEl.innerHTML = '<div class="tiny">No recent notes yet.</div>';
        return;
      }

      recentListEl.innerHTML = notes.slice(0, 5).map((note) =>
        '<div class="recent-item">' +
          '<strong>' + favoriteLabel(note) + ' ' + note.title + '</strong>' +
          '<div class="tiny">Updated: ' + formatDate(note.updatedAt) + '</div>' +
          '<div class="tiny">Folder: ' + (note.folderId || '-') + ' | Tags: ' + ((note.tagIds || []).join(', ') || '-') + '</div>' +
          '<div class="mini-actions"><button type="button" class="secondary" data-view-note="' + note.id + '">查看详情</button></div>' +
        '</div>'
      ).join('');
    }

    function renderFolders(folders) {
      document.getElementById('folder-count').textContent = String(folders.length);
      const selectedFolderId = filterFolderEl.value;
      const selectedParentId = folderParentEl.value;
      filterFolderEl.innerHTML = '<option value="">全部目录</option>' + folders.map((folder) =>
        '<option value="' + folder.id + '">' + folder.name + '</option>'
      ).join('');
      folderParentEl.innerHTML = '<option value="">Root Folder</option>' + folders.map((folder) =>
        '<option value="' + folder.id + '">' + folder.pathCache + '</option>'
      ).join('');
      if (selectedFolderId && folders.some((folder) => folder.id === selectedFolderId)) {
        filterFolderEl.value = selectedFolderId;
      }
      if (selectedParentId && folders.some((folder) => folder.id === selectedParentId)) {
        folderParentEl.value = selectedParentId;
      }
      if (!folders.length) {
        folderListEl.innerHTML = '<div class="tiny">当前空间还没有目录。</div>';
        return;
      }

      const sorted = [...folders].sort((left, right) => left.pathCache.localeCompare(right.pathCache));
      folderListEl.innerHTML = sorted.map((folder) => {
        const depth = folder.pathCache.split('/').filter(Boolean).length - 1;
        const indent = depth * 18;
        return '<div class="mini-item" style="margin-left:' + indent + 'px;">' +
          '<strong>' + folder.name + '</strong>' +
          '<div class="tiny">ID: ' + folder.id + ' | Parent: ' + (folder.parentId || '-') + ' | Path: ' + folder.pathCache + '</div>' +
          '<div class="mini-actions">' +
            '<button type="button" class="secondary" data-use-folder="' + folder.id + '">用作当前目录</button>' +
            '<button type="button" class="secondary" data-edit-folder="' + folder.id + '" data-folder-name="' + folder.name + '" data-folder-parent-id="' + (folder.parentId || '') + '" data-folder-path="' + folder.pathCache + '">编辑</button>' +
            '<button type="button" class="danger" data-delete-folder="' + folder.id + '">删除</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function renderTags(tags) {
      document.getElementById('tag-count').textContent = String(tags.length);
      const selectedTagId = filterTagEl.value;
      filterTagEl.innerHTML = '<option value="">全部标签</option>' + tags.map((tag) =>
        '<option value="' + tag.id + '">' + tag.name + '</option>'
      ).join('');
      if (selectedTagId && tags.some((tag) => tag.id === selectedTagId)) {
        filterTagEl.value = selectedTagId;
      }
      if (!tags.length) {
        tagListEl.innerHTML = '<div class="tiny">当前空间还没有标签。</div>';
        return;
      }

      tagListEl.innerHTML = tags.map((tag) =>
        '<div class="mini-item">' +
          '<strong>' + tag.name + '</strong>' +
          '<div class="tiny">ID: ' + tag.id + ' | Color: ' + tag.color + '</div>' +
          '<div class="mini-actions">' +
            '<button type="button" class="secondary" data-use-tag="' + tag.id + '">用作当前标签</button>' +
            '<button type="button" class="secondary" data-edit-tag="' + tag.id + '" data-tag-name="' + tag.name + '" data-tag-color="' + tag.color + '">编辑</button>' +
            '<button type="button" class="danger" data-delete-tag="' + tag.id + '">删除</button>' +
          '</div>' +
        '</div>'
      ).join('');
    }

    async function fetchJson(url, options = {}) {
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Request failed');
      }
      return payload;
    }

    async function refreshNotes() {
      const spaceId = currentSpaceId();
      const query = document.getElementById('search-query').value.trim();
      const folderId = filterFolderEl.value.trim();
      const tagId = filterTagEl.value.trim();
      const { sortBy, order } = getSortConfig();
      const { limit, offset } = getPaginationConfig();
      const base = query ? '/api/knowledge/search/notes' : '/api/knowledge/notes';
      const params = new URLSearchParams({ spaceId });
      if (query) params.set('query', query);
      if (folderId) params.set('folderId', folderId);
      if (tagId) params.set('tagId', tagId);
      params.set('sortBy', sortBy);
      params.set('order', order);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (favoriteOnlyMode) {
        params.set('favoriteOnly', 'true');
      }
      if (recycleBinMode) {
        params.set('includeDeleted', 'true');
        params.set('deletedOnly', 'true');
      }
      const url = base + '?' + params.toString();

      const payload = await fetchJson(url);
      lastNotesCount = payload.data.length;
      document.getElementById('space-count').textContent = String(payload.data.length);
      updateViewModeUi();
      updatePageIndicator();
      renderNotes(payload.data);
      renderRecentNotes(payload.data);
    }

    async function refreshFolders() {
      const payload = await fetchJson('/api/knowledge/folders/tree?spaceId=' + encodeURIComponent(currentSpaceId()));
      const flatten = [];
      (function visit(nodes) {
        nodes.forEach((node) => {
          flatten.push({
            id: node.id,
            name: node.name,
            parentId: node.parentId,
            pathCache: node.pathCache
          });
          visit(node.children || []);
        });
      })(payload.data);
      renderFolders(flatten);
    }

    async function refreshTags() {
      const payload = await fetchJson('/api/knowledge/tags?spaceId=' + encodeURIComponent(currentSpaceId()));
      renderTags(payload.data);
    }

    async function refreshAll() {
      await Promise.all([refreshNotes(), refreshFolders(), refreshTags()]);
    }

    async function exportKnowledgeBase() {
      const payload = await fetchJson('/api/storage/export');
      snapshotBoxEl.value = JSON.stringify(payload.data, null, 2);

      const blob = new Blob([snapshotBoxEl.value], { type: 'application/json' });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = 'knowledge-base-export-' + Date.now() + '.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);

      return payload.data;
    }

    async function importKnowledgeBaseFromText(rawText) {
      if (!rawText.trim()) {
        throw new Error('请先提供要导入的 JSON 内容');
      }

      let parsed;

      try {
        parsed = JSON.parse(rawText);
      } catch (error) {
        throw new Error('导入内容不是合法 JSON');
      }

      const payload = await fetchJson('/api/storage/import', {
        method: 'POST',
        body: JSON.stringify(parsed)
      });

      snapshotBoxEl.value = JSON.stringify(payload.data, null, 2);
      await refreshAll();
      return payload.data;
    }

    async function importMarkdownFile(files) {
      if (!files?.length) {
        throw new Error('请先选择 Markdown 文件');
      }

      const tagId = document.getElementById('tag-id').value.trim();
      const items = await Promise.all(Array.from(files).map(async (file, index) => ({
        title: files.length === 1 ? (markdownImportTitleEl.value.trim() || undefined) : undefined,
        rawMarkdown: await file.text(),
        spaceId: currentSpaceId(),
        folderId: document.getElementById('folder-id').value.trim() || null,
        tagIds: tagId ? [tagId] : [],
        sourceType: index === 0 ? 'markdown-import' : 'markdown-import'
      })));

      const endpoint = items.length > 1
        ? '/api/knowledge/notes/import-markdown-batch'
        : '/api/knowledge/notes/import-markdown';
      const body = items.length > 1
        ? { items }
        : items[0];
      const payload = await fetchJson(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      await refreshAll();
      return payload.data;
    }

    function resetNoteForm() {
      document.getElementById('note-mode').value = 'create';
      document.getElementById('note-id').value = '';
      document.getElementById('title').value = '';
      document.getElementById('markdown').value = '# New Note\\n\\nWrite here.';
      document.getElementById('tag-id').value = '';
      noteSubmitButton.textContent = '保存笔记';
      updateEditorPreview();
    }

    function resetFolderForm() {
      document.getElementById('folder-mode').value = 'create';
      document.getElementById('folder-create-id').value = 'folder-' + Date.now();
      document.getElementById('folder-name').value = '';
      folderParentEl.value = '';
      folderSubmitButton.textContent = '创建目录';
    }

    function resetTagForm() {
      document.getElementById('tag-mode').value = 'create';
      document.getElementById('tag-create-id').value = 'tag-' + Date.now();
      document.getElementById('tag-name').value = '';
      document.getElementById('tag-color').value = 'slate';
      tagSubmitButton.textContent = '创建标签';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const mode = document.getElementById('note-mode').value;
      const note = {
        id: document.getElementById('note-id').value.trim(),
        spaceId: document.getElementById('space-id').value.trim(),
        folderId: document.getElementById('folder-id').value.trim(),
        title: document.getElementById('title').value.trim(),
        rawMarkdown: document.getElementById('markdown').value
      };
      const tagId = document.getElementById('tag-id').value.trim();
      const tagIds = tagId ? [tagId] : [];

      try {
        const created = mode === 'edit'
          ? await fetchJson('/api/knowledge/notes/' + encodeURIComponent(note.id), {
              method: 'PATCH',
              body: JSON.stringify({
                title: note.title,
                rawMarkdown: note.rawMarkdown,
                folderId: note.folderId
              })
            })
          : await fetchJson('/api/knowledge/notes', {
              method: 'POST',
              body: JSON.stringify(note)
            });

        await fetchJson('/api/knowledge/notes/' + encodeURIComponent(note.id) + '/tags', {
          method: 'PUT',
          body: JSON.stringify({ tagIds })
        });

        setStatus((mode === 'edit' ? '笔记已更新：' : '笔记已保存：') + created.data.title);
        if (mode === 'edit') {
          document.getElementById('note-mode').value = 'create';
          noteSubmitButton.textContent = '保存笔记';
        }
        await refreshAll();
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    folderForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const mode = document.getElementById('folder-mode').value;

      try {
        const folderId = document.getElementById('folder-create-id').value.trim();
        const payload = mode === 'edit'
          ? await fetchJson('/api/knowledge/folders/' + encodeURIComponent(folderId), {
              method: 'PATCH',
              body: JSON.stringify({
                name: document.getElementById('folder-name').value.trim(),
                parentId: folderParentEl.value.trim() || null
              })
            })
          : await fetchJson('/api/knowledge/folders', {
              method: 'POST',
              body: JSON.stringify({
                id: folderId,
                spaceId: currentSpaceId(),
                parentId: folderParentEl.value.trim() || null,
                name: document.getElementById('folder-name').value.trim()
              })
            });
        setStatus((mode === 'edit' ? '目录已更新：' : '目录已创建：') + payload.data.name);
        resetFolderForm();
        await refreshAll();
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    tagForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const mode = document.getElementById('tag-mode').value;

      try {
        const tagIdValue = document.getElementById('tag-create-id').value.trim();
        const payload = mode === 'edit'
          ? await fetchJson('/api/knowledge/tags/' + encodeURIComponent(tagIdValue), {
              method: 'PATCH',
              body: JSON.stringify({
                name: document.getElementById('tag-name').value.trim(),
                color: document.getElementById('tag-color').value.trim() || 'slate'
              })
            })
          : await fetchJson('/api/knowledge/tags', {
              method: 'POST',
              body: JSON.stringify({
                id: tagIdValue,
                spaceId: currentSpaceId(),
                name: document.getElementById('tag-name').value.trim(),
                color: document.getElementById('tag-color').value.trim() || 'slate'
              })
            });
        setStatus((mode === 'edit' ? '标签已更新：' : '标签已创建：') + payload.data.name);
        resetTagForm();
        await refreshAll();
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById('init-space').addEventListener('click', async () => {
      try {
        const userId = document.getElementById('space-id').value.trim().replace('space-', '') || 'demo';
        const payload = await fetchJson('/api/knowledge/spaces/default', {
          method: 'POST',
          body: JSON.stringify({ userId })
        });
        setStatus('默认知识空间已准备：' + payload.data.id);
        await refreshAll();
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById('search-button').addEventListener('click', async () => {
      try {
        currentPage = 1;
        await refreshNotes();
        setStatus('搜索完成');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    toggleDeletedViewEl.addEventListener('click', async () => {
      try {
        recycleBinMode = !recycleBinMode;
        currentPage = 1;
        clearNoteDetail();
        await refreshNotes();
        setStatus(recycleBinMode ? 'Switched to recycle bin view.' : 'Switched to active notes view.');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    toggleFavoriteViewEl.addEventListener('click', async () => {
      try {
        favoriteOnlyMode = !favoriteOnlyMode;
        currentPage = 1;
        clearNoteDetail();
        await refreshNotes();
        setStatus(favoriteOnlyMode ? 'Switched to favorites-only view.' : 'Switched to all notes view.');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById('select-visible-notes').addEventListener('click', () => {
      selectedNoteIds = [...visibleNoteIds];
      normalizeSelectedNotes();
      refreshNotes().catch((error) => setStatus(error.message, true));
    });

    document.getElementById('clear-selected-notes').addEventListener('click', () => {
      selectedNoteIds = [];
      normalizeSelectedNotes();
      refreshNotes().catch((error) => setStatus(error.message, true));
    });

    document.getElementById('batch-delete-button').addEventListener('click', async () => {
      if (!selectedNoteIds.length) {
        setStatus('Please select at least one note first.', true);
        return;
      }

      try {
        await fetchJson('/api/knowledge/notes/batch/delete', {
          method: 'POST',
          body: JSON.stringify({
            noteIds: selectedNoteIds
          })
        });
        selectedNoteIds = [];
        await refreshNotes();
        setStatus('Selected notes deleted.');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById('batch-tag-button').addEventListener('click', async () => {
      if (!selectedNoteIds.length) {
        setStatus('Please select at least one note first.', true);
        return;
      }
      const tagId = batchTagIdEl.value.trim();
      if (!tagId) {
        setStatus('Please provide a tag id for batch apply.', true);
        return;
      }

      try {
        await fetchJson('/api/knowledge/notes/batch/tags', {
          method: 'POST',
          body: JSON.stringify({
            noteIds: selectedNoteIds,
            tagId
          })
        });
        await refreshNotes();
        setStatus('Tag applied to selected notes.');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById('refresh-button').addEventListener('click', async () => {
      try {
        document.getElementById('search-query').value = '';
        filterFolderEl.value = '';
        filterTagEl.value = '';
        sortOrderEl.value = 'updatedAt:desc';
        pageSizeEl.value = '10';
        batchTagIdEl.value = '';
        selectedNoteIds = [];
        favoriteOnlyMode = false;
        recycleBinMode = false;
        currentPage = 1;
        await refreshAll();
        setStatus('列表已刷新');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById('export-button').addEventListener('click', async () => {
      try {
        const exported = await exportKnowledgeBase();
        setStatus('知识库已导出：' + exported.exportedAt);
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById('import-button').addEventListener('click', async () => {
      try {
        const imported = await importKnowledgeBaseFromText(snapshotBoxEl.value);
        setStatus('知识库已导入：' + imported.exportedAt);
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    importFileEl.addEventListener('change', async (event) => {
      const [file] = event.target.files || [];
      if (!file) {
        return;
      }

      try {
        snapshotBoxEl.value = await file.text();
        setStatus('已读取导入文件，点击 Import JSON 可写入知识库');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById('import-markdown-button').addEventListener('click', async () => {
      try {
        const imported = await importMarkdownFile(markdownImportFileEl.files || []);
        markdownImportTitleEl.value = '';
        markdownImportFileEl.value = '';
        const importedCount = Array.isArray(imported) ? imported.length : 1;
        const label = Array.isArray(imported)
          ? imported.map((item) => item.title).join(', ')
          : imported.title;
        currentPage = 1;
        setStatus('Markdown 已导入：' + importedCount + ' 条笔记（' + label + '）');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    filterFolderEl.addEventListener('change', async () => {
      try {
        currentPage = 1;
        await refreshNotes();
        setStatus('目录筛选已更新');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    filterTagEl.addEventListener('change', async () => {
      try {
        currentPage = 1;
        await refreshNotes();
        setStatus('标签筛选已更新');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    sortOrderEl.addEventListener('change', async () => {
      try {
        currentPage = 1;
        await refreshNotes();
        setStatus('排序已更新');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    pageSizeEl.addEventListener('change', async () => {
      try {
        currentPage = 1;
        await refreshNotes();
        setStatus('分页大小已更新');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById('prev-page-button').addEventListener('click', async () => {
      if (currentPage === 1) {
        setStatus('已经是第一页');
        return;
      }

      try {
        currentPage -= 1;
        await refreshNotes();
        setStatus('已切换到上一页');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById('next-page-button').addEventListener('click', async () => {
      if (lastNotesCount < Number(pageSizeEl.value || '10')) {
        setStatus('当前已经是最后一页');
        return;
      }

      try {
        currentPage += 1;
        await refreshNotes();
        setStatus('已切换到下一页');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById('reset-form').addEventListener('click', () => {
      resetNoteForm();
      setStatus('表单已重置');
    });

    document.getElementById('folder-reset').addEventListener('click', () => {
      resetFolderForm();
      setStatus('目录表单已重置');
    });

    document.getElementById('tag-reset').addEventListener('click', () => {
      resetTagForm();
      setStatus('标签表单已重置');
    });

    document.getElementById('detail-clear-button').addEventListener('click', () => {
      clearNoteDetail();
      setStatus('笔记详情已清空');
    });

    detailEditButtonEl.addEventListener('click', () => {
      if (!currentDetailNote) {
        setStatus('请先选择一条笔记', true);
        return;
      }

      fillNoteForm(currentDetailNote);
      updateEditorPreview();
      setStatus('笔记详情已加载到编辑表单');
    });

    document.getElementById('markdown').addEventListener('input', () => {
      updateEditorPreview();
    });

    document.getElementById('upload-attachment-button').addEventListener('click', async () => {
      if (!currentDetailNote) {
        setStatus('请先选择一条笔记再上传附件', true);
        return;
      }

      if (currentDetailNote.deleted) {
        setStatus('Restore the note before uploading attachments.', true);
        return;
      }

      const [file] = attachmentFileEl.files || [];
      if (!file) {
        setStatus('请先选择附件文件', true);
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach((value) => {
          binary += String.fromCharCode(value);
        });
        const contentBase64 = btoa(binary);
        await fetchJson('/api/storage/attachments', {
          method: 'POST',
          body: JSON.stringify({
            noteId: currentDetailNote.id,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            contentBase64
          })
        });
        attachmentFileEl.value = '';
        await loadNoteDetail(currentDetailNote.id);
        setStatus('附件已上传');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    detailAttachmentsEl.addEventListener('click', (event) => {
      const insertButton = event.target.closest('[data-insert-attachment]');
      const deleteButton = event.target.closest('[data-delete-attachment]');

      if (deleteButton) {
        if (!currentDetailNote) {
          setStatus('Please select a note first.', true);
          return;
        }

        fetchJson('/api/storage/attachments/' + encodeURIComponent(deleteButton.dataset.deleteAttachment), {
          method: 'DELETE'
        })
          .then(async () => {
            await loadNoteDetail(currentDetailNote.id);
            setStatus('Attachment deleted.');
          })
          .catch((error) => {
            setStatus(error.message, true);
          });
        return;
      }

      if (!insertButton) {
        return;
      }

      insertAttachmentIntoEditor({
        id: insertButton.dataset.insertAttachment,
        fileName: insertButton.dataset.attachmentName || 'attachment',
        mimeType: insertButton.dataset.attachmentMime || 'application/octet-stream'
      });
      setStatus('Attachment reference inserted into editor.');
    });

    listEl.addEventListener('click', async (event) => {
      const deleteButton = event.target.closest('[data-delete-note]');
      const restoreButton = event.target.closest('[data-restore-note]');
      const favoriteButton = event.target.closest('[data-toggle-favorite]');
      const fillButton = event.target.closest('[data-fill-note]');
      const removeTagButton = event.target.closest('[data-remove-note-tag]');
      const viewButton = event.target.closest('[data-view-note]');
      const selectCheckbox = event.target.closest('[data-select-note]');

      if (selectCheckbox) {
        if (selectCheckbox.checked) {
          selectedNoteIds = [...new Set([...selectedNoteIds, selectCheckbox.dataset.selectNote])];
        } else {
          selectedNoteIds = selectedNoteIds.filter((noteId) => noteId !== selectCheckbox.dataset.selectNote);
        }
        normalizeSelectedNotes();
        return;
      }

      if (deleteButton) {
        try {
          await fetchJson('/api/knowledge/notes/' + encodeURIComponent(deleteButton.dataset.deleteNote), {
            method: 'DELETE'
          });
          setStatus('笔记已删除');
          await refreshNotes();
        } catch (error) {
          setStatus(error.message, true);
        }
      }

      if (restoreButton) {
        try {
          await fetchJson('/api/knowledge/notes/' + encodeURIComponent(restoreButton.dataset.restoreNote) + '/restore', {
            method: 'POST'
          });
          setStatus('Note restored from recycle bin.');
          await refreshNotes();
        } catch (error) {
          setStatus(error.message, true);
        }
      }

      if (favoriteButton) {
        try {
          await fetchJson('/api/knowledge/notes/' + encodeURIComponent(favoriteButton.dataset.toggleFavorite) + '/favorite', {
            method: 'POST',
            body: JSON.stringify({
              favorite: favoriteButton.dataset.favorite === 'true'
            })
          });
          setStatus(favoriteButton.dataset.favorite === 'true' ? 'Note added to favorites.' : 'Note removed from favorites.');
          await refreshNotes();
        } catch (error) {
          setStatus(error.message, true);
        }
        return;
      }

      if (fillButton) {
        try {
          const note = await loadNoteDetail(fillButton.dataset.fillNote);
          fillNoteForm(note);
          updateEditorPreview();
          setStatus('笔记内容已回填到表单，当前为编辑模式');
        } catch (error) {
          setStatus(error.message, true);
        }
      }

      if (removeTagButton) {
        try {
          await fetchJson(
            '/api/knowledge/notes/' + encodeURIComponent(removeTagButton.dataset.removeNoteTag) + '/tags/' + encodeURIComponent(removeTagButton.dataset.tagId),
            { method: 'DELETE' }
          );
          setStatus('标签已从笔记解绑');
          await refreshNotes();
        } catch (error) {
          setStatus(error.message, true);
        }
      }

      if (viewButton) {
        try {
          await loadNoteDetail(viewButton.dataset.viewNote);
          setStatus('笔记详情已加载');
        } catch (error) {
          setStatus(error.message, true);
        }
      }
    });

    recentListEl.addEventListener('click', async (event) => {
      const viewButton = event.target.closest('[data-view-note]');

      if (!viewButton) {
        return;
      }

      try {
        await loadNoteDetail(viewButton.dataset.viewNote);
        setStatus('最近笔记详情已加载');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    folderListEl.addEventListener('click', async (event) => {
      const useButton = event.target.closest('[data-use-folder]');
      const editButton = event.target.closest('[data-edit-folder]');
      const deleteButton = event.target.closest('[data-delete-folder]');

      if (useButton) {
        document.getElementById('folder-id').value = useButton.dataset.useFolder;
        filterFolderEl.value = useButton.dataset.useFolder;
        try {
          await refreshNotes();
          setStatus('当前目录已切换');
        } catch (error) {
          setStatus(error.message, true);
        }
      }

      if (deleteButton) {
        try {
          await fetchJson('/api/knowledge/folders/' + encodeURIComponent(deleteButton.dataset.deleteFolder), {
            method: 'DELETE'
          });
          setStatus('目录已删除');
          await refreshAll();
        } catch (error) {
          setStatus(error.message, true);
        }
      }

      if (editButton) {
        document.getElementById('folder-mode').value = 'edit';
        document.getElementById('folder-create-id').value = editButton.dataset.editFolder;
        document.getElementById('folder-name').value = editButton.dataset.folderName;
        folderParentEl.value = editButton.dataset.folderParentId || '';
        folderSubmitButton.textContent = '更新目录';
        setStatus('目录已载入编辑表单');
      }
    });

    tagListEl.addEventListener('click', async (event) => {
      const useButton = event.target.closest('[data-use-tag]');
      const editButton = event.target.closest('[data-edit-tag]');
      const deleteButton = event.target.closest('[data-delete-tag]');

      if (useButton) {
        document.getElementById('tag-id').value = useButton.dataset.useTag;
        filterTagEl.value = useButton.dataset.useTag;
        try {
          await refreshNotes();
          setStatus('当前标签已切换');
        } catch (error) {
          setStatus(error.message, true);
        }
      }

      if (deleteButton) {
        try {
          await fetchJson('/api/knowledge/tags/' + encodeURIComponent(deleteButton.dataset.deleteTag), {
            method: 'DELETE'
          });
          setStatus('标签已删除');
          await refreshAll();
        } catch (error) {
          setStatus(error.message, true);
        }
      }

      if (editButton) {
        document.getElementById('tag-mode').value = 'edit';
        document.getElementById('tag-create-id').value = editButton.dataset.editTag;
        document.getElementById('tag-name').value = editButton.dataset.tagName;
        document.getElementById('tag-color').value = editButton.dataset.tagColor;
        tagSubmitButton.textContent = '更新标签';
        setStatus('标签已载入编辑表单');
      }
    });

    resetNoteForm();
    resetFolderForm();
    resetTagForm();
    clearNoteDetail();
    updateViewModeUi();
    refreshAll().catch((error) => setStatus(error.message, true));
  </script>
</body>
</html>`;
}

export function createServer({ appContext }) {
  const html = createWebAppHtml();

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const { knowledge } = appContext.http;
      const { storage } = appContext.http;

      if (request.method === 'GET' && url.pathname === '/') {
        sendHtml(response, html);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, {
          data: {
            status: 'ok'
          }
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/storage/export') {
        sendJson(response, 200, {
          data: storage.exportKnowledgeBase()
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/storage/attachments') {
        sendJson(response, 200, {
          data: storage.listAttachments(toQueryObject(url))
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/storage/attachments') {
        const body = await parseBody(request);
        sendJson(response, 201, {
          data: storage.uploadAttachment(body)
        });
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/storage/attachments/') && url.pathname.endsWith('/content')) {
        const attachmentId = url.pathname.split('/')[4];
        const payload = storage.getAttachmentContent({ id: decodeURIComponent(attachmentId) });
        sendBinary(response, 200, payload.content, payload.attachment.mimeType, payload.attachment.fileName);
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/storage/attachments/')) {
        const attachmentId = url.pathname.split('/')[4];
        if (attachmentId && !url.pathname.endsWith('/content')) {
          sendJson(response, 200, {
            data: storage.deleteAttachment({ id: decodeURIComponent(attachmentId) })
          });
          return;
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/storage/import') {
        const body = await parseBody(request);
        sendJson(response, 200, {
          data: storage.importKnowledgeBase(body)
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/knowledge-points') {
        sendJson(response, 200, {
          data: knowledge.listKnowledgePoints(toQueryObject(url))
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/knowledge-point-tag-groups') {
        sendJson(response, 200, {
          data: knowledge.listKnowledgePointTagGroups(toQueryObject(url))
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/knowledge-points') {
        const body = await parseBody(request);
        sendJson(response, 201, {
          data: knowledge.createKnowledgePoint(body)
        });
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/knowledge/knowledge-point-sources/')) {
        const sourceId = url.pathname.split('/')[4];
        sendJson(response, 200, {
          data: knowledge.deleteKnowledgePointSource({ sourceId: decodeURIComponent(sourceId) })
        });
        return;
      }

      if (request.method === 'POST' && url.pathname.startsWith('/api/knowledge/knowledge-points/') && url.pathname.endsWith('/sources')) {
        const knowledgePointId = url.pathname.split('/')[4];
        const body = await parseBody(request);
        sendJson(response, 201, {
          data: knowledge.addSourceToKnowledgePoint({ id: decodeURIComponent(knowledgePointId) }, body)
        });
        return;
      }

      if (request.method === 'PATCH' && url.pathname.startsWith('/api/knowledge/knowledge-points/')) {
        const knowledgePointId = url.pathname.split('/')[4];
        const body = await parseBody(request);
        sendJson(response, 200, {
          data: knowledge.updateKnowledgePoint({ id: decodeURIComponent(knowledgePointId) }, body)
        });
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/knowledge/knowledge-points/')) {
        const knowledgePointId = url.pathname.split('/')[4];
        sendJson(response, 200, {
          data: knowledge.deleteKnowledgePoint({ id: decodeURIComponent(knowledgePointId) })
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/notes') {
        sendJson(response, 200, {
          data: knowledge.listNotes(toQueryObject(url))
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/notes') {
        const body = await parseBody(request);
        sendJson(response, 201, {
          data: knowledge.createNote(body)
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/notes/import-markdown') {
        const body = await parseBody(request);
        sendJson(response, 201, {
          data: knowledge.importMarkdown(body)
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/notes/import-markdown-batch') {
        const body = await parseBody(request);
        sendJson(response, 201, {
          data: knowledge.importMarkdownBatch(body)
        });
        return;
      }

      if (request.method === 'DELETE' && url.pathname === '/api/knowledge/notes/recycle-bin') {
        sendJson(response, 200, {
          data: knowledge.emptyRecycleBin(toQueryObject(url))
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/notes/batch/delete') {
        const body = await parseBody(request);
        sendJson(response, 200, {
          data: knowledge.deleteNotes(body)
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/notes/batch/tags') {
        const body = await parseBody(request);
        sendJson(response, 200, {
          data: knowledge.assignTagToNotes(body)
        });
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/knowledge/notes/') && url.pathname.includes('/tags/')) {
        const segments = url.pathname.split('/');
        const noteId = segments[4];
        const tagId = segments[6];
        sendJson(response, 200, {
          data: knowledge.removeTagFromNote({
            id: decodeURIComponent(noteId),
            tagId: decodeURIComponent(tagId)
          })
        });
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/knowledge/notes/')) {
        const noteId = url.pathname.split('/')[4];
        if (noteId && url.pathname.endsWith('/links')) {
          sendJson(response, 200, {
            data: knowledge.getLinkedNotes({ id: decodeURIComponent(noteId) })
          });
          return;
        }
        if (noteId && !url.pathname.endsWith('/tags') && !url.pathname.includes('/tags/') && !url.pathname.endsWith('/links')) {
          sendJson(response, 200, {
            data: knowledge.getNote({ id: decodeURIComponent(noteId) }, toQueryObject(url))
          });
          return;
        }
      }

      if (request.method === 'PATCH' && url.pathname.startsWith('/api/knowledge/notes/')) {
        const noteId = url.pathname.split('/')[4];
        if (noteId && !url.pathname.endsWith('/tags') && !url.pathname.includes('/tags/')) {
          const body = await parseBody(request);
          sendJson(response, 200, {
            data: knowledge.updateNote({ id: decodeURIComponent(noteId) }, body)
          });
          return;
        }
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/knowledge/notes/')) {
        const noteId = url.pathname.split('/')[4];
        if (noteId === 'recycle-bin') {
          sendJson(response, 404, {
            error: 'Route not found'
          });
          return;
        }
        if (noteId && url.pathname.endsWith('/permanent')) {
          sendJson(response, 200, {
            data: knowledge.permanentlyDeleteNote({ id: decodeURIComponent(noteId) })
          });
          return;
        }
        if (noteId && !url.pathname.endsWith('/tags') && !url.pathname.includes('/tags/')) {
          sendJson(response, 200, {
            data: knowledge.deleteNote({ id: decodeURIComponent(noteId) })
          });
          return;
        }
      }

      if (request.method === 'POST' && url.pathname.startsWith('/api/knowledge/notes/') && url.pathname.endsWith('/favorite')) {
        const noteId = url.pathname.split('/')[4];
        if (noteId) {
          const body = await parseBody(request);
          sendJson(response, 200, {
            data: knowledge.setFavorite({ id: decodeURIComponent(noteId) }, body)
          });
          return;
        }
      }

      if (request.method === 'POST' && url.pathname.startsWith('/api/knowledge/notes/') && url.pathname.endsWith('/restore')) {
        const noteId = url.pathname.split('/')[4];
        if (noteId) {
          sendJson(response, 200, {
            data: knowledge.restoreNote({ id: decodeURIComponent(noteId) })
          });
          return;
        }
      }

      if (request.method === 'POST' && url.pathname.startsWith('/api/knowledge/notes/') && url.pathname.endsWith('/tags')) {
        const segments = url.pathname.split('/');
        const noteId = segments[4];
        const body = await parseBody(request);
        sendJson(response, 200, {
          data: appContext.modules.knowledge.noteService.assignTagToNote(decodeURIComponent(noteId), body.tagId)
        });
        return;
      }

      if (request.method === 'PUT' && url.pathname.startsWith('/api/knowledge/notes/') && url.pathname.endsWith('/tags')) {
        const segments = url.pathname.split('/');
        const noteId = segments[4];
        const body = await parseBody(request);
        sendJson(response, 200, {
          data: knowledge.setNoteTags({
            id: decodeURIComponent(noteId)
          }, body)
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/search/notes') {
        sendJson(response, 200, {
          data: knowledge.searchNotes(toQueryObject(url))
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/folders') {
        const body = await parseBody(request);
        sendJson(response, 201, {
          data: knowledge.createFolder(body)
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/folders') {
        sendJson(response, 200, {
          data: knowledge.listFolders(toQueryObject(url))
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/folders/tree') {
        sendJson(response, 200, {
          data: knowledge.listFolderTree(toQueryObject(url))
        });
        return;
      }

      if (request.method === 'PATCH' && url.pathname.startsWith('/api/knowledge/folders/')) {
        const folderId = url.pathname.split('/')[4];
        const body = await parseBody(request);
        sendJson(response, 200, {
          data: knowledge.updateFolder({ id: decodeURIComponent(folderId) }, body)
        });
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/knowledge/folders/')) {
        const folderId = url.pathname.split('/')[4];
        sendJson(response, 200, {
          data: knowledge.deleteFolder({ id: decodeURIComponent(folderId) })
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/tags') {
        const body = await parseBody(request);
        sendJson(response, 201, {
          data: knowledge.createTag(body)
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/tags') {
        sendJson(response, 200, {
          data: knowledge.listTags(toQueryObject(url))
        });
        return;
      }

      if (request.method === 'PATCH' && url.pathname.startsWith('/api/knowledge/tags/')) {
        const tagId = url.pathname.split('/')[4];
        const body = await parseBody(request);
        sendJson(response, 200, {
          data: knowledge.updateTag({ id: decodeURIComponent(tagId) }, body)
        });
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/knowledge/tags/')) {
        const tagId = url.pathname.split('/')[4];
        sendJson(response, 200, {
          data: knowledge.deleteTag({ id: decodeURIComponent(tagId) })
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/spaces/default') {
        const body = await parseBody(request);
        sendJson(response, 201, {
          data: knowledge.createDefaultKnowledgeSpace(body)
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/spaces') {
        sendJson(response, 200, {
          data: knowledge.listKnowledgeSpaces(toQueryObject(url))
        });
        return;
      }

      sendJson(response, 404, {
        error: 'Route not found'
      });
    } catch (error) {
      sendJson(response, 400, {
        error: error.message
      });
    }
  });
}
