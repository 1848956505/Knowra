import { knowledgeBaseSeed } from '../../lib/mock-knowledge-base.js';
import { extractMarkdownHeadings } from '../../lib/markdown.js';
import { buildFolderPath } from '../../lib/navigation/selection.js';
import { createClearedNoteSideData, createLocalNoteSideData } from '../../lib/sidebar/state.js';
import { ASIDE_TABS, resolveAsideContentKey } from '../../lib/sidebar/tabs.js';
import {
  renderAiTab,
  renderAsideEmptyState,
  renderAsideTabs
} from '../../lib/sidebar/renderers.js';
import { renderInfoTab as renderInfoTabMarkup } from '../../lib/sidebar/info-panel.js';
import { renderOutlineTab as renderOutlineTabMarkup } from '../../lib/sidebar/outline-panel.js';
import { createAttachmentCommandsController } from './sidebar/attachment-commands-controller.js';
import { createAttachmentRenameController } from './sidebar/attachment-rename-controller.js';
import { isAttachmentReferencedInMarkdown } from '../../lib/sidebar/attachments.js';

export function createSidebarController(deps) {
  const {
    state,
    elements,
    knowledgeApi,
    getCurrentNote,
    syncAnnotationMarkers,
    flashStatus,
    formatDate
  } = deps;

  const attachmentCommands = createAttachmentCommandsController({ elements, flashStatus });
  const attachmentRenameController = createAttachmentRenameController({
    state,
    knowledgeApi,
    getCurrentNote,
    renderSidebar,
    flashStatus
  });

async function loadCurrentNoteSideData() {
  if (state.dataMode === 'local') {
    loadLocalNoteSideData(state.selectedNoteId);
    return;
  }
  await loadApiNoteSideData(state.selectedNoteId);
}

async function deleteAttachment(attachmentId) {
  if (!attachmentId) {
    flashStatus('缺少要删除的附件');
    return false;
  }

  const attachment = state.attachments.find((item) => item?.id === attachmentId);
  const currentNote = getCurrentNote();
  const currentMarkdown = state.draftMarkdown || currentNote?.rawMarkdown || '';
  if (attachment && isAttachmentReferencedInMarkdown(attachment, currentMarkdown)) {
    flashStatus('当前附件仍在正文中被引用，请先删除正文引用');
    return false;
  }

  await knowledgeApi.deleteAttachment(attachmentId);
  state.attachments = state.attachments.filter((attachment) => attachment?.id !== attachmentId);
  if (state.attachmentRenaming?.id === attachmentId) {
    state.attachmentRenaming = null;
  }
  renderSidebar(getCurrentNote());
  flashStatus('附件已删除');
  return true;
}

async function loadApiNoteSideData(noteId) {
  if (!noteId) {
    clearNoteSideData();
    syncAnnotationMarkers();
    return;
  }

  try {
    const note = state.allNotes.find((item) => item.id === noteId);
    const spaceId = note?.spaceId ?? state.currentSpaceId;
    const sideData = await knowledgeApi.loadNoteSideData({ noteId, spaceId });
    state.linkedNotes = sideData.linkedNotes;
    state.attachments = sideData.attachments;
    state.attachmentRenaming = null;
    state.annotations = sideData.annotations;
    state.annotationLoadState = 'loaded';
    syncAnnotationMarkers();
  } catch (error) {
    clearNoteSideData();
    syncAnnotationMarkers();
    flashStatus(`附加信息加载失败：${error.message}`);
  }
}

function loadLocalNoteSideData(noteId) {
  if (!noteId) {
    clearNoteSideData();
    syncAnnotationMarkers();
    return;
  }

  Object.assign(state, createLocalNoteSideData({ noteId, notes: state.allNotes, attachments: knowledgeBaseSeed.attachments }));
  state.annotations = [];
  state.attachmentRenaming = null;
  syncAnnotationMarkers();
}

function clearNoteSideData() {
  Object.assign(state, createClearedNoteSideData());
  state.annotations = [];
}

function findOutlineHeadingTarget(outlineId, outlineIndex) {
  if (!elements.editorContent) {
    return null;
  }

  if (outlineId) {
    const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(outlineId)
      : outlineId.replace(/"/g, '\\"');
    const directMatch = elements.editorContent.querySelector(`#${escapedId}`);
    if (directMatch) {
      return directMatch;
    }
  }

  if (!Number.isInteger(outlineIndex) || outlineIndex < 0) {
    return null;
  }

  const renderedHeadings = elements.editorContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
  return renderedHeadings.item(outlineIndex) ?? null;
}

function renderSidebar(note) {
  if (!elements.asideTabs || !elements.asideContent) {
    return;
  }

  elements.asideTabs.innerHTML = renderAsideTabs({
    tabs: ASIDE_TABS,
    activeKey: state.asideTab
  });

  const contentKey = resolveAsideContentKey({
    note,
    activeTab: state.asideTab
  });

  if (contentKey === 'empty') {
    elements.asideContent.innerHTML = renderAsideEmptyState();
    return;
  }

  switch (contentKey) {
    case 'outline':
      elements.asideContent.innerHTML = renderOutlineTab(note);
      return;
    case 'concepts':
      elements.asideContent.innerHTML = renderConceptsTab(note);
      return;
    case 'ai':
      elements.asideContent.innerHTML = renderAiTab(note);
      return;
    case 'info':
    default:
      elements.asideContent.innerHTML = renderInfoTab(note);
  }
}

function renderInfoTab(note) {
  return renderInfoTabMarkup({
    note,
    markdown: state.draftMarkdown || note.rawMarkdown || '',
    folderPath: buildFolderPath({
      folderId: note.folderId,
      foldersById: state.foldersById
    }),
    tags: state.tags,
    tagComposer: state.noteTagComposer,
    linkedNotes: state.linkedNotes,
    attachments: state.attachments,
    attachmentRenaming: state.attachmentRenaming,
    formatDate
  });
}

function renderOutlineTab() {
  const headings = extractMarkdownHeadings(state.draftMarkdown || '');
  const currentNote = getCurrentNote();
  const noteId = currentNote?.id ?? '';
  const collapsedHeadingIds = state.outlineCollapsedHeadingIdsByNote[noteId] ?? {};

  return renderOutlineTabMarkup({
    headings,
    noteId,
    collapsedHeadingIds
  });
}

function renderConceptsTab() {
  const items = state.annotations.filter((item) => item.status !== 'archived');
  if (!items.length) return '<div class="aside-empty">暂无重要内容标注</div>';
  return `<section class="annotation-panel">${items.map((item) => `<article class="annotation-card" data-annotation-id="${item.id}"><p>${item.quoteText}</p><small>${item.status === 'stale' ? '原文位置已变化' : '已标注'}</small><button type="button" data-annotation-jump="${item.id}">定位</button><button type="button" data-annotation-delete="${item.id}">删除</button></article>`).join('')}</section>`;
}

  return {
    // 本地方法 —— 直接引用
    loadCurrentNoteSideData,
    loadApiNoteSideData,
    loadLocalNoteSideData,
    clearNoteSideData,
    findOutlineHeadingTarget,
    renderSidebar,
    renderInfoTab,
    renderOutlineTab,
    renderConceptsTab,
    deleteAttachment,
    // attachmentCommands —— 通过子控制器委托
    findAttachmentReferenceTarget: (...args) => attachmentCommands.findAttachmentReferenceTarget(...args),
    jumpToAttachmentReference: (...args) => attachmentCommands.jumpToAttachmentReference(...args),
    openAttachment: (...args) => attachmentCommands.openAttachment(...args),
    copyAttachmentLink: (...args) => attachmentCommands.copyAttachmentLink(...args),
    // attachmentRenameController —— 展开子控制器方法
    ...attachmentRenameController
  };
}
