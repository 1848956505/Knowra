import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const fileDataStoreTests = [
  {
    name: 'file data store exports and imports snapshot data',
    async run() {
      const { createFileDataStore } = await import('../src/infrastructure/file-data-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-store-'));
      const filePath = path.join(tempDir, 'knowledge-base.json');

      try {
        const store = createFileDataStore(filePath);
        store.state.spaces.push({ id: 'space-1', userId: 'user-1', name: 'Default Space' });
        store.state.notes.push({ id: 'note-1', title: 'Original note' });
        store.flush();

        const exported = store.exportSnapshot();
        assert.equal(exported.version, 'v1-local-json');
        assert.equal(exported.data.notes.length, 1);

        const imported = store.importSnapshot({
          data: {
            spaces: [{ id: 'space-2', userId: 'user-2', name: 'Imported Space' }],
            folders: [{ id: 'folder-1', spaceId: 'space-2', name: 'Imported Folder' }],
            tags: [{ id: 'tag-1', spaceId: 'space-2', name: 'Imported Tag', color: 'slate' }],
            notes: [{ id: 'note-2', title: 'Imported note', rawMarkdown: '# Imported' }],
            contentAnnotations: [{ id: 'annotation-1', spaceId: 'space-2', noteId: 'note-2', quoteText: 'Imported annotation' }]
          }
        });

        assert.equal(imported.data.spaces[0].id, 'space-2');
        assert.equal(store.state.notes.length, 1);
        assert.equal(store.state.notes[0].id, 'note-2');

        const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        assert.equal(persisted.notes[0].id, 'note-2');
        assert.equal(persisted.folders[0].id, 'folder-1');
        assert.equal(persisted.contentAnnotations[0].id, 'annotation-1');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }
];
