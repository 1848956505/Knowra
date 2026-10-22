import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';
import * as contract from '../src/modules/knowledge/domain/knowledge-artifact-provenance-contract.js';
import * as stateContract from '../src/modules/knowledge/domain/knowledge-artifact-provenance-state.js';
import { resolveAnalysisScopeNoteVersion } from '../src/modules/knowledge/domain/analysis-scope-version-alias.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const reject = (run, code = 'KNOWLEDGE_ARTIFACT_PROVENANCE_INVALID', statusCode = 422) =>
  assert.throws(run, error => error instanceof AppError && error.code === code && error.statusCode === statusCode);
const seal = value => ({ ...value, provenanceHash: contract.hashKnowledgeArtifactProvenance(value) });
function fixture(mode = 'mock') {
  const content = '前言\n  来源😀 \n结尾',
    quoteText = '  来源😀 \n';
  const start = content.indexOf(quoteText);
  const origins = {
    mock: { jobId: 'job', requestId: 'request', scopeId: 'scope', spaceId: 'space', receiptHash: sha('receipt') },
    agent: {
      conversationId: 'conversation',
      turnId: 'turn',
      toolCallId: 'tool',
      requestId: 'request',
      spaceId: 'space',
      receiptHash: sha('receipt')
    },
    mcp: { pairingId: 'pairing', callId: 'call', requestId: 'request', spaceId: 'space', receiptHash: sha('receipt') }
  };
  const source = {
    evidenceId: 'evidence',
    sourceId: 'source',
    noteId: 'note',
    originNoteVersionId: 'original',
    contentHash: sha(content),
    start,
    end: start + quoteText.length,
    quoteText,
    quoteHash: sha(quoteText),
    annotationRevisions: [{ annotationId: 'annotation', revision: 1 }]
  };
  const record = seal({
    id: contract.knowledgeArtifactProvenanceId('item'),
    schemaVersion: 1,
    state: 'recorded',
    artifactKind: 'knowledgeItem',
    artifactId: 'item',
    executionMode: mode,
    provider: mode === 'mock' ? 'mock' : mode === 'agent' ? 'historical-provider' : 'external-client',
    modelId: 'historical-model',
    promptVersion: 'prompt-v1',
    resultSchemaVersion: 'result-v1',
    origin: origins[mode],
    inputHash: sha('input'),
    outputHash: sha('output'),
    committedAt: '2026-10-02T00:00:00.000Z',
    sources: [source]
  });
  return {
    record,
    source,
    state: {
      knowledgeItems: [{ id: 'item', sourceMode: 'ai' }],
      knowledgeArtifactProvenance: [record],
      notes: [{ id: 'note', rawMarkdown: content }],
      noteVersions: [{ id: 'original', noteId: 'note', content, contentHash: sha(content) }],
      knowledgeEvidence: [
        {
          id: 'evidence',
          knowledgeItemId: 'item',
          noteId: 'note',
          sourceType: 'noteVersion',
          noteVersionId: 'original',
          quoteText: quoteText.trim(),
          status: 'valid',
          applicabilityStatus: 'active'
        }
      ]
    }
  };
}
function aliasFixture() {
  const content = 'A😀B';
  const binding = { noteId: 'note', noteVersionId: 'original', contentHash: sha(content) };
  const version = { id: 'alias', noteId: 'note', contentHash: sha(content), content };
  const segment = { noteId: 'note', noteVersionId: 'original', start: 1, end: 3, markdown: '😀' };
  return { binding, version, segment };
}

test('provenance JS/TS bridges preserve every exported runtime identity', async () => {
  for (const name of [
    'knowledge-artifact-provenance-contract',
    'knowledge-artifact-provenance-state',
    'analysis-scope-version-alias'
  ]) {
    const js = await import(`../src/modules/knowledge/domain/${name}.js`);
    const ts = await import(`../src/modules/knowledge/domain/${name}.ts`);
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
  assert.ok(Object.isFrozen(contract.KNOWLEDGE_ARTIFACT_PROVENANCE_LIMITS));
});

test('provenance unknown inputs preserve contract errors and accessor preflight behavior', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  for (const value of [
    undefined,
    null,
    false,
    12,
    'record',
    [],
    {},
    () => {},
    Symbol('record'),
    1n,
    { value: 1n },
    cyclic
  ]) {
    reject(() => contract.validateKnowledgeArtifactProvenance(value));
  }
  for (const key of ['state', 'reason']) {
    const record = contract.createLegacyKnowledgeArtifactProvenance('item');
    const value = record[key];
    let reads = 0;
    Object.defineProperty(record, key, {
      enumerable: true,
      get() {
        reads += 1;
        return value;
      }
    });
    reject(() => contract.validateKnowledgeArtifactProvenance(record));
    assert.ok(reads > 0, 'JSON byte preflight still reads enumerable accessors');
  }
  const throwing = {
    get state() {
      throw new Error('private getter failure');
    }
  };
  reject(() => contract.validateKnowledgeArtifactProvenance(throwing));
  for (const value of [cyclic, { value: 1n }, throwing]) reject(() => contract.hashKnowledgeArtifactProvenance(value));
});

test('provenance all recorded branches and null-prototype records return independent clones', () => {
  for (const mode of ['mock', 'agent', 'mcp']) {
    const { record } = fixture(mode);
    Object.setPrototypeOf(record, null);
    Object.setPrototypeOf(record.origin, null);
    Object.setPrototypeOf(record.sources[0], null);
    Object.setPrototypeOf(record.sources[0].annotationRevisions[0], null);
    const copy = contract.validateKnowledgeArtifactProvenance(record);
    assert.deepEqual(copy, JSON.parse(JSON.stringify(record)));
    assert.equal(Object.getPrototypeOf(copy), Object.prototype);
    copy.origin.requestId = 'changed';
    copy.sources[0].annotationRevisions[0].revision = 2;
    assert.equal(record.origin.requestId, 'request');
    assert.equal(record.sources[0].annotationRevisions[0].revision, 1);
  }
  const legacy = contract.createLegacyKnowledgeArtifactProvenance('legacy');
  Object.setPrototypeOf(legacy, null);
  assert.deepEqual(contract.validateKnowledgeArtifactProvenance(legacy), JSON.parse(JSON.stringify(legacy)));
});

test('scope alias Array and Map preserve first matching row identity and order', () => {
  const { binding, version, segment } = aliasFixture();
  const second = { ...version, id: 'second' };
  for (const rows of [
    [version, second],
    new Map([
      ['one', version],
      ['two', second]
    ])
  ]) {
    assert.equal(resolveAnalysisScopeNoteVersion({ segments: [segment] }, binding, rows), version);
  }
  assert.equal(resolveAnalysisScopeNoteVersion({}, binding, [second, version]), second);
  assert.equal(
    resolveAnalysisScopeNoteVersion(
      {},
      binding,
      new Map([
        ['two', second],
        ['one', version]
      ])
    ),
    second
  );
  const original = { ...version, id: 'original' };
  assert.equal(resolveAnalysisScopeNoteVersion({}, binding, [version, original]), original);
});

test('scope original ID mismatch and first invalid alias never fall back', () => {
  const { binding, version } = aliasFixture();
  const badRows = [
    { ...version, id: 'original', noteId: 'other' },
    { ...version, id: 'original', contentHash: sha('other') },
    { ...version, id: 'original', content: 'tampered' },
    { ...version, content: 'tampered' }
  ];
  for (const bad of badRows) {
    reject(() => resolveAnalysisScopeNoteVersion({}, binding, [bad, version]), 'ANALYSIS_SCOPE_VERSION_MISMATCH');
  }
  for (const rows of [undefined, null, {}, 'rows']) {
    reject(() => resolveAnalysisScopeNoteVersion({}, binding, rows), 'ANALYSIS_SCOPE_VERSION_MISMATCH');
  }
});

test('scope context segments are checked while unrelated malformed segments stay ignored', () => {
  const { binding, version, segment } = aliasFixture();
  assert.equal(resolveAnalysisScopeNoteVersion({ contextSegments: [segment] }, binding, [version]), version);
  reject(
    () => resolveAnalysisScopeNoteVersion({ contextSegments: [{ ...segment, markdown: 'xx' }] }, binding, [version]),
    'ANALYSIS_SCOPE_VERSION_MISMATCH'
  );
  const unrelated = { noteVersionId: 'unrelated', start: -99, end: NaN, markdown: null };
  assert.equal(
    resolveAnalysisScopeNoteVersion({ segments: [unrelated], contextSegments: [segment, unrelated] }, binding, [
      version
    ]),
    version
  );
});

test('legacy migration mutates the same state and array and retains duplicate-ID behavior', () => {
  const state = {
    knowledgeItems: [
      { id: 'item', sourceMode: 'ai' },
      { id: 'item', sourceMode: 'ai' },
      { id: 'manual', sourceMode: 'manual' }
    ]
  };
  assert.equal(stateContract.migrateLegacyKnowledgeArtifactProvenance(state), state);
  assert.equal(state.knowledgeArtifactProvenance.length, 2);
  assert.deepEqual(state.knowledgeArtifactProvenance[0], state.knowledgeArtifactProvenance[1]);
  assert.notEqual(state.knowledgeArtifactProvenance[0], state.knowledgeArtifactProvenance[1]);
  const records = state.knowledgeArtifactProvenance;
  assert.equal(stateContract.migrateLegacyKnowledgeArtifactProvenance(state), state);
  assert.equal(state.knowledgeArtifactProvenance, records);
  assert.equal(records.length, 2);
  reject(() => stateContract.validateKnowledgeArtifactProvenanceRelations(state));
  const existing = contract.createLegacyKnowledgeArtifactProvenance('item');
  const supplied = { knowledgeItems: state.knowledgeItems, knowledgeArtifactProvenance: [existing] };
  stateContract.migrateLegacyKnowledgeArtifactProvenance(supplied);
  assert.equal(supplied.knowledgeArtifactProvenance[0], existing);
  assert.equal(supplied.knowledgeArtifactProvenance.length, 1);
});

test('relation validation returns original state and preserves rows for every recorded mode', () => {
  for (const mode of ['mock', 'agent', 'mcp']) {
    const { state, record } = fixture(mode);
    const snapshot = structuredClone(state);
    assert.equal(stateContract.validateKnowledgeArtifactProvenanceRelations(state), state);
    assert.equal(state.knowledgeArtifactProvenance[0], record);
    assert.deepEqual(state, snapshot);
    state.noteVersions[0].id = state.knowledgeEvidence[0].noteVersionId = 'alias';
    assert.equal(stateContract.validateKnowledgeArtifactProvenanceRelations(state), state);
    state.noteVersions.push({ id: 'original', noteId: 'other', contentHash: record.sources[0].contentHash });
    reject(
      () => stateContract.validateKnowledgeArtifactProvenanceRelations(state),
      'KNOWLEDGE_ARTIFACT_PROVENANCE_SOURCE_MISMATCH'
    );
  }
  const empty = {};
  assert.equal(stateContract.validateKnowledgeArtifactProvenanceRelations(empty), empty);
});

test('downgrade guard retains shallow hash-only checks, last duplicate wins, and deletion exemption', () => {
  const { record } = fixture();
  const previous = { knowledgeArtifactProvenance: [record] };
  const replacement = {
    artifactId: record.artifactId,
    state: 'legacy-unavailable',
    provenanceHash: record.provenanceHash
  };
  const next = { knowledgeItems: [{ id: record.artifactId }], knowledgeArtifactProvenance: [replacement] };
  assert.equal(stateContract.assertNoKnowledgeArtifactProvenanceDowngrade(previous, next), undefined);
  const bad = { ...replacement, provenanceHash: 'different' };
  next.knowledgeArtifactProvenance = [bad, replacement];
  assert.equal(stateContract.assertNoKnowledgeArtifactProvenanceDowngrade(previous, next), undefined);
  next.knowledgeArtifactProvenance.reverse();
  reject(
    () => stateContract.assertNoKnowledgeArtifactProvenanceDowngrade(previous, next),
    'KNOWLEDGE_ARTIFACT_PROVENANCE_CONFLICT',
    409
  );
  next.knowledgeArtifactProvenance = [];
  reject(
    () => stateContract.assertNoKnowledgeArtifactProvenanceDowngrade(previous, next),
    'KNOWLEDGE_ARTIFACT_PROVENANCE_CONFLICT',
    409
  );
  next.knowledgeItems = [];
  assert.equal(stateContract.assertNoKnowledgeArtifactProvenanceDowngrade(previous, next), undefined);
  assert.equal(stateContract.assertNoKnowledgeArtifactProvenanceDowngrade({}, {}), undefined);
});
