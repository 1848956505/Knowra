import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const appFactoryTests = [
  {
    name: 'createAppContext wires knowledge module and handlers together',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');

      const app = createAppContext();

      assert.equal(typeof app.modules.knowledge.noteService.createNote, 'function');
      assert.equal(typeof app.http.knowledge.createNote, 'function');
      assert.equal(typeof app.http.knowledge.searchNotes, 'function');
      assert.equal(typeof app.http.storage.exportKnowledgeBase, 'function');
      assert.equal(typeof app.http.storage.uploadAttachment, 'function');
      assert.equal(typeof app.http.storage.deleteAttachment, 'function');
    }
  },
  {
    name: 'createAppContext storage handlers can export and import persistent data',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');

      const dataStore = {
        state: {
          spaces: [{ id: 'space-1' }],
          folders: [],
          tags: [],
          notes: [{ id: 'note-1', title: 'Persisted note' }],
          attachments: [{ id: 'attachment-1', noteId: 'note-1', fileName: 'hello.txt' }]
        },
        flush() {},
        exportSnapshot() {
          return {
            exportedAt: '2026-06-02T00:00:00.000Z',
            version: 'v1-local-json',
            data: {
              spaces: [...this.state.spaces],
              folders: [...this.state.folders],
              tags: [...this.state.tags],
              notes: [...this.state.notes],
              attachments: [...this.state.attachments]
            }
          };
        },
        importSnapshot(payload) {
          this.state.spaces.splice(0, this.state.spaces.length, ...(payload.data?.spaces ?? []));
          this.state.folders.splice(0, this.state.folders.length, ...(payload.data?.folders ?? []));
          this.state.tags.splice(0, this.state.tags.length, ...(payload.data?.tags ?? []));
          this.state.notes.splice(0, this.state.notes.length, ...(payload.data?.notes ?? []));
          this.state.attachments.splice(0, this.state.attachments.length, ...(payload.data?.attachments ?? []));
          return this.exportSnapshot();
        }
      };
      const attachmentStore = {
        exported: [
          {
            id: 'attachment-1',
            noteId: 'note-1',
            fileName: 'hello.txt',
            mimeType: 'text/plain',
            contentBase64: 'aGVsbG8='
          }
        ],
        exportAttachmentsSnapshot() {
          return this.exported;
        },
        importAttachmentsSnapshot(items) {
          this.exported = items;
          return items;
        }
      };

      const app = createAppContext({ dataStore, attachmentStore });
      const exported = app.http.storage.exportKnowledgeBase();
      const imported = app.http.storage.importKnowledgeBase({
        data: {
          spaces: [{ id: 'space-2' }],
          folders: [],
          tags: [],
          notes: [{ id: 'note-2', title: 'Imported note' }],
          attachments: [{ id: 'attachment-2', noteId: 'note-2', fileName: 'imported.txt' }]
        },
        attachmentFiles: [
          {
            id: 'attachment-2',
            noteId: 'note-2',
            fileName: 'imported.txt',
            mimeType: 'text/plain',
            contentBase64: 'aW1wb3J0ZWQ='
          }
        ]
      });

      assert.equal(exported.data.notes[0].id, 'note-1');
      assert.equal(exported.attachmentFiles[0].id, 'attachment-1');
      assert.equal(imported.data.notes[0].id, 'note-2');
      assert.equal(imported.attachmentFiles[0].id, 'attachment-2');
      assert.equal(dataStore.state.spaces[0].id, 'space-2');
    }
  },
  {
    name: 'createPersistentAppContext resolves storage paths from the workspace root instead of cwd',
    async run() {
      const { createPersistentAppContext, resolveStoragePath } = await import('../src/app.factory.js');
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'study-app-factory-'));
      const originalCwd = process.cwd();
      const apiCwd = originalCwd.endsWith(path.join('apps', 'api'))
        ? originalCwd
        : path.join(originalCwd, 'apps', 'api');

      try {
        process.chdir(apiCwd);

        const app = createPersistentAppContext({ storageRootDir: tempRoot });
        const expectedDataFilePath = path.join(tempRoot, 'storage', 'data', 'knowledge-base.json');
        const expectedUploadsDir = path.join(tempRoot, 'storage', 'uploads');

        assert.equal(fs.existsSync(expectedDataFilePath), true);
        assert.equal(fs.existsSync(expectedUploadsDir), true);
        assert.equal(resolveStoragePath('storage/data/knowledge-base.json', tempRoot), expectedDataFilePath);
        assert.equal(app.dataStore.state.notes.length, 0);
      } finally {
        process.chdir(originalCwd);
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  }
];
