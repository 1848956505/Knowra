import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialWorkspaceScript } from '../lib/workspace-loading.js';
import { readRuntimePorts, resolveApiPort, writeRuntimePort } from '../../../scripts/dev-runtime-ports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(rootDir, '..', '..');

const preferredPort = Number(process.env.PORT || 3000);
const runtimePortsFile = process.env.STUDY_RUNTIME_PORTS_FILE || path.join(workspaceRoot, 'storage', 'runtime', 'dev-ports.json');
let activeWebPort = preferredPort;

function renderHtml(initialWorkspaceScript = '') {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Study Accelerator</title>
  <meta name="description" content="A modular learning workspace centered on knowledge bases" />
  <link rel="stylesheet" href="/src/styles.css" />
  <link rel="stylesheet" href="/lib/editor/milkdown-bundle.css" />
</head>
<body>
  <div id="app">
    <div class="workspace-shell app-root">
      <aside class="icon-rail" aria-label="模块导航">
        <div class="rail-brand">SA</div>
        <nav class="rail-actions" id="module-rail"></nav>
      </aside>
      <div class="workspace-main">
        <header class="top-bar">
          <div class="top-bar-search" id="global-search-shell" aria-label="全局搜索"></div>
          <button type="button" class="top-bar-user" aria-label="用户入口">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"></path>
              <path d="M5.5 19a6.5 6.5 0 0 1 13 0"></path>
            </svg>
          </button>
        </header>
        <main class="workspace-stage">
          <div class="kb-workspace" id="kb-workspace" data-left-hidden="false" data-right-hidden="false" data-view-mode="edit">
            <aside class="kb-sidebar" id="kb-sidebar">
              <section class="section-card">
                <div class="library-header">
                  <span class="library-header-leading">
                    <svg viewBox="0 0 16 16" aria-hidden="true" class="library-symbol">
                      <path d="M3 4.5h10"></path>
                      <path d="M3 8h10"></path>
                      <path d="M3 11.5h7"></path>
                    </svg>
                  </span>
                  <span class="library-header-label">知识库导航</span>
                  <button type="button" class="library-header-toggle" id="secondary-nav-toggle" aria-label="显示导航入口菜单" title="显示导航入口菜单">
                    <svg viewBox="0 0 16 16" aria-hidden="true" class="library-header-toggle-icon">
                      <circle cx="3" cy="8" r="1.2"></circle>
                      <circle cx="8" cy="8" r="1.2"></circle>
                      <circle cx="13" cy="8" r="1.2"></circle>
                    </svg>
                  </button>
                </div>
                <div class="library-tree" id="folder-tree"></div>
              </section>
            </aside>
            <section class="kb-editor">
              <div class="note-tabs" id="note-tabs"></div>
              <div class="editor-menu-bar" id="editor-menu-bar"></div>
              <section class="editor-shell">
                <div class="editor-content" id="editor-content" data-source-open="false">
                  <section class="preview-pane preview-frame">
                    <div class="pane-body">
                      <article class="preview-rendered" id="preview-content"></article>
                    </div>
                  </section>
                </div>
              </section>
            </section>
            <aside class="kb-aside" id="kb-aside">
              <div class="aside-tabs" id="aside-tabs">
                <button type="button" class="aside-tab" data-aside-tab="info" data-active="true">信息</button>
                <button type="button" class="aside-tab" data-aside-tab="outline" data-active="false">大纲</button>
                <button type="button" class="aside-tab" data-aside-tab="concepts" data-active="false">知识点</button>
                <button type="button" class="aside-tab" data-aside-tab="ai" data-active="false">AI</button>
              </div>
              <div class="aside-panel-scroll">
                <div class="aside-content" id="aside-content"></div>
              </div>
            </aside>
          </div>
        </main>
        <footer class="status-bar">
          <div class="status-group" id="status-indicators"></div>
          <div class="status-group status-group-end" id="status-meta"></div>
        </footer>
      </div>
    </div>
  </div>
  <div class="library-context-menu" id="library-context-menu" hidden></div>
  <div class="library-context-menu library-section-menu" id="library-section-menu" hidden></div>
  <div class="note-tab-menu" id="note-tab-menu" hidden></div>
  <div class="editor-context-menu" id="editor-context-menu" hidden></div>
  <input id="markdown-import-input" type="file" accept=".md,.markdown,text/markdown,text/plain" multiple hidden />
  ${initialWorkspaceScript}
  <script type="module" src="/src/client.js"></script>
</body>
</html>`;
}

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (request.method === 'GET' && url.pathname === '/') {
      const initialWorkspace = await loadInitialWorkspaceSnapshot();
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      response.end(renderHtml(createInitialWorkspaceScript(initialWorkspace)));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/favicon.ico') {
      response.writeHead(204, { 'Cache-Control': 'no-store' });
      response.end();
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      const upstreamUrl = new URL(url.pathname + url.search, getApiOrigin());
      const requestBody = await readRequestBody(request);
      const upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers: buildProxyHeaders(request.headers),
        body: shouldSendBody(request.method) ? requestBody : undefined
      });
      const upstreamBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
      const responseHeaders = Object.fromEntries(upstreamResponse.headers.entries());

      response.writeHead(upstreamResponse.status, responseHeaders);
      response.end(upstreamBuffer);
      return;
    }

    if (
      url.pathname === '/src/client.js' ||
      url.pathname === '/src/styles.css' ||
      url.pathname.startsWith('/src/services/') ||
      url.pathname.startsWith('/src/controllers/') ||
      url.pathname.startsWith('/lib/') ||
      url.pathname.startsWith('/styles/')
    ) {
      const relativePath = url.pathname.replace(/^\//, '');
      const filePath = path.join(rootDir, relativePath);
      if (!filePath.startsWith(rootDir)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      if (!fs.existsSync(filePath)) {
        response.writeHead(404);
        response.end('Not Found');
        return;
      }

      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      response.writeHead(200, {
        'Content-Type': mimeTypes.get(ext) || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      response.end(content);
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error.message);
  }
});

function shouldSendBody(method) {
  return !['GET', 'HEAD'].includes(String(method || 'GET').toUpperCase());
}

function buildProxyHeaders(headers) {
  const nextHeaders = {};

  Object.entries(headers || {}).forEach(([key, value]) => {
    if (!value) return;
    if (key.toLowerCase() === 'host') return;
    nextHeaders[key] = value;
  });

  return nextHeaders;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on('end', () => {
      resolve(chunks.length ? Buffer.concat(chunks) : undefined);
    });
    request.on('error', reject);
  });
}

async function listenOnAvailablePort(startPort, maxAttempts = 20) {
  let currentPort = startPort;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('error', onError);
          reject(error);
        };

        server.once('error', onError);
        server.listen(currentPort, () => {
          server.off('error', onError);
          resolve();
        });
      });

      return currentPort;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') {
        throw error;
      }

      currentPort += 1;
    }
  }

  throw new Error(`Unable to find an available port starting from ${startPort}`);
}

async function loadInitialWorkspaceSnapshot() {
  try {
    const spacesPayload = await fetchApiJson('/api/knowledge/spaces');
    const spaces = Array.isArray(spacesPayload.data) ? spacesPayload.data : [];
    const space = spaces[0] ?? await ensureDefaultSpace();

    if (!space?.id) {
      return null;
    }

    const [folderTreePayload, notesPayload, tagsPayload] = await Promise.all([
      fetchApiJson(`/api/knowledge/folders/tree?spaceId=${encodeURIComponent(space.id)}`),
      fetchApiJson(`/api/knowledge/notes?spaceId=${encodeURIComponent(space.id)}`),
      fetchApiJson(`/api/knowledge/tags?spaceId=${encodeURIComponent(space.id)}`)
    ]);

    return {
      spaces: spaces.length ? spaces : [space],
      currentSpaceId: space.id,
      folderTree: Array.isArray(folderTreePayload.data) ? folderTreePayload.data : [],
      allNotes: Array.isArray(notesPayload.data) ? notesPayload.data : [],
      tags: Array.isArray(tagsPayload.data) ? tagsPayload.data : [],
      openFolders: {},
      selectedFolderId: null,
      selectedNoteId: null
    };
  } catch (error) {
    return null;
  }
}

async function ensureDefaultSpace() {
  const payload = await fetchApiJson('/api/knowledge/spaces/default', {
    method: 'POST',
    body: JSON.stringify({ userId: 'demo' })
  });
  return payload.data ?? null;
}

async function fetchApiJson(pathname, options = {}) {
  const response = await fetch(new URL(pathname, getApiOrigin()), {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    },
    body: options.body,
    signal: AbortSignal.timeout(1800)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return payload;
}

function getApiOrigin() {
  if (process.env.API_ORIGIN?.trim()) {
    return process.env.API_ORIGIN.trim();
  }

  const apiPort = resolveApiPort({
    envApiPort: process.env.API_PORT,
    runtimePorts: readRuntimePorts(runtimePortsFile),
    webPort: activeWebPort,
    fallbackPort: 3001
  });

  return `http://localhost:${apiPort}`;
}

listenOnAvailablePort(preferredPort)
  .then((port) => {
    activeWebPort = port;
    writeRuntimePort(runtimePortsFile, 'web', port);
    const suffix = port === preferredPort ? '' : ` (auto-selected from ${preferredPort})`;
    console.log(`Study Accelerator web UI running at http://localhost:${port}${suffix}`);
    console.log(`Proxying /api to ${getApiOrigin()}`);
  })
  .catch((error) => {
    console.error('Failed to start Study Accelerator web UI:', error.message);
    process.exitCode = 1;
  });
