import assert from 'node:assert/strict';

export const knowledgePointServiceTests = [
  {
    name: 'knowledge point service creates a point with source and note relation',
    async run() {
      const { createKnowledgePointService } = await import('../src/modules/knowledge/application/knowledge-point-service.js');
      const service = createKnowledgePointService();

      const created = service.createKnowledgePoint({
        id: 'kp-1',
        spaceId: 'space-1',
        noteId: 'note-1',
        title: ' CLIP contrastive loss ',
        comment: 'Own explanation',
        tagIds: ['tag-clip'],
        sources: [
          {
            id: 'source-1',
            noteId: 'note-1',
            sourceText: 'CLIP uses a contrastive loss.',
            startOffset: 10,
            endOffset: 39,
            contextBefore: 'Before',
            contextAfter: 'After'
          }
        ]
      });

      assert.equal(created.id, 'kp-1');
      assert.equal(created.title, 'CLIP contrastive loss');
      assert.equal(created.sources.length, 1);
      assert.equal(created.sources[0].sourceText, 'CLIP uses a contrastive loss.');
      assert.deepEqual(created.tagIds, ['tag-clip']);
      assert.deepEqual(created.noteIds, ['note-1']);
    }
  },
  {
    name: 'knowledge point service lists active points for current note only',
    async run() {
      const { createKnowledgePointService } = await import('../src/modules/knowledge/application/knowledge-point-service.js');
      const service = createKnowledgePointService();

      service.createKnowledgePoint({
        id: 'kp-note-a',
        spaceId: 'space-1',
        noteId: 'note-a',
        title: 'A',
        sources: [{ id: 'source-a', noteId: 'note-a', sourceText: 'A source' }]
      });
      service.createKnowledgePoint({
        id: 'kp-note-b',
        spaceId: 'space-1',
        noteId: 'note-b',
        title: 'B',
        sources: [{ id: 'source-b', noteId: 'note-b', sourceText: 'B source' }]
      });

      const notePoints = service.listKnowledgePoints({
        spaceId: 'space-1',
        noteId: 'note-a'
      });

      assert.equal(notePoints.length, 1);
      assert.equal(notePoints[0].id, 'kp-note-a');
      assert.equal(notePoints[0].sources[0].id, 'source-a');
    }
  },
  {
    name: 'knowledge point service updates title comment and tags',
    async run() {
      const { createKnowledgePointService } = await import('../src/modules/knowledge/application/knowledge-point-service.js');
      const service = createKnowledgePointService();

      service.createKnowledgePoint({
        id: 'kp-update',
        spaceId: 'space-1',
        noteId: 'note-1',
        title: 'Old title',
        comment: 'old',
        tagIds: ['tag-old'],
        sources: [{ id: 'source-update', noteId: 'note-1', sourceText: 'source' }]
      });

      const updated = service.updateKnowledgePoint('kp-update', {
        title: 'New title',
        comment: 'new',
        tagIds: ['tag-new-a', 'tag-new-b']
      });

      assert.equal(updated.title, 'New title');
      assert.equal(updated.comment, 'new');
      assert.deepEqual(updated.tagIds, ['tag-new-a', 'tag-new-b']);
    }
  },
  {
    name: 'knowledge point service adds and removes source snippets while keeping one source',
    async run() {
      const { createKnowledgePointService } = await import('../src/modules/knowledge/application/knowledge-point-service.js');
      const service = createKnowledgePointService();

      service.createKnowledgePoint({
        id: 'kp-source',
        spaceId: 'space-1',
        noteId: 'note-1',
        title: 'Source test',
        sources: [{ id: 'source-first', noteId: 'note-1', sourceText: 'first source' }]
      });

      const withSecond = service.addSourceToKnowledgePoint('kp-source', {
        id: 'source-second',
        noteId: 'note-1',
        sourceText: 'second source',
        sortOrder: 2
      });
      const afterDelete = service.deleteKnowledgePointSource('source-second');

      assert.deepEqual(withSecond.sources.map((source) => source.id), ['source-first', 'source-second']);
      assert.deepEqual(afterDelete.sources.map((source) => source.id), ['source-first']);
      assert.throws(
        () => service.deleteKnowledgePointSource('source-first'),
        /at least one source/i
      );
    }
  },
  {
    name: 'knowledge point service removes note relation when deleting the last source from that note',
    async run() {
      const { createKnowledgePointService } = await import('../src/modules/knowledge/application/knowledge-point-service.js');
      const service = createKnowledgePointService();

      service.createKnowledgePoint({
        id: 'kp-note-source',
        spaceId: 'space-1',
        noteId: 'note-1',
        title: 'Shared point',
        sources: [{ id: 'source-note-1', noteId: 'note-1', sourceText: 'first note source' }]
      });
      service.addSourceToKnowledgePoint('kp-note-source', {
        id: 'source-note-2',
        noteId: 'note-2',
        sourceText: 'second note source'
      });

      assert.deepEqual(
        service.listKnowledgePoints({ spaceId: 'space-1', noteId: 'note-2' }).map((point) => point.id),
        ['kp-note-source']
      );

      service.deleteKnowledgePointSource('source-note-2');

      assert.deepEqual(
        service.listKnowledgePoints({ spaceId: 'space-1', noteId: 'note-2' }).map((point) => point.id),
        []
      );
      assert.deepEqual(
        service.listKnowledgePoints({ spaceId: 'space-1', noteId: 'note-1' }).map((point) => point.id),
        ['kp-note-source']
      );
    }
  },
  {
    name: 'knowledge point service soft deletes points from default list',
    async run() {
      const { createKnowledgePointService } = await import('../src/modules/knowledge/application/knowledge-point-service.js');
      const service = createKnowledgePointService();

      service.createKnowledgePoint({
        id: 'kp-delete',
        spaceId: 'space-1',
        noteId: 'note-1',
        title: 'Delete me',
        sources: [{ id: 'source-delete', noteId: 'note-1', sourceText: 'delete source' }]
      });

      const deleted = service.deleteKnowledgePoint('kp-delete');
      const active = service.listKnowledgePoints({ spaceId: 'space-1' });
      const all = service.listKnowledgePoints({ spaceId: 'space-1', includeDeleted: true });

      assert.ok(deleted.deletedAt);
      assert.equal(active.length, 0);
      assert.equal(all.length, 1);
      assert.equal(all[0].id, 'kp-delete');
    }
  },
  {
    name: 'knowledge point service returns built-in tag groups with system tags',
    async run() {
      const { createKnowledgePointService } = await import('../src/modules/knowledge/application/knowledge-point-service.js');
      const { createInMemoryTagRepository } = await import('../src/modules/knowledge/infrastructure/tag-repository.js');
      const { createInMemoryTagGroupRepository } = await import('../src/modules/knowledge/infrastructure/knowledge-point-repository.js');
      const service = createKnowledgePointService({
        tagRepository: createInMemoryTagRepository(),
        tagGroupRepository: createInMemoryTagGroupRepository()
      });

      const groups = service.listKnowledgePointTagGroups({ spaceId: 'space-tags' });

      assert.deepEqual(groups.map((group) => group.code), ['ordinary', 'mastery', 'importance', 'purpose']);
      assert.equal(groups.find((group) => group.code === 'mastery').selectionMode, 'single');
      assert.equal(groups.find((group) => group.code === 'purpose').selectionMode, 'multiple');
      assert.deepEqual(
        groups.find((group) => group.code === 'mastery').tags.map((tag) => tag.code),
        ['not-mastered', 'fuzzy', 'mastered']
      );
    }
  },
  {
    name: 'knowledge point service rejects multiple tags in a single-select system group',
    async run() {
      const { createKnowledgePointService } = await import('../src/modules/knowledge/application/knowledge-point-service.js');
      const { createInMemoryTagRepository } = await import('../src/modules/knowledge/infrastructure/tag-repository.js');
      const { createInMemoryTagGroupRepository } = await import('../src/modules/knowledge/infrastructure/knowledge-point-repository.js');
      const service = createKnowledgePointService({
        tagRepository: createInMemoryTagRepository(),
        tagGroupRepository: createInMemoryTagGroupRepository()
      });

      const groups = service.listKnowledgePointTagGroups({ spaceId: 'space-single' });
      const masteryTags = groups.find((group) => group.code === 'mastery').tags;

      assert.throws(
        () => service.createKnowledgePoint({
          id: 'kp-invalid-single',
          spaceId: 'space-single',
          noteId: 'note-1',
          title: 'Invalid single selection',
          tagIds: masteryTags.slice(0, 2).map((tag) => tag.id),
          sources: [{ id: 'source-invalid-single', noteId: 'note-1', sourceText: 'source' }]
        }),
        /single-select tag group/i
      );
    }
  },
  {
    name: 'knowledge point service filters points by combined tag ids',
    async run() {
      const { createKnowledgePointService } = await import('../src/modules/knowledge/application/knowledge-point-service.js');
      const { createInMemoryTagRepository } = await import('../src/modules/knowledge/infrastructure/tag-repository.js');
      const { createInMemoryTagGroupRepository } = await import('../src/modules/knowledge/infrastructure/knowledge-point-repository.js');
      const tagRepository = createInMemoryTagRepository();
      const service = createKnowledgePointService({
        tagRepository,
        tagGroupRepository: createInMemoryTagGroupRepository()
      });
      const groups = service.listKnowledgePointTagGroups({ spaceId: 'space-filter' });
      const mastered = groups.find((group) => group.code === 'mastery').tags.find((tag) => tag.code === 'mastered');
      tagRepository.save({ id: 'tag-free', spaceId: 'space-filter', name: 'CLIP', color: 'slate' });

      service.createKnowledgePoint({
        id: 'kp-filter-hit',
        spaceId: 'space-filter',
        noteId: 'note-1',
        title: 'Hit',
        tagIds: ['tag-free', mastered.id],
        sources: [{ id: 'source-filter-hit', noteId: 'note-1', sourceText: 'hit source' }]
      });
      service.createKnowledgePoint({
        id: 'kp-filter-miss',
        spaceId: 'space-filter',
        noteId: 'note-1',
        title: 'Miss',
        tagIds: ['tag-free'],
        sources: [{ id: 'source-filter-miss', noteId: 'note-1', sourceText: 'miss source' }]
      });

      const filtered = service.listKnowledgePoints({
        spaceId: 'space-filter',
        tagIds: ['tag-free', mastered.id]
      });

      assert.deepEqual(filtered.map((point) => point.id), ['kp-filter-hit']);
    }
  }
];
