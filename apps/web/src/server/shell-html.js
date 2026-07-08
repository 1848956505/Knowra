export function renderHtml(initialWorkspaceScript = '') {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>知境·Knowra</title>
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
