import { escapeAttribute, escapeHtml } from '../../src/app/formatting.js';

export function renderAnnotationPanel(annotations = []) {
  const items = annotations.filter((item) => item?.status !== 'archived');
  if (!items.length) {
    return '<div class="aside-empty">暂无重要内容标注</div>';
  }

  return `<section class="annotation-panel">${items.map(renderAnnotationCard).join('')}</section>`;
}

function renderAnnotationCard(annotation) {
  const id = escapeAttribute(annotation?.id);
  const quoteText = escapeHtml(annotation?.quoteText);
  const statusLabel = annotation?.status === 'stale'
    ? '原文位置已变化'
    : '已标注';

  return `<article class="annotation-card" data-annotation-id="${id}"><p>${quoteText}</p><small>${statusLabel}</small><button type="button" data-annotation-jump="${id}">定位</button><button type="button" data-annotation-delete="${id}">删除</button></article>`;
}
