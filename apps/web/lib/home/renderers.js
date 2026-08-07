import { escapeAttribute, escapeHtml, formatCompactDate } from '../../src/app/formatting.js';
import { renderIcon } from '../icons/icon-map.js';
import { getSourceTypeLabel, getStatusLabel } from '../library-index/model.js';
import { selectHomeRecentNotes, selectHomeSummary } from './model.js';

const HOME_DOMAIN_CARDS = Object.freeze([
  {
    key: 'materials',
    title: '资料工作台',
    icon: 'moduleMaterials',
    state: 'ready',
    tag: '已就绪',
    description: 'Markdown 资料的采集、编辑与整理。首页提供一个真实资料入口。'
  },
  {
    key: 'knowledge',
    title: '知识工作台',
    icon: 'moduleKnowledge',
    state: 'available',
    tag: '已接入',
    description: '知识概览与知识单元使用真实工作域数据，请从左侧功能导航进入。'
  },
  {
    key: 'training',
    title: '训练工作台',
    icon: 'moduleTraining',
    state: 'available',
    tag: '已接入',
    description: '题目库与训练概览使用真实工作域数据，请从左侧功能导航进入。'
  },
  {
    key: 'learning',
    title: '学习档案',
    icon: 'moduleLearning',
    state: 'blocked',
    tag: '依赖未就绪',
    description: '掌握状态和复习安排等待 LearningEvidence 与 MasteryState 的真实数据。'
  }
]);

export function renderHomeWorkspace(state) {
  const recentNotes = selectHomeRecentNotes(state);
  const summary = selectHomeSummary(state, recentNotes);
  return `
    <div class="home-workspace" data-home-workspace data-home-loading="${String(summary.isLoading)}">
      ${renderWelcome(summary)}
      <section class="home-domain-section" aria-labelledby="home-domain-heading">
        <header class="home-section-heading">
          <div>
            <span class="home-section-kicker">WORK DOMAINS</span>
            <h2 id="home-domain-heading">进入工作域</h2>
          </div>
          <p>主页只提供资料入口，其余工作域保持真实状态。</p>
        </header>
        <div class="home-domain-grid">
          ${HOME_DOMAIN_CARDS.map(renderHomeDomainCard).join('')}
        </div>
      </section>
      <section class="home-recent-section" aria-labelledby="home-recent-heading">
        <header class="home-section-heading home-recent-heading">
          <div>
            <span class="home-section-kicker">RECENT EDITS</span>
            <h2 id="home-recent-heading">最近编辑</h2>
          </div>
          <button type="button" class="home-secondary-action" data-home-action="open-library">查看全部资料</button>
        </header>
        ${renderRecentTable(recentNotes, summary.isLoading)}
      </section>
    </div>
  `;
}

export function renderHomeLoading() {
  return `
    <div class="home-workspace home-workspace-loading" data-home-workspace data-home-loading="true">
      <div class="home-loading-state" role="status" aria-live="polite">
        <span class="home-section-kicker">WORKBENCH</span>
        <strong>正在加载资料工作台…</strong>
        <span>正在读取真实资料与文件夹状态。</span>
      </div>
    </div>
  `;
}

function renderWelcome(summary) {
  const statValue = (value) => summary.isLoading ? '—' : String(value);
  const summaryText = summary.isLoading
    ? '正在同步真实资料状态。'
    : `已加载 ${summary.noteCount} 条资料，最近编辑 ${summary.recentCount} 条。`;
  return `
    <header class="home-welcome">
      <div class="home-welcome-copy">
        <span class="home-section-kicker">KNOWRA WORKBENCH</span>
        <h1>从你的资料开始。</h1>
        <p>${escapeHtml(summaryText)}</p>
      </div>
      <dl class="home-summary" aria-label="资料工作台摘要">
        <div><dt>资料</dt><dd data-home-stat="notes">${statValue(summary.noteCount)}</dd></div>
        <div><dt>文件夹</dt><dd data-home-stat="folders">${statValue(summary.folderCount)}</dd></div>
        <div><dt>最近编辑</dt><dd data-home-stat="recent">${statValue(summary.recentCount)}</dd></div>
      </dl>
    </header>
  `;
}

function renderHomeDomainCard(card) {
  const isReady = card.state === 'ready';
  return `
    <article class="home-domain-card${isReady ? ' home-domain-card-ready' : ' home-domain-card-muted'}" data-home-domain-card="${escapeAttribute(card.key)}" data-home-domain-state="${escapeAttribute(card.state)}"${isReady ? '' : ' aria-disabled="true"'}>
      <div class="home-domain-card-header">
        <span class="home-domain-icon" aria-hidden="true">${renderIcon(card.icon, { className: 'home-domain-icon-image' })}</span>
        <span class="home-domain-tag" data-home-domain-tag="${escapeAttribute(card.state)}">${escapeHtml(card.tag)}</span>
      </div>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.description)}</p>
      ${isReady
        ? '<button type="button" class="home-primary-action" data-home-action="open-library">进入资料库</button>'
        : '<span class="home-domain-hint">从左侧功能导航进入</span>'}
    </article>
  `;
}

function renderRecentTable(notes, isLoading) {
  if (isLoading) {
    return '<div class="home-recent-empty" role="status">正在读取最近编辑…</div>';
  }
  if (!notes.length) {
    return '<div class="home-recent-empty"><strong>还没有最近编辑资料</strong><span>进入资料库后创建或导入第一条资料。</span></div>';
  }
  return `
    <div class="home-recent-table-wrap">
      <table class="home-recent-table">
        <thead><tr><th scope="col">资料</th><th scope="col">状态</th><th scope="col">最后编辑</th></tr></thead>
        <tbody>${notes.map(renderRecentRow).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderRecentRow(note) {
  const title = note.title || '未命名资料';
  return `
    <tr data-home-recent-note="${escapeAttribute(note.id)}">
      <td>
        <button type="button" class="home-recent-note" data-home-note-open="${escapeAttribute(note.id)}" aria-label="打开资料：${escapeAttribute(title)}">
          ${renderIcon('noteMarkdown', { className: 'home-recent-note-icon' })}
          <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(getSourceTypeLabel(note.sourceType))}</small></span>
        </button>
      </td>
      <td><span class="home-recent-status" data-home-note-status="${escapeAttribute(note.status ?? 'active')}">${escapeHtml(getStatusLabel(note.status))}</span></td>
      <td><time class="home-recent-date" datetime="${escapeAttribute(note.updatedAt ?? '')}">${escapeHtml(formatCompactDate(note.updatedAt))}</time></td>
    </tr>
  `;
}
