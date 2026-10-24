import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildKnowledgeProposalPlan } from '../src/modules/ai/knowledge-propose-tool.js';
import { createAgentKnowledgeCommitService } from '../src/modules/ai/agent-knowledge-commit.js';

// 准确父提交的固定正文。普通入口既不读 Git，也不从候选回填 oracle。
export const agentProvenanceParent = '881e5d2110baefd1b0297f0a74fc2dc6612a963b';
export const agentProvenanceFrozenSource = String.raw`import { calculateContentHash } from '@study-accelerator/content-anchor';
import { hashRecord } from './record-contract.js';
import { knowledgeArtifactProvenanceId, hashKnowledgeArtifactProvenance, validateKnowledgeArtifactProvenance }
  from '../knowledge/domain/knowledge-artifact-provenance-contract.js';

export const AGENT_KNOWLEDGE_PROMPT_VERSION = 'agent-knowledge-propose-v1';
export const AGENT_KNOWLEDGE_RESULT_SCHEMA = 'knowledge-extraction-v1';
export const MCP_KNOWLEDGE_PROMPT_VERSION = 'mcp-knowledge-propose-v1';

/**
 * 把已校验的 Agent 知识提议转为来源摘要记录。只挑选白名单事实：候选 ID、引文位置与原文、
 * 生成它的对话回合与工具调用，以及整份提议的哈希；不包含对话文本、请求原文或凭据。
 * 引文位置是相对笔记版本的绝对偏移，标注修订在 Agent 路径不跟踪，固定为空。
 */
export function createKnowledgeArtifactProvenanceFromProposal({ plan, candidate, origin, provider, modelId, committedAt }) {
  const artifactId = candidate.candidateInput.id;
  const receiptHash = hashRecord({ requestId: plan.requestId, inputHash: plan.inputHash, outputHash: plan.outputHash,
    conversationId: origin.conversationId, turnId: origin.turnId, toolCallId: origin.toolCallId,
    candidateIds: plan.candidates.map(item => item.candidateInput.id) });
  const record = {
    id: knowledgeArtifactProvenanceId(artifactId), schemaVersion: 1, state: 'recorded',
    artifactKind: 'knowledgeItem', artifactId, executionMode: 'agent', provider, modelId,
    promptVersion: AGENT_KNOWLEDGE_PROMPT_VERSION, resultSchemaVersion: AGENT_KNOWLEDGE_RESULT_SCHEMA,
    origin: { conversationId: origin.conversationId, turnId: origin.turnId, toolCallId: origin.toolCallId,
      requestId: plan.requestId, spaceId: plan.spaceId, receiptHash },
    inputHash: plan.inputHash, outputHash: plan.outputHash, committedAt,
    sources: sourcesOf(candidate)
  };
  return validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) });
}

const sourcesOf = candidate => candidate.provenance.map((source, index) => ({
  evidenceId: candidate.candidateInput.evidence[index].id, sourceId: source.sourceId, noteId: source.noteId,
  originNoteVersionId: source.noteVersionId, contentHash: source.contentHash, start: source.start, end: source.end,
  quoteText: source.quoteText, quoteHash: calculateContentHash(source.quoteText), annotationRevisions: [] }));

/**
 * 外部 AI 客户端（本机 MCP）提议的候选的来源摘要。客户端不报告可信的模型信息，所以 provider 固定为 external-client、
 * modelId 固定为 unreported；origin 只有配对 ID 与调用 ID（客户端给的幂等键或由提议内容派生），不含对话内容与客户端自述。
 */
export function createKnowledgeArtifactProvenanceFromMcpProposal({ plan, candidate, origin, committedAt }) {
  const artifactId = candidate.candidateInput.id;
  const receiptHash = hashRecord({ requestId: plan.requestId, inputHash: plan.inputHash, outputHash: plan.outputHash,
    pairingId: origin.pairingId, callId: origin.callId, candidateIds: plan.candidates.map(item => item.candidateInput.id) });
  const record = {
    id: knowledgeArtifactProvenanceId(artifactId), schemaVersion: 1, state: 'recorded',
    artifactKind: 'knowledgeItem', artifactId, executionMode: 'mcp', provider: 'external-client', modelId: 'unreported',
    promptVersion: MCP_KNOWLEDGE_PROMPT_VERSION, resultSchemaVersion: AGENT_KNOWLEDGE_RESULT_SCHEMA,
    origin: { pairingId: origin.pairingId, callId: origin.callId, requestId: plan.requestId, spaceId: plan.spaceId, receiptHash },
    inputHash: plan.inputHash, outputHash: plan.outputHash, committedAt, sources: sourcesOf(candidate)
  };
  return validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) });
}
`;
export const hash = x => createHash('sha256').update(x).digest('hex');
const canonical = x =>
  Array.isArray(x)
    ? '[' + x.map(canonical).join(',') + ']'
    : x !== null && typeof x === 'object'
      ? '{' +
        Object.keys(x)
          .sort()
          .map(k => JSON.stringify(k) + ':' + canonical(x[k]))
          .join(',') +
        '}'
      : JSON.stringify(x);
export function fixture(mode = 'agent') {
  const candidate = {
    candidateInput: { id: 'item-1', canonicalStatement: 'synthetic statement', evidence: [{ id: 'evidence-1' }] },
    provenance: [
      {
        sourceId: 'source-1',
        noteId: 'note-1',
        noteVersionId: 'version-1',
        contentHash: hash('abc'),
        start: 0,
        end: 3,
        quoteText: 'abc'
      }
    ]
  };
  const plan = {
    requestId: 'request-1',
    spaceId: 'space-1',
    inputHash: '1'.repeat(64),
    outputHash: '2'.repeat(64),
    candidates: [candidate]
  };
  return {
    plan,
    candidate,
    origin:
      mode === 'mcp'
        ? { pairingId: 'pairing-1', callId: 'call-1' }
        : { conversationId: 'conversation-1', turnId: 'turn-1', toolCallId: 'call-1' },
    provider: 'deepseek',
    modelId: 'deepseek-flash',
    committedAt: '2026-10-01T00:00:00.000Z'
  };
}
export function expected(input, mode) {
  const { plan, candidate, origin, committedAt } = input;
  const receipt = {
    requestId: plan.requestId,
    inputHash: plan.inputHash,
    outputHash: plan.outputHash,
    ...(mode === 'mcp'
      ? { pairingId: origin.pairingId, callId: origin.callId }
      : { conversationId: origin.conversationId, turnId: origin.turnId, toolCallId: origin.toolCallId }),
    candidateIds: plan.candidates.map(x => x.candidateInput.id)
  };
  const artifactId = candidate.candidateInput.id;
  const record = {
    id: 'provenance-' + hash(JSON.stringify(['knowledgeItem', artifactId])),
    schemaVersion: 1,
    state: 'recorded',
    artifactKind: 'knowledgeItem',
    artifactId,
    executionMode: mode,
    provider: mode === 'mcp' ? 'external-client' : input.provider,
    modelId: mode === 'mcp' ? 'unreported' : input.modelId,
    promptVersion: mode === 'mcp' ? 'mcp-knowledge-propose-v1' : 'agent-knowledge-propose-v1',
    resultSchemaVersion: 'knowledge-extraction-v1',
    origin: {
      ...(mode === 'mcp'
        ? { pairingId: origin.pairingId, callId: origin.callId }
        : { conversationId: origin.conversationId, turnId: origin.turnId, toolCallId: origin.toolCallId }),
      requestId: plan.requestId,
      spaceId: plan.spaceId,
      receiptHash: hash(canonical(receipt))
    },
    inputHash: plan.inputHash,
    outputHash: plan.outputHash,
    committedAt,
    sources: candidate.provenance.map((x, i) => ({
      evidenceId: candidate.candidateInput.evidence[i].id,
      sourceId: x.sourceId,
      noteId: x.noteId,
      originNoteVersionId: x.noteVersionId,
      contentHash: x.contentHash,
      start: x.start,
      end: x.end,
      quoteText: x.quoteText,
      quoteHash: hash(x.quoteText),
      annotationRevisions: []
    }))
  };
  return { ...record, provenanceHash: hash('knowra:knowledge-artifact-provenance:v1\n' + canonical(record)) };
}

export function agentProvenanceContractCases(api) {
  const {
    createKnowledgeArtifactProvenanceFromProposal: agent,
    createKnowledgeArtifactProvenanceFromMcpProposal: mcp,
    AGENT_KNOWLEDGE_PROMPT_VERSION,
    AGENT_KNOWLEDGE_RESULT_SCHEMA,
    MCP_KNOWLEDGE_PROMPT_VERSION
  } = api;
  const rows = [];
  const check = (name, run) => rows.push({ name, run });

  for (const [mode, receiptHash, provenanceHash] of [
    [
      'agent',
      '1473d4bec147f845be2ce1ba910a66923d83e777130f680cfdf385273d1edeb3',
      '0e127f34f71c4fd245879e13156813fcc309dd18f2163e5a72e1ef2114fb3730'
    ],
    [
      'mcp',
      '0835533526b9c5df73416705f697580a1e14866eaddb5870eef106c65d4696df',
      '1f9287ef77aa582b607288b4b13758dd2875aedc92495443434c12c9ac30b783'
    ]
  ])
    check(mode + ' independent fixed literal id, receipt, content, quote and provenance hashes', () => {
      const record = (mode === 'agent' ? agent : mcp)(fixture(mode));
      assert.equal(record.id, 'provenance-8ab59477127237654ed6410d4d9d62c2e8a57e74040daa8021f0b463d7be1ff5');
      assert.equal(record.origin.receiptHash, receiptHash);
      assert.equal(record.provenanceHash, provenanceHash);
      assert.equal(record.sources[0].contentHash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      assert.equal(record.sources[0].quoteHash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
  const invalid = { code: 'KNOWLEDGE_ARTIFACT_PROVENANCE_INVALID' };
  check('constants and synchronous arity', () => {
    assert.equal(agent.length, 1);
    assert.equal(mcp.length, 1);
    assert.equal(AGENT_KNOWLEDGE_PROMPT_VERSION, 'agent-knowledge-propose-v1');
    assert.equal(AGENT_KNOWLEDGE_RESULT_SCHEMA, 'knowledge-extraction-v1');
    assert.equal(MCP_KNOWLEDGE_PROMPT_VERSION, 'mcp-knowledge-propose-v1');
    assert(!(agent(fixture()) instanceof Promise));
  });
  for (const mode of ['agent', 'mcp']) {
    const fn = mode === 'mcp' ? mcp : agent;
    check(mode + ' fixed full-record crypto oracle', () => {
      const input = fixture(mode);
      assert.deepEqual(fn(input), expected(input, mode));
    });
    check(mode + ' whitelist ignores private getters', () => {
      const input = fixture(mode);
      for (const value of [
        input,
        input.plan,
        input.candidate,
        input.candidate.candidateInput,
        input.origin,
        input.candidate.provenance[0],
        input.candidate.candidateInput.evidence[0]
      ])
        Object.defineProperty(value, 'privateSecret', {
          enumerable: true,
          get() {
            throw Error('private getter must not run');
          }
        });
      const record = fn(input);
      assert(!JSON.stringify(record).includes('privateSecret'));
    });
    check(mode + ' deterministic output and independent mutable result', () => {
      const input = fixture(mode),
        before = structuredClone(input);
      const a = fn(input),
        b = fn(input);
      assert.deepEqual(a, b);
      assert.notEqual(a, b);
      assert.notEqual(a.sources, b.sources);
      a.sources[0].quoteText = 'changed';
      a.sources[0].annotationRevisions.push({ annotationId: 'a', revision: 1 });
      assert.deepEqual(input, before);
      assert.equal(b.sources[0].quoteText, 'abc');
    });
    check(mode + ' frozen source accepted', () => {
      const input = fixture(mode);
      const freeze = x => {
        if (x && typeof x === 'object') {
          Object.values(x).forEach(freeze);
          Object.freeze(x);
        }
        return x;
      };
      assert.deepEqual(fn(freeze(input)), expected(input, mode));
    });
    check(mode + ' candidate membership is not newly validated', () => {
      const input = fixture(mode);
      input.plan.candidates = [];
      assert.deepEqual(fn(input), expected(input, mode));
    });
    check(mode + ' source/evidence pairs preserve index and order', () => {
      const input = fixture(mode);
      input.candidate.provenance.push({ ...input.candidate.provenance[0], sourceId: 'source-2', start: 3, end: 6 });
      input.candidate.candidateInput.evidence.push({ id: 'evidence-2' });
      assert.deepEqual(fn(input), expected(input, mode));
    });
    check(mode + ' absent evidence throws before source getters', () => {
      const input = fixture(mode);
      input.candidate.candidateInput.evidence = [];
      Object.defineProperty(input.candidate.provenance[0], 'sourceId', {
        get() {
          throw Error('too late');
        }
      });
      assert.throws(() => fn(input), TypeError);
    });
    check(mode + ' extra evidence ignored', () => {
      const input = fixture(mode);
      input.candidate.candidateInput.evidence.push(
        Object.defineProperty({}, 'id', {
          get() {
            throw Error('unused evidence');
          }
        })
      );
      assert.equal(fn(input).sources.length, 1);
    });
    check(mode + ' duplicate source rejected', () => {
      const input = fixture(mode);
      input.candidate.provenance.push({ ...input.candidate.provenance[0] });
      input.candidate.candidateInput.evidence.push({ id: 'evidence-2' });
      assert.throws(() => fn(input), invalid);
    });
    check(mode + ' sparse source rejected', () => {
      const input = fixture(mode);
      input.candidate.provenance.length = 2;
      assert.throws(() => fn(input), invalid);
    });
    check(mode + ' custom map callback omission preserved', () => {
      const input = fixture(mode);
      input.candidate.provenance.map = () => [];
      assert.throws(() => fn(input), invalid);
    });
    check(mode + ' quoteText read twice and not cached', () => {
      const input = fixture(mode);
      let reads = 0;
      Object.defineProperty(input.candidate.provenance[0], 'quoteText', {
        get() {
          return ++reads === 1 ? 'abc' : 'xyz';
        }
      });
      assert.throws(() => fn(input), invalid);
      assert.equal(reads, 2);
    });
    check(mode + ' thrown getter identity escapes synchronously', () => {
      const input = fixture(mode),
        sentinel = { sentinel: true };
      Object.defineProperty(input.plan, 'inputHash', {
        get() {
          throw sentinel;
        }
      });
      assert.throws(
        () => fn(input),
        e => e === sentinel
      );
    });
    check(mode + ' wrong quote UTF16 length rejected', () => {
      const input = fixture(mode);
      input.candidate.provenance[0].quoteText = '😀';
      assert.throws(() => fn(input), invalid);
    });
    check(mode + ' UTF16 emoji valid without normalization', () => {
      const input = fixture(mode);
      Object.assign(input.candidate.provenance[0], { quoteText: '😀', end: 2 });
      assert.deepEqual(fn(input), expected(input, mode));
    });
    check(mode + ' malformed timestamp rejected', () => {
      const input = fixture(mode);
      input.committedAt = 'yesterday';
      assert.throws(() => fn(input), invalid);
    });
    check(mode + ' unknown fields are not prevalidated', () => {
      const input = fixture(mode);
      input.candidate.provenance[0].start = '0';
      assert.throws(() => fn(input), invalid);
    });
    check(mode + ' getter order is not flattened or cached', () => {
      const input = fixture(mode),
        trace = [];
      const watch = (value, name, keys) => {
        for (const key of keys) {
          const stored = value[key];
          Object.defineProperty(value, key, {
            enumerable: true,
            configurable: true,
            get() {
              trace.push(name + '.' + key);
              return stored;
            }
          });
        }
      };
      const ci = input.candidate.candidateInput,
        source = input.candidate.provenance[0],
        evidence = ci.evidence[0];
      watch(
        input,
        'input',
        mode === 'agent'
          ? ['plan', 'candidate', 'origin', 'provider', 'modelId', 'committedAt']
          : ['plan', 'candidate', 'origin', 'committedAt']
      );
      watch(input.plan, 'plan', ['requestId', 'inputHash', 'outputHash', 'candidates', 'spaceId']);
      watch(input.candidate, 'candidate', ['candidateInput', 'provenance']);
      watch(ci, 'candidateInput', ['id', 'evidence']);
      watch(evidence, 'evidence', ['id']);
      const originKeys = mode === 'agent' ? ['conversationId', 'turnId', 'toolCallId'] : ['pairingId', 'callId'];
      watch(input.origin, 'origin', originKeys);
      watch(source, 'source', ['sourceId', 'noteId', 'noteVersionId', 'contentHash', 'start', 'end', 'quoteText']);
      trace.length = 0;
      fn(input);
      assert.deepEqual(trace, [
        ...(mode === 'agent'
          ? ['plan', 'candidate', 'origin', 'provider', 'modelId', 'committedAt']
          : ['plan', 'candidate', 'origin', 'committedAt']
        ).map(k => 'input.' + k),
        'candidate.candidateInput',
        'candidateInput.id',
        'plan.requestId',
        'plan.inputHash',
        'plan.outputHash',
        ...originKeys.map(k => 'origin.' + k),
        'plan.candidates',
        'candidate.candidateInput',
        'candidateInput.id',
        ...originKeys.map(k => 'origin.' + k),
        'plan.requestId',
        'plan.spaceId',
        'plan.inputHash',
        'plan.outputHash',
        'candidate.provenance',
        'candidate.candidateInput',
        'candidateInput.evidence',
        'evidence.id',
        ...['sourceId', 'noteId', 'noteVersionId', 'contentHash', 'start', 'end', 'quoteText', 'quoteText'].map(
          k => 'source.' + k
        )
      ]);
    });
  }
  check('Agent disallows reserved providers', () => {
    for (const provider of ['mock', 'external-client', '', null])
      assert.throws(() => agent({ ...fixture(), provider }), invalid);
  });
  check('MCP never reads caller provider or modelId', () => {
    const input = fixture('mcp');
    for (const k of ['provider', 'modelId'])
      Object.defineProperty(input, k, {
        get() {
          throw Error('ignored');
        }
      });
    assert.equal(mcp(input).provider, 'external-client');
  });
  check('receipt hash keeps candidate order', () => {
    const input = fixture();
    input.plan.candidates.push({ candidateInput: { id: 'item-2' } });
    const first = agent(input);
    input.plan.candidates.reverse();
    const second = agent(input);
    assert.notEqual(first.origin.receiptHash, second.origin.receiptHash);
    assert.equal(first.id, second.id);
  });
  check('origin getter remains distinct across receipt and record', () => {
    const input = fixture();
    let reads = 0;
    Object.defineProperty(input.origin, 'conversationId', {
      enumerable: true,
      get() {
        return ++reads === 1 ? 'receipt-conversation' : 'stored-conversation';
      }
    });
    const result = agent(input);
    assert.equal(reads, 2);
    assert.equal(result.origin.conversationId, 'stored-conversation');
    const receiptInput = fixture();
    receiptInput.origin.conversationId = 'receipt-conversation';
    assert.equal(result.origin.receiptHash, expected(receiptInput, 'agent').origin.receiptHash);
  });
  check('input hash getter remains distinct across receipt and record', () => {
    const input = fixture();
    let reads = 0;
    Object.defineProperty(input.plan, 'inputHash', {
      enumerable: true,
      get() {
        return ++reads === 1 ? '1'.repeat(64) : '3'.repeat(64);
      }
    });
    const result = agent(input);
    assert.equal(reads, 2);
    assert.equal(result.inputHash, '3'.repeat(64));
    assert.equal(result.origin.receiptHash, expected(fixture(), 'agent').origin.receiptHash);
  });
  check('unknown plan-only candidate IDs are not falsely validated', () => {
    for (const id of [undefined, null, Symbol('untrusted'), 0, {}, []]) {
      const input = fixture();
      input.plan.candidates.push({ candidateInput: { id } });
      assert.equal(agent(input).artifactId, 'item-1');
    }
  });
  check('top-level parameter destructuring precedes body', () => {
    const input = fixture(),
      sentinel = { stage: 'provider' };
    Object.defineProperty(input, 'provider', {
      get() {
        throw sentinel;
      }
    });
    input.candidate = null;
    assert.throws(
      () => agent(input),
      e => e === sentinel
    );
  });
  check('receipt hash precedes artifact ID validation', () => {
    const input = fixture(),
      sentinel = { stage: 'request' };
    input.candidate.candidateInput.id = '';
    Object.defineProperty(input.plan, 'requestId', {
      get() {
        throw sentinel;
      }
    });
    assert.throws(
      () => agent(input),
      e => e === sentinel
    );
  });
  check('native unsupported input error is not wrapped', () => {
    for (const input of [undefined, null, {}, []]) assert.throws(() => agent(input), TypeError);
  });

  for (const mode of ['agent', 'mcp']) {
    const fn = mode === 'agent' ? agent : mcp;
    check(mode + ' fixed receipt covers ordered, duplicate and nonmember candidate IDs', () => {
      const input = fixture(mode);
      input.plan.candidates = [
        { candidateInput: { id: 'z' } },
        { candidateInput: { id: 'a' } },
        { candidateInput: { id: 'z' } }
      ];
      assert.deepEqual(fn(input), expected(input, mode));
    });
    check(mode + ' origin opposite protocol fields and source annotation getters are never read', () => {
      const input = fixture(mode);
      for (const key of mode === 'agent' ? ['pairingId', 'callId'] : ['conversationId', 'turnId', 'toolCallId'])
        Object.defineProperty(input.origin, key, {
          enumerable: true,
          get() {
            return assert.fail('opposite protocol');
          }
        });
      Object.defineProperty(input.candidate.provenance[0], 'annotationRevisions', {
        enumerable: true,
        get() {
          return assert.fail('untrusted annotations');
        }
      });
      const result = fn(input);
      assert.deepEqual(result.sources[0].annotationRevisions, []);
    });
    check(mode + ' separate fresh annotation arrays and ordered source records', () => {
      const input = fixture(mode);
      input.candidate.provenance.push({ ...input.candidate.provenance[0], sourceId: 'source-2' });
      input.candidate.candidateInput.evidence.push({ id: 'evidence-2' });
      const a = fn(input);
      assert.notEqual(a.sources[0].annotationRevisions, a.sources[1].annotationRevisions);
      a.sources[0].annotationRevisions.push({ annotationId: 'a', revision: 1 });
      assert.deepEqual(a.sources[1].annotationRevisions, []);
    });
    check(mode + ' custom source map preserves callback this, indexes and order', () => {
      const input = fixture(mode),
        source = input.candidate.provenance[0];
      let called = false;
      input.candidate.candidateInput.evidence = [{ id: 'evidence-2' }, { id: 'evidence-1' }];
      input.candidate.provenance = {
        map(callback) {
          assert.equal(this, input.candidate.provenance);
          called = true;
          return [callback(source, 1), callback({ ...source, sourceId: 'source-2' }, 0)];
        }
      };
      const result = fn(input);
      assert.equal(called, true);
      assert.deepEqual(
        result.sources.map(x => x.evidenceId),
        ['evidence-1', 'evidence-2']
      );
    });
    check(mode + ' custom plan map return and callback semantics remain unvalidated', () => {
      const input = fixture(mode);
      let called = false;
      input.plan.candidates = {
        map(callback) {
          called = true;
          assert.equal(this, input.plan.candidates);
          assert.equal(callback({ candidateInput: { id: 'custom' } }), 'custom');
          return 'synthetic-map-return';
        }
      };
      const result = fn(input);
      assert.equal(called, true);
      assert.equal(result.origin.receiptHash, expected(input, mode).origin.receiptHash);
    });
    check(mode + ' missing source containers and malformed evidence retain native failures', () => {
      for (const value of [null, undefined, 0, 'x', {}]) {
        const input = fixture(mode);
        input.candidate.provenance = value;
        assert.throws(() => fn(input), TypeError);
      }
      for (const value of [null, undefined]) {
        const input = fixture(mode);
        input.candidate.candidateInput.evidence = value;
        assert.throws(() => fn(input), TypeError);
      }
    });
    check(mode + ' selected field validation is not bypassed', () => {
      const edits = [
        x => (x.candidate.candidateInput.id = ''),
        x => (x.plan.requestId = ''),
        x => (x.plan.spaceId = ''),
        x => (x.plan.inputHash = 'bad'),
        x => (x.plan.outputHash = 'bad'),
        x => (x.candidate.provenance[0].sourceId = ''),
        x => (x.candidate.provenance[0].noteId = null),
        x => (x.candidate.provenance[0].noteVersionId = ''),
        x => (x.candidate.provenance[0].contentHash = 'BAD'),
        x => (x.candidate.provenance[0].start = -1),
        x => (x.candidate.provenance[0].end = 0),
        x => (x.candidate.provenance[0].quoteText = '\ud800'),
        x => (x.candidate.candidateInput.evidence[0].id = null),
        x => (x.committedAt = '2026-99-99')
      ];
      for (const edit of edits) {
        const input = fixture(mode);
        edit(input);
        assert.throws(() => fn(input), invalid);
      }
    });
    check(mode + ' quote boxed string is not silently coerced into a valid DTO', () => {
      const input = fixture(mode);
      input.candidate.provenance[0].quoteText = new String('abc');
      assert.throws(() => fn(input), invalid);
    });
    check(mode + ' inherited fields remain read through prototype without ownership guard', () => {
      const input = fixture(mode);
      input.candidate.provenance[0] = Object.create(input.candidate.provenance[0]);
      input.origin = Object.create(input.origin);
      input.plan = Object.create(input.plan);
      assert.deepEqual(fn(input), expected(input, mode));
    });
    check(mode + ' every selected getter exception preserves original identity and stops immediately', () => {
      const paths = [
        ['candidate', 'candidateInput'],
        ['candidate', 'candidateInput', 'id'],
        ['plan', 'requestId'],
        ['plan', 'inputHash'],
        ['plan', 'outputHash'],
        ['plan', 'candidates'],
        ['plan', 'spaceId'],
        ['candidate', 'provenance'],
        ['candidate', 'candidateInput', 'evidence'],
        ['candidate', 'candidateInput', 'evidence', 0, 'id'],
        ...['sourceId', 'noteId', 'noteVersionId', 'contentHash', 'start', 'end', 'quoteText'].map(k => [
          'candidate',
          'provenance',
          0,
          k
        ]),
        ...(mode === 'agent' ? ['conversationId', 'turnId', 'toolCallId'] : ['pairingId', 'callId']).map(k => [
          'origin',
          k
        ])
      ];
      for (const path of paths) {
        const input = fixture(mode),
          sentinel = { path };
        let target = input;
        for (const key of path.slice(0, -1)) target = target[key];
        Object.defineProperty(target, path.at(-1), {
          get() {
            throw sentinel;
          }
        });
        assert.throws(
          () => fn(input),
          e => e === sentinel
        );
      }
    });
    check(mode + ' source quote hashing failure follows first quote capture', () => {
      const input = fixture(mode),
        trace = [],
        sentinel = { stage: 'quote-coercion' };
      let reads = 0;
      Object.defineProperty(input.candidate.provenance[0], 'quoteText', {
        get() {
          trace.push(++reads);
          return reads === 1
            ? 'abc'
            : {
                toString() {
                  trace.push('coercion');
                  throw sentinel;
                }
              };
        }
      });
      assert.throws(
        () => fn(input),
        e => e === sentinel
      );
      assert.deepEqual(trace, [1, 2, 'coercion']);
    });
    check(mode + ' receipt hash object getter failure precedes artifact id validation', () => {
      const input = fixture(mode),
        sentinel = { stage: 'receipt hash' };
      input.candidate.candidateInput.id = '';
      input.plan.requestId = Object.defineProperty({}, 'secret', {
        enumerable: true,
        get() {
          throw sentinel;
        }
      });
      assert.throws(
        () => fn(input),
        e => e === sentinel
      );
    });
    check(mode + ' source construction precedes timestamp and provider validation', () => {
      const input = fixture(mode),
        sentinel = { stage: 'source' };
      input.committedAt = 'bad';
      input.provider = 'mock';
      Object.defineProperty(input.candidate.provenance[0], 'sourceId', {
        get() {
          throw sentinel;
        }
      });
      assert.throws(
        () => fn(input),
        e => e === sentinel
      );
    });
    check(mode + ' repeatedly changing plan and origin getters retain receipt and stored values', () => {
      for (const [container, key, first, second] of [
        ['plan', 'requestId', 'r1', 'r2'],
        ['plan', 'inputHash', '1'.repeat(64), '3'.repeat(64)],
        ['plan', 'outputHash', '2'.repeat(64), '4'.repeat(64)],
        ...(mode === 'agent' ? ['conversationId', 'turnId', 'toolCallId'] : ['pairingId', 'callId']).map(k => [
          'origin',
          k,
          'first-' + k,
          'second-' + k
        ])
      ]) {
        const input = fixture(mode),
          oracle = fixture(mode);
        oracle[container][key] = first;
        const receipt = expected(oracle, mode).origin.receiptHash;
        let reads = 0;
        Object.defineProperty(input[container], key, {
          get() {
            return ++reads === 1 ? first : second;
          }
        });
        const result = fn(input);
        assert.equal(reads, 2);
        assert.equal(result.origin.receiptHash, receipt);
        assert.equal(['inputHash', 'outputHash'].includes(key) ? result[key] : result.origin[key], second);
      }
    });
    check(mode + ' candidate input and evidence are reread rather than snapshotted', () => {
      const input = fixture(mode),
        original = input.candidate.candidateInput;
      let reads = 0;
      Object.defineProperty(input.candidate, 'candidateInput', {
        get() {
          return ++reads < 3 ? original : { evidence: [{ id: 'evidence-later' }] };
        }
      });
      const result = fn(input);
      assert.equal(reads, 3);
      assert.equal(result.artifactId, 'item-1');
      assert.equal(result.sources[0].evidenceId, 'evidence-later');
    });
  }
  return rows;
}

export function agentProvenanceConsumerCases(api) {
  const {
    createKnowledgeArtifactProvenanceFromProposal: agent,
    createKnowledgeArtifactProvenanceFromMcpProposal: mcp
  } = api;
  const rows = [];
  const check = (name, run) => rows.push({ name, run });
  async function buildRealPlan() {
    const content = 'abc';
    return buildKnowledgeProposalPlan({
      access: {
        async verifyRead({ noteId }) {
          return {
            note: { id: noteId, spaceId: 'space-1' },
            version: { id: 'version-1', content },
            contentHash: hash(content)
          };
        }
      },
      grantId: 'grant-1',
      args: {
        candidates: [
          {
            title: 'Synthetic',
            canonicalStatement: 'synthetic statement',
            knowledgeType: 'concept',
            citations: [{ noteId: 'note-1', quote: content }]
          }
        ]
      },
      sourceRefs: [
        {
          noteId: 'note-1',
          noteVersionId: 'version-1',
          contentHash: hash(content),
          start: 0,
          end: 3,
          quoteHash: hash(content)
        }
      ],
      turnId: 'turn-1',
      callId: 'call-1'
    });
  }
  check(
    'real validated proposal producer feeds both builders',
    async () => {
      const plan = await buildRealPlan();
      for (const mode of ['agent', 'mcp']) {
        const input = { ...fixture(mode), plan, candidate: plan.candidates[0] };
        assert.deepEqual((mode === 'mcp' ? mcp : agent)(input), expected(input, mode));
      }
    },
    'actualConsumer'
  );
  for (const mode of ['agent', 'mcp'])
    for (const asyncDomain of [false, true])
      check(
        'real commit consumer ' + mode + ' ' + (asyncDomain ? 'async' : 'sync'),
        async () => {
          const plan = await buildRealPlan(),
            input = { ...fixture(mode), plan, candidate: plan.candidates[0] },
            identity = { datasetId: 'dataset-1', datasetEpoch: 'epoch-1' },
            saved = [],
            items = [],
            trace = [];
          const base = { ownerId: 'owner-1', ...identity, spaceId: 'space-1' },
            expiresAt = '2030-01-01T00:00:00.000Z',
            conversationId = mode === 'mcp' ? 'mcp-pairing-1' : 'conversation-1';
          const grant = {
            ...base,
            conversationId,
            actorId: 'owner-1',
            policyId: 'policy-1',
            policyRevision: 1,
            expiresAt,
            allowedTools: ['notes_read']
          };
          const policy = {
            ...base,
            actorId: 'owner-1',
            revision: 1,
            read: true,
            revokedAt: null,
            expiresAt,
            excludedNoteIds: [],
            scope: { kind: 'library' }
          };
          const note = { id: 'note-1', spaceId: 'space-1', rawMarkdown: 'abc', aiVisibility: 'normal' },
            version = { id: 'version-1', noteId: 'note-1', content: 'abc', contentHash: hash('abc') };
          const result = x => (asyncDomain ? Promise.resolve(x) : x);
          const knowledge = {
            repositories: {
              noteRepository: { findById: () => result(note) },
              noteVersionRepository: { findById: () => result(version) },
              knowledgeSpaceRepository: { findById: () => result({ id: 'space-1', userId: 'owner-1' }) },
              knowledgeItemRepository: { list: () => result(items) },
              knowledgeArtifactProvenanceRepository: {
                create: record => {
                  trace.push('provenance');
                  saved.push(record);
                  return result(record);
                }
              }
            },
            knowledgeItemService: {
              createCandidate: record => {
                trace.push('candidate');
                items.push(record);
                return result(record);
              }
            }
          };
          const service = createAgentKnowledgeCommitService({
            core: { commit: (_request, apply) => apply() },
            knowledge,
            ownerId: 'owner-1',
            conversationStore: {
              peekTurn: () =>
                result({ ...base, conversationId, status: 'running', leaseGeneration: 1, leaseExpiresAt: expiresAt })
            },
            accessStore: { peek: kind => result(kind === 'aiRunGrant' ? grant : policy) },
            asyncDomain,
            now: () => new Date(input.committedAt)
          });
          const receipt = await service.commit({
            ...input,
            identity,
            grantId: 'grant-1',
            generation: 1,
            mode,
            guard: () => trace.push('guard')
          });
          assert.deepEqual(trace, mode === 'mcp' ? ['guard', 'candidate', 'provenance'] : ['candidate', 'provenance']);
          assert.deepEqual(saved, [expected(input, mode)]);
          assert.equal(receipt.saveState, 'localCommitted');
          assert.equal(receipt.candidates[0].provenanceId, saved[0].id);
        },
        'actualConsumer'
      );

  return rows;
}
