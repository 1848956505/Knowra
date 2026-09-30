import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachmentIdsInText, hasAttachmentReference } from '../src/attachments.js';
test('资源路径单次解码，fragment 不覆盖，异常编码不崩溃', () => {
  assert.deepEqual(attachmentIdsInText('[x](/api/storage/attachments/%61ttachment-real/content#attachment=wrong)'), ['attachment-real']);
  assert.deepEqual(attachmentIdsInText('/api/storage/attachments/%ZZ/content'), []);
  assert.deepEqual(attachmentIdsInText('/api/storage/attachments/a%2Fb/content'), []);
  assert.deepEqual(attachmentIdsInText('/api/storage/attachments/id/content-else'), []);
  assert.deepEqual(attachmentIdsInText('<img src="https://host/api/storage/attachments/id/content?download=1">'), ['id']);
  assert(hasAttachmentReference({ history: [{ sourceType: 'attachment', sourceId: 'id' }] }, 'id'));
  const cyclic = {}; cyclic.self = cyclic; assert(!hasAttachmentReference(cyclic, 'id'));
});
