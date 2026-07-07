import assert from 'node:assert/strict';
import {
  renderAiTab,
  renderAsideEmptyInline,
  renderAsideEmptyState,
  renderAssignedTagPills,
  renderAttachments,
  renderAvailableTagPills,
  renderLinkedNotes,
  renderTagPills
} from '../lib/sidebar/renderers.js';

const html = renderAsideEmptyState();
assert.match(html, /aside-panel-empty/);
assert.match(html, /未打开笔记/);

assert.equal(renderAsideEmptyInline('<空>'), '<div class="aside-empty-inline">&lt;空&gt;</div>');

assert.match(renderAiTab({ title: '<AI>' }), /&lt;AI&gt;/);

const tags = [{ id: 'tag-1', name: '<JavaScript>', color: '#ffcc00' }];
assert.match(renderTagPills(tags), /&lt;JavaScript&gt;/);
assert.match(renderAssignedTagPills(tags), /data-note-tag-remove="tag-1"/);
assert.match(renderAvailableTagPills(tags), /data-note-tag-add="tag-1"/);

assert.match(
  renderLinkedNotes([{ id: 'note-1', title: '<Linked>', summary: '<Summary>' }]),
  /&lt;Linked&gt;[\s\S]*&lt;Summary&gt;/
);

assert.match(
  renderAttachments([{
    id: 'attachment-1',
    fileName: '<draft>.md',
    mimeType: 'text/markdown',
    contentUrl: '/api/storage/attachments/attachment-1/content',
    isReferenced: true
  }]),
  /data-attachment-id="attachment-1"[\s\S]*已引用[\s\S]*data-attachment-open="attachment-1"/
);

console.log('ok - sidebar renderers escape and render right rail fragments');
