import { useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowLeft, ArrowUpRight, BookmarkSimple, CaretDown, CaretLeft, CaretRight,
  Check, Clock, Code, DotsThree, FileText, FolderPlus,
  FolderSimple, GearSix, LinkSimple, ListBullets, MagnifyingGlass, NotePencil,
  Paperclip, Plus, Quotes, SidebarSimple, SlidersHorizontal, Sparkle,
  Tag, TextB, TextItalic, X,
} from '@phosphor-icons/react';

const modules = [
  { id: '01', name: '资料库', english: 'LIBRARY' },
  { id: '02', name: '知识库', english: 'KNOWLEDGE' },
  { id: '03', name: '试题库', english: 'QUESTION BANK' },
  { id: '04', name: '任务与待办', english: 'TASKS' },
  { id: '05', name: 'AI 助手', english: 'AI ASSISTANT' },
];

const seedItems = [
  { id: '001', code: 'A1', title: '构建个人知识体系', summary: '从目标设定、信息收集、知识加工到体系构建的完整方法论，建立可持续迭代的个人知识系统。', date: '2026.07.11', folderId: 'research', tags: ['知识管理', '方法论', '系统思维', '元认知'], status: '进行中', saved: true },
  { id: '002', code: 'A2', title: '如何阅读一本书', summary: '系统化阅读的方法与技巧，提升理解力、批判性思维与知识留存率。', date: '2026.07.10', folderId: 'research', tags: ['阅读', '学习方法', '认知'], status: '已删除', deleted: true, saved: false },
  { id: '003', code: 'B1', title: '第二大脑搭建指南', summary: '基于 PARA 方法与连接主义原理，构建可持续使用的第二大脑，实现知识的高效存储与调用。', date: '2026.07.08', folderId: 'knowledge', tags: ['知识管理', 'PARA', '数字笔记', '自动化'], status: '进行中', saved: true },
  { id: '004', code: 'B2', title: '卡片笔记写作法', summary: '通过原子化写作与卡片连接，积累知识资产，激发创意与深度思考。', date: '2026.07.04', folderId: 'writing', tags: ['卡片笔记', '写作', '知识创作', '费曼技巧'], status: '进行中', saved: false },
  { id: '015', code: 'B2', title: '费曼学习法', summary: '通过输出检验理解，用简单语言重构复杂概念，形成可教的知识。', date: '2026.06.28', folderId: 'knowledge', tags: ['学习方法', '输出', '刻意练习'], status: '进行中', saved: true },
  { id: '028', code: 'C1', title: '信息筛选与评估：从来源可信度到证据分级的长标题压力测试', summary: '用来源、时间、证据等级和交叉验证四个维度，建立适用于研究资料的筛选机制。', date: '2026.06.19', folderId: 'research-methods', tags: ['研究方法', '信息素养'], status: '待整理', saved: false },
  { id: '032', code: 'C1', title: '知识更新与迭代', summary: '为知识条目建立复查节奏、变更记录与失效提醒。', date: '2026.06.12', folderId: 'knowledge', tags: ['知识管理', '复盘'], status: '已完成', saved: false },
];

const seedFolders = [
  { id: 'research', name: '研究资料', english: 'RESEARCH', children: ['001', '002'], depth: 0 },
  { id: 'research-methods', name: '研究方法与证据评估', english: 'METHODS', children: ['028'], depth: 1 },
  { id: 'knowledge', name: '知识管理', english: 'KNOWLEDGE', children: ['003', '015', '032'], depth: 0 },
  { id: 'writing', name: '写作与表达', english: 'WRITING', children: ['004'], depth: 0 },
  { id: 'uncategorized', name: '未分类', english: 'UNCATEGORIZED', children: [], depth: 0 },
];

const secondaryDirectories = {
  '02': ['全部知识', '知识图谱', '知识点', '关联资料'],
  '03': ['全部试题', '错题本', '收藏题目', '题集'],
  '04': ['全部任务', '今日待办', '项目', '已完成'],
  '05': ['对话记录', '提示词库', '生成内容'],
};

const paragraphs = [
  '从目标设定、信息收集、知识加工到体系构建的完整方法论，建立可持续迭代的个人知识系统。',
  '知识体系不是信息的堆砌，而是经过筛选、连接与抽象后的网络。它帮助我们更好地理解世界，也让知识在需要时被有效调用。',
  '构建知识体系的过程，本质上是不断追问“为什么”的过程。通过持续的自我对话，把碎片信息转化为可迁移的知识模型。',
  '体系需要定期维护与更新。新知识的加入、旧知识的修正与淘汰，保证了系统的生命力与适应性。',
  '工具只负责降低记录与检索的阻力，真正决定体系质量的仍然是筛选标准、连接方式与持续复盘。',
  '每次复盘都应留下变更依据：哪些结论被证据加强，哪些假设已经失效，以及下一步需要补充哪些资料。',
];

const editorMenus = {
  文件: [
    ['new-note', '新建资料', '⌘ N'], ['new-folder', '新建文件夹', '⇧⌘ N'], ['import', '导入 Markdown', ''],
    ['save', '保存', '⌘ S'], ['export', '导出 Markdown', ''], ['favorite', '收藏 / 取消收藏', ''], ['delete', '移到回收站', ''],
  ],
  编辑: [['undo', '撤销', '⌘ Z'], ['redo', '重做', '⇧⌘ Z'], ['find', '查找', '⌘ F'], ['replace', '查找并替换', '⌥⌘ F'], ['select-all', '全选', '⌘ A']],
  段落: [['paragraph', '正文', ''], ['heading-1', '一级标题', ''], ['heading-2', '二级标题', ''], ['bullet', '无序列表', ''], ['ordered', '有序列表', ''], ['task-list', '任务列表', ''], ['quote', '引用', ''], ['table', '插入表格', '']],
  格式: [['bold', '加粗', '⌘ B'], ['italic', '斜体', '⌘ I'], ['highlight', '高亮', ''], ['code', '行内代码', ''], ['link', '内部链接', ''], ['image', '插入图片', '']],
  视图: [['edit', '编辑模式', ''], ['read', '阅读模式', ''], ['focus', '专注模式', ''], ['source', 'Markdown 源码', ''], ['left', '显示 / 隐藏左栏', ''], ['right', '显示 / 隐藏右栏', '']],
};

export function App() {
  const importInputRef = useRef(null);
  const [view, setView] = useState('index');
  const [activeModuleId, setActiveModuleId] = useState('01');
  const [activeLibraryView, setActiveLibraryView] = useState('all');
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(['research', 'research-methods', 'knowledge', 'writing']);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('全部条目');
  const [activeId, setActiveId] = useState('001');
  const [openTabs, setOpenTabs] = useState(['001', '003', '004', '028']);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [modalMode, setModalMode] = useState(null);
  const [items, setItems] = useState(seedItems);
  const [folders, setFolders] = useState(seedFolders);
  const [notice, setNotice] = useState('已保存');
  const [activeMenu, setActiveMenu] = useState(null);
  const [asideTab, setAsideTab] = useState('info');
  const [viewMode, setViewMode] = useState('edit');
  const [findOpen, setFindOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState(false);
  const [leftVisible, setLeftVisible] = useState(true);
  const [selectedTag, setSelectedTag] = useState('全部');

  const activeItem = items.find((item) => item.id === activeId) || items.find((item) => !item.deleted) || items[0];
  const filtered = useMemo(() => items.filter((item) => {
    const folderMatch = !activeFolderId || item.folderId === activeFolderId;
    const queryMatch = `${item.title}${item.summary}${item.tags.join('')}`.toLowerCase().includes(query.toLowerCase());
    const recycleView = activeLibraryView === 'archive' || tab === '回收站';
    const viewMatch = recycleView ? item.deleted : !item.deleted && (activeLibraryView !== 'favorites' || item.saved);
    const tabMatch = tab === '全部条目' || tab === '我创建的' || (tab === '已收藏' ? item.saved : tab === '回收站' ? item.deleted : true);
    const tagMatch = selectedTag === '全部' || item.tags.includes(selectedTag);
    return folderMatch && queryMatch && viewMatch && tabMatch && tagMatch;
  }), [activeFolderId, activeLibraryView, items, query, selectedTag, tab]);

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice('已保存'), 1600);
  }

  function openItem(id) {
    setActiveId(id);
    setOpenTabs((current) => current.includes(id) ? current : [...current, id].slice(-6));
    setView('editor');
  }

  function openModule(id) {
    setActiveModuleId(id);
    setView('index');
    setActiveFolderId(null);
    setActiveLibraryView('all');
  }

  function openLibraryView(nextView) {
    setActiveLibraryView(nextView);
    setActiveFolderId(null);
    setView('index');
    if (nextView === 'archive') setTab('回收站');
    else if (tab === '回收站') setTab('全部条目');
  }

  function openFolder(folderId) {
    setActiveFolderId(folderId);
    setActiveLibraryView('folder');
    setView('index');
    setExpandedFolders((current) => current.includes(folderId) ? current : [...current, folderId]);
  }

  function closeTab(id) {
    const next = openTabs.filter((tabId) => tabId !== id);
    setOpenTabs(next);
    if (id === activeId) {
      if (next.length) setActiveId(next[next.length - 1]);
      else setView('index');
    }
  }

  function addEntity(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (modalMode === 'folder') {
      const id = `folder-${Date.now()}`;
      setFolders((current) => [...current, { id, name: data.get('title'), english: 'NEW FOLDER', children: [], depth: 0 }]);
      setExpandedFolders((current) => [...current, id]);
      setModalMode(null);
      flash('文件夹已创建');
      return;
    }
    const id = String(Math.max(...items.map((item) => Number(item.id))) + 1).padStart(3, '0');
    const next = { id, code: 'N1', title: data.get('title'), summary: data.get('summary') || '新资料的摘要将在这里显示。', date: '2026.07.15', folderId: 'uncategorized', tags: ['新资料'], status: '待整理', deleted: false, saved: false };
    setItems((current) => [next, ...current]);
    setModalMode(null);
    setActiveId(id);
    setOpenTabs((current) => [...current, id].slice(-6));
    setView('editor');
  }

  function handleEditorCommand(command) {
    setActiveMenu(null);
    if (command === 'new-note') return setModalMode('note');
    if (command === 'new-folder') return setModalMode('folder');
    if (command === 'import') return importInputRef.current?.click();
    if (command === 'find' || command === 'replace') return setFindOpen(true);
    if (command === 'save') return flash('保存完成');
    if (command === 'export') return flash('已生成 Markdown 导出');
    if (command === 'favorite') {
      setItems((current) => current.map((item) => item.id === activeId ? { ...item, saved: !item.saved } : item));
      return flash(activeItem.saved ? '已取消收藏' : '已加入收藏');
    }
    if (command === 'delete') {
      setItems((current) => current.map((item) => item.id === activeId ? { ...item, deleted: true, status: '已删除' } : item));
      setView('index');
      setActiveLibraryView('archive');
      setTab('回收站');
      return flash('已移到回收站');
    }
    if (['edit', 'read', 'focus'].includes(command)) setViewMode(command);
    if (command === 'source') setSourceMode((current) => !current);
    if (command === 'left') setLeftVisible((current) => !current);
    if (command === 'right') setInspectorOpen((current) => !current);
    if (!['edit', 'read', 'focus', 'source', 'left', 'right'].includes(command)) flash('已执行格式命令');
  }

  function restoreItem(id) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, deleted: false, status: '待整理' } : item));
    flash('资料已恢复');
  }

  const shellClass = [
    'app-shell', view === 'editor' ? 'editor-mode' : 'index-mode', inspectorOpen ? '' : 'inspector-closed',
    leftVisible ? '' : 'rail-closed', viewMode === 'focus' ? 'focus-mode' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClass} onClick={(event) => !event.target.closest('.menu-cluster') && setActiveMenu(null)}>
      {leftVisible && <Rail
        items={items} folders={folders} activeModuleId={activeModuleId} openModule={openModule}
        activeLibraryView={activeLibraryView} openLibraryView={openLibraryView}
        activeFolderId={activeFolderId} openFolder={openFolder}
        expandedFolders={expandedFolders} setExpandedFolders={setExpandedFolders}
        activeId={activeId} openItem={openItem} setActiveModuleId={setActiveModuleId} setView={setView}
        onNewFolder={() => setModalMode('folder')}
      />}
      {view === 'index' ? <IndexView
        activeModuleId={activeModuleId} activeLibraryView={activeLibraryView} activeFolderId={activeFolderId}
        activeItem={activeItem} activeId={activeId} filtered={filtered} query={query} setQuery={setQuery}
        tab={tab} setTab={setTab} openItem={openItem} setActiveId={setActiveId}
        inspectorOpen={inspectorOpen} setInspectorOpen={setInspectorOpen} setModalMode={setModalMode}
        folders={folders} selectedTag={selectedTag} setSelectedTag={setSelectedTag} restoreItem={restoreItem}
      /> : <EditorView
        items={items} activeItem={activeItem} activeId={activeId} openTabs={openTabs} setActiveId={setActiveId}
        closeTab={closeTab} setView={setView} inspectorOpen={inspectorOpen} setInspectorOpen={setInspectorOpen}
        notice={notice} flash={flash} activeMenu={activeMenu} setActiveMenu={setActiveMenu}
        onCommand={handleEditorCommand} asideTab={asideTab} setAsideTab={setAsideTab}
        viewMode={viewMode} setViewMode={setViewMode} findOpen={findOpen} setFindOpen={setFindOpen}
        sourceMode={sourceMode} folders={folders} onNew={() => setModalMode('note')}
      />}
      {modalMode && <EntityModal mode={modalMode} onClose={() => setModalMode(null)} onSubmit={addEntity} />}
      <input ref={importInputRef} className="visually-hidden" type="file" accept=".md,.markdown,text/markdown" onChange={() => flash('Markdown 已载入（原型）')} />
    </div>
  );
}

function Brand({ onClick }) {
  return <button className="brand" onClick={onClick} aria-label="返回全局索引"><span className="brand-mark">K</span><span><strong>知境 · Knowra</strong><small>知识管理与研究系统</small></span></button>;
}

function Rail({ items, folders, activeModuleId, openModule, activeLibraryView, openLibraryView, activeFolderId, openFolder, expandedFolders, setExpandedFolders, activeId, openItem, setActiveModuleId, setView, onNewFolder }) {
  const isLibrary = activeModuleId === '01';
  return <aside className={`rail ${activeModuleId ? 'module-rail' : 'default-rail'}`}>
    <Brand onClick={() => { setActiveModuleId(null); setView('index'); }} />
    {!activeModuleId ? <nav className="module-list" aria-label="产品模块">
      {modules.map((module) => <button key={module.id} className="module-button" onClick={() => openModule(module.id)}><b>{module.id}</b><span><strong>{module.name}</strong><small>{module.english}</small></span></button>)}
    </nav> : isLibrary ? <LibraryDirectory
      items={items} folders={folders} activeLibraryView={activeLibraryView} openLibraryView={openLibraryView}
      activeFolderId={activeFolderId} openFolder={openFolder} expandedFolders={expandedFolders}
      setExpandedFolders={setExpandedFolders} activeId={activeId} openItem={openItem} onNewFolder={onNewFolder}
    /> : <ModuleDirectory moduleId={activeModuleId} setView={setView} />}
    {activeModuleId && <nav className="module-switcher" aria-label="切换产品模块">
      {modules.map((module) => <button key={module.id} title={module.name} className={activeModuleId === module.id ? 'active' : ''} onClick={() => openModule(module.id)}>{module.id}</button>)}
    </nav>}
    <button className="settings-button"><GearSix size={18} />设置</button>
  </aside>;
}

function LibraryDirectory({ items, folders, activeLibraryView, openLibraryView, activeFolderId, openFolder, expandedFolders, setExpandedFolders, activeId, openItem, onNewFolder }) {
  const activeCount = items.filter((item) => !item.deleted).length;
  return <div className="library-directory">
    <button className="library-label" onClick={() => openLibraryView('all')}><b className="library-id">01</b><span className="library-copy"><strong>资料库</strong><small>LIBRARY</small></span><ArrowUpRight size={19} /></button>
    <div className="directory-scroll">
      <div className="directory-group">
        <span className="directory-group-label">内容　CONTENT</span>
        <button className={`directory-entry ${activeLibraryView === 'all' ? 'active' : ''}`} onClick={() => openLibraryView('all')}><FileText size={17} /><span>全部资料</span><b>{activeCount}</b></button>
        <button className={`directory-entry ${activeLibraryView === 'folder' && !activeFolderId ? 'active' : ''}`} onClick={() => openLibraryView('folder')}><FolderSimple size={17} /><span>文件夹</span><b>{folders.length}</b></button>
      </div>
      <div className="folder-tree">
        <div className="tree-heading"><span className="directory-group-label">文件夹　FOLDERS</span><button onClick={onNewFolder} aria-label="新建文件夹"><FolderPlus size={16} /></button></div>
        {folders.map((folder) => <FolderNode key={folder.id} folder={folder} items={items} expanded={expandedFolders.includes(folder.id)} activeFolderId={activeFolderId} activeId={activeId} onToggle={() => setExpandedFolders((current) => current.includes(folder.id) ? current.filter((id) => id !== folder.id) : [...current, folder.id])} onFolderClick={() => openFolder(folder.id)} onFileClick={openItem} />)}
      </div>
      <div className="directory-group directory-views">
        <span className="directory-group-label">视图　VIEWS</span>
        <button className={`directory-entry ${activeLibraryView === 'recent' ? 'active' : ''}`} onClick={() => openLibraryView('recent')}><Clock size={17} /><span>最近编辑</span><b>{Math.min(activeCount, 15)}</b></button>
        <button className={`directory-entry ${activeLibraryView === 'favorites' ? 'active' : ''}`} onClick={() => openLibraryView('favorites')}><BookmarkSimple size={17} /><span>收藏</span><b>{items.filter((item) => item.saved && !item.deleted).length}</b></button>
        <button className={`directory-entry ${activeLibraryView === 'archive' ? 'active' : ''}`} onClick={() => openLibraryView('archive')}><Archive size={17} /><span>回收站</span><b>{items.filter((item) => item.deleted).length}</b></button>
      </div>
    </div>
  </div>;
}

function FolderNode({ folder, items, expanded, activeFolderId, activeId, onToggle, onFolderClick, onFileClick }) {
  return <div className={`folder-node depth-${folder.depth || 0} ${activeFolderId === folder.id ? 'active' : ''}`}>
    <div className="folder-row"><button className="folder-toggle" onClick={onToggle} aria-label={expanded ? '收起文件夹' : '展开文件夹'}><CaretRight className={expanded ? 'expanded' : ''} size={13} /></button><button className="folder-open" onClick={onFolderClick}><FolderSimple size={17} /><span>{folder.name}</span><b>{folder.children.length}</b></button><button className="folder-more" aria-label="文件夹操作"><DotsThree size={16} /></button></div>
    {expanded && <div className="folder-children">{folder.children.length ? folder.children.map((itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      return item && !item.deleted ? <button key={itemId} className={`file-row ${activeId === itemId ? 'active' : ''}`} onClick={() => onFileClick(itemId)}><FileText size={15} /><span>{item.title}</span></button> : null;
    }) : <span className="folder-empty">暂无资料</span>}</div>}
  </div>;
}

function ModuleDirectory({ moduleId, setView }) {
  const module = modules.find((item) => item.id === moduleId);
  return <div className="simple-directory"><button className="library-label" onClick={() => setView('index')}><b className="library-id">{module?.id}</b><span className="library-copy"><strong>{module?.name}</strong><small>{module?.english}</small></span><ArrowUpRight size={19} /></button><div className="directory-scroll"><div className="directory-group-label">目录　DIRECTORY</div>{(secondaryDirectories[moduleId] || []).map((entry, index) => <button className={`directory-entry ${index === 0 ? 'active' : ''}`} key={entry}><FileText size={16} /><span>{entry}</span><b>{String(index + 1).padStart(2, '0')}</b></button>)}</div></div>;
}

function IndexView({ activeModuleId, activeLibraryView, activeFolderId, activeItem, activeId, filtered, query, setQuery, tab, setTab, openItem, setActiveId, inspectorOpen, setInspectorOpen, setModalMode, folders, selectedTag, setSelectedTag, restoreItem }) {
  const libraryActive = activeModuleId === '01';
  const activeFolder = folders.find((folder) => folder.id === activeFolderId);
  const activeModule = modules.find((module) => module.id === activeModuleId);
  const title = libraryActive ? '资料库' : activeModule?.name || '知识索引';
  const subtitle = libraryActive ? 'LIBRARY INDEX' : activeModule?.english || 'KNOWLEDGE INDEX';
  const scopeLabel = activeFolder?.name || (activeLibraryView === 'recent' ? '最近编辑' : activeLibraryView === 'favorites' ? '收藏资料' : activeLibraryView === 'archive' ? '回收站' : '全部资料');
  return <>
    <main className="workspace index-workspace">
      <header className="masthead">
        <div className="masthead-title"><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="scope-summary"><span>当前范围　SCOPE</span><strong>{scopeLabel}</strong><div><b>资料 {filtered.length}</b><b>文件夹 {folders.length}</b><b>最近保存 14:32</b></div></div>
        <button className="primary-button" onClick={() => setModalMode('note')}><Plus size={29} />新建资料</button>
      </header>
      <nav className="content-tabs" aria-label="资料筛选">{['全部条目', '我创建的', '已收藏', '回收站'].map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}<b>{name === '全部条目' ? '444' : name === '我创建的' ? '328' : name === '已收藏' ? '23' : '312'}</b></button>)}</nav>
      <div className="filter-row"><button>类型　全部 <CaretDown /></button><button>状态　全部 <CaretDown /></button><button onClick={() => setSelectedTag(selectedTag === '全部' ? '知识管理' : '全部')}>标签　{selectedTag} <CaretDown /></button><button>时间　最新编辑 <CaretDown /></button><label><MagnifyingGlass size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、标签、正文" /></label></div>
      <section className="entry-list" aria-label="资料条目">{filtered.map((item) => <article key={item.id} className={activeId === item.id ? 'selected' : ''} onClick={() => setActiveId(item.id)} onDoubleClick={() => !item.deleted && openItem(item.id)}>
        <b className="entry-id">{item.id}</b><div className="entry-copy"><div className="entry-heading"><h2>{item.title}</h2><span className={`status status-${item.deleted ? 'deleted' : 'active'}`}><i />{item.status}</span></div><p>{item.summary}</p><div className="tag-row">{item.tags.map((tagName) => <span key={tagName}>{tagName}</span>)}</div></div><div className="entry-meta"><span>{item.date}</span><span>文档</span></div><b className="entry-code">{item.code}</b><button className="entry-action" onClick={(event) => { event.stopPropagation(); item.deleted ? restoreItem(item.id) : openItem(item.id); }}>{item.deleted ? '恢复' : '打开'}</button>
      </article>)}{!filtered.length && <div className="empty-state"><MagnifyingGlass size={34} /><b>没有找到匹配条目</b><span>可以清除搜索或切换左侧视图。</span><button onClick={() => { setQuery(''); setSelectedTag('全部'); }}>清除筛选</button></div>}</section>
      <footer className="pagination"><span>当前 {filtered.length} 条 · 原项目数据接入后显示真实总数</span><div><CaretLeft /><button className="active">1</button><button>2</button><button>3</button><span>…</span><button>45</button><CaretRight /></div><button>每页 10 条 <CaretDown /></button></footer>
    </main>
    {inspectorOpen ? <IndexInspector item={activeItem} onClose={() => setInspectorOpen(false)} onOpen={() => openItem(activeItem.id)} /> : <button className="reopen-panel" onClick={() => setInspectorOpen(true)}><SlidersHorizontal size={18} />详情</button>}
  </>;
}

function IndexInspector({ item, onClose, onOpen }) {
  return <aside className="inspector index-inspector">
    <button className="panel-close" onClick={onClose} aria-label="收起详情"><CaretRight size={17} /></button>
    <button className="primary-button inspector-action" onClick={onOpen}><NotePencil size={25} />打开资料</button>
    <InspectorFixedSection icon={<FileText size={16} />} title="资料信息">
      <dl className="inspector-record"><div><dt>标题</dt><dd>{item.title}</dd></div><div><dt>类型</dt><dd>Markdown 文档</dd></div><div><dt>状态</dt><dd><span className={`status status-${item.deleted ? 'deleted' : 'active'}`}><i />{item.status}</span></dd></div><div><dt>所在位置</dt><dd>资料库 / 研究资料</dd></div><div><dt>字数</dt><dd>862</dd></div><div><dt>最后编辑</dt><dd>{item.date} 14:32</dd></div><div><dt>收藏</dt><dd>{item.saved ? '已收藏' : '未收藏'}</dd></div></dl>
    </InspectorFixedSection>
    <InspectorFixedSection icon={<Tag size={16} />} title="标签">
      <div className="selected inspector-tag-wrap"><div className="tag-row">{item.tags.map((tagName) => <span key={tagName}>{tagName}</span>)}</div></div>
      <button className="quiet-action">＋ 添加标签</button>
    </InspectorFixedSection>
    <div className="summary-groups">
      <InspectorDisclosure icon={<LinkSimple size={16} />} title="关联笔记" count="4"><RelationList /><button className="text-action">查看全部 12 条</button></InspectorDisclosure>
      <InspectorDisclosure icon={<ListBullets size={16} />} title="内容大纲" count="4"><ol className="outline preview-outline"><li>为什么需要知识体系</li><li>知识体系的底层模型</li><li>构建步骤与操作方法</li><li>迭代与持续优化</li></ol></InspectorDisclosure>
      <InspectorDisclosure icon={<Paperclip size={16} />} title="附件" count="1"><button className="resource-row"><Paperclip size={16} /><span>knowledge-map.png</span><small>已引用</small></button></InspectorDisclosure>
    </div>
  </aside>;
}

function EditorView({ items, activeItem, activeId, openTabs, setActiveId, closeTab, setView, inspectorOpen, setInspectorOpen, notice, flash, activeMenu, setActiveMenu, onCommand, asideTab, setAsideTab, viewMode, setViewMode, findOpen, setFindOpen, sourceMode, folders, onNew }) {
  const activeFolder = folders.find((folder) => folder.id === activeItem.folderId);
  return <>
    <main className="editor-workspace">
      <header className="document-tabs"><button className="back-index" onClick={() => setView('index')} aria-label="返回资料索引"><ArrowLeft size={18} /></button><div className="open-tabs">{openTabs.map((id) => { const item = items.find((entry) => entry.id === id); return item ? <div key={id} className={`document-tab ${activeId === id ? 'active' : ''}`}><button onClick={() => setActiveId(id)} title={item.title}><span>{item.title}</span></button><button onClick={() => closeTab(id)} aria-label={`关闭 ${item.title}`}><X size={13} /></button></div> : null; })}<button className="add-tab" onClick={onNew} aria-label="新建资料"><Plus size={19} /></button></div><div className="top-actions"><button onClick={() => setFindOpen(true)}><MagnifyingGlass size={18} />搜索</button></div></header>
      <EditorMenuBar activeMenu={activeMenu} setActiveMenu={setActiveMenu} onCommand={onCommand} />
      {findOpen && <FindPanel onClose={() => setFindOpen(false)} />}
      <div className="editor-scroll-area">
        <section className="document-head"><div className="document-meta-row"><div className="document-location"><span className="breadcrumb">资料库　/　{activeFolder?.name || '未分类'}　/　{activeItem.id}</span><span className="status status-active"><i />{activeItem.status}</span></div><div className="document-dates"><span>创建　2026-07-11</span><span>编辑　2026-07-15 14:32</span></div></div><div className="document-title-row"><b className="document-id">{activeItem.id}</b><div className="document-title"><h1>{activeItem.title}</h1><div className="tag-row">{activeItem.tags.map((tagName) => <span key={tagName}>{tagName}</span>)}<button>＋ 添加标签</button></div></div></div></section>
        {sourceMode ? <article className="editor-content"><pre className="source-editor">{`# ${activeItem.title}\n\n${paragraphs.map((paragraph, index) => `${index + 1}. ${paragraph}`).join('\n\n')}\n\n[[003 第二大脑搭建指南]]`}</pre></article> : <article className={`editor-content ${viewMode === 'read' ? 'reading' : ''}`} contentEditable={viewMode === 'edit'} suppressContentEditableWarning onInput={() => flash('正在保存…')}>{paragraphs.map((paragraph, index) => <section className="editor-paragraph" key={paragraph}><b contentEditable={false}>{index + 1}</b><p>{paragraph}</p><a contentEditable={false} href="#related">[{index + 1}]</a></section>)}</article>}
      </div>
      <footer className="statusbar"><div><span>字数　862</span><span>字符　1,342</span></div><div><span>{notice}　14:32:10</span><span className="status status-active"><i />{activeItem.status}</span></div><div><button className={viewMode === 'focus' ? 'active' : ''} onClick={() => setViewMode('focus')}>专注</button><button className={viewMode === 'read' ? 'active' : ''} onClick={() => setViewMode('read')}>阅读</button><button className={viewMode === 'edit' ? 'active' : ''} onClick={() => setViewMode('edit')}><NotePencil size={15} />编辑</button></div></footer>
    </main>
    {inspectorOpen ? <EditorInspector item={activeItem} activeTab={asideTab} setActiveTab={setAsideTab} onClose={() => setInspectorOpen(false)} /> : <button className="reopen-panel editor-reopen" onClick={() => setInspectorOpen(true)}><SidebarSimple size={18} />侧栏</button>}
  </>;
}

function EditorMenuBar({ activeMenu, setActiveMenu, onCommand }) {
  return <nav className="editor-menu-bar" aria-label="编辑器菜单"><div className="editor-menu-groups">{Object.entries(editorMenus).map(([label, entries]) => <div className="menu-cluster" key={label}><button className={activeMenu === label ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setActiveMenu(activeMenu === label ? null : label); }}>{label}</button>{activeMenu === label && <div className="menu-popover">{entries.map(([command, text, shortcut], index) => <button key={command} className={index === 3 && label === '文件' ? 'menu-divider' : ''} onClick={() => onCommand(command)}><span>{text}</span><kbd>{shortcut}</kbd></button>)}</div>}</div>)}</div><span className="quick-tools-divider" /><div className="editor-quick-tools" aria-label="常用格式工具"><button onClick={() => onCommand('heading-1')}>H1</button><button onClick={() => onCommand('heading-2')}>H2</button><button onClick={() => onCommand('heading-3')}>H3</button><i /><button onClick={() => onCommand('bold')} aria-label="粗体"><TextB /></button><button onClick={() => onCommand('italic')} aria-label="斜体"><TextItalic /></button><button onClick={() => onCommand('bullet')} aria-label="列表"><ListBullets /></button><button onClick={() => onCommand('quote')} aria-label="引用"><Quotes /></button><button onClick={() => onCommand('link')} aria-label="链接"><LinkSimple /></button><button onClick={() => onCommand('source')} aria-label="源码"><Code /></button><button aria-label="更多"><DotsThree /></button></div></nav>;
}

function FindPanel({ onClose }) {
  return <section className="find-panel"><label><MagnifyingGlass size={16} /><input autoFocus placeholder="查找当前资料" /></label><label><span>替换</span><input placeholder="替换为…" /></label><button>上一个</button><button>下一个</button><button>全部替换</button><button className="find-close" onClick={onClose} aria-label="关闭查找"><X size={15} /></button></section>;
}

function EditorInspector({ item, activeTab, setActiveTab, onClose }) {
  const tabs = [['info', '信息'], ['outline', '大纲'], ['concepts', '重点'], ['ai', 'AI']];
  const [outlineExpanded, setOutlineExpanded] = useState(true);
  return <aside className="inspector editor-inspector"><header><div><b>资料边注</b><span>MARGINALIA</span></div><button onClick={onClose} aria-label="收起资料边注"><CaretRight size={17} /></button></header><nav className="aside-tabs">{tabs.map(([id, label]) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{label}</button>)}</nav><div className="aside-content">{activeTab === 'info' && <><InspectorFixedSection icon={<FileText size={16} />} title="资料信息"><dl className="inspector-record"><div><dt>标题</dt><dd>{item.title}</dd></div><div><dt>路径</dt><dd>资料库 / 研究资料</dd></div><div><dt>字数</dt><dd>862</dd></div><div><dt>更新时间</dt><dd>{item.date} 14:32</dd></div><div><dt>创建时间</dt><dd>2026.07.11</dd></div><div><dt>收藏状态</dt><dd>{item.saved ? '已收藏' : '未收藏'}</dd></div></dl></InspectorFixedSection><InspectorFixedSection icon={<Tag size={16} />} title="标签"><div className="selected inspector-tag-wrap"><div className="tag-row">{item.tags.map((tagName) => <span key={tagName}>{tagName}</span>)}</div></div><button className="quiet-action">＋ 添加标签</button></InspectorFixedSection><div className="summary-groups editor-summary-groups"><InspectorDisclosure icon={<LinkSimple size={16} />} title="关联笔记" count="4"><RelationList /></InspectorDisclosure><InspectorDisclosure icon={<Paperclip size={16} />} title="附件" count="1"><button className="resource-row"><Paperclip size={16} /><span>knowledge-map.png</span><small>已引用</small></button><button className="quiet-action">上传附件</button></InspectorDisclosure></div></>}{activeTab === 'outline' && <section className="outline-panel"><div className="outline-panel-head"><span>DOCUMENT MAP</span><strong>4 个标题</strong></div><div className="outline-editorial"><OutlineRow level="H1" title="为什么需要知识体系" current /><OutlineRow level="H2" title="知识体系的底层模型" expandable expanded={outlineExpanded} onToggle={() => setOutlineExpanded((current) => !current)} />{outlineExpanded && <div className="outline-children"><OutlineRow level="H3" title="筛选与连接" /><OutlineRow level="H3" title="抽象与迁移" /></div>}<OutlineRow level="H2" title="构建步骤与操作方法" /><OutlineRow level="H2" title="迭代与持续优化" /></div></section>}{activeTab === 'concepts' && <Info title="重点内容"><div className="annotation-card"><mark>知识体系不是信息的堆砌</mark><p>来自正文第 2 段 · 可点击定位</p><button>定位</button><button>删除</button></div><button className="quiet-action">在正文中选中文字后添加重点</button></Info>}{activeTab === 'ai' && <Info title="AI 辅助"><div className="ai-card"><Sparkle size={20} /><b>基于当前资料</b><p>总结正文、提取知识点、生成复习题，或查找可能遗漏的关联资料。</p><button>总结当前资料</button><button>提取知识点</button></div></Info>}</div></aside>;
}

function OutlineRow({ level, title, current = false, expandable = false, expanded = false, onToggle }) {
  return <div className={`outline-row-ui level-${level.toLowerCase()} ${current ? 'current' : ''}`}>{expandable ? <button className="outline-toggle-ui" onClick={onToggle} aria-label={expanded ? `收起 ${title}` : `展开 ${title}`}>{expanded ? <CaretDown size={13} /> : <CaretRight size={13} />}</button> : <span className="outline-toggle-space" />}<button className="outline-jump"><span>{level}</span><strong>{title}</strong></button></div>;
}

function InspectorDisclosure({ icon, title, count, children }) {
  return <details className="inspector-disclosure"><summary><span>{icon}<b>{title}</b></span><span><small>{count}</small><CaretDown size={14} /></span></summary><div className="disclosure-body">{children}</div></details>;
}

function InspectorFixedSection({ icon, title, children }) {
  return <section className="inspector-fixed-section"><header>{icon}<h3>{title}</h3></header>{children}</section>;
}

function Info({ index, title, children }) { return <section className="info">{index ? <div className="info-heading"><span>{index}</span><h3>{title}</h3></div> : <h3>{title}</h3>}{children}</section>; }
function RelationList() { return <ol className="relations"><li><a href="#003">003</a> 第二大脑搭建指南</li><li><a href="#004">004</a> 卡片笔记写作法</li><li><a href="#015">015</a> 费曼学习法</li><li><a href="#028">028</a> 信息筛选与评估</li></ol>; }

function EntityModal({ mode, onClose, onSubmit }) {
  const isFolder = mode === 'folder';
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={onSubmit}><header><div><small>{isFolder ? 'NEW FOLDER' : 'NEW LIBRARY ITEM'}</small><h2>{isFolder ? '新建文件夹' : '新建资料'}</h2></div><button type="button" onClick={onClose} aria-label="关闭"><X /></button></header><label>{isFolder ? '文件夹名称' : '资料标题'}<input name="title" required autoFocus placeholder={isFolder ? '输入文件夹名称' : '输入一个明确的资料标题'} /></label>{!isFolder && <label>摘要<textarea name="summary" placeholder="用一两句话描述核心内容" /></label>}<footer><button type="button" onClick={onClose}>取消</button><button className="submit"><Check />{isFolder ? '创建文件夹' : '创建并打开'}</button></footer></form></div>;
}
