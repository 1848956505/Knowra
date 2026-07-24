import assert from 'node:assert/strict';

export const knowledgeModuleTests = [
  {
    name: 'createKnowledgeModule exposes core services',
    async run() {
      const { createKnowledgeModule } = await import('../src/modules/knowledge/index.js');

      const module = createKnowledgeModule();

      assert.equal(typeof module.noteService.createNote, 'function');
      assert.equal(typeof module.folderService.createFolder, 'function');
      assert.equal(typeof module.tagService.createTag, 'function');
      assert.equal(typeof module.contentAnnotationService.createAnnotation, 'function');
      assert.equal(typeof module.knowledgeSpaceService.createDefaultKnowledgeSpace, 'function');
      assert.equal(typeof module.searchService.searchNotes, 'function');
    }
  }
];
