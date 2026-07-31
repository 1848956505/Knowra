import { useMemo, useState } from 'react';
import { Archive, BookmarkSimple, CaretDown, CaretLeft, CaretRight, Check, Clock, FileText, MagnifyingGlass, Plus, SlidersHorizontal, X } from '@phosphor-icons/react';

const sections = [
  ['01', '认知与思考', 128], ['02', '写作与表达', 96], ['03', '学习与成长', 142],
  ['04', '项目与实践', 78], ['05', '生活与见闻', 64],
];

const seedItems = [
  { id:'001', code:'A1', title:'构建个人知识体系', desc:'从目标设定、信息收集、知识加工到体系构建的完整方法论，建立可持续迭代的个人知识系统。', date:'2024.05.10', section:'01', tags:['知识管理','方法论','系统思维','元认知'], status:'进行中' },
  { id:'002', code:'A2', title:'如何阅读一本书', desc:'系统化阅读的方法与技巧，提升理解力、批判性思维与知识留存率。', date:'2024.05.08', section:'03', tags:['阅读','学习方法','认知'], status:'已归档' },
  { id:'003', code:'B1', title:'第二大脑搭建指南', desc:'基于 PARA 方法与连接主义原理，构建你的第二大脑，实现知识的高效存储与调用。', date:'2024.05.06', section:'01', tags:['知识管理','PARA','数字笔记','自动化'], status:'进行中' },
  { id:'004', code:'B2', title:'卡片笔记写作法', desc:'通过原子化写作与卡片连接，积累知识资产，激发创意与深度思考。', date:'2024.05.04', section:'02', tags:['卡片笔记','写作','知识创作','费曼技巧'], status:'进行中' },
];

export function App() {
  const [activeSection, setActiveSection] = useState('all');
  const [activeId, setActiveId] = useState('001');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('全部条目');
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 720);
  const [modalOpen, setModalOpen] = useState(false);
  const [items, setItems] = useState(seedItems);
  const active = items.find((item) => item.id === activeId) || items[0];
  const filtered = useMemo(() => items.filter((item) => {
    const sectionMatch = activeSection === 'all' || item.section === activeSection;
    const queryMatch = `${item.title}${item.desc}${item.tags.join('')}`.includes(query);
    const tabMatch = tab === '全部条目' || (tab === '归档' ? item.status === '已归档' : true);
    return sectionMatch && queryMatch && tabMatch;
  }), [items, activeSection, query, tab]);

  function addItem(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = { id:String(items.length + 1).padStart(3,'0'), code:'C1', title:form.get('title') || '未命名条目', desc:form.get('desc') || '新知识条目的摘要将在这里显示。', date:'2026.07.11', section:'01', tags:['新条目'], status:'进行中' };
    setItems([next, ...items]); setActiveId(next.id); setModalOpen(false);
  }

  return <div className={`app-shell ${panelOpen ? '' : 'panel-closed'}`}>
    <aside className="rail">
      <div className="brand"><span className="brand-mark">K</span><div><strong>知境 · Knowra</strong><small>知识管理与研究系统</small></div></div>
      <nav className="sections" aria-label="知识分类">
        {sections.map(([number, label, count]) => <button className={activeSection === number ? 'active' : ''} key={number} onClick={() => setActiveSection(activeSection === number ? 'all' : number)}><b>{number}</b><span><strong>{label}</strong><small>条目 {count}</small></span></button>)}
      </nav>
      <div className="rail-foot">
        <button><BookmarkSimple size={22}/>收藏 <span>23</span></button>
        <button><Clock size={22}/>最近 <span>15</span></button>
        <button><Archive size={22}/>归档 <span>312</span></button>
      </div>
    </aside>

    <main className="workspace">
      <header className="masthead">
        <div><h1>知识索引</h1><p>KNOWLEDGE INDEX</p></div>
        <div className="collection"><b>COLL. 2024–05</b><span>创建时间　2024.05.12</span><span>版本　1.3.0</span></div>
        <button className="new-button" onClick={() => setModalOpen(true)}><Plus size={34}/>新建条目</button>
      </header>

      <div className="tabs">
        {['全部条目','我创建的','已收藏','归档'].map((name) => <button className={tab===name?'active':''} onClick={()=>setTab(name)} key={name}>{name} <b>{name==='全部条目'?444:name==='我创建的'?328:name==='已收藏'?23:312}</b></button>)}
      </div>
      <div className="filters">
        <button>类型　全部 <CaretDown/></button><button>状态　全部 <CaretDown/></button><button>标签　全部 <CaretDown/></button><button>时间　最新编辑 <CaretDown/></button>
        <label><MagnifyingGlass size={20}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="搜索条目"/></label>
      </div>

      <section className="index-list">
        {filtered.map((item) => <article key={item.id} className={activeId===item.id?'selected':''} onClick={()=>setActiveId(item.id)}>
          <b className="item-id">{item.id}</b>
          <div className="item-copy"><div className="item-title"><h2>{item.title}</h2>{item.status==='进行中'&&<span className="status"><i/>进行中</span>}</div><p>{item.desc}</p><div className="tags">{item.tags.map(tag=><span key={tag}>{tag}</span>)}</div></div>
          <div className="item-meta"><span>{item.date}</span><span>文档</span></div><b className="item-code">{item.code}</b>
        </article>)}
        {filtered.length===0 && <div className="empty"><MagnifyingGlass size={34}/><b>没有找到匹配条目</b><button onClick={()=>setQuery('')}>清除搜索</button></div>}
      </section>
      <footer className="pagination"><span>共 {filtered.length || 0} 条</span><div><CaretLeft/><button className="active">1</button><button>2</button><button>3</button><button>4</button><button>5</button><span>…</span><button>45</button><CaretRight/></div><button>每页 10 条 <CaretDown/></button></footer>
    </main>

    {panelOpen && active && <aside className="inspector">
      <button className="collapse" aria-label="收起详情" onClick={()=>setPanelOpen(false)}><CaretRight/></button>
      <button className="new-button small" onClick={()=>setModalOpen(true)}><Plus size={30}/>新建条目</button>
      <Info label="类型"><span>文档</span><FileText size={22}/></Info>
      <Info label="状态"><span className="status"><i/>{active.status}</span></Info>
      <Info label="标签"><div className="inspector-tags">{active.tags.map(tag=><button key={tag}>{tag}</button>)}</div><button className="add-tag">＋ 添加标签</button></Info>
      <Info label="关联知识"><ol><li><a>003</a> 第二大脑搭建指南</li><li><a>004</a> 卡片笔记写作法</li><li><a>015</a> 费曼学习法</li><li><a>028</a> 信息筛选与评估</li></ol><button className="text-button">查看全部 12 条　&gt;</button></Info>
      <Info label="最后编辑"><span>2024.05.10　14:32</span><small>由 知境君 编辑</small></Info>
      <Info label="内容大纲"><ol className="outline"><li>为什么需要知识体系</li><li>知识体系的底层模型</li><li>构建步骤与操作方法</li><li>工具与实践建议</li><li>迭代与持续优化</li></ol></Info>
    </aside>}
    {!panelOpen && <button className="open-panel" onClick={()=>setPanelOpen(true)}><SlidersHorizontal/>详情</button>}

    {modalOpen && <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setModalOpen(false)}><form className="modal" onSubmit={addItem}><header><div><small>NEW KNOWLEDGE ENTRY</small><h2>新建知识条目</h2></div><button type="button" onClick={()=>setModalOpen(false)}><X/></button></header><label>条目标题<input name="title" autoFocus placeholder="输入一个明确的知识主题" required/></label><label>摘要<textarea name="desc" placeholder="用一两句话描述它的核心内容"/></label><footer><button type="button" onClick={()=>setModalOpen(false)}>取消</button><button className="submit"><Check/>创建条目</button></footer></form></div>}
  </div>;
}

function Info({label, children}) { return <section className="info"><h3>{label}</h3>{children}</section> }
