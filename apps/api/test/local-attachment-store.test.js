import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const localAttachmentStoreTests = [
  {
    name: 'local attachment store uploads and lists note attachments',
    async run() {
      const { createLocalAttachmentStore } = await import('../src/infrastructure/local-attachment-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-attachments-'));
      const uploadsDir = path.join(tempDir, 'uploads');
      const dataStore = {
        state: {
          attachments: []
        },
        flush() {}
      };

      try {
        const store = createLocalAttachmentStore({ dataStore, uploadsDir });
        const uploaded = store.uploadAttachment({
          noteId: 'note-1',
          fileName: 'lesson.txt',
          mimeType: 'text/plain',
          contentBase64: Buffer.from('hello attachment').toString('base64')
        });

        const list = store.listAttachments({ noteId: 'note-1' });
        const content = store.readAttachmentContent(uploaded.id);

        assert.equal(list.length, 1);
        assert.equal(list[0].fileName, 'lesson.txt');
        assert.equal(content.attachment.id, uploaded.id);
        assert.equal(content.content.toString('utf8'), 'hello attachment');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'local attachment store exports and restores attachment file contents',
    async run() {
      const { createLocalAttachmentStore } = await import('../src/infrastructure/local-attachment-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-attachments-snapshot-'));
      const uploadsDir = path.join(tempDir, 'uploads');
      const dataStore = {
        state: {
          attachments: []
        },
        flush() {}
      };

      try {
        const store = createLocalAttachmentStore({ dataStore, uploadsDir });
        const uploaded = store.uploadAttachment({
          noteId: 'note-export',
          fileName: 'diagram.txt',
          mimeType: 'text/plain',
          contentBase64: Buffer.from('attachment snapshot body').toString('base64')
        });

        const exported = store.exportAttachmentsSnapshot();
        fs.rmSync(uploaded.storagePath, { force: true });
        dataStore.state.attachments.splice(0, dataStore.state.attachments.length);

        const restored = store.importAttachmentsSnapshot(exported);
        const content = store.readAttachmentContent(uploaded.id);

        assert.equal(exported.length, 1);
        assert.equal(exported[0].contentBase64, Buffer.from('attachment snapshot body').toString('base64'));
        assert.equal(restored.length, 1);
        assert.equal(content.content.toString('utf8'), 'attachment snapshot body');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'local attachment store deletes attachment metadata and file content together',
    async run() {
      const { createLocalAttachmentStore } = await import('../src/infrastructure/local-attachment-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-attachments-delete-'));
      const uploadsDir = path.join(tempDir, 'uploads');
      const dataStore = {
        state: {
          attachments: []
        },
        flush() {}
      };

      try {
        const store = createLocalAttachmentStore({ dataStore, uploadsDir });
        const uploaded = store.uploadAttachment({
          noteId: 'note-delete',
          fileName: 'delete-me.txt',
          mimeType: 'text/plain',
          contentBase64: Buffer.from('delete attachment body').toString('base64')
        });

        const deleted = store.deleteAttachment(uploaded.id);

        assert.equal(deleted.id, uploaded.id);
        assert.equal(store.listAttachments({ noteId: 'note-delete' }).length, 0);
        assert.equal(fs.existsSync(uploaded.storagePath), false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'readAttachmentContent returns 404 when the attachment record is missing',
    async run() {
      const { createLocalAttachmentStore } = await import('../src/infrastructure/local-attachment-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-attachments-missing-record-'));
      const dataStore = { state: { attachments: [] }, flush() {} };

      try {
        const store = createLocalAttachmentStore({ dataStore, uploadsDir: path.join(tempDir, 'uploads') });
        let captured;
        try {
          store.readAttachmentContent('attachment-does-not-exist');
        } catch (error) {
          captured = error;
        }

        assert.ok(captured, 'readAttachmentContent must throw when the record is missing');
        assert.equal(captured.statusCode, 404, 'missing record must surface as 404, not a generic 400');
        assert.equal(captured.code, 'ATTACHMENT_NOT_FOUND');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'readAttachmentContent returns 404 when the file is missing on disk',
    async run() {
      const { createLocalAttachmentStore } = await import('../src/infrastructure/local-attachment-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-attachments-missing-file-'));
      const uploadsDir = path.join(tempDir, 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });

      const dataStore = {
        state: {
          attachments: [{
            id: 'attachment-orphan',
            noteId: 'note-1',
            fileName: 'picture.png',
            mimeType: 'image/png',
            size: 0,
            storagePath: path.join(uploadsDir, 'attachment-orphan-picture.png'),
            createdAt: new Date().toISOString()
          }]
        },
        flush() {}
      };

      try {
        const store = createLocalAttachmentStore({ dataStore, uploadsDir });
        let captured;
        try {
          store.readAttachmentContent('attachment-orphan');
        } catch (error) {
          captured = error;
        }

        assert.ok(captured, 'readAttachmentContent must throw when the file is missing');
        assert.equal(captured.statusCode, 404, 'missing file must surface as 404, not a generic 400');
        assert.equal(captured.code, 'ATTACHMENT_FILE_MISSING');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'deleteAttachment returns 404 when the record is missing',
    async run() {
      const { createLocalAttachmentStore } = await import('../src/infrastructure/local-attachment-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-attachments-delete-missing-'));
      const dataStore = { state: { attachments: [] }, flush() {} };

      try {
        const store = createLocalAttachmentStore({ dataStore, uploadsDir: path.join(tempDir, 'uploads') });
        let captured;
        try {
          store.deleteAttachment('attachment-does-not-exist');
        } catch (error) {
          captured = error;
        }

        assert.ok(captured, 'deleteAttachment must throw when the record is missing');
        assert.equal(captured.statusCode, 404);
        assert.equal(captured.code, 'ATTACHMENT_NOT_FOUND');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }
];
