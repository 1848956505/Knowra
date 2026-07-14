import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createContentAnnotationService } from '../src/modules/knowledge/application/content-annotation-service.js';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const note = { id: 'note-1', spaceId: 'space-1', rawMarkdown: 'alpha important beta', deleted: false };
const input = (key = 'request-1') => ({ spaceId: 'space-1', noteId: 'note-1', quoteText: 'important', fromPosition: 6, toPosition: 15, prefixText: 'alpha ', suffixText: ' beta', headingPath: [], anchorFingerprint: 'fingerprint', noteContentHash: hash(note.rawMarkdown), idempotencyKey: key });

export const contentAnnotationServiceTests = [{ name: 'content annotation service persists idempotently and archives annotations', async run() {
  const service = createContentAnnotationService({ noteRepository: { findById: () => note } });
  const created = service.createAnnotation(input());
  assert.equal(service.createAnnotation(input()).id, created.id);
  assert.equal(service.listAnnotationsByNote({ noteId: note.id }).length, 1);
  assert.equal(service.archiveAnnotation(created.id).status, 'archived');
  assert.equal(service.listAnnotationsByNote({ noteId: note.id }).length, 0);
  assert.equal(service.restoreAnnotation(created.id).status, 'active');
} }];
