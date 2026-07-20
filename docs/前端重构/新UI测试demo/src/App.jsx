// Knowra 离线 UI demo —— 与正式项目 apps/web/ 的视觉/结构/文案对齐。
// 保留 React 容器，仅做静态展示与状态模拟，不接真实后端与 Milkdown。

import { useState } from 'react';

// ---------- 内置最简数据（替代原 seedItems / seedFolders / paragraphs） ----------
const FOLDERS = [
  { id: 'fld-research', name: '研究方法', english: 'RESEARCH METHODS' },
  { id: 'fld-knowledge', name: '知识管理', english: 'KNOWLEDGE' }
];

const TAGS = [
  { id: 'tag-meta', name: '元学习' },
  { id: 'tag-reading', name: '阅读' },
  { id: 'tag-method', name: '研究方法' },
  { id: 'tag-card', name: '卡片笔记' }
];

const NOTES = [
  {
    id: 'n-001',
    title: '如何阅读一本书',
    folderId: 'fld-reading',
    sourceType: 'manual',
    status: 'in-progress',
    summary: '本书把阅读分成基础、检视、分析与主题四个层次，强调主动阅读与提出问题。',
    rawMarkdown: '# 主动阅读的四个层次\n\n## 引言\n\n阅读不是被动地接受信息，而是一种主动的思考过程。\n\n## 四个层次\n\n- 基础阅读：识字的初级阶段\n- 检视阅读：在短时间内把握全书骨架\n- 分析阅读：完整咀嚼一本书\n- 主题阅读：跨书比较同一主题\n\n> 一个好的读者，应该既是提问者，也是回答者。',
    tagIds: ['tag-reading', 'tag-method'],
    internalLinks: [],
    favorite: true,
    deleted: false,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-15T14:32:00'
  },
  {
    id: 'n-002',
    title: '卡片笔记写作法',
    folderId: 'fld-knowledge',
    sourceType: 'import-md',
    status: 'inbox',
    summary: '把灵感与摘录写成可复用的原子卡片，再用编号与链接组成知识网络。',
    rawMarkdown: '# 卡片笔记的核心\n\n## 为什么是卡片\n\n每张卡片对应一个独立想法，避免一篇文章中混杂多个主题。\n\n## 链接即思考\n\n通过编号与双向链接，让旧卡片被新卡片引用。\n\n```js\nconst note = { id: "n-002", tags: ["卡片笔记"] };\n```',
    tagIds: ['tag-card', 'tag-meta'],
    internalLinks: ['n-001'],
    favorite: false,
    deleted: false,
    createdAt: '2026-07-04T09:20:00',
    updatedAt: '2026-07-12T11:05:00'
  },
  {
    id: 'n-003',
    title: '费曼学习法',
    folderId: 'fld-research',
    sourceType: 'manual',
    status: 'archived',
    summary: '通过把概念讲给外行人听，倒逼自己把模糊之处补齐。',
    rawMarkdown: '# 费曼学习法\n\n## 四步流程\n\n1. 选择一个概念\n2. 假装讲给小学生听\n3. 卡住就回去重学\n4. 简化语言并复述\n\n> 如果你无法简单地解释它，说明你还没有真正理解它。',
    tagIds: ['tag-meta'],
    internalLinks: ['n-002'],
    favorite: false,
    deleted: false,
    createdAt: '2026-06-20T16:00:00',
    updatedAt: '2026-07-08T20:18:00'
  }
];

const MODULES = [
  { id: 'knowledge', name: '知识库' },
  { id: 'paper', name: '题库' },
  { id: 'ai', name: 'AI 工作台' },
  { id: 'task', name: '任务' },
  { id: 'review', name: '复盘' },
  { id: 'settings', name: '设置' }
];

const INDEX_TABS = [
  { id: 'all', label: '全部条目' },
  { id: 'recent', label: '最近' },
  { id: 'starred', label: '已收藏' },
  { id: 'trash', label: '回收站' }
];

const FILTERS = {
  type: {
    label: '类型',
    options: ['全部', '手动笔记', 'MD 导入', 'PDF 导入', '文件资料']
  },
  status: {
    label: '状态',
    options: ['全部', '待整理', '进行中', '已完成', '已归档']
  },
  time: {
    label: '时间',
    options: ['最近编辑', '最早编辑', '最近创建', '最早创建']
  }
};

const EDITOR_MENUS = {
  file: ['新建笔记', '新建文件夹', '导入 Markdown', '保存', '另存为', '重命名', '收藏笔记', '删除', '导出 Markdown', '导出'],
  paragraph: ['正文', '一级标题', '二级标题', '三级标题', '无序列表', '有序列表', '任务列表', '引用块', '代码块', '分割线', '表格'],
  edit: ['撤销', '重做', '剪切', '复制', '粘贴', '查找', '替换', '全选'],
  format: ['图片', '内部链接', '加粗', '斜体', '删除线', '行内代码', '高亮'],
  view: ['阅读模式', '编辑模式', '专注模式', '隐藏左侧目录区', '隐藏右侧辅助区', '显示源码编辑器']
};

const QUICK_TOOLS = [
  { label: '一级标题', glyph: 'H1' },
  { label: '二级标题', glyph: 'H2' },
  { label: '三级标题', glyph: 'H3' },
  { label: '加粗', glyph: 'B' },
  { label: '斜体', glyph: 'I' },
  { label: '无序列表', glyph: '•' },
  { label: '引用', glyph: '❝' },
  { label: '行内代码', glyph: '<>' }
];

const SECTIONS = [
  { id: 'all', label: '资料', count: 3 },
  { id: 'starred', label: '收藏', count: 1 },
  { id: 'recent', label: '最近', count: 3 },
  { id: 'recycle', label: '回收站', count: 0 }
];
SECTIONS.length = 0;

// ---------- 工具函数 ----------
function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${mo}.${da} ${h}:${mi}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStatusLabel(status) {
  return { inbox: '待整理', 'in-progress': '进行中', done: '已完成', archived: '已归档' }[status] || '待整理';
}

function getSourceTypeLabel(type) {
  return { manual: '手动笔记', 'import-md': 'MD 导入', 'import-pdf': 'PDF 导入', file: '文件资料' }[type] || '手动笔记';
}

function getEstimatedReadingMinutes(note) {
  const len = (note.rawMarkdown || '').length;
  return Math.max(1, Math.round(len / 280));
}

// ---------- 图标（保持 SVG 内联以避免依赖 Phosphor） ----------
const Icon = ({ name, className = 'library-tree-icon' }) => {
  const paths = {
    folderOpen: '<path d="M1.5 5.5h5l1.2 1.3H14v5.7a1 1 0 0 1-1 1H3a1.5 1.5 0 0 1-1.5-1.5z"></path><path d="M1.5 5V4a1 1 0 0 1 1-1h3l1.1 1.2H13A1 1 0 0 1 14 5v1.3"></path>',
    folderClosed: '<path d="M2 4h3.4l1.1 1.2H13A1 1 0 0 1 14 6v5.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"></path><path d="M2 6h12"></path>',
    file: '<path d="M4 2.5h5l3 3v7.8a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7z"></path><path d="M9 2.5v3h3"></path><path d="M5.1 11.8V9.1l1.2 1.5 1.2-1.5v2.7"></path><path d="M8.9 11.8V9.1l2.1 2.7V9.1"></path>',
    filePdf: '<path d="M4 2.5h5l3 3v7.8a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7z"></path><path d="M9 2.5v3h3"></path><path d="M4.8 10.5h6.4"></path><path d="M5.2 12.2h5.6"></path>',
    fileResource: '<path d="M4 2.5h5l3 3v7.8a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7z"></path><path d="M9 2.5v3h3"></path><path d="M5.1 9.9 7 8.5l1.4 1.2 2-2"></path>',
    chevron: '<path d="M5 3.5 10 8l-5 4.5"></path>',
    tag: '<path d="M3 3h5l5 5-5 5-5-5z"></path><circle cx="6" cy="6" r="1"></circle>',
    link: '<path d="M6.5 9.5 9.5 6.5M5.5 11.5l-1 1a2 2 0 0 1-3-3l2-2a2 2 0 0 1 3 0M10.5 4.5l1-1a2 2 0 1 1 3 3l-2 2a2 2 0 0 1-3 0"></path>',
    list: '<path d="M5 4h9M5 8h9M5 12h9M2 4h.1M2 8h.1M2 12h.1"></path>',
    paperclip: '<path d="m6 8 4-4a2 2 0 1 1 3 3l-6 6a3 3 0 0 1-4-4l6-6"></path>',
    x: '<path d="M4 4l8 8M12 4l-8 8"></path>',
    search: '<circle cx="7" cy="7" r="4"></circle><path d="M10 10l4 4"></path>',
    threeDots: '<circle cx="3" cy="8" r="1.2"></circle><circle cx="8" cy="8" r="1.2"></circle><circle cx="13" cy="8" r="1.2"></circle>'
  };
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true"
         dangerouslySetInnerHTML={{ __html: paths[name] || paths.file }} />
  );
};

const ModuleIcon = ({ kind }) => {
  const paths = {
    knowledge: '<path d="M4.5 5.5h6a3 3 0 0 1 3 3v10h-6a3 3 0 0 0-3 3z"></path><path d="M19.5 5.5h-6a3 3 0 0 0-3 3v10h6a3 3 0 0 1 3 3z"></path>',
    paper: '<path d="M7 4.5h7l4 4v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"></path><path d="M14 4.5v4h4"></path><path d="M8.5 12h7"></path><path d="M8.5 15.5h7"></path>',
    ai: '<path d="M12 3.5l1.8 4.2L18 9.5l-4.2 1.8L12 15.5l-1.8-4.2L6 9.5l4.2-1.8z"></path><path d="M18.5 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"></path><path d="M6 15.5l1 2.2 2.2 1-2.2 1-1 2.3-1-2.3-2.2-1 2.2-1z"></path>',
    task: '<path d="M9 6.5h10"></path><path d="M9 12h10"></path><path d="M9 17.5h10"></path><path d="M5.5 6.5h.01"></path><path d="M5.5 12h.01"></path><path d="M5.5 17.5h.01"></path>',
    review: '<path d="M12 5.5v13"></path><path d="M5.5 12h13"></path><path d="M7.5 7.5l9 9"></path><path d="M16.5 7.5l-9 9"></path>',
    settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"></path><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.3 7.3 0 0 0-1.7-1l-.4-2.6H9.6l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.3 7.3 0 0 0 1.7 1l.4 2.6h4.8l.4-2.6a7.3 7.3 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.07-.33.1-.67.1-1z"></path>'
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths[kind] || paths.knowledge }} />;
};

const FolderIcon = ({ open }) => <Icon name={open ? 'folderOpen' : 'folderClosed'} />;
const NoteIcon = ({ note }) => {
  if (note.sourceType === 'import-pdf') return <Icon name="filePdf" className="library-tree-icon library-tree-icon-pdf" />;
  if (note.sourceType === 'file') return <Icon name="fileResource" className="library-tree-icon library-tree-icon-resource" />;
  return <Icon name="file" className="library-tree-icon library-tree-icon-markdown" />;
};

// ---------- 左侧导航栏 ----------
function LeftRail({ activeNoteId, onSelectNote, onBackToIndex, onOpenSectionMenu }) {
  const [openMaterials, setOpenMaterials] = useState(true);
  const [openFavorites, setOpenFavorites] = useState(true);
  const [openRecent, setOpenRecent] = useState(true);
  const [openRecycle, setOpenRecycle] = useState(false);
  const [openFolders, setOpenFolders] = useState({ 'fld-research': true, 'fld-knowledge': true });
  const [headerToggleOpen, setHeaderToggleOpen] = useState(false);

  const favoriteNotes = NOTES.filter((n) => n.favorite && !n.deleted);
  const recentNotes = [...NOTES]
    .filter((n) => !n.deleted)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const toggleFolder = (id) => setOpenFolders((s) => ({ ...s, [id]: !s[id] }));
  const rootNotes = NOTES.filter((n) => !n.deleted && !FOLDERS.find((f) => f.id === n.folderId));

  const sectionProps = (key, label, count, open, toggle) => (
    <div className="library-node-group library-section-group" key={key}>
      <button
        type="button"
        className="library-node library-section-node"
        data-nav-section={key}
        data-open={String(open)}
        data-level="0"
        data-materials-section={key === 'materials' ? 'true' : undefined}
        data-recycle-section={key === 'recycle' ? 'true' : undefined}
      >
        <span className="library-node-leading">
          <span className="library-chevron-hitbox">
            <Icon name="chevron" className={`library-chevron ${open ? 'is-open' : ''}`} />
          </span>
        </span>
        <span className="library-node-label library-section-label" onClick={toggle}>{label}</span>
        <span className="library-section-meta">{String(count).padStart(2, '0')}</span>
      </button>
      {open && <div className="library-node-children">{renderChildren(key)}</div>}
    </div>
  );

  function renderChildren(key) {
    if (key === 'materials') {
      const parts = [];
      FOLDERS.forEach((folder) => {
        const isOpen = openFolders[folder.id];
        const childNotes = NOTES.filter((n) => !n.deleted && n.folderId === folder.id);
        const hasChildren = childNotes.length > 0;
        parts.push(
          <div className="library-node-group" key={folder.id}>
            <button
              type="button"
              className="library-node library-folder-node"
              data-folder-id={folder.id}
              data-level="1"
              data-selected="false"
              title={folder.name}
            >
              <span className="library-node-leading">
                <span
                  className="library-chevron-hitbox"
                  onClick={(e) => { e.stopPropagation(); toggleFolder(folder.id); }}
                >
                  {hasChildren ? (
                    <Icon name="chevron" className={`library-chevron ${isOpen ? 'is-open' : ''}`} />
                  ) : (
                    <span className="library-node-spacer" />
                  )}
                </span>
                <FolderIcon open={isOpen} />
              </span>
              <span className="library-node-label">{folder.name}</span>
            </button>
            {isOpen && hasChildren && (
              <div className="library-node-children">
                {childNotes.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    className="library-node library-note-node"
                    data-note-id={n.id}
                    data-level="2"
                    data-selected={activeNoteId === n.id}
                    title={n.title}
                    onClick={() => onSelectNote(n.id)}
                  >
                    <span className="library-node-leading">
                      <span className="library-node-spacer" />
                      <NoteIcon note={n} />
                    </span>
                    <span className="library-node-label">{n.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      });
      rootNotes.forEach((n) => {
        parts.push(
          <button
            type="button"
            key={n.id}
            className="library-node library-note-node"
            data-note-id={n.id}
            data-level="1"
            data-selected={activeNoteId === n.id}
            title={n.title}
            onClick={() => onSelectNote(n.id)}
          >
            <span className="library-node-leading">
              <span className="library-node-spacer" />
              <NoteIcon note={n} />
            </span>
            <span className="library-node-label">{n.title}</span>
          </button>
        );
      });
      return parts.length === 0
        ? <div className="library-node library-static-node library-empty-node" data-level="1"><span className="library-node-leading"><span className="library-node-spacer" /></span><span className="library-node-label">暂无目录</span></div>
        : parts;
    }
    if (key === 'favorites') {
      return favoriteNotes.length === 0
        ? <div className="library-node library-static-node library-empty-node" data-level="1"><span className="library-node-leading"><span className="library-node-spacer" /></span><span className="library-node-label">暂无收藏</span></div>
        : favoriteNotes.map((n) => (
            <button
              type="button"
              key={n.id}
              className="library-node library-note-node"
              data-note-id={n.id}
              data-level="1"
              data-selected={activeNoteId === n.id}
              title={n.title}
              onClick={() => onSelectNote(n.id)}
            >
              <span className="library-node-leading">
                <span className="library-node-spacer" />
                <NoteIcon note={n} />
              </span>
              <span className="library-node-label">{n.title}</span>
            </button>
          ));
    }
    if (key === 'recent') {
      return recentNotes.length === 0
        ? <div className="library-node library-static-node library-empty-node" data-level="1"><span className="library-node-leading"><span className="library-node-spacer" /></span><span className="library-node-label">暂无最近笔记</span></div>
        : recentNotes.map((n) => (
            <button
              type="button"
              key={n.id}
              className="library-node library-note-node"
              data-note-id={n.id}
              data-level="1"
              data-selected={activeNoteId === n.id}
              title={n.title}
              onClick={() => onSelectNote(n.id)}
            >
              <span className="library-node-leading">
                <span className="library-node-spacer" />
                <NoteIcon note={n} />
              </span>
              <span className="library-node-label">{n.title}</span>
            </button>
          ));
    }
    if (key === 'recycle') {
      return <div className="library-node library-static-node library-empty-node" data-level="1"><span className="library-node-leading"><span className="library-node-spacer" /></span><span className="library-node-label">暂无回收站文件</span></div>;
    }
    return null;
  }

  return (
    <aside className="knowra-rail" id="kb-sidebar" aria-label="资料库导航">
      <button type="button" className="brand" onClick={onBackToIndex} aria-label="返回资料库">
        <span className="brand-mark">K</span>
        <span className="brand-copy">
          <strong>知境 · Knowra</strong>
          <small>知识管理与研究系统</small>
        </span>
      </button>
      <section className="library-directory">
        <div className="library-label">
          <b className="library-id">01</b>
          <span className="library-copy"><strong>资料库</strong><small>LIBRARY</small></span>
          <button
            type="button"
            className="library-header-toggle"
            data-open={String(headerToggleOpen)}
            aria-label="显示导航入口菜单"
            title="显示导航入口菜单"
            onClick={() => { setHeaderToggleOpen((v) => !v); onOpenSectionMenu?.(); }}
          >
            <Icon name="threeDots" className="library-header-toggle-icon" />
          </button>
        </div>
        <div className="directory-group-label directory-heading">内容与文件夹　CONTENT &amp; FOLDERS</div>
        <nav className="library-tree" id="folder-tree" aria-label="资料树">
          {sectionProps('materials', '资料', FOLDERS.length + rootNotes.length, openMaterials, () => setOpenMaterials((v) => !v))}
          {sectionProps('favorites', '收藏', favoriteNotes.length, openFavorites, () => setOpenFavorites((v) => !v))}
          {sectionProps('recent', '最近', recentNotes.length, openRecent, () => setOpenRecent((v) => !v))}
          {sectionProps('recycle', '回收站', 0, openRecycle, () => setOpenRecycle((v) => !v))}
        </nav>
      </section>
      <nav className="module-switcher" id="module-rail" role="navigation" aria-label="业务模块">
        {MODULES.map((m, i) => (
          <button
            type="button"
            key={m.id}
            className="rail-item"
            data-module-key={m.id}
            data-active={m.id === 'knowledge' ? 'true' : 'false'}
            aria-label={m.name}
            title={m.name}
          >
            <span className="rail-item-icon"><ModuleIcon kind={m.id} /></span>
            <span className="rail-item-counter">{String(i + 1).padStart(2, '0')}</span>
            <span className="rail-item-label">{m.name}</span>
          </button>
        ))}
      </nav>
      <button type="button" className="settings-button" aria-label="设置">
        <span className="settings-code" aria-hidden="true">SET</span><span>设置</span>
      </button>
    </aside>
  );
}

// ---------- 索引页 ----------
function IndexView({ notes, selectedNoteId, onSelectNote, onOpenNote, onBack }) {
  const [activeTab, setActiveTab] = useState('all');
  const [filterValues, setFilterValues] = useState({ type: '全部', status: '全部', time: '最近编辑' });
  const [openFilter, setOpenFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const filtered = notes.filter((n) => !n.deleted);
  const currentNote = filtered.find((n) => n.id === selectedNoteId) || filtered[0];

  const tagsFor = (note) => (note.tagIds || []).map((tid) => TAGS.find((t) => t.id === tid)).filter(Boolean);

  return (
    <div className="library-index-view" data-inspector-open={inspectorOpen}>
      <main className="index-workspace">
        <header className="masthead">
          <div className="masthead-title">
            <h1>资料库</h1>
            <p>LIBRARY INDEX</p>
          </div>
          <div className="scope-summary">
            <span>当前范围　SCOPE</span>
            <strong>全部资料</strong>
            <div>
              <b>资料 {filtered.length}</b>
              <b>文件夹 {FOLDERS.length}</b>
              <b>最近更新 {formatDate(filtered[0]?.updatedAt)}</b>
            </div>
          </div>
          <button type="button" className="primary-button">＋ 新建资料</button>
        </header>

        <nav className="content-tabs" aria-label="资料范围">
          {INDEX_TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              data-active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <b>{tab.id === 'trash' ? '0' : filtered.length}</b>
            </button>
          ))}
        </nav>

        <div className="filter-row">
          <div className="index-filter-controls">
            {Object.entries(FILTERS).map(([key, def]) => (
              <div className="index-filter-shell" key={key}>
                <button
                  type="button"
                  className="index-filter-trigger"
                  aria-expanded={openFilter === key}
                  onClick={() => setOpenFilter((o) => (o === key ? null : key))}
                >
                  <b>{def.label}</b>
                  <span>{filterValues[key]}</span>
                  <Icon name="chevron" className="index-filter-chevron" />
                </button>
                {openFilter === key && (
                  <div className="index-filter-menu" role="menu">
                    {def.options.map((opt) => (
                      <button
                        type="button"
                        key={opt}
                        aria-checked={filterValues[key] === opt}
                        onClick={() => { setFilterValues((v) => ({ ...v, [key]: opt })); setOpenFilter(null); }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="index-search-shell">
            <Icon name="search" />
            <input
              type="search"
              placeholder="搜索笔记、标签、附件、AI 结果"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <section className="entry-list">
            <div className="empty-state">
              <strong>没有找到匹配条目</strong>
              <span>可以清除搜索、切换资料范围或返回全部资料。</span>
              <button type="button" onClick={() => { setSearch(''); setFilterValues({ type: '全部', status: '全部', time: '最近编辑' }); }}>清除筛选</button>
            </div>
          </section>
        ) : (
          <section className="entry-list" aria-label="资料条目">
            {filtered.map((note, i) => {
              const id = String(i + 1).padStart(3, '0');
              const minutes = getEstimatedReadingMinutes(note);
              return (
                <article
                  key={note.id}
                  className="index-entry"
                  data-selected={currentNote?.id === note.id}
                  onClick={() => onSelectNote(note.id)}
                  onDoubleClick={() => onOpenNote(note.id)}
                >
                  <b className="entry-id">{id}</b>
                  <div className="entry-copy">
                    <div className="entry-heading">
                      <h2>{note.title}</h2>
                      <span className="status"><i></i>{getStatusLabel(note.status)}</span>
                    </div>
                    <p>{note.summary}</p>
                    <div className="tag-row">
                      {tagsFor(note).map((t) => <span key={t.id}>{t.name}</span>)}
                    </div>
                  </div>
                  <div className="entry-meta">
                    <span>{formatDate(note.updatedAt)}</span>
                    <span>{getSourceTypeLabel(note.sourceType)}</span>
                  </div>
                  <span className="entry-reading"><b>{minutes}</b><small>MIN</small></span>
                  <button type="button" className="entry-action" onClick={(e) => { e.stopPropagation(); onOpenNote(note.id); }}>打开</button>
                </article>
              );
            })}
          </section>
        )}

        <footer className="pagination">
          <span className="pagination-info">第 1 / 1 页 · 共 {filtered.length} 条</span>
          <div className="pagination-size">
            <span>每页</span>
            <button type="button" data-active="true">10</button>
            <button type="button">20</button>
            <button type="button">50</button>
            <span>条</span>
          </div>
        </footer>
      </main>

      <aside className="index-inspector" data-open={inspectorOpen}>
        <button type="button" className="panel-close" aria-label="收起详情" onClick={() => setInspectorOpen(false)}>›</button>
        {currentNote ? (
          <>
            <button type="button" className="primary-button inspector-action" onClick={() => onOpenNote(currentNote.id)}>打开资料</button>
            <section className="inspector-fixed-section">
              <header><Icon name="file" /><h3>资料信息</h3></header>
              <dl className="inspector-record">
                <div><dt>标题</dt><dd>{currentNote.title}</dd></div>
                <div><dt>类型</dt><dd>Markdown 文档</dd></div>
                <div><dt>状态</dt><dd><span className="status"><i></i>{getStatusLabel(currentNote.status)}</span></dd></div>
                <div><dt>所在位置</dt><dd>{FOLDERS.find((f) => f.id === currentNote.folderId)?.name || '未分类'}</dd></div>
                <div><dt>字数</dt><dd>{(currentNote.rawMarkdown || '').replace(/\s/g, '').length}</dd></div>
                <div><dt>最后编辑</dt><dd>{formatDate(currentNote.updatedAt)}</dd></div>
                <div><dt>收藏</dt><dd>{currentNote.favorite ? '已收藏' : '未收藏'}</dd></div>
              </dl>
            </section>
            <section className="inspector-fixed-section">
              <header><Icon name="tag" /><h3>标签</h3></header>
              <div className="tag-row">
                {tagsFor(currentNote).map((t) => <span key={t.id}>{t.name}</span>)}
                <button type="button" className="tag-add">＋ 添加标签</button>
              </div>
            </section>
            <div className="summary-groups">
              <details className="inspector-disclosure">
                <summary><span><Icon name="link" /><b>关联笔记</b></span><span><small>{currentNote.internalLinks?.length || 0}</small><b aria-hidden="true">⌄</b></span></summary>
                <div className="disclosure-body">
                  {(currentNote.internalLinks || []).length > 0 ? (
                    <ol className="relations">
                      {currentNote.internalLinks.map((id) => {
                        const linked = NOTES.find((n) => n.id === id);
                        return linked ? <li key={id}><a onClick={() => onOpenNote(linked.id)}>{linked.id.slice(-3).toUpperCase()}</a>{linked.title}</li> : null;
                      })}
                    </ol>
                  ) : <span className="aside-empty-inline">暂无关联笔记</span>}
                </div>
              </details>
              <details className="inspector-disclosure" open>
                <summary><span><Icon name="list" /><b>内容大纲</b></span><span><small>3</small><b aria-hidden="true">⌄</b></span></summary>
                <div className="disclosure-body">
                  <ol className="outline preview-outline">
                    {extractHeadings(currentNote.rawMarkdown).map((h) => <li key={h}>{h}</li>)}
                  </ol>
                </div>
              </details>
              <details className="inspector-disclosure">
                <summary><span><Icon name="paperclip" /><b>附件</b></span><span><small>0</small><b aria-hidden="true">⌄</b></span></summary>
                <div className="disclosure-body">
                  <span className="aside-empty-inline">打开资料后可管理附件</span>
                </div>
              </details>
            </div>
          </>
        ) : (
          <div className="inspector-empty"><strong>未选择资料</strong><span>请从列表中选择一条资料。</span></div>
        )}
      </aside>
    </div>
  );
}

function extractHeadings(md) {
  return String(md || '').split('\n')
    .map((line) => /^(#{1,3})\s+(.+)$/.exec(line.trim()))
    .filter(Boolean)
    .map((m) => m[2]);
}

// ---------- 编辑器 ----------
function EditorView({ note, onBack, onClose, onSelectTab, activeTab, onOpenOverflow }) {
  const [openMenu, setOpenMenu] = useState(null);
  const [findOpen, setFindOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [viewMode, setViewMode] = useState('edit'); // edit / read / focus
  const [rightOpen, setRightOpen] = useState(true);
  const [activeNoteTabId, setActiveNoteTabId] = useState(note.id);

  const tags = (note.tagIds || []).map((tid) => TAGS.find((t) => t.id === tid)).filter(Boolean);

  if (!note) return null;

  return (
    <div className="editor-workspace-view">
      <div className="kb-workspace" data-right-hidden={!rightOpen}>
        <section className="editor-workspace">
          <div className="document-tabs">
            <button type="button" className="back-index" onClick={onBack} aria-label="返回资料索引">←</button>
            <div className="note-tabs" role="tablist">
              {NOTES.filter((n) => !n.deleted).slice(0, 3).map((n, i) => (
                <button
                  type="button"
                  key={n.id}
                  className="note-tab"
                  data-active={activeNoteTabId === n.id}
                  role="tab"
                  onClick={() => onSelectTab(n.id)}
                >
                  <span className="note-tab-label">{n.title}</span>
                  <span className="note-tab-close" onClick={(e) => { e.stopPropagation(); onClose(n.id); }} aria-label="关闭标签页">×</span>
                </button>
              ))}
            </div>
            <button type="button" className="note-tab-overflow-toggle" aria-label="更多标签页">
              <span>•••</span>
              <small>1</small>
            </button>
          </div>

          <div className="editor-menu-bar">
            <div className="editor-menu-shell">
              <div className="editor-menu-groups">
                {Object.entries(EDITOR_MENUS).map(([key, items]) => (
                  <div className="editor-menu-popover-host" key={key}>
                    <button
                      type="button"
                      className="editor-menu-text"
                      data-open={openMenu === key}
                      onClick={() => setOpenMenu((m) => (m === key ? null : key))}
                    >
                      {key === 'file' ? '文件' : key === 'paragraph' ? '段落' : key === 'edit' ? '编辑' : key === 'format' ? '格式' : '视图'}
                    </button>
                    {openMenu === key && (
                      <div className="editor-menu-popover" role="menu">
                        {items.map((it) => (
                          <button type="button" key={it} className="editor-menu-item">
                            <span>{it}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="editor-quick-tools">
                {QUICK_TOOLS.map((t, i) => (
                  <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <button type="button" aria-label={t.label} title={t.label} data-active={t.glyph === 'B' ? 'true' : 'false'}>{t.glyph}</button>
                    {i === 2 && <span className="editor-quick-divider" />}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {findOpen && (
            <div className="find-panel" role="search">
              <div className="find-row">
                <input type="search" placeholder="输入要查找的文字" />
                <button type="button">查找下一个</button>
                <button type="button" onClick={() => setFindOpen(false)}>关闭</button>
              </div>
              <div className="find-row">
                <input type="search" placeholder="替换为" />
                <button type="button">替换一次</button>
                <button type="button">全部替换</button>
              </div>
            </div>
          )}

          <div className="editor-shell" data-view-mode={viewMode}>
            <section className="document-head">
              <div className="document-meta-row">
                <div className="document-location">
                  <span className="breadcrumb">资料库　/　{FOLDERS.find((f) => f.id === note.folderId)?.name || '未分类'}　/　{note.id.slice(-3).toUpperCase()}</span>
                  <span className="status"><i></i>{getStatusLabel(note.status)}</span>
                </div>
                <div className="document-dates">
                  <span>创建　{formatDate(note.createdAt)}</span>
                  <span>编辑　{formatDate(note.updatedAt)}</span>
                </div>
              </div>
              <div className="document-title-row">
                <b className="document-id">001</b>
                <div className="document-title">
                  <input type="text" className="document-title-input" defaultValue={note.title} aria-label="资料标题" autoComplete="off" />
                  <div className="tag-row">
                    {tags.map((t) => <span key={t.id}>{t.name}</span>)}
                    <button type="button" className="tag-add">＋ 添加标签</button>
                  </div>
                </div>
              </div>
            </section>

            {sourceOpen ? (
              <pre className="source-editor">{note.rawMarkdown}</pre>
            ) : (
              <div className="editor-content">
                <article className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(note.rawMarkdown) }} />
              </div>
            )}
          </div>
        </section>

        {rightOpen && (
          <aside className="editor-inspector">
            <div className="aside-heading">
              <div>
                <b>资料边注</b>
                <span>MARGINALIA</span>
              </div>
              <button type="button" onClick={() => setRightOpen(false)} aria-label="收起边注">›</button>
            </div>
            <div className="aside-tabs" role="tablist">
              {[
                { id: 'info', label: '信息' },
                { id: 'outline', label: '大纲' },
                { id: 'concepts', label: '重点' },
                { id: 'ai', label: 'AI' }
              ].map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className="aside-tab"
                  data-active={activeTab === t.id}
                  onClick={() => onSelectTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="aside-panel-scroll">
              <div className="aside-content">
                {activeTab === 'info' && <AsideInfo note={note} />}
                {activeTab === 'outline' && <AsideOutline markdown={note.rawMarkdown} />}
                {activeTab === 'concepts' && <AsideConcepts />}
                {activeTab === 'ai' && <AsideAi />}
              </div>
            </div>
          </aside>
        )}
        {!rightOpen && (
          <button type="button" className="reopen-panel" onClick={() => setRightOpen(true)}>侧栏</button>
        )}
      </div>
    </div>
  );
}

function AsideInfo({ note }) {
  const tags = (note.tagIds || []).map((tid) => TAGS.find((t) => t.id === tid)).filter(Boolean);
  return (
    <>
      <section className="inspector-fixed-section">
        <header><Icon name="file" /><h3>资料信息</h3></header>
        <dl className="inspector-record">
          <div><dt>标题</dt><dd>{note.title}</dd></div>
          <div><dt>路径</dt><dd>{FOLDERS.find((f) => f.id === note.folderId)?.name || '未分类'}</dd></div>
          <div><dt>字数</dt><dd>{(note.rawMarkdown || '').replace(/\s/g, '').length}</dd></div>
          <div><dt>更新时间</dt><dd>{formatDate(note.updatedAt)}</dd></div>
          <div><dt>创建时间</dt><dd>{formatDate(note.createdAt)}</dd></div>
          <div><dt>收藏状态</dt><dd>{note.favorite ? '已收藏' : '未收藏'}</dd></div>
        </dl>
      </section>
      <section className="inspector-fixed-section">
        <header><Icon name="tag" /><h3>标签</h3></header>
        <div className="tag-row">
          {tags.map((t) => <span key={t.id}>{t.name}</span>)}
          <button type="button" className="tag-add">＋ 添加标签</button>
        </div>
      </section>
      <div className="summary-groups">
        <details className="inspector-disclosure">
          <summary><span><Icon name="link" /><b>关联笔记</b></span><span><small>{note.internalLinks?.length || 0}</small><b aria-hidden="true">⌄</b></span></summary>
          <div className="disclosure-body">
            <span className="aside-empty-inline">{(note.internalLinks || []).length || '暂无关联笔记'}</span>
          </div>
        </details>
        <details className="inspector-disclosure">
          <summary><span><Icon name="paperclip" /><b>附件</b></span><span><small>0</small><b aria-hidden="true">⌄</b></span></summary>
          <div className="disclosure-body">
            <span className="aside-empty-inline">打开资料后可管理附件</span>
          </div>
        </details>
      </div>
    </>
  );
}

function AsideOutline({ markdown }) {
  const lines = String(markdown || '').split('\n');
  const rows = [];
  lines.forEach((line) => {
    const m = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (m) rows.push({ depth: m[1].length, title: m[2] });
  });
  return (
    <div>
      <div className="outline-panel-head">
        <span>DOCUMENT MAP</span>
        <strong>{rows.length} 个标题</strong>
      </div>
      <div>
        {rows.length === 0 ? <span className="aside-empty-inline">暂无大纲</span> : rows.map((r, i) => (
          <div className={`outline-row-ui level-h${r.depth}`} data-depth={r.depth - 1} key={i}>
            <button type="button" className="outline-toggle-ui" aria-label="折叠"><span className="outline-toggle-glyph"><Icon name="chevron" /></span></button>
            <button type="button" className="outline-jump">
              <span className="outline-item-level">H{r.depth}</span>
              <strong>{r.title}</strong>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AsideConcepts() {
  return (
    <div>
      <div className="annotation-card">
        <blockquote>一个好的读者，应该既是提问者，也是回答者。</blockquote>
        <div className="annotation-card-meta"><span>第 1 章 · 段 4</span></div>
        <div className="annotation-card-actions">
          <button type="button">定位</button>
          <button type="button">删除</button>
        </div>
      </div>
    </div>
  );
}

function AsideAi() {
  return (
    <div className="ai-placeholder">
      <span>AI 辅助区将在右侧面板内继续扩展。</span>
      <button type="button">总结当前资料</button>
      <button type="button">提取知识点</button>
    </div>
  );
}

// ---------- 状态栏 ----------
function StatusBar({ note, onToggleSource, onToggleAside, sourceOpen, asideOpen }) {
  return (
    <footer className="status-bar">
      <div className="status-group">
        <button type="button" className="status-save" data-state="saved">
          <i></i>已自动保存
        </button>
        <span className="status-current">{note?.title || '未选择资料'}</span>
        <span className="status-inline">笔记 {NOTES.length}</span>
        <span className="status-inline">目录 {FOLDERS.length}</span>
      </div>
      <div className="status-group">
        <span className="status-inline">字数 {(note?.rawMarkdown || '').replace(/\s/g, '').length}</span>
        <span className="status-inline">行数 {(note?.rawMarkdown || '').split('\n').length}</span>
        <button type="button" className="status-action" data-active={sourceOpen} onClick={onToggleSource}>源码</button>
        <button type="button" className="status-action" data-active={asideOpen} onClick={onToggleAside}>边注</button>
        <span className="status-inline">UTF-8</span>
        <span className="status-inline">本地优先</span>
      </div>
    </footer>
  );
}

// ---------- 简易 Markdown → HTML（demo 用，仅支持基础块） ----------
function renderMarkdown(md) {
  const lines = String(md || '').split('\n');
  const out = [];
  let inCode = false;
  let codeBuf = [];
  let inList = false;
  let inQuote = false;
  let quoteBuf = [];

  const flushList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  const flushQuote = () => { if (inQuote) { out.push(`<blockquote>${quoteBuf.join('<br>')}</blockquote>`); inQuote = false; quoteBuf = []; } };

  for (const line of lines) {
    if (line.startsWith('```')) {
      flushList(); flushQuote();
      if (!inCode) { inCode = true; codeBuf = []; } else { out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`); inCode = false; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) { flushList(); flushQuote(); out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`); continue; }
    if (/^>\s+/.test(line)) { flushList(); inQuote = true; quoteBuf.push(inlineMd(line.replace(/^>\s+/, ''))); continue; } else { flushQuote(); }
    if (/^-\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(line.replace(/^-\s+/, ''))}</li>`);
      continue;
    } else { flushList(); }
    if (line.trim() === '') continue;
    out.push(`<p>${inlineMd(line)}</p>`);
  }
  flushList(); flushQuote();
  return out.join('\n');
}

function inlineMd(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

// ---------- 顶层 App ----------
export default function App() {
  const [screen, setScreen] = useState('index');
  const [selectedNoteId, setSelectedNoteId] = useState(NOTES[0].id);
  const [asideTab, setAsideTab] = useState('info');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [asideOpen, setAsideOpen] = useState(true);
  const [leftHidden, setLeftHidden] = useState(false);

  const currentNote = NOTES.find((n) => n.id === selectedNoteId) || NOTES[0];

  const openEditor = (id) => { setSelectedNoteId(id); setScreen('editor'); };
  const backToIndex = () => setScreen('index');

  return (
    <div className="knowra-production-shell" data-screen={screen} data-left-hidden={leftHidden}>
      {!leftHidden && (
        <LeftRail
          activeNoteId={selectedNoteId}
          onSelectNote={setSelectedNoteId}
          onBackToIndex={backToIndex}
        />
      )}
      <div className="workspace-main">
        <div className="workspace-stage">
          {screen === 'index' ? (
            <IndexView
              notes={NOTES}
              selectedNoteId={selectedNoteId}
              onSelectNote={setSelectedNoteId}
              onOpenNote={openEditor}
              onBack={backToIndex}
            />
          ) : (
            <EditorView
              note={currentNote}
              onBack={backToIndex}
              onClose={() => setScreen('index')}
              activeTab={asideTab}
              onSelectTab={setAsideTab}
            />
          )}
        </div>
        {screen === 'editor' && (
          <StatusBar
            note={currentNote}
            sourceOpen={sourceOpen}
            asideOpen={asideOpen}
            onToggleSource={() => setSourceOpen((v) => !v)}
            onToggleAside={() => setAsideOpen((v) => !v)}
          />
        )}
      </div>
    </div>
  );
}
