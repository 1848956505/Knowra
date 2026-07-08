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
import { renderKnowledgePointPanel } from '../../lib/knowledge-points/panel.js';
import { createAttachmentCommandsController } from './sidebar/attachment-commands-controller.js';
import { isAttachmentReferencedInMarkdown } from '../../lib/sidebar/attachments.js';

export function createSidebarController(deps) {
  const {
    state,
    elements,
    knowledgeApi,
    getCurrentNote,
    syncKnowledgePointMarkers,
    flashStatus,
    formatDate
  } = deps;

  const attachmentCommands = createAttachmentCommandsController({ elements, flashStatus });

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
  renderSidebar(getCurrentNote());
  flashStatus('附件已删除');
  return true;
}

async function loadApiNoteSideData(noteId) {
  if (!noteId) {
    clearNoteSideData();
    syncKnowledgePointMarkers();
    return;
  }

  try {
    const note = state.allNotes.find((item) => item.id === noteId);
    const spaceId = note?.spaceId ?? state.currentSpaceId;
    const sideData = await knowledgeApi.loadNoteSideData({ noteId, spaceId });
    state.linkedNotes = sideData.linkedNotes;
    state.attachments = sideData.attachments;
    state.knowledgePoints = sideData.knowledgePoints;
    state.allKnowledgePoints = sideData.allKnowledgePoints;
    state.knowledgePointTagGroups = sideData.knowledgePointTagGroups;
    syncKnowledgePointMarkers();
  } catch (error) {
    clearNoteSideData({ keepEditing: true });
    syncKnowledgePointMarkers();
    flashStatus(`附加信息加载失败：${error.message}`);
  }
}

function loadLocalNoteSideData(noteId) {
  if (!noteId) {
    clearNoteSideData();
    syncKnowledgePointMarkers();
    return;
  }

  Object.assign(state, createLocalNoteSideData({
    noteId,
    notes: state.allNotes,
    attachments: knowledgeBaseSeed.attachments
  }));
  syncKnowledgePointMarkers();
}

function clearNoteSideData({ keepEditing = false } = {}) {
  Object.assign(state, createClearedNoteSideData({
    editing: state.knowledgePointEditing,
    keepEditing
  }));
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

function renderConceptsTab(note) {
  return renderKnowledgePointPanel({
    note,
    points: state.knowledgePoints,
    tagGroups: state.knowledgePointTagGroups,
    availablePoints: state.allKnowledgePoints,
    filters: state.knowledgePointFilters,
    attachComposer: state.knowledgePointAttachComposer,
    expandedIds: state.expandedKnowledgePointIds,
    editing: state.knowledgePointEditing
  });
}

function findAttachmentReferenceTarget(attachmentId) {
  return attachmentCommands.findAttachmentReferenceTarget(attachmentId);
}

function jumpToAttachmentReference(attachmentId) {
  return attachmentCommands.jumpToAttachmentReference(attachmentId);
}

function openAttachment(attachmentId) {
  return attachmentCommands.openAttachment(attachmentId);
}

async function copyAttachmentLink(attachmentId) {
  return attachmentCommands.copyAttachmentLink(attachmentId);
}

  return {
    loadCurrentNoteSideData,
    loadApiNoteSideData,
    loadLocalNoteSideData,
    clearNoteSideData,
    findOutlineHeadingTarget,
    renderSidebar,
    renderInfoTab,
    renderOutlineTab,
    renderConceptsTab,
    findAttachmentReferenceTarget,
    jumpToAttachmentReference,
    openAttachment,
    copyAttachmentLink,
    deleteAttachment
  };
}
