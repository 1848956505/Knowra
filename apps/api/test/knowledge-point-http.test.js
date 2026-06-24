import assert from 'node:assert/strict';

export const knowledgePointHttpTests = [
  {
    name: 'knowledge handlers create and list knowledge points for a note',
    async run() {
      const { createKnowledgeModule } = await import('../src/modules/knowledge/index.js');
      const { createKnowledgeHttpHandlers } = await import('../src/modules/knowledge/http/knowledge-handlers.js');

      const handlers = createKnowledgeHttpHandlers({
        knowledgeModule: createKnowledgeModule()
      });

      const created = handlers.createKnowledgePoint({
        id: 'http-kp-1',
        spaceId: 'space-1',
        noteId: 'note-1',
        title: 'HTTP knowledge point',
        sources: [{ id: 'http-source-1', noteId: 'note-1', sourceText: 'source text' }]
      });
      const listed = handlers.listKnowledgePoints({
        spaceId: 'space-1',
        noteId: 'note-1'
      });

      assert.equal(created.id, 'http-kp-1');
      assert.equal(listed.length, 1);
      assert.equal(listed[0].sources[0].sourceText, 'source text');
    }
  },
  {
    name: 'knowledge handlers expose knowledge point tag groups',
    async run() {
      const { createKnowledgeModule } = await import('../src/modules/knowledge/index.js');
      const { createKnowledgeHttpHandlers } = await import('../src/modules/knowledge/http/knowledge-handlers.js');

      const handlers = createKnowledgeHttpHandlers({
        knowledgeModule: createKnowledgeModule()
      });

      const groups = handlers.listKnowledgePointTagGroups({ spaceId: 'space-http-tags' });

      assert.deepEqual(groups.map((group) => group.code), ['ordinary', 'mastery', 'importance', 'purpose']);
      assert.equal(groups.find((group) => group.code === 'importance').selectionMode, 'single');
    }
  }
];
