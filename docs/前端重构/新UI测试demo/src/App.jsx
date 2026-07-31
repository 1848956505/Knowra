import { useMemo, useState } from 'react';
import {
  Archive, ArrowLeft, ArrowUpRight, BookmarkSimple, CaretDown, CaretLeft, CaretRight,
  Check, Clock, FileText, FolderSimple, GearSix, LinkSimple, ListBullets,
  MagnifyingGlass, NotePencil, Plus, Quotes, SidebarSimple,
  SlidersHorizontal, TextB, TextItalic, X,
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
];

const folderTree = [
  { id: 'research', name: '研究资料', english: 'RESEARCH', children: ['001', '002'] },
  { id: 'knowledge', name: '知识管理', english: 'KNOWLEDGE', children: ['003', '015'] },
  { id: 'writing', name: '写作与表达', english: 'WRITING', children: ['004'] },
  { id: 'uncategorized', name: '未分类', english: 'UNCATEGORIZED', children: [] },
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
];

export function App() {
  const [view, setView] = useState('index');
  const [activeModuleId, setActiveModuleId] = useState(null);
  const [activeLibraryView, setActiveLibraryView] = useState('all');
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(['research', 'knowledge', 'writing']);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('全部条目');
  const [activeId, setActiveId] = useState('001');
  const [openTabs, setOpenTabs] = useState(['001', '002', '003', '004']);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [items, setItems] = useState(seedItems);
  const [savedNotice, setSavedNotice] = useState(false);

  const activeItem = items.find((item) => item.id === activeId) || items[0];
  const filtered = useMemo(() => items.filter((item) => {
    const folderMatch = !activeFolderId || item.folderId === activeFolderId;
    const queryMatch = `${item.title}${item.summary}${item.tags.join('')}`.toLowerCase().includes(query.toLowerCase());
    const recycleView = activeLibraryView === 'archive' || tab === '回收站';
    const viewMatch = recycleView
      ? item.deleted
      : !item.deleted && (activeLibraryView === 'all' || activeLibraryView === 'folder' || activeLibraryView === 'recent' || (activeLibraryView === 'favorites' && item.saved));
    const tabMatch = tab === '全部条目' || (tab === '已收藏' ? item.saved : tab === '回收站' ? item.deleted : true);
    return folderMatch && queryMatch && viewMatch && tabMatch;
  }), [activeFolderId, activeLibraryView, items, query, tab]);

  function openItem(id) {
    setActiveId(id);
    setOpenTabs((tabs) => tabs.includes(id) ? tabs : [...tabs, id]);
    setView('editor');
  }

  function openModule(id) {
    setActiveModuleId(id);
    setView('index');
    if (id === '01') {
      setActiveLibraryView('all');
      setActiveFolderId(null);
    }
  }

  function openLibraryView(nextView) {
    setActiveLibraryView(nextView);
    setActiveFolderId(null);
    setView('index');
  }

  function toggleFolder(folderId) {
    setExpandedFolders((folders) => folders.includes(folderId)
      ? folders.filter((id) => id !== folderId)
      : [...folders, folderId]);
  }

  function openFolder(folderId) {
    setActiveFolderId(folderId);
    setActiveLibraryView('folder');
    setView('index');
    setExpandedFolders((folders) => folders.includes(folderId) ? folders : [...folders, folderId]);
  }

  function closeTab(id) {
    const next = openTabs.filter((tabId) => tabId !== id);
    setOpenTabs(next);
    if (id === activeId) {
      if (next.length) setActiveId(next[next.length - 1]);
      else setView('index');
    }
  }

  function addItem(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const id = String(Math.max(...items.map((item) => Number(item.id))) + 1).padStart(3, '0');
    const next = { id, code: 'C1', title: data.get('title'), summary: data.get('summary') || '新资料的摘要将在这里显示。', date: '2026.07.14', folderId: 'uncategorized', tags: ['新资料'], status: '进行中', deleted: false, saved: false };
    setItems((current) => [next, ...current]);
    setModalOpen(false);
    openItem(id);
  }

  function fakeSave() {
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1600);
  }

  return (
    <div className={`app-shell ${view === 'editor' ? 'editor-mode' : 'index-mode'} ${inspectorOpen ? '' : 'inspector-closed'}`}>
      <Rail
        activeModuleId={activeModuleId}
        openModule={openModule}
        activeLibraryView={activeLibraryView}
        openLibraryView={openLibraryView}
        activeFolderId={activeFolderId}
        openFolder={openFolder}
        toggleFolder={toggleFolder}
        expandedFolders={expandedFolders}
        activeId={activeId}
        openItem={openItem}
        setActiveModuleId={setActiveModuleId}
        view={view}
        setView={setView}
      />
      {view === 'index' ? (
        <IndexView
          activeModuleId={activeModuleId} activeLibraryView={activeLibraryView} activeFolderId={activeFolderId}
          activeItem={activeItem} activeId={activeId} filtered={filtered} query={query} setQuery={setQuery}
          tab={tab} setTab={setTab} openItem={openItem} setActiveId={setActiveId}
          inspectorOpen={inspectorOpen} setInspectorOpen={setInspectorOpen} setModalOpen={setModalOpen}
        />
      ) : (
        <EditorView
          activeItem={activeItem} activeId={activeId} openTabs={openTabs} setActiveId={setActiveId}
          closeTab={closeTab} setView={setView} inspectorOpen={inspectorOpen}
          setInspectorOpen={setInspectorOpen} fakeSave={fakeSave} savedNotice={savedNotice}
        />
      )}
      {modalOpen && <NewItemModal onClose={() => setModalOpen(false)} onSubmit={addItem} />}
    </div>
  );
}

function Brand({ onClick }) {
  return <button className="brand" onClick={onClick} aria-label="返回知识索引"><span className="brand-mark">K</span><span><strong>知境 · Knowra</strong><small>知识管理与研究系统</small></span></button>;
}

function Rail({ activeModuleId, openModule, activeLibraryView, openLibraryView, activeFolderId, openFolder, toggleFolder, expandedFolders, activeId, openItem, setActiveModuleId, view, setView }) {
  const isLibrary = activeModuleId === '01';
  return <aside className={`rail ${activeModuleId ? 'module-rail' : 'default-rail'}`}>
    <Brand onClick={() => { setActiveModuleId(null); setView('index'); }} />
    {!activeModuleId ? (
      <nav className="module-list" aria-label="产品模块">
        {modules.map((module) => <button key={module.id} className="module-button" onClick={() => openModule(module.id)}>
          <b>{module.id}</b><span><strong>{module.name}</strong><small>{module.english}</small></span>
        </button>)}
      </nav>
    ) : isLibrary ? (
      <LibraryDirectory
        activeLibraryView={activeLibraryView}
        openLibraryView={openLibraryView}
        activeFolderId={activeFolderId}
        openFolder={openFolder}
        toggleFolder={toggleFolder}
        expandedFolders={expandedFolders}
        activeId={activeId}
        openItem={openItem}
        view={view}
        setView={setView}
      />
    ) : <ModuleDirectory moduleId={activeModuleId} setView={setView} />}
    {activeModuleId && <nav className="module-switcher" aria-label="切换产品模块">
      {modules.map((module) => <button key={module.id} className={activeModuleId === module.id ? 'active' : ''} onClick={() => openModule(module.id)}>{module.id}</button>)}
    </nav>}
    <button className="settings-button"><GearSix size={19} />设置</button>
  </aside>;
}

function LibraryDirectory({ activeLibraryView, openLibraryView, activeFolderId, openFolder, toggleFolder, expandedFolders, activeId, openItem, view, setView }) {
  return <div className="library-directory">
    <button className="library-label" onClick={() => { openLibraryView('all'); setView('index'); }}><b className="library-id">01</b><span className="library-copy"><strong>资料库</strong><small>LIBRARY</small></span><ArrowUpRight size={19} /></button>
    <div className="directory-scroll">
      <div className="directory-group">
        <span className="directory-group-label">内容　CONTENT</span>
        <button className={`directory-entry ${activeLibraryView === 'all' ? 'active' : ''}`} onClick={() => openLibraryView('all')}><FileText size={17} /><span>全部资料</span><b>128</b></button>
        <button className={`directory-entry ${activeLibraryView === 'folder' && !activeFolderId ? 'active' : ''}`} onClick={() => openLibraryView('folder')}><FolderSimple size={17} /><span>文件夹</span><b>{folderTree.length}</b></button>
      </div>
      <div className="folder-tree">
        <div className="directory-group-label">文件夹　FOLDERS</div>
        {folderTree.map((folder) => <FolderNode key={folder.id} folder={folder} expanded={expandedFolders.includes(folder.id)} activeFolderId={activeFolderId} activeId={activeId} onFolderClick={() => { openFolder(folder.id); if (expandedFolders.includes(folder.id)) toggleFolder(folder.id); }} onFileClick={openItem} />)}
      </div>
      <div className="directory-group directory-views">
        <span className="directory-group-label">视图　VIEWS</span>
        <button className={`directory-entry ${activeLibraryView === 'recent' ? 'active' : ''}`} onClick={() => openLibraryView('recent')}><Clock size={17} /><span>最近编辑</span><b>15</b></button>
        <button className={`directory-entry ${activeLibraryView === 'favorites' ? 'active' : ''}`} onClick={() => openLibraryView('favorites')}><BookmarkSimple size={17} /><span>收藏</span><b>23</b></button>
        <button className={`directory-entry ${activeLibraryView === 'archive' ? 'active' : ''}`} onClick={() => openLibraryView('archive')}><Archive size={17} /><span>回收站</span><b>312</b></button>
      </div>
    </div>
  </div>;
}

function FolderNode({ folder, expanded, activeFolderId, activeId, onFolderClick, onFileClick }) {
  return <div className={`folder-node ${activeFolderId === folder.id ? 'active' : ''}`}>
    <button className="folder-row" onClick={onFolderClick}>
      <CaretRight className={expanded ? 'expanded' : ''} size={13} /><FolderSimple size={17} /><span>{folder.name}</span><b>{folder.children.length}</b>
    </button>
    {expanded && <div className="folder-children">
      {folder.children.length ? folder.children.map((itemId) => {
        const item = seedItems.find((entry) => entry.id === itemId);
        return <button key={itemId} className={`file-row ${activeId === itemId ? 'active' : ''}`} onClick={() => onFileClick(itemId)}><FileText size={15} /><span>{item?.title || '未命名资料'}</span></button>;
      }) : <span className="folder-empty">暂无资料</span>}
    </div>}
  </div>;
}

function ModuleDirectory({ moduleId, setView }) {
  const module = modules.find((item) => item.id === moduleId);
  return <div className="simple-directory">
    <button className="library-label" onClick={() => setView('index')}><b className="library-id">{module?.id}</b><span className="library-copy"><strong>{module?.name}</strong><small>{module?.english}</small></span><ArrowUpRight size={19} /></button>
    <div className="directory-scroll">
      <div className="directory-group-label">目录　DIRECTORY</div>
      {(secondaryDirectories[moduleId] || []).map((entry, index) => <button className={`directory-entry ${index === 0 ? 'active' : ''}`} key={entry}><span>{entry}</span><b>{String(index + 1).padStart(2, '0')}</b></button>)}
    </div>
  </div>;
}

function IndexView({ activeModuleId, activeLibraryView, activeFolderId, activeItem, activeId, filtered, query, setQuery, tab, setTab, openItem, setActiveId, inspectorOpen, setInspectorOpen, setModalOpen }) {
  const libraryActive = activeModuleId === '01';
  const activeFolder = folderTree.find((folder) => folder.id === activeFolderId);
  const title = libraryActive ? activeFolder?.name || (activeLibraryView === 'recent' ? '最近编辑' : activeLibraryView === 'favorites' ? '收藏' : activeLibraryView === 'archive' ? '回收站' : '资料库') : '知识索引';
  const subtitle = libraryActive ? (activeFolder ? `${activeFolder.english} FOLDER` : 'LIBRARY INDEX') : 'KNOWLEDGE INDEX';
  return <>
    <main className="workspace index-workspace">
      <header className="masthead">
        <div><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="collection"><b>COLL. 2026–07</b><span>创建时间　2026.07.04</span><span>版本　2.4.0</span></div>
        <button className="primary-button" onClick={() => setModalOpen(true)}><Plus size={30} />新建资料</button>
      </header>
      <nav className="content-tabs" aria-label="资料筛选">
        {['全部条目', '我创建的', '已收藏', '回收站'].map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}<b>{name === '全部条目' ? 444 : name === '我创建的' ? 328 : name === '已收藏' ? 23 : 312}</b></button>)}
      </nav>
      <div className="filter-row">
        <button>类型　全部 <CaretDown /></button><button>状态　全部 <CaretDown /></button><button>标签　全部 <CaretDown /></button><button>时间　最新编辑 <CaretDown /></button>
        <label><MagnifyingGlass size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索条目" /></label>
      </div>
      <section className="entry-list" aria-label="知识条目">
        {filtered.map((item) => <article key={item.id} className={activeId === item.id ? 'selected' : ''} onClick={() => setActiveId(item.id)} onDoubleClick={() => openItem(item.id)}>
          <button className="entry-open" onClick={(event) => { event.stopPropagation(); openItem(item.id); }} aria-label={`打开 ${item.title}`} />
          <b className="entry-id">{item.id}</b>
          <div className="entry-copy"><div className="entry-heading"><h2>{item.title}</h2>{item.status === '进行中' && <span className="status"><i />进行中</span>}</div><p>{item.summary}</p><div className="tag-row">{item.tags.map((tagName) => <span key={tagName}>{tagName}</span>)}</div></div>
          <div className="entry-meta"><span>{item.date}</span><span>文档</span></div><b className="entry-code">{item.code}</b>
        </article>)}
        {!filtered.length && <div className="empty-state"><MagnifyingGlass size={34} /><b>没有找到匹配条目</b><button onClick={() => setQuery('')}>清除搜索</button></div>}
      </section>
      <footer className="pagination"><span>共 {filtered.length} 条</span><div><CaretLeft /><button className="active">1</button><button>2</button><button>3</button><button>4</button><button>5</button><span>…</span><button>45</button><CaretRight /></div><button>每页 10 条 <CaretDown /></button></footer>
    </main>
    {inspectorOpen ? <IndexInspector item={activeItem} onClose={() => setInspectorOpen(false)} onOpen={() => openItem(activeItem.id)} /> : <button className="reopen-panel" onClick={() => setInspectorOpen(true)}><SlidersHorizontal size={18} />详情</button>}
  </>;
}

function IndexInspector({ item, onClose, onOpen }) {
  return <aside className="inspector index-inspector">
    <button className="panel-close" onClick={onClose} aria-label="收起详情"><CaretRight /></button>
    <button className="primary-button inspector-action" onClick={onOpen}><NotePencil size={27} />打开资料</button>
    <Info title="类型"><span>文档</span><FileText size={21} /></Info>
    <Info title="状态"><span className="status"><i />{item.status}</span></Info>
    <Info title="标签"><div className="inspector-tags">{item.tags.map((tagName) => <button key={tagName}>{tagName}</button>)}</div><button className="quiet-action">＋ 添加标签</button></Info>
    <Info title="关联知识"><RelationList /><button className="text-action">查看全部 12 条　&gt;</button></Info>
    <Info title="最后编辑"><span>{item.date}　14:32</span><small>由 知境君 编辑</small></Info>
    <Info title="内容大纲"><ol className="outline"><li>为什么需要知识体系</li><li>知识体系的底层模型</li><li>构建步骤与操作方法</li><li>工具与实践建议</li><li>迭代与持续优化</li></ol></Info>
  </aside>;
}

function EditorView({ activeItem, activeId, openTabs, setActiveId, closeTab, setView, inspectorOpen, setInspectorOpen, fakeSave, savedNotice }) {
  const activeFolder = folderTree.find((folder) => folder.id === activeItem.folderId);
  return <>
    <main className="editor-workspace">
      <header className="document-tabs">
        <button className="back-index" onClick={() => setView('index')} aria-label="返回知识索引"><ArrowLeft size={18} /></button>
        <div className="open-tabs">{openTabs.map((id) => {
          const item = seedItems.find((entry) => entry.id === id) || activeItem;
          return <button key={id} className={activeId === id ? 'active' : ''} onClick={() => setActiveId(id)}><span>{item.title}</span><X size={14} onClick={(event) => { event.stopPropagation(); closeTab(id); }} /></button>;
        })}<button className="add-tab" aria-label="新建标签页"><Plus size={20} /></button></div>
        <div className="top-actions"><button><MagnifyingGlass size={19} />搜索</button><button className="new-small"><Plus size={17} />新建<CaretDown size={14} /></button><button>设置</button></div>
      </header>
      <section className="document-head">
        <div className="breadcrumb">资料库　/　{activeFolder?.name || '未分类'}　/　{activeItem.id} {activeItem.title}</div><span className="status"><i />{activeItem.status}</span>
        <div className="document-dates"><span>创建时间　2026-07-11</span><span>编辑时间　2026-07-14 14:32</span></div>
        <b className="document-id">{activeItem.id}</b><div className="document-title"><h1>{activeItem.title}</h1><div className="tag-row">{activeItem.tags.map((tagName) => <span key={tagName}>{tagName}</span>)}<button>＋ 添加标签</button></div></div>
      </section>
      <nav className="editor-toolbar" aria-label="编辑工具栏"><button>H1</button><button>H2</button><button>H3</button><button aria-label="粗体"><TextB /></button><button aria-label="斜体"><TextItalic /></button><button aria-label="列表"><ListBullets /></button><button aria-label="引用"><Quotes /></button><button aria-label="链接"><LinkSimple /></button><button>···</button></nav>
      <article className="editor-content">
        {paragraphs.map((paragraph, index) => <section className="editor-paragraph" key={paragraph}><b>{index + 1}</b><p contentEditable suppressContentEditableWarning onInput={fakeSave}>{paragraph}</p><a>[{index + 1}]</a></section>)}
      </article>
      <footer className="statusbar"><div><span>字数　862</span><span>字符　1,342</span><span>预计阅读　4 分钟</span></div><div><span>{savedNotice ? '正在保存…' : '已保存　14:32:10'}</span><span className="status"><i />进行中</span></div><div><button>专注模式</button><button>预览</button><button className="active"><NotePencil size={17} />编辑</button></div></footer>
    </main>
    {inspectorOpen ? <EditorInspector onClose={() => setInspectorOpen(false)} /> : <button className="reopen-panel editor-reopen" onClick={() => setInspectorOpen(true)}><SidebarSimple size={18} />边注</button>}
  </>;
}

function EditorInspector({ onClose }) {
  return <aside className="inspector editor-inspector">
    <header><b>知识边注</b><span>MARGINALIA</span><button onClick={onClose} aria-label="收起知识边注">«</button></header>
    <Info title="关联知识点"><RelationCards /><button className="text-action">查看全部关联知识点（12） &gt;</button></Info>
    <Info title="反向链接"><ul className="backlinks"><li>来自　002　<a>如何阅读一本书</a><b>A2</b></li><li>来自　007　<a>输出型学习法</a><b>B2</b></li><li>来自　032　<a>知识更新与迭代</a><b>C1</b></li></ul><button className="text-action">查看全部反向链接（8） &gt;</button></Info>
    <Info title="标签"><div className="inspector-tags"><button>知识管理</button><button>方法论</button><button>系统思维</button><button>元认知</button></div><button className="quiet-action">＋ 添加标签</button></Info>
    <Info title="引用"><button className="quiet-action">＋ 添加文献或网页链接</button></Info>
  </aside>;
}

function Info({ title, children }) { return <section className="info"><h3>{title}</h3>{children}</section>; }
function RelationList() { return <ol className="relations"><li><a>003</a> 第二大脑搭建指南</li><li><a>004</a> 卡片笔记写作法</li><li><a>015</a> 费曼学习法</li><li><a>028</a> 信息筛选与评估</li></ol>; }
function RelationCards() { return <ol className="relation-cards"><li><b>[1]</b><div><strong>003　第二大脑搭建指南</strong><p>关于 PARA 方法与连接主义原理的完整说明。</p><time>2026.07.08</time></div><em>B1</em></li><li><b>[2]</b><div><strong>004　卡片笔记写作法</strong><p>双链笔记如何支持知识的连接与重组。</p><time>2026.07.04</time></div><em>B2</em></li><li><b>[3]</b><div><strong>015　费曼学习法</strong><p>通过输出检验理解，形成可教的知识。</p><time>2026.06.28</time></div><em>B2</em></li></ol>; }

function NewItemModal({ onClose, onSubmit }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={onSubmit}><header><div><small>NEW LIBRARY ITEM</small><h2>新建资料</h2></div><button type="button" onClick={onClose} aria-label="关闭"><X /></button></header><label>资料标题<input name="title" required autoFocus placeholder="输入一个明确的资料标题" /></label><label>摘要<textarea name="summary" placeholder="用一两句话描述核心内容" /></label><footer><button type="button" onClick={onClose}>取消</button><button className="submit"><Check />创建并打开</button></footer></form></div>;
}
