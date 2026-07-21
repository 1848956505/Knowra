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
    <div class="workspace-shell app-root knowra-production-shell" id="workspace-shell" data-screen="index">
      <aside class="kb-sidebar knowra-rail" id="kb-sidebar" aria-label="资料库导航">
        <section class="library-directory">
          <div class="library-label">
            <button type="button" class="library-home-target" data-library-home="global" aria-label="返回资料索引">
              <b class="library-id">01</b>
              <span class="library-copy"><strong>资料库</strong><small>LIBRARY</small></span>
            </button>
            <button type="button" class="library-header-toggle" id="secondary-nav-toggle" aria-label="显示导航入口菜单" title="显示导航入口菜单">
              <svg viewBox="0 0 16 16" aria-hidden="true" class="library-header-toggle-icon">
                <circle cx="3" cy="8" r="1.2"></circle>
                <circle cx="8" cy="8" r="1.2"></circle>
                <circle cx="13" cy="8" r="1.2"></circle>
              </svg>
            </button>
          </div>
          <div class="directory-group-label directory-heading">内容与文件夹　CONTENT &amp; FOLDERS</div>
          <div class="library-tree" id="folder-tree"></div>
        </section>
        <nav class="module-switcher" id="module-rail" aria-label="切换产品模块"></nav>
        <button type="button" class="settings-button" aria-label="设置">
          <span class="settings-code" aria-hidden="true">SET</span><span>设置</span>
        </button>
      </aside>

      <div class="workspace-main">
        <main class="workspace-stage">
          <section class="library-index-view" id="library-index-view">
            <main class="index-workspace">
              <header class="masthead">
                <div class="masthead-title"><h1>资料库</h1><p>LIBRARY INDEX</p></div>
                <div class="scope-summary" id="library-index-scope"></div>
                <button type="button" class="primary-button" data-index-new-note>＋ 新建资料</button>
              </header>
              <nav class="content-tabs" id="library-index-tabs" aria-label="资料筛选"></nav>
              <div class="filter-row">
                <div class="index-filter-controls" id="library-index-filters"></div>
                <div class="top-bar-search" id="global-search-shell" aria-label="搜索资料"></div>
              </div>
              <div class="library-index-content" id="library-index-content"></div>
            </main>
            <aside class="index-inspector" id="library-index-inspector"></aside>
          </section>

          <section class="editor-workspace-view" id="editor-workspace-view" hidden>
            <div class="kb-workspace" id="kb-workspace" data-left-hidden="false" data-right-hidden="false" data-view-mode="edit">
              <section class="kb-editor editor-workspace">
                <header class="document-tabs">
                  <button type="button" class="back-index" data-library-home="back" aria-label="返回资料索引">←</button>
                  <div class="note-tabs" id="note-tabs"></div>
                  <div class="note-tab-overflow-menu" id="note-tab-overflow-menu" hidden></div>
                </header>
                <div class="editor-menu-bar" id="editor-menu-bar"></div>
                <section class="editor-shell" id="editor-scroll-region">
                  <div class="editor-document-head" id="editor-document-head"></div>
                  <div class="editor-content" id="editor-content" data-source-open="false">
                    <section class="preview-pane preview-frame">
                      <div class="pane-body">
                        <article class="preview-rendered" id="preview-content"></article>
                      </div>
                    </section>
                  </div>
                </section>
              </section>
              <aside class="kb-aside editor-inspector" id="kb-aside">
                <header class="aside-heading">
                  <div><b>资料边注</b><span>MARGINALIA</span></div>
                  <button type="button" data-editor-aside-toggle aria-label="收起资料边注">›</button>
                </header>
                <div class="aside-tabs" id="aside-tabs"></div>
                <div class="aside-panel-scroll">
                  <div class="aside-content" id="aside-content"></div>
                </div>
              </aside>
              <button type="button" class="reopen-panel editor-reopen" id="editor-aside-reopen" data-editor-aside-toggle hidden>侧栏</button>
            </div>
          </section>
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
