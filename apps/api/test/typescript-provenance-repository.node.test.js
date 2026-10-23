import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createInMemoryKnowledgeArtifactProvenanceRepository } from '../src/modules/knowledge/infrastructure/knowledge-artifact-provenance-repository.js';
import { createKnowledgeArtifactProvenanceReader } from '../src/modules/knowledge/application/knowledge-artifact-provenance-read.js';
import { validateKnowledgeArtifactProvenanceRelations } from '../src/modules/knowledge/domain/knowledge-artifact-provenance-state.js';
import {
  createLegacyKnowledgeArtifactProvenance,
  hashKnowledgeArtifactProvenance,
  knowledgeArtifactProvenanceId
} from '../src/modules/knowledge/domain/knowledge-artifact-provenance-contract.js';

const sha = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const content = '来源😀';
  const record = {
    id: knowledgeArtifactProvenanceId('item'),
    schemaVersion: 1,
    state: 'recorded',
    artifactKind: 'knowledgeItem',
    artifactId: 'item',
    executionMode: 'mock',
    provider: 'mock',
    modelId: 'model',
    promptVersion: 'prompt',
    resultSchemaVersion: 'result',
    origin: {
      jobId: 'job',
      requestId: 'request',
      scopeId: 'scope',
      spaceId: 'historical',
      receiptHash: sha('receipt')
    },
    inputHash: sha('input'),
    outputHash: sha('output'),
    committedAt: '2026-10-22T00:00:00.000Z',
    sources: [
      {
        evidenceId: 'evidence',
        sourceId: 'source',
        noteId: 'note',
        originNoteVersionId: 'original',
        contentHash: sha(content),
        start: 0,
        end: content.length,
        quoteText: content,
        quoteHash: sha(content),
        annotationRevisions: [{ annotationId: 'annotation', revision: 1 }]
      }
    ]
  };
  record.provenanceHash = hashKnowledgeArtifactProvenance(record);
  return {
    record,
    item: { id: 'item', sourceMode: 'ai' },
    evidence: {
      id: 'evidence',
      knowledgeItemId: 'item',
      noteId: 'note',
      sourceType: 'noteVersion',
      noteVersionId: 'original',
      quoteText: content,
      status: 'valid',
      applicabilityStatus: 'active'
    },
    note: { id: 'note', spaceId: 'current', rawMarkdown: content },
    space: { id: 'current', userId: 'owner' },
    versions: [{ id: 'original', noteId: 'note', content, contentHash: sha(content) }]
  };
}
const synchronous = value => {
  assert.equal(value instanceof Promise, false);
  return value;
};
const mutate = record => {
  record.origin.requestId = 'changed';
  record.sources[0].annotationRevisions[0].revision = 99;
};

test('provenance repository and reader bridges preserve every export identity', async () => {
  for (const path of [
    'infrastructure/knowledge-artifact-provenance-repository',
    'application/knowledge-artifact-provenance-read'
  ]) {
    const js = await import(`../src/modules/knowledge/${path}.js`);
    const ts = await import(`../src/modules/knowledge/${path}.ts`);
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const name of Object.keys(js)) assert.equal(js[name], ts[name]);
  }
});

test('repository preserves external array identity, synchronous operations and deep clone isolation', () => {
  const { record } = fixture();
  const expected = structuredClone(record);
  const records = [];
  const changes = [];
  const repo = createInMemoryKnowledgeArtifactProvenanceRepository({ records, onChange: value => changes.push(value) });
  const created = synchronous(repo.create(record));
  assert.deepEqual(created, expected);
  assert.equal(changes.length, 1);
  assert.equal(changes[0], records);
  mutate(record);
  mutate(created);
  assert.deepEqual(records, [expected]);
  for (const result of [
    repo.findById(expected.id),
    repo.findByArtifactId('item'),
    repo.list()[0],
    repo.list({ artifactId: 'item' })[0],
    repo.create(expected),
    repo.upgradeLegacy(expected)
  ]) {
    mutate(synchronous(result));
    assert.deepEqual(records, [expected]);
  }
  assert.equal(changes.length, 1, 'idempotent writes never invoke onChange');
  assert.equal(synchronous(repo.findById('missing')), null);
  assert.equal(synchronous(repo.findByArtifactId('missing')), null);
  assert.deepEqual(synchronous(repo.list({ artifactId: 'missing' })), []);
  const stored = records[0];
  const deleted = synchronous(repo.deleteByKnowledgeItemId('item'));
  assert.deepEqual(deleted, [expected]);
  mutate(deleted[0]);
  assert.deepEqual(stored, expected);
  assert.deepEqual(records, []);
  assert.equal(changes.length, 2);
  assert.equal(changes[1], records);
  assert.deepEqual(synchronous(repo.deleteByKnowledgeItemId('missing')), []);
  assert.equal(changes.length, 2);
});

test('repository successful legacy upgrades clone input and results without replacing the array', () => {
  const { record } = fixture();
  const expected = structuredClone(record);
  const legacy = createLegacyKnowledgeArtifactProvenance('item');
  const records = [legacy];
  let changes = 0;
  const repo = createInMemoryKnowledgeArtifactProvenanceRepository({
    records,
    onChange: value => {
      assert.equal(value, records);
      changes += 1;
    }
  });
  const upgraded = synchronous(repo.upgradeLegacy(record));
  assert.deepEqual(upgraded, expected);
  assert.notEqual(records[0], legacy);
  mutate(record);
  mutate(upgraded);
  assert.deepEqual(records, [expected]);
  assert.equal(legacy.state, 'legacy-unavailable');
  assert.equal(changes, 1);
});

test('repository failed create and legacy upgrade roll back, while failed delete remains deleted', () => {
  const { record } = fixture();
  const failure = new Error('persist failed');
  const legacy = createLegacyKnowledgeArtifactProvenance('item');
  const untouched = createLegacyKnowledgeArtifactProvenance('other');
  const records = [untouched];
  const repo = createInMemoryKnowledgeArtifactProvenanceRepository({
    records,
    onChange: value => {
      assert.equal(value, records);
      throw failure;
    }
  });
  assert.throws(
    () => repo.create(record),
    error => error === failure
  );
  assert.deepEqual(records, [untouched]);
  assert.equal(records[0], untouched);
  records.push(legacy);
  assert.throws(
    () => repo.upgradeLegacy(record),
    error => error === failure
  );
  assert.equal(records[1], legacy, 'rollback restores the exact original object');
  assert.throws(
    () => repo.create(record),
    error => error.code === 'KNOWLEDGE_ARTIFACT_PROVENANCE_CONFLICT' && error.statusCode === 409
  );
  assert.throws(
    () => repo.deleteByKnowledgeItemId('item'),
    error => error === failure
  );
  assert.deepEqual(records, [untouched], 'delete deliberately has no local rollback');
});

function ports(data, asynchronous) {
  const calls = [];
  const port = (name, method, read) => ({
    [method]: id => {
      calls.push([name, id]);
      const value = read(id);
      return asynchronous ? Promise.resolve(value) : value;
    }
  });
  return {
    calls,
    repositories: {
      knowledgeItemRepository: port('item', 'findById', id => (data.item?.id === id ? data.item : null)),
      knowledgeArtifactProvenanceRepository: port('record', 'findByArtifactId', () => data.record),
      knowledgeEvidenceRepository: port('evidence', 'findById', id =>
        data.evidence?.id === id ? data.evidence : null
      ),
      noteRepository: port('note', 'findById', id => (data.note?.id === id ? data.note : null)),
      knowledgeSpaceRepository: port('space', 'findById', id => (data.space?.id === id ? data.space : null)),
      noteVersionRepository: port('version', 'findById', id => data.versions.find(row => row.id === id) ?? null)
    }
  };
}
async function read(data, asynchronous, owner = 'owner') {
  const { calls, repositories } = ports(data, asynchronous);
  try {
    return { result: await createKnowledgeArtifactProvenanceReader(repositories)('item', owner), calls };
  } catch (error) {
    return {
      error: { name: error.name, code: error.code, statusCode: error.statusCode, message: error.message },
      calls
    };
  }
}
async function equivalent(data, owner = 'owner') {
  const sync = await read(data, false, owner);
  assert.deepEqual(await read(data, true, owner), sync);
  return sync;
}

test('reader six sync and Promise ports preserve current-host authorization and independent projections', async () => {
  const data = fixture();
  const { result, calls } = await equivalent(data);
  assert.deepEqual(result, {
    artifactId: 'item',
    state: 'recorded',
    record: data.record,
    sources: [
      {
        evidenceId: 'evidence',
        originalVersionId: 'original',
        resolvedVersionId: 'original',
        aliasUsed: false,
        sourceState: 'available'
      }
    ]
  });
  assert.ok(calls.some(([name, id]) => name === 'space' && id === 'current'));
  assert.ok(!calls.some(([, id]) => id === 'historical'));
  mutate(result.record);
  assert.equal(data.record.origin.requestId, 'request');
  for (const owner of ['', 'other'])
    assert.equal((await equivalent(data, owner)).error.code, 'KNOWLEDGE_ITEM_NOT_FOUND');
  data.space.userId = 'other';
  assert.equal((await equivalent(data)).error.statusCode, 404);
});

test('reader absent and legacy records retain no-source-authorization behavior and required errors', async () => {
  const data = fixture();
  data.record = null;
  data.item.sourceMode = 'manual';
  assert.deepEqual(await equivalent(data, ''), {
    result: { artifactId: 'item', state: 'absent', record: null, sources: [] },
    calls: [
      ['item', 'item'],
      ['record', 'item']
    ]
  });
  data.record = createLegacyKnowledgeArtifactProvenance('item');
  data.item.sourceMode = 'ai';
  const legacy = await equivalent(data, '');
  assert.deepEqual(legacy.result, {
    artifactId: 'item',
    state: 'legacy-unavailable',
    record: data.record,
    sources: []
  });
  assert.deepEqual(legacy.calls, [
    ['item', 'item'],
    ['record', 'item']
  ]);
  data.record = null;
  const required = await equivalent(data);
  assert.equal(required.error.code, 'KNOWLEDGE_ARTIFACT_PROVENANCE_REQUIRED');
  assert.equal(required.error.statusCode, 422);
  data.item = null;
  assert.equal((await equivalent(data)).error.code, 'KNOWLEDGE_ITEM_NOT_FOUND');
  data.item = { id: 'item' };
  data.record = createLegacyKnowledgeArtifactProvenance('other');
  assert.equal((await equivalent(data)).error.code, 'KNOWLEDGE_ITEM_NOT_FOUND');
});

test('reader aliases retain original identity conflict errors and source-state projections', async () => {
  const data = fixture();
  data.versions[0].id = data.evidence.noteVersionId = 'alias';
  const alias = await equivalent(data);
  assert.equal(alias.result.sources[0].aliasUsed, true);
  assert.equal(alias.result.sources[0].resolvedVersionId, 'alias');
  assert.ok(alias.calls.some(([name, id]) => name === 'version' && id === 'original'));
  for (const original of [
    { ...data.versions[0], id: 'original', noteId: 'other' },
    { ...data.versions[0], id: 'original', contentHash: sha('other') }
  ]) {
    data.versions.push(original);
    const mismatch = await equivalent(data);
    assert.equal(mismatch.error.code, 'KNOWLEDGE_ARTIFACT_PROVENANCE_SOURCE_MISMATCH');
    assert.equal(mismatch.error.statusCode, 422);
    assert.equal(mismatch.error.message, '原始来源版本身份不一致。');
    data.versions.pop();
  }
  data.note.rawMarkdown = 'changed';
  assert.equal((await equivalent(data)).result.sources[0].sourceState, 'stale');
  data.evidence.status = 'invalid';
  assert.equal((await equivalent(data)).result.sources[0].sourceState, 'unavailable');
  data.versions[0].content = 'tampered';
  assert.equal((await equivalent(data)).error.code, 'KNOWLEDGE_ARTIFACT_PROVENANCE_SOURCE_MISMATCH');
});

test('historical nullable evidence preserves available applicability and fails closed for missing version identity', async () => {
  const data = fixture();
  data.evidence.applicabilityStatus = null;
  const state = {
    knowledgeItems: [data.item],
    knowledgeEvidence: [data.evidence],
    notes: [data.note],
    noteVersions: data.versions,
    knowledgeArtifactProvenance: [data.record]
  };
  assert.equal((await equivalent(data)).result.sources[0].sourceState, 'available');
  assert.equal(validateKnowledgeArtifactProvenanceRelations(state), state);
  data.evidence.noteVersionId = null;
  const expected = {
    name: 'AppError',
    code: 'KNOWLEDGE_ARTIFACT_PROVENANCE_SOURCE_MISMATCH',
    statusCode: 422,
    message: '知识产物来源与当前证据或笔记版本不一致。'
  };
  assert.deepEqual((await equivalent(data)).error, expected);
  assert.throws(() => validateKnowledgeArtifactProvenanceRelations(state), expected);
});
