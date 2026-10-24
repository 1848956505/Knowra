import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { parse } from '@babel/parser';
import { calculateContentHash } from '@study-accelerator/content-anchor';
import { hashRecord } from '../src/modules/ai/record-contract.js';
import {
  knowledgeArtifactProvenanceId,
  hashKnowledgeArtifactProvenance,
  validateKnowledgeArtifactProvenance
} from '../src/modules/knowledge/domain/knowledge-artifact-provenance-contract.js';
import {
  agentProvenanceParent,
  agentProvenanceFrozenSource,
  agentProvenanceContractCases,
  agentProvenanceConsumerCases,
  hash,
  fixture,
  expected
} from './agent-knowledge-provenance.contract-support.js';

const baseline = process.env.KNOWRA_AGENT_KNOWLEDGE_PROVENANCE_BASELINE === '1';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/modules/ai/agent-knowledge-provenance.js';
const sourceUrl = new URL(helper, root);
const sourceHash = 'c3fd1ab3f2d88594360c82521998e31f6cfff5ea3dd155dcffa0ce636cc3e910';
const validatorSpecifier = '../knowledge/domain/knowledge-artifact-provenance-contract.js';
const names = [
  'calculateContentHash',
  'hashRecord',
  'knowledgeArtifactProvenanceId',
  'hashKnowledgeArtifactProvenance',
  'validateKnowledgeArtifactProvenance'
];
const real = {
  calculateContentHash,
  hashRecord,
  knowledgeArtifactProvenanceId,
  hashKnowledgeArtifactProvenance,
  validateKnowledgeArtifactProvenance
};
let loadCount = 0;
async function loadSource(source, label, instrument = false) {
  let rewritten = source;
  const dependencies = {
    '@study-accelerator/content-anchor': ['calculateContentHash'],
    './record-contract.js': ['hashRecord'],
    [validatorSpecifier]: [
      'knowledgeArtifactProvenanceId',
      'hashKnowledgeArtifactProvenance',
      'validateKnowledgeArtifactProvenance'
    ]
  };
  for (const [specifier, exports] of Object.entries(dependencies)) {
    assert.equal(rewritten.split(`'${specifier}'`).length, 2, `Exact dependency: ${specifier}`);
    const url = instrument
      ? 'data:text/javascript;base64,' +
        Buffer.from(
          exports
            .map(
              name =>
                `export const ${name} = (...args) => globalThis[Symbol.for('knowra-batch52-boundary')].${name}(...args);`
            )
            .join('\n')
        ).toString('base64')
      : specifier.startsWith('.')
        ? new URL(specifier, sourceUrl).href
        : import.meta.resolve(specifier);
    rewritten = rewritten.replace(`'${specifier}'`, JSON.stringify(url));
  }
  return import(
    `data:text/javascript;base64,${Buffer.from(rewritten + `\n// ${label} ${++loadCount}`).toString('base64')}`
  );
}
// 显式历史模式只取准确父，缺对象即失败，绝不回退固定正文或候选实现。
const historical = baseline
  ? execFileSync('git', ['show', `${agentProvenanceParent}:${helper}`], { cwd: root, encoding: 'utf8' })
  : null;
const api = baseline ? await loadSource(historical, 'exact-parent') : await import(sourceUrl);
const frozen = await loadSource(agentProvenanceFrozenSource, 'fixed-oracle');
const candidateErased = baseline
  ? historical
  : stripTypeScriptTypes(readFileSync(new URL(helper.replace(/\.js$/, '.ts'), root), 'utf8'));
function normalizeSpecifier(source) {
  if (baseline) return source;
  const from = "'../knowledge/domain/knowledge-artifact-provenance-contract.ts'";
  assert.equal(source.split(from).length, 2);
  return source.replace(from, `'${validatorSpecifier}'`);
}
const executable = normalizeSpecifier(candidateErased);
const boundaryApi = await loadSource(executable, 'candidate-boundary', true);
for (const entry of agentProvenanceContractCases(api)) test(entry.name, entry.run);

test('fixed old literal has independently recorded exact-parent SHA256', () => {
  assert.equal(hash(agentProvenanceFrozenSource), sourceHash);
  if (baseline) assert.equal(historical, agentProvenanceFrozenSource);
});
function executableAst(source) {
  const parsed = parse(source, { sourceType: 'module' });
  const normalize = value =>
    Array.isArray(value)
      ? value.map(normalize)
      : value === null || typeof value !== 'object'
        ? value
        : Object.fromEntries(
            Object.entries(value)
              .filter(
                ([key]) =>
                  ![
                    'start',
                    'end',
                    'loc',
                    'extra',
                    'comments',
                    'leadingComments',
                    'trailingComments',
                    'innerComments'
                  ].includes(key)
              )
              .map(([key, nested]) => [key, normalize(nested)])
          );
  return normalize(parsed.program);
}
test(
  'Node official erasure preserves full ordered executable AST with only validator bridge extension normalized',
  { skip: baseline },
  () => assert.deepEqual(executableAst(executable), executableAst(agentProvenanceFrozenSource))
);
test('JS bridge is exactly five same-identity TS re-exports', { skip: baseline }, async () => {
  const typed = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(api), Object.keys(typed));
  assert.equal(Object.keys(api).length, 5);
  for (const key of Object.keys(api)) assert.equal(api[key], typed[key]);
  const parsed = parse(readFileSync(sourceUrl, 'utf8'), { sourceType: 'module' }).program;
  assert.deepEqual(parsed.directives, []);
  assert.equal(parsed.body.length, 1);
  const statement = parsed.body[0];
  assert.equal(statement.type, 'ExportNamedDeclaration');
  assert.equal(statement.declaration, null);
  assert.equal(statement.source.value, './agent-knowledge-provenance.ts');
  assert.deepEqual(statement.specifiers.map(x => x.exported.name).sort(), Object.keys(api));
  assert.ok(statement.specifiers.every(x => x.type === 'ExportSpecifier' && x.local.name === x.exported.name));
});

function boundaryCases(subject) {
  const cases = [];
  const check = (name, run) => cases.push({ name, run });
  const key = Symbol.for('knowra-batch52-boundary');
  function exercise(mode, run, overrides = {}) {
    const previous = globalThis[key],
      calls = [];
    globalThis[key] = Object.fromEntries(
      names.map(name => [
        name,
        (...args) => {
          calls.push({ name, args });
          return (overrides[name] ?? real[name])(...args);
        }
      ])
    );
    try {
      return run(
        subject[
          mode === 'agent'
            ? 'createKnowledgeArtifactProvenanceFromProposal'
            : 'createKnowledgeArtifactProvenanceFromMcpProposal'
        ],
        calls
      );
    } finally {
      if (previous === undefined) delete globalThis[key];
      else globalThis[key] = previous;
    }
  }
  for (const mode of ['agent', 'mcp']) {
    check(mode + ' exact dependency call and hash/validator record construction order', () =>
      exercise(mode, (fn, calls) => {
        const input = fixture(mode),
          result = fn(input);
        assert.deepEqual(result, expected(input, mode));
        assert.deepEqual(
          calls.map(x => x.name),
          [
            'hashRecord',
            'knowledgeArtifactProvenanceId',
            'calculateContentHash',
            'hashKnowledgeArtifactProvenance',
            'validateKnowledgeArtifactProvenance'
          ]
        );
        const receipt = calls[0].args[0],
          record = calls[3].args[0],
          validated = calls[4].args[0];
        assert.deepEqual(Object.keys(receipt), [
          'requestId',
          'inputHash',
          'outputHash',
          ...(mode === 'agent' ? ['conversationId', 'turnId', 'toolCallId'] : ['pairingId', 'callId']),
          'candidateIds'
        ]);
        assert.deepEqual(Object.keys(record), [
          'id',
          'schemaVersion',
          'state',
          'artifactKind',
          'artifactId',
          'executionMode',
          'provider',
          'modelId',
          'promptVersion',
          'resultSchemaVersion',
          'origin',
          'inputHash',
          'outputHash',
          'committedAt',
          'sources'
        ]);
        assert.deepEqual(Object.keys(record.sources[0]), [
          'evidenceId',
          'sourceId',
          'noteId',
          'originNoteVersionId',
          'contentHash',
          'start',
          'end',
          'quoteText',
          'quoteHash',
          'annotationRevisions'
        ]);
        assert.deepEqual(Object.keys(validated), [...Object.keys(record), 'provenanceHash']);
        assert.notEqual(record, validated);
        assert.equal(record.sources, validated.sources);
        assert.equal(record.origin, validated.origin);
        assert.notEqual(result, validated);
        assert.notEqual(result.sources, validated.sources);
        assert.notEqual(result.origin, validated.origin);
        assert.notEqual(result.sources[0].annotationRevisions, validated.sources[0].annotationRevisions);
        assert.deepEqual(calls[1].args, ['item-1']);
        assert.deepEqual(calls[2].args, ['abc']);
        assert.equal(validated.provenanceHash, result.provenanceHash);
      })
    );

    check(mode + ' exact combined getter, receipt hash, id, quote hash and validator timeline', () =>
      exercise(mode, (fn, calls) => {
        const input = fixture(mode),
          candidate = input.candidate,
          ci = candidate.candidateInput,
          source = candidate.provenance[0],
          origin = input.origin,
          plan = input.plan;
        const watch = (value, label, keys) => {
          for (const key of keys) {
            const stored = value[key];
            Object.defineProperty(value, key, {
              enumerable: true,
              get() {
                calls.push({ name: 'get ' + label + '.' + key });
                return stored;
              }
            });
          }
        };
        const parameters =
          mode === 'agent'
            ? ['plan', 'candidate', 'origin', 'provider', 'modelId', 'committedAt']
            : ['plan', 'candidate', 'origin', 'committedAt'];
        const origins = mode === 'agent' ? ['conversationId', 'turnId', 'toolCallId'] : ['pairingId', 'callId'];
        watch(input, 'input', parameters);
        watch(plan, 'plan', ['requestId', 'inputHash', 'outputHash', 'candidates', 'spaceId']);
        watch(candidate, 'candidate', ['candidateInput', 'provenance']);
        watch(ci, 'candidateInput', ['id', 'evidence']);
        watch(ci.evidence[0], 'evidence', ['id']);
        watch(origin, 'origin', origins);
        watch(source, 'source', ['sourceId', 'noteId', 'noteVersionId', 'contentHash', 'start', 'end', 'quoteText']);
        calls.length = 0;
        fn(input);
        assert.deepEqual(
          calls.map(x => x.name),
          [
            ...parameters.map(k => 'get input.' + k),
            'get candidate.candidateInput',
            'get candidateInput.id',
            'get plan.requestId',
            'get plan.inputHash',
            'get plan.outputHash',
            ...origins.map(k => 'get origin.' + k),
            'get plan.candidates',
            'get candidate.candidateInput',
            'get candidateInput.id',
            'hashRecord',
            'knowledgeArtifactProvenanceId',
            ...origins.map(k => 'get origin.' + k),
            'get plan.requestId',
            'get plan.spaceId',
            'get plan.inputHash',
            'get plan.outputHash',
            'get candidate.provenance',
            'get candidate.candidateInput',
            'get candidateInput.evidence',
            'get evidence.id',
            ...['sourceId', 'noteId', 'noteVersionId', 'contentHash', 'start', 'end', 'quoteText', 'quoteText'].map(
              k => 'get source.' + k
            ),
            'calculateContentHash',
            'hashKnowledgeArtifactProvenance',
            'validateKnowledgeArtifactProvenance'
          ]
        );
      })
    );
    for (const stage of names)
      check(mode + ' dependency exception identity and stopping at ' + stage, () => {
        const sentinel = { mode, stage };
        exercise(
          mode,
          (fn, calls) => {
            assert.throws(
              () => fn(fixture(mode)),
              error => error === sentinel
            );
            const order = [
              'hashRecord',
              'knowledgeArtifactProvenanceId',
              'calculateContentHash',
              'hashKnowledgeArtifactProvenance',
              'validateKnowledgeArtifactProvenance'
            ];
            assert.deepEqual(
              calls.map(x => x.name),
              order.slice(0, order.indexOf(stage) + 1)
            );
          },
          {
            [stage]() {
              throw sentinel;
            }
          }
        );
      });
    check(mode + ' returns exact validator success object without replacement, freeze or caching', () => {
      const marker = { synthetic: 'validator result' };
      exercise(
        mode,
        (fn, calls) => {
          assert.equal(fn(fixture(mode)), marker);
          assert.equal(calls.at(-1).name, 'validateKnowledgeArtifactProvenance');
          assert.equal(Object.isFrozen(marker), false);
        },
        {
          validateKnowledgeArtifactProvenance() {
            return marker;
          }
        }
      );
    });
    check(mode + ' hashes every source before provenance hash and passes untouched unknown field values', () =>
      exercise(mode, (fn, calls) => {
        const input = fixture(mode);
        input.candidate.provenance.push({ ...input.candidate.provenance[0], sourceId: 'source-2', quoteText: 'xyz' });
        input.candidate.candidateInput.evidence.push({ id: 'evidence-2' });
        fn(input);
        assert.deepEqual(
          calls.map(x => x.name),
          [
            'hashRecord',
            'knowledgeArtifactProvenanceId',
            'calculateContentHash',
            'calculateContentHash',
            'hashKnowledgeArtifactProvenance',
            'validateKnowledgeArtifactProvenance'
          ]
        );
        assert.deepEqual(
          calls.filter(x => x.name === 'calculateContentHash').map(x => x.args),
          [['abc'], ['xyz']]
        );
      })
    );
  }
  return cases;
}
for (const entry of boundaryCases(boundaryApi)) test(entry.name, entry.run);

// 每个种子单独构造输入。Proxy 记录按顺序的真实属性访问、重复访问及异常身份，不排序轨迹。
function observe(subject, seed) {
  let state = (seed + 17) >>> 0;
  const random = max => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % max;
  };
  const mode = seed % 2 ? 'mcp' : 'agent',
    input = fixture(mode),
    events = [],
    sentinel = { seed };
  const quotes = ['abc', '😀', 'e\u0301', '中', ' a ', '\ud800'];
  const quote = quotes[random(quotes.length)];
  const count = random(4);
  input.candidate.provenance = [];
  input.candidate.candidateInput.evidence = [];
  for (let index = 0; index < count; index++) {
    input.candidate.provenance.push({
      sourceId: 'source-' + index,
      noteId: 'note-' + index,
      noteVersionId: 'version-' + index,
      contentHash: hash('synthetic-' + index),
      start: index * 8,
      end: index * 8 + quote.length,
      quoteText: quote
    });
    input.candidate.candidateInput.evidence.push({ id: 'evidence-' + index });
  }
  const kind = seed % 16;
  if (kind === 1) input.candidate.candidateInput.id = '';
  if (kind === 2) input.plan.requestId = null;
  if (kind === 3) input.plan.inputHash = 'BAD';
  if (kind === 4 && count) input.candidate.provenance[0].end = '3';
  if (kind === 5 && count) input.candidate.candidateInput.evidence.length = 0;
  if (kind === 6) input.committedAt = 'bad-date';
  if (kind === 7) input.provider = 'mock';
  if (kind === 8) input.plan.candidates = [];
  if (kind === 9)
    input.plan.candidates.push({ candidateInput: { id: [undefined, null, Symbol('id'), 0, {}, [], 4n][random(7)] } });
  if (kind === 10 && count) input.candidate.provenance[0].quoteText = new String('abc');
  if (kind === 11)
    input.plan.outputHash = Object.defineProperty({}, 'nested', {
      enumerable: true,
      get() {
        events.push(['nested-hash']);
        throw sentinel;
      }
    });
  if (kind === 12)
    input.candidate.provenance.map = function (callback) {
      events.push(['custom-map']);
      return Array.prototype.map.call(this, callback).reverse();
    };
  if (kind === 13 && count) delete input.candidate.provenance[0];
  if (kind === 14)
    input.plan.candidates = {
      map(callback) {
        events.push(['plan-map']);
        return [callback({ candidateInput: { id: 'synthetic' } }), 0];
      }
    };
  const throwPaths = [
    'input.provider',
    'input.committedAt',
    'input.candidate.candidateInput.id',
    'input.plan.requestId',
    'input.plan.candidates',
    'input.origin.conversationId',
    'input.origin.pairingId',
    'input.candidate.provenance.0.quoteText',
    'input.candidate.candidateInput.evidence.0.id'
  ];
  const throwPath = random(4) === 0 ? throwPaths[random(throwPaths.length)] : null,
    throwRead = 1 + random(2);
  const changes = random(3) === 0;
  const reads = new Map(),
    proxies = new WeakMap();
  function proxy(value, path) {
    if (value === null || typeof value !== 'object' || value instanceof String) return value;
    if (proxies.has(value)) return proxies.get(value);
    const wrapped = new Proxy(value, {
      get(target, key, receiver) {
        const label = path + '.' + String(key),
          read = (reads.get(label) ?? 0) + 1;
        reads.set(label, read);
        events.push(['get', label, read]);
        if (label === throwPath && read === throwRead) throw sentinel;
        const result = Reflect.get(target, key, receiver);
        if (
          changes &&
          read > 1 &&
          typeof result === 'string' &&
          ['requestId', 'conversationId', 'pairingId'].includes(key)
        )
          return result + '-later';
        if (changes && read > 1 && key === 'quoteText') return 'xyz';
        return proxy(result, label);
      }
    });
    proxies.set(value, wrapped);
    return wrapped;
  }
  let outcome;
  try {
    const value = subject[
      mode === 'agent'
        ? 'createKnowledgeArtifactProvenanceFromProposal'
        : 'createKnowledgeArtifactProvenanceFromMcpProposal'
    ](proxy(input, 'input'));
    outcome = { kind: 'return', value, asynchronous: value instanceof Promise };
  } catch (error) {
    outcome =
      error === sentinel
        ? { kind: 'throw', identity: 'sentinel' }
        : { kind: 'throw', name: error.name, message: error.message, code: error.code, keys: Object.keys(error) };
  }
  return { events, outcome };
}
test('4096 independent ordered old/new differentials preserve result, reads, native errors and sentinel identity', () => {
  const outcomes = new Map();
  for (let seed = 0; seed < 4096; seed++) {
    const expected = observe(frozen, seed);
    assert.deepEqual(observe(api, seed), expected, `Differential seed ${seed}`);
    const key = expected.outcome.identity ?? expected.outcome.name ?? expected.outcome.kind;
    outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
  }
  for (const kind of ['return', 'sentinel', 'TypeError', 'AppError'])
    assert.ok(outcomes.get(kind) > 10, `Missing differential coverage ${kind}`);
});

const mutations = [
  ['Agent prompt changes', "'agent-knowledge-propose-v1'", "'agent-knowledge-propose-v2'"],
  ['result schema changes', "'knowledge-extraction-v1'", "'knowledge-extraction-v2'"],
  ['MCP prompt changes', "'mcp-knowledge-propose-v1'", "'mcp-knowledge-propose-v2'"],
  [
    'Agent parameter getter order changes',
    '{ plan, candidate, origin, provider, modelId, committedAt }',
    '{ provider, plan, candidate, origin, modelId, committedAt }'
  ],
  [
    'MCP reads ignored provider',
    '{ plan, candidate, origin, committedAt }',
    '{ plan, candidate, origin, provider, committedAt }'
  ],
  [
    'artifact ID validation happens before receipt hash',
    'const artifactId = candidate.candidateInput.id;',
    'const artifactId = candidate.candidateInput.id; knowledgeArtifactProvenanceId(artifactId);',
    2
  ],
  [
    'receipt hashing algorithm changes',
    'const receiptHash = hashRecord(',
    'const receiptHash = hashKnowledgeArtifactProvenance(',
    2
  ],
  [
    'receipt candidates are sorted',
    'plan.candidates.map(item => item.candidateInput.id)',
    'plan.candidates.map(item => item.candidateInput.id).sort()',
    2
  ],
  [
    'receipt candidates are deduplicated',
    'plan.candidates.map(item => item.candidateInput.id)',
    '[...new Set(plan.candidates.map(item => item.candidateInput.id))]',
    2
  ],
  ['receipt ignores noncurrent candidates', 'plan.candidates.map(item => item.candidateInput.id)', '[artifactId]', 2],
  [
    'receipt input hash omitted',
    'requestId: plan.requestId, inputHash: plan.inputHash, outputHash: plan.outputHash',
    'requestId: plan.requestId, outputHash: plan.outputHash',
    2
  ],
  [
    'receipt request field reordered',
    'requestId: plan.requestId, inputHash: plan.inputHash, outputHash: plan.outputHash',
    'inputHash: plan.inputHash, requestId: plan.requestId, outputHash: plan.outputHash',
    2
  ],
  [
    'origin is flattened and cached',
    'const artifactId = candidate.candidateInput.id;',
    'origin = { ...origin }; const artifactId = candidate.candidateInput.id;',
    2
  ],
  [
    'plan is flattened and cached',
    'const artifactId = candidate.candidateInput.id;',
    'plan = { ...plan }; const artifactId = candidate.candidateInput.id;',
    2
  ],
  [
    'candidate is flattened and cached',
    'const artifactId = candidate.candidateInput.id;',
    'candidate = { ...candidate }; const artifactId = candidate.candidateInput.id;',
    2
  ],
  [
    'candidate membership newly enforced',
    'const artifactId = candidate.candidateInput.id;',
    'if (!plan.candidates.includes(candidate)) throw Error("not a member"); const artifactId = candidate.candidateInput.id;',
    2
  ],
  [
    'Agent provider is hardcoded',
    "executionMode: 'agent', provider, modelId,",
    "executionMode: 'agent', provider: 'fixed-provider', modelId,"
  ],
  [
    'MCP provider trusts caller',
    "executionMode: 'mcp', provider: 'external-client'",
    "executionMode: 'mcp', provider: 'deepseek'"
  ],
  ['MCP model changes', "modelId: 'unreported'", "modelId: 'client-model'"],
  [
    'record input and output hashes swapped',
    'inputHash: plan.inputHash, outputHash: plan.outputHash, committedAt',
    'inputHash: plan.outputHash, outputHash: plan.inputHash, committedAt',
    2
  ],
  ['source sequence reverses', 'candidate.provenance.map(', 'candidate.provenance.slice().reverse().map('],
  [
    'evidence index becomes first element',
    'candidate.candidateInput.evidence[index].id',
    'candidate.candidateInput.evidence[0].id'
  ],
  ['evidence id starts reading source', 'candidate.candidateInput.evidence[index].id', 'source.sourceId'],
  [
    'whole source is spread into record',
    'evidenceId: candidate.candidateInput.evidence[index].id',
    '...source, evidenceId: candidate.candidateInput.evidence[index].id'
  ],
  ['source version becomes note id', 'originNoteVersionId: source.noteVersionId', 'originNoteVersionId: source.noteId'],
  [
    'offsets normalized into integers',
    'start: source.start, end: source.end',
    'start: Number(source.start), end: Number(source.end)'
  ],
  ['quote is trimmed', 'quoteText: source.quoteText', 'quoteText: source.quoteText.trim()'],
  [
    'quote hash is constant',
    'quoteHash: calculateContentHash(source.quoteText)',
    "quoteHash: calculateContentHash('abc')"
  ],
  [
    'untrusted annotations are preserved',
    'annotationRevisions: []',
    'annotationRevisions: source.annotationRevisions ?? []'
  ],
  ['annotation arrays are shared', 'annotationRevisions: []', 'annotationRevisions: sharedAnnotations', 1, 'shared'],
  [
    'quote second read is cached',
    'quoteHash: calculateContentHash(source.quoteText)',
    'quoteHash: calculateContentHash(quoteText)',
    1,
    'quote-cache'
  ],
  [
    'validator bypassed',
    'return validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) });',
    'return { ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) };',
    2
  ],
  [
    'validator result replaced by unvalidated object',
    'return validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) });',
    'const input = { ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) }; validateKnowledgeArtifactProvenance(input); return input;',
    2
  ],
  [
    'provenance hash is skipped',
    'provenanceHash: hashKnowledgeArtifactProvenance(record)',
    "provenanceHash: '0'.repeat(64)",
    2
  ],
  [
    'validation exception swallowed',
    'return validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) });',
    'try { return validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) }); } catch { return null; }',
    2
  ],
  [
    'validation exception wrapped',
    'return validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) });',
    'try { return validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) }); } catch { throw Error("wrapped"); }',
    2
  ],
  [
    'result is frozen',
    'return validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) });',
    'return Object.freeze(validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) }));',
    2
  ],
  [
    'Agent becomes async',
    'export function createKnowledgeArtifactProvenanceFromProposal(',
    'export async function createKnowledgeArtifactProvenanceFromProposal('
  ],
  [
    'MCP becomes async',
    'export function createKnowledgeArtifactProvenanceFromMcpProposal(',
    'export async function createKnowledgeArtifactProvenanceFromMcpProposal('
  ]
];
for (const [label, from, to, count = 1, special] of mutations)
  test('fixed assertions kill valid executable mutation: ' + label, async () => {
    assert.equal(agentProvenanceFrozenSource.split(from).length, count + 1, `Exact mutation anchor: ${label}`);
    let changed = agentProvenanceFrozenSource.replaceAll(from, to);
    if (special === 'shared') changed = 'const sharedAnnotations = [];\n' + changed;
    if (special === 'quote-cache')
      changed = changed
        .replace(
          'const sourcesOf = candidate => candidate.provenance.map((source, index) => ({',
          'const sourcesOf = candidate => candidate.provenance.map((source, index) => { const quoteText = source.quoteText; return ({'
        )
        .replace('quoteText: source.quoteText, quoteHash:', 'quoteText, quoteHash:')
        .replace('annotationRevisions: [] }));', 'annotationRevisions: [] }); });');
    // 先解析并真实导入，语法或导入失败不能算杀死变异。
    executableAst(changed);
    const mutant = await loadSource(changed, label),
      instrumented = await loadSource(changed, label + ' boundary', true);
    let killedBy = null;
    for (const entry of [...agentProvenanceContractCases(mutant), ...boundaryCases(instrumented)]) {
      try {
        await assert.doesNotReject(async () => entry.run());
      } catch (error) {
        assert.equal(error.name, 'AssertionError', `Mutation must be killed by an assertion: ${label}`);
        killedBy = entry.name;
        break;
      }
    }
    assert.ok(killedBy, `Live mutation: ${label}`);
  });

// 历史模式不把当前消费依赖图宣称为历史验收。普通入口确实执行这些 node:test 文件的六个测试。
if (!baseline) {
  for (const entry of agentProvenanceConsumerCases(api)) test(entry.name, entry.run);
  await import('./knowledge-artifact-provenance-agent.node.test.js');
  await import('./knowledge-artifact-provenance-mcp.node.test.js');
}
