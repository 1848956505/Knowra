import assert from 'node:assert/strict';

export const batch5OperationAccessTests = [
  {
    name: 'knowledge operations use explicit metadata including merge and reorder mutations',
    async run() {
      const { getKnowledgeOperationAccess } = await import('../src/infrastructure/knowledge-operation-access.js');
      assert.equal(getKnowledgeOperationAccess('mergeTags'), 'mutation');
      assert.equal(getKnowledgeOperationAccess('reorderTags'), 'mutation');
      assert.equal(getKnowledgeOperationAccess('searchNotes'), 'read');
      assert.throws(
        () => getKnowledgeOperationAccess('futureWriteThatNeedsClassification'),
        /missing explicit operation access metadata/
      );
    }
  },
  {
    name: 'maintenance and PostgreSQL wrappers serialize merge and reorder as writes',
    async run() {
      const { createMaintenanceGate, wrapHandlersWithMaintenanceGate } = await import('../src/infrastructure/maintenance-gate.js');
      const { wrapHandlersWithPostgresAdvisoryLock } = await import('../src/infrastructure/postgres-advisory-lock.js');
      const events = [];
      const advisoryLock = {
        async runShared(operation) { events.push('shared'); return operation(); },
        async runExclusive(operation) { events.push('exclusive'); return operation(); }
      };
      const gate = createMaintenanceGate();
      const handlers = wrapHandlersWithMaintenanceGate(
        wrapHandlersWithPostgresAdvisoryLock({
          mergeTags() { events.push('merge'); },
          reorderTags() { events.push('reorder'); },
          listTags() { events.push('list'); }
        }, advisoryLock),
        gate
      );

      await handlers.mergeTags();
      await handlers.reorderTags();
      await handlers.listTags();
      assert.deepEqual(events, ['exclusive', 'merge', 'exclusive', 'reorder', 'shared', 'list']);
    }
  }
];
