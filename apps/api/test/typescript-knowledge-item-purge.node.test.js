import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

// 普通检出只读当前文件。显式基线要求真实父 Git 对象，缺失立即失败，不回退。
const baseline = process.env.KNOWRA_KNOWLEDGE_PURGE_BASELINE === '1';
const parent = 'fefed254431861f1a658ba8a747a71b5de357485';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/modules/knowledge/application/knowledge-item-purge.js';
const cache = new Map();
function moduleUrl(file) {
  if (!baseline) return new URL(file, root).href;
  if (!cache.has(file)) {
    const source = execFileSync('git', ['show', `${parent}:${file}`], { cwd: root, encoding: 'utf8' });
    const rewritten = source.replace(/from\s+(['"])([^'"]+)\1/g, (match, quote, specifier) => {
      const resolved = specifier.startsWith('.')
        ? new URL(specifier, new URL(file, root)).href
        : import.meta.resolve(specifier);
      const target = resolved === new URL(helper, root).href ? moduleUrl(helper) : resolved;
      return `from ${quote}${target}${quote}`;
    });
    cache.set(file, `data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);
  }
  return cache.get(file);
}
const { inspectKnowledgeItemPurge: inspect, assertKnowledgeItemPurgeAllowed: allowed } = await import(
  moduleUrl(helper)
);
const { createKnowledgeModule } = await import(moduleUrl('apps/api/src/modules/knowledge/index.js'));
const { createPostgresKnowledgeModule } = await import(
  moduleUrl('apps/api/src/modules/knowledge/postgres-async-module.js')
);

test('JS bridge exposes only the two identical synchronous TS functions', { skip: baseline }, async () => {
  const js = await import(new URL(helper, root));
  const ts = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(js), ['assertKnowledgeItemPurgeAllowed', 'inspectKnowledgeItemPurge']);
  assert.deepEqual(Object.keys(ts), Object.keys(js));
  for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
});
const item = (extra = {}) => ({ id: 'k', deletedAt: 'stamp', updatedAt: 'stamp', ...extra });
test('sync function identity/arity and fresh mutable output', () => {
  assert.equal(inspect.length, 1);
  assert.equal(allowed.length, 2);
  const a = inspect({ item: item() }),
    b = inspect({ item: item() });
  assert(!(a instanceof Promise));
  assert.notEqual(a, b);
  assert.notEqual(a.references, b.references);
  a.references.push({});
  assert.deepEqual(Object.keys(b), [
    'asset',
    'operation',
    'decision',
    'expectedUpdatedAt',
    'exclusiveRecords',
    'references',
    'coverage'
  ]);
  assert.equal(b.decision, 'can-purge-no-history');
  assert.equal(allowed(b, 'stamp'), undefined);
});
test('missing item and no top-level default', () => {
  assert.throws(() => inspect({ item: null }), { code: 'KNOWLEDGE_ITEM_NOT_FOUND', statusCode: 404 });
  assert.throws(() => inspect(), TypeError);
});
test('all destructuring getters occur before missing-item guard', () => {
  const trace = [],
    marker = {};
  const input = Object.fromEntries(
    ['item', 'evidence', 'provenance', 'learningObjectives', 'questionSources', 'analysisScopes'].map(key => [
      key,
      undefined
    ])
  );
  for (const key of Object.keys(input))
    Object.defineProperty(input, key, {
      get() {
        trace.push(key);
        if (key === 'analysisScopes') throw marker;
        return undefined;
      }
    });
  assert.throws(
    () => inspect(input),
    e => e === marker
  );
  assert.deepEqual(trace, Object.keys(input));
});
test('references ordered by category, duplicates and unknown identities preserved', () => {
  const unknown = { legacy: true };
  const p = inspect({
    item: item(),
    evidence: [{ id: 'e' }, { id: 'e' }],
    provenance: [{ id: 'p' }, { id: 'p' }],
    learningObjectives: [
      { id: unknown, knowledgeItemId: 'k' },
      { id: unknown, knowledgeItemId: 'k' }
    ],
    questionSources: [
      { id: 7, sourceType: 'knowledgeItem', sourceId: 'k' },
      { id: null, sourceType: 'knowledgeEvidence', sourceId: 'e' }
    ],
    analysisScopes: [{ id: undefined, nested: { any: 'e' } }]
  });
  assert.deepEqual(
    p.references.map(x => x.collection),
    ['learningObjectives', 'learningObjectives', 'questionSources', 'questionSources', 'analysisScopeSnapshots']
  );
  assert.equal(p.references[0].id, unknown);
  assert.equal(p.references[4].id, undefined);
  assert.deepEqual(p.exclusiveRecords, {
    knowledgeEvidenceIds: ['e', 'e'],
    knowledgeArtifactProvenanceIds: ['p', 'p']
  });
});
test('active status wins decision but does not short-circuit reference work', () => {
  const p = inspect({
    item: item({ deletedAt: 0 }),
    questionSources: [{ id: 'q', sourceType: 'knowledgeItem', sourceId: 'k' }]
  });
  assert.equal(p.decision, 'move-to-recycle-bin-first');
  assert.equal(p.references.length, 1);
  const marker = {};
  assert.throws(
    () =>
      inspect({
        item: item({ deletedAt: 0 }),
        analysisScopes: [
          {
            get bad() {
              throw marker;
            }
          }
        ]
      }),
    e => e === marker
  );
});
test('deletedAt retains truthiness rather than boolean/date normalization', () => {
  for (const x of ['false', [], {}, 1])
    assert.equal(inspect({ item: item({ deletedAt: x }) }).decision, 'can-purge-no-history');
  for (const x of ['', null, undefined, 0, false, NaN])
    assert.equal(inspect({ item: item({ deletedAt: x }) }).decision, 'move-to-recycle-bin-first');
});
test('recursive search sees exact values not keys/substrings/inherited/symbol properties', () => {
  const inherited = Object.create({ hit: 'k' });
  inherited.id = 'inherited';
  const scopes = [
    { id: 'key', k: 'not a match' },
    { id: 'substring', v: 'prefix-k' },
    { id: 'symbol', [Symbol('hit')]: 'k' },
    inherited,
    { id: 'match', deep: [{ v: 'k' }] }
  ];
  assert.deepEqual(
    inspect({ item: item(), analysisScopes: scopes }).references.map(r => r.id),
    ['match']
  );
});
test('cycles terminate and nested hit survives a cycle', () => {
  const cycle = { id: 'cycle' };
  cycle.self = cycle;
  const hit = { id: 'hit' };
  hit.self = hit;
  hit.child = { v: 'k' };
  assert.deepEqual(
    inspect({ item: item(), analysisScopes: [cycle, hit] }).references.map(r => r.id),
    ['hit']
  );
});
test('Object.values eagerly reads sibling getters before some short-circuit', () => {
  const trace = [],
    marker = {};
  const scope = {
    id: 's',
    first: 'k',
    get later() {
      trace.push('later');
      throw marker;
    }
  };
  assert.throws(
    () => inspect({ item: item(), analysisScopes: [scope] }),
    e => e === marker
  );
  assert.deepEqual(trace, ['later']);
});
test('recursive child traversal short-circuits after first match', () => {
  const marker = {};
  const scope = {
    id: 's',
    first: 'k',
    later: {
      get fail() {
        throw marker;
      }
    }
  };
  assert.equal(inspect({ item: item(), analysisScopes: [scope] }).references.length, 1);
});
test('fresh seen set for each evidence search and duplicate scope', () => {
  let reads = 0;
  const scope = {
    id: 's',
    get value() {
      reads++;
      return reads === 1 ? 'none' : 'e';
    }
  };
  const p = inspect({ item: item(), evidence: [{ id: 'e' }], analysisScopes: [scope, scope] });
  assert.equal(p.references.length, 2);
  assert.equal(reads, 4);
});
test('evidence IDs reread for output after initial Set; no caching', () => {
  let reads = 0;
  const e = {
    get id() {
      return ++reads === 1 ? 'old-e' : 'new-e';
    }
  };
  const p = inspect({
    item: item(),
    evidence: [e],
    questionSources: [{ id: 'q', sourceType: 'knowledgeEvidence', sourceId: 'old-e' }]
  });
  assert.equal(p.references.length, 1);
  assert.deepEqual(p.exclusiveRecords.knowledgeEvidenceIds, ['new-e']);
  assert.equal(reads, 2);
});
test('question sourceType twice on failed first disjunct; exact equality', () => {
  let reads = 0;
  const q = {
    id: 'q',
    get sourceType() {
      return ++reads === 1 ? 'other' : 'knowledgeEvidence';
    },
    sourceId: 'e'
  };
  const p = inspect({
    item: item(),
    evidence: [{ id: 'e' }],
    questionSources: [q, { id: 'strict', sourceType: 'knowledgeItem', sourceId: new String('k') }]
  });
  assert.deepEqual(
    p.references.map(r => r.id),
    ['q']
  );
  assert.equal(reads, 2);
});
test('sparse map leaves sparse exclusive IDs; null lists and null rows still throw', () => {
  const evidence = Array(2);
  evidence[1] = { id: 'e' };
  const p = inspect({ item: item(), evidence });
  assert.equal(p.exclusiveRecords.knowledgeEvidenceIds.length, 2);
  assert.equal(0 in p.exclusiveRecords.knowledgeEvidenceIds, false);
  assert.throws(() => inspect({ item: item(), evidence: null }), TypeError);
  assert.throws(() => inspect({ item: item(), learningObjectives: [null] }), TypeError);
});
test('timestamp identity and read order at output are unchanged', () => {
  const stamp = { legacy: true },
    trace = [];
  const k = {
    get id() {
      trace.push('id');
      return 'k';
    },
    get deletedAt() {
      trace.push('deleted');
      return true;
    },
    get updatedAt() {
      trace.push('stamp');
      return stamp;
    }
  };
  const p = inspect({
    item: k,
    provenance: [
      {
        get id() {
          trace.push('provenance');
          return 'p';
        }
      }
    ]
  });
  assert.equal(p.expectedUpdatedAt, stamp);
  assert.deepEqual(trace, ['id', 'deleted', 'stamp', 'provenance']);
  assert.equal(allowed(p, stamp), undefined);
});
test('assert timestamp conflict before decision/reference getter, falsey skips preflight', () => {
  const marker = {};
  const p = {
    expectedUpdatedAt: 'different',
    get decision() {
      throw marker;
    }
  };
  assert.throws(() => allowed(p, 'stamp'), { code: 'KNOWLEDGE_ITEM_UPDATE_CONFLICT', statusCode: 409 });
  assert.throws(() => allowed(null, ''), { code: 'KNOWLEDGE_ITEM_UPDATE_CONFLICT' });
});
test('assert first task-coverage message uses nullish fallback including empty string', () => {
  for (const message of ['', null, undefined, 'specific']) {
    let later = 0;
    const p = {
      expectedUpdatedAt: 'stamp',
      decision: 'blocked',
      references: [
        { reasonCode: 'OTHER', message: 'ignored' },
        { reasonCode: 'TASK_REFERENCE_COVERAGE_UNAVAILABLE', message },
        {
          get reasonCode() {
            later++;
            return 'TASK_REFERENCE_COVERAGE_UNAVAILABLE';
          },
          message: 'later'
        }
      ]
    };
    assert.throws(
      () => allowed(p, 'stamp'),
      e =>
        e.code === 'KNOWLEDGE_ITEM_PURGE_BLOCKED' &&
        e.message === (message ?? '请先处理知识点的关联引用。') &&
        !Object.hasOwn(e, 'preflight') &&
        !Object.hasOwn(e, 'cause')
    );
    assert.equal(later, 0);
  }
});
test('assert getter errors propagate identity and allowed decision never reads references', () => {
  const marker = {};
  assert.throws(
    () =>
      allowed(
        {
          expectedUpdatedAt: 'stamp',
          decision: 'blocked',
          get references() {
            throw marker;
          }
        },
        'stamp'
      ),
    e => e === marker
  );
  assert.equal(
    allowed(
      {
        expectedUpdatedAt: 'stamp',
        decision: 'can-purge-no-history',
        get references() {
          throw marker;
        }
      },
      'stamp'
    ),
    undefined
  );
});
test('frozen inputs are not mutated', () => {
  const k = Object.freeze(item()),
    scope = Object.freeze({ id: 's', value: 'k' }),
    scopes = Object.freeze([scope]);
  const p = inspect({ item: k, analysisScopes: scopes });
  assert.equal(p.references.length, 1);
  assert.equal(scopes[0], scope);
});

for (const key of ['evidence', 'provenance', 'learningObjectives', 'questionSources', 'analysisScopes']) {
  test(`${key} defaults only for undefined, not null`, () => {
    assert.equal(inspect({ item: item(), [key]: undefined }).decision, 'can-purge-no-history');
    assert.throws(() => inspect({ item: item(), [key]: null }), TypeError);
  });
}
for (const expected of [undefined, null, false, 0, '', NaN]) {
  test(`falsey expected timestamp ${String(expected)} reports conflict before null preflight`, () => {
    assert.throws(() => allowed(null, expected), { code: 'KNOWLEDGE_ITEM_UPDATE_CONFLICT', statusCode: 409 });
  });
}
test('missing item error shape, message and ignored preflight option remain unchanged', () => {
  assert.throws(
    () => inspect({ item: undefined }),
    error => {
      assert.equal(error.name, 'AppError');
      assert.equal(error.message, '知识点不存在。');
      assert.equal(error.code, 'KNOWLEDGE_ITEM_NOT_FOUND');
      assert.equal(error.statusCode, 404);
      assert.deepEqual(Object.keys(error), ['name', 'code', 'statusCode']);
      assert.equal(Object.hasOwn(error, 'cause'), false);
      return true;
    }
  );
});
test('strict equality does not coerce item, evidence or question source identities', () => {
  const p = inspect({
    item: item(),
    evidence: [{ id: 'e' }],
    learningObjectives: [{ id: 'o', knowledgeItemId: new String('k') }],
    questionSources: [{ id: 'q', sourceType: 'knowledgeEvidence', sourceId: new String('e') }]
  });
  assert.deepEqual(p.references, []);
});
test('function-valued subtrees are not recursively traversed', () => {
  const fn = () => {};
  fn.value = 'k';
  assert.equal(inspect({ item: item(), analysisScopes: [{ id: 's', fn }] }).references.length, 0);
});
test('equality precedes falsey guard for historical empty item IDs', () => {
  assert.equal(inspect({ item: item({ id: '' }), analysisScopes: [{ id: 's', value: '' }] }).references.length, 1);
});
test('equality precedes object traversal for opaque historical IDs', () => {
  const id = {};
  const p = inspect({ item: item({ id }), analysisScopes: [id] });
  assert.equal(p.asset.id, id);
  assert.equal(p.references.length, 1);
});
test('Object.values integer keys precede string keys and ignore nonenumerable properties', () => {
  const trace = [];
  const scope = {
    id: 's',
    get tail() {
      trace.push('tail');
      return 'no';
    },
    get 9() {
      trace.push('9');
      return 'k';
    },
    get 2() {
      trace.push('2');
      return 'no';
    }
  };
  Object.defineProperty(scope, 'hidden', {
    get() {
      throw new Error('not enumerable');
    }
  });
  assert.equal(inspect({ item: item(), analysisScopes: [scope] }).references.length, 1);
  assert.deepEqual(trace, ['2', '9', 'tail']);
});
test('same object visited twice in one traversal is skipped after first visit', () => {
  let reads = 0;
  const shared = {
    get value() {
      reads++;
      return reads === 1 ? 'none' : 'k';
    }
  };
  assert.equal(inspect({ item: item(), analysisScopes: [{ id: 's', a: shared, b: shared }] }).references.length, 0);
  assert.equal(reads, 1);
});
test('each distinct evidence search has a fresh seen set', () => {
  let reads = 0;
  const scope = {
    id: 's',
    get value() {
      return ++reads === 3 ? 'e2' : 'none';
    }
  };
  assert.equal(
    inspect({ item: item(), evidence: [{ id: 'e1' }, { id: 'e2' }], analysisScopes: [scope] }).references.length,
    1
  );
  assert.equal(reads, 3);
});
test('scope id is reread by the reference map after recursive traversal', () => {
  let reads = 0;
  const scope = {
    get id() {
      return ++reads === 1 ? 'k' : 'final-scope';
    }
  };
  assert.deepEqual(
    inspect({ item: item(), analysisScopes: [scope] }).references.map(r => r.id),
    ['final-scope']
  );
  assert.equal(reads, 2);
});
test('scope traversal reads current evidence id rather than the earlier Set snapshot', () => {
  let reads = 0;
  const evidence = [
    {
      get id() {
        return ['old', 'scope-e', 'output-e'][reads++];
      }
    }
  ];
  const p = inspect({ item: item(), evidence, analysisScopes: [{ id: 's', value: 'scope-e' }] });
  assert.equal(p.references.length, 1);
  assert.deepEqual(p.exclusiveRecords.knowledgeEvidenceIds, ['output-e']);
  assert.equal(reads, 3);
});
test('item id is reread per filter, per scope and at output', () => {
  let reads = 0;
  const k = {
    ...item(),
    get id() {
      return ['o-id', 'q-id', 's-id', 'final-id'][reads++];
    }
  };
  const p = inspect({
    item: k,
    learningObjectives: [{ id: 'o', knowledgeItemId: 'o-id' }],
    questionSources: [{ id: 'q', sourceType: 'knowledgeItem', sourceId: 'q-id' }],
    analysisScopes: [{ id: 's', value: 's-id' }]
  });
  assert.deepEqual(
    p.references.map(r => r.id),
    ['o', 'q', 's']
  );
  assert.equal(p.asset.id, 'final-id');
  assert.equal(reads, 4);
});
test('evidence Set is fully built before objectives and category maps complete before later filters', () => {
  const trace = [];
  const p = inspect({
    item: item(),
    evidence: [
      {
        get id() {
          trace.push('evidence');
          return 'e';
        }
      }
    ],
    learningObjectives: [
      {
        get knowledgeItemId() {
          trace.push('objective-filter');
          return 'k';
        },
        get id() {
          trace.push('objective-map');
          return 'o';
        }
      }
    ],
    questionSources: [
      {
        get sourceType() {
          trace.push('question-filter');
          return 'knowledgeItem';
        },
        sourceId: 'k',
        get id() {
          trace.push('question-map');
          return 'q';
        }
      }
    ],
    analysisScopes: [
      {
        id: 's',
        get value() {
          trace.push('scope-filter');
          return 'k';
        }
      }
    ]
  });
  assert.equal(p.references.length, 3);
  assert.deepEqual(trace, [
    'evidence',
    'objective-filter',
    'objective-map',
    'question-filter',
    'question-map',
    'scope-filter',
    'evidence'
  ]);
});
test('output key order and nested values are exact', () => {
  const p = inspect({ item: item() });
  assert.deepEqual(p, {
    asset: { type: 'knowledgeItem', id: 'k' },
    operation: 'permanent-delete',
    decision: 'can-purge-no-history',
    expectedUpdatedAt: 'stamp',
    exclusiveRecords: { knowledgeEvidenceIds: [], knowledgeArtifactProvenanceIds: [] },
    references: [],
    coverage: {
      persistedCurrentAndHistory: true,
      runningTasks: 'unverified',
      offlineDevices: 'pending-sync',
      backups: 'retention-managed'
    }
  });
  assert.deepEqual(Object.keys(p.exclusiveRecords), ['knowledgeEvidenceIds', 'knowledgeArtifactProvenanceIds']);
  assert.deepEqual(Object.keys(p.coverage), [
    'persistedCurrentAndHistory',
    'runningTasks',
    'offlineDevices',
    'backups'
  ]);
});
test('all output arrays and records are fresh and mutable without mutating inputs', () => {
  const input = {
    item: Object.freeze(item()),
    evidence: Object.freeze([Object.freeze({ id: 'e' })]),
    provenance: Object.freeze([Object.freeze({ id: 'p' })]),
    learningObjectives: Object.freeze([Object.freeze({ id: 'o', knowledgeItemId: 'k' })])
  };
  const a = inspect(input),
    b = inspect(input);
  for (const key of ['asset', 'exclusiveRecords', 'references', 'coverage']) assert.notEqual(a[key], b[key]);
  assert.notEqual(a.references[0], b.references[0]);
  a.references[0].id = 'new';
  a.exclusiveRecords.knowledgeEvidenceIds.push('another');
  a.coverage.runningTasks = 'changed';
  assert.equal(b.references[0].id, 'o');
  assert.deepEqual(b.exclusiveRecords.knowledgeEvidenceIds, ['e']);
});
test('assert uses strict timestamp identity, not conversion or structural equality', () => {
  const stamp = {};
  const p = { expectedUpdatedAt: stamp, decision: 'can-purge-no-history' };
  assert.equal(allowed(p, stamp), undefined);
  assert.throws(() => allowed(p, {}), { code: 'KNOWLEDGE_ITEM_UPDATE_CONFLICT' });
  assert.throws(() => allowed({ expectedUpdatedAt: '1' }, 1), { code: 'KNOWLEDGE_ITEM_UPDATE_CONFLICT' });
});
test('assert reads timestamp then decision then references; original getter errors win', () => {
  for (const fault of ['expectedUpdatedAt', 'decision', 'references']) {
    const trace = [],
      marker = {};
    const p = {};
    for (const [key, value] of [
      ['expectedUpdatedAt', 'stamp'],
      ['decision', 'blocked'],
      ['references', []]
    ])
      Object.defineProperty(p, key, {
        get() {
          trace.push(key);
          if (key === fault) throw marker;
          return value;
        }
      });
    assert.throws(
      () => allowed(p, 'stamp'),
      error => error === marker
    );
    assert.deepEqual(
      trace,
      ['expectedUpdatedAt', 'decision', 'references'].slice(
        0,
        ['expectedUpdatedAt', 'decision', 'references'].indexOf(fault) + 1
      )
    );
  }
});
test('unknown decision blocks and absent coverage message falls back', () => {
  for (const decision of [undefined, null, false, '', 'CAN-PURGE', {}])
    assert.throws(() => allowed({ expectedUpdatedAt: 'stamp', decision, references: [] }, 'stamp'), {
      code: 'KNOWLEDGE_ITEM_PURGE_BLOCKED',
      message: '请先处理知识点的关联引用。',
      statusCode: 409
    });
});
test('null references still throw only after passing timestamp and blocked decision', () => {
  assert.throws(
    () => allowed({ expectedUpdatedAt: 'stamp', decision: 'blocked', references: null }, 'stamp'),
    TypeError
  );
  assert.equal(
    allowed({ expectedUpdatedAt: 'stamp', decision: 'can-purge-no-history', references: null }, 'stamp'),
    undefined
  );
});
test('first coverage message getter error propagates without reading later candidates', () => {
  const marker = {};
  assert.throws(
    () =>
      allowed(
        {
          expectedUpdatedAt: 'stamp',
          decision: 'blocked',
          references: [
            {
              reasonCode: 'TASK_REFERENCE_COVERAGE_UNAVAILABLE',
              get message() {
                throw marker;
              }
            },
            {
              get reasonCode() {
                throw new Error('later');
              }
            }
          ]
        },
        'stamp'
      ),
    error => error === marker
  );
});
test('actual synchronous module and real memory repositories preserve preview and reject before delete', () => {
  const module = createKnowledgeModule({
    knowledgeItems: [item()],
    knowledgeEvidence: [{ id: 'e', knowledgeItemId: 'k' }],
    questionSources: [{ id: 'q', sourceType: 'knowledgeEvidence', sourceId: 'e' }],
    analysisScopeSnapshots: [{ id: 's', value: 'k' }]
  });
  const p = module.inspectKnowledgePurge('k');
  assert.equal(p instanceof Promise, false);
  assert.deepEqual(
    p.references.map(r => r.id),
    ['q', 's']
  );
  assert.equal(p.coverage.runningTasks, 'verified');
  const writes = [];
  for (const [name, method] of [
    ['knowledgeItemRepository', 'delete'],
    ['knowledgeEvidenceRepository', 'deleteByKnowledgeItemId'],
    ['knowledgeArtifactProvenanceRepository', 'deleteByKnowledgeItemId']
  ])
    module.repositories[name][method] = () => {
      writes.push(name);
      throw new Error('unexpected write');
    };
  assert.throws(() => module.permanentlyDeleteKnowledgeItem('k', { expectedUpdatedAt: 'old' }), {
    code: 'KNOWLEDGE_ITEM_UPDATE_CONFLICT'
  });
  assert.throws(() => module.permanentlyDeleteKnowledgeItem('k', { expectedUpdatedAt: 'stamp' }), {
    code: 'KNOWLEDGE_ITEM_PURGE_BLOCKED'
  });
  assert.deepEqual(writes, []);
  assert(module.repositories.knowledgeItemRepository.findById('k'));
});
test('actual local module preserves task coverage supplement boundary and no-history preview', () => {
  const clean = createKnowledgeModule({ knowledgeItems: [item()] });
  assert.equal(clean.inspectKnowledgePurge('k').decision, 'can-purge-no-history');
  const blocked = createKnowledgeModule({
    knowledgeItems: [item()],
    readPurgeTaskState() {
      throw new Error('synthetic unavailable');
    }
  });
  const p = blocked.inspectKnowledgePurge('k');
  assert.equal(p.decision, 'requires-dependency-action');
  assert.equal(p.references[0].reasonCode, 'TASK_REFERENCE_COVERAGE_UNAVAILABLE');
  assert.throws(() => blocked.permanentlyDeleteKnowledgeItem('k', { expectedUpdatedAt: 'stamp' }), {
    code: 'KNOWLEDGE_ITEM_PURGE_BLOCKED',
    message: p.references[0].message
  });
});
function asyncFixture(extra = {}) {
  const names = [
    'note',
    'folder',
    'tag',
    'tagGroup',
    'knowledgeSpace',
    'contentAnnotation',
    'annotationExclusion',
    'annotationRevision',
    'analysisScope',
    'noteVersion',
    'knowledgeItem',
    'knowledgeEvidence',
    'knowledgeArtifactProvenance',
    'learningObjective',
    'examProfile',
    'examFocus',
    'question',
    'questionObjective',
    'questionSource'
  ];
  const state = Object.fromEntries(names.map(n => [n, []]));
  state.knowledgeItem = [item()];
  state.knowledgeEvidence = [{ id: 'e', knowledgeItemId: 'k' }];
  state.questionSource = [{ id: 'q', sourceType: 'knowledgeEvidence', sourceId: 'e' }];
  const calls = [],
    writes = [];
  const repositories = Object.fromEntries(
    names.map(n => [
      `${n}Repository`,
      {
        supportsAsync: true,
        async findById(id) {
          calls.push([n, 'find', id]);
          return state[n].find(r => r.id === id) ?? null;
        },
        async list(query) {
          calls.push([n, 'list', query]);
          return state[n];
        },
        async delete() {
          writes.push(n);
          throw new Error('unexpected write');
        },
        async deleteByKnowledgeItemId() {
          writes.push(n);
          throw new Error('unexpected write');
        }
      }
    ])
  );
  return { module: createPostgresKnowledgeModule({ ...repositories, ...extra }), state, calls, writes };
}
test('actual async module resolves six reads and rejects before any synthetic write', async () => {
  const { module, calls, writes } = asyncFixture();
  const pending = module.inspectKnowledgePurge('k');
  assert(pending instanceof Promise);
  const p = await pending;
  assert.deepEqual(
    p.references.map(r => r.id),
    ['q']
  );
  assert.equal(p.coverage.runningTasks, 'verified');
  assert.deepEqual(calls, [
    ['knowledgeItem', 'find', 'k'],
    ['knowledgeEvidence', 'list', { knowledgeItemId: 'k' }],
    ['knowledgeArtifactProvenance', 'list', { artifactId: 'k' }],
    ['learningObjective', 'list', { includeArchived: true, includeDeleted: true }],
    ['questionSource', 'list', undefined],
    ['analysisScope', 'list', { includeDeleted: true }]
  ]);
  await assert.rejects(module.permanentlyDeleteKnowledgeItem('k', { expectedUpdatedAt: 'old' }), {
    code: 'KNOWLEDGE_ITEM_UPDATE_CONFLICT'
  });
  await assert.rejects(module.permanentlyDeleteKnowledgeItem('k', { expectedUpdatedAt: 'stamp' }), {
    code: 'KNOWLEDGE_ITEM_PURGE_BLOCKED'
  });
  assert.deepEqual(writes, []);
});
test('actual async module keeps no-history and unavailable-task supplement results', async () => {
  const clean = asyncFixture();
  clean.state.questionSource = [];
  assert.equal((await clean.module.inspectKnowledgePurge('k')).decision, 'can-purge-no-history');
  const blocked = asyncFixture({
    async readPurgeTaskState() {
      throw new Error('synthetic unavailable');
    }
  });
  blocked.state.questionSource = [];
  const p = await blocked.module.inspectKnowledgePurge('k');
  assert.equal(p.coverage.runningTasks, 'unverified');
  assert.equal(p.references[0].reasonCode, 'TASK_REFERENCE_COVERAGE_UNAVAILABLE');
  await assert.rejects(blocked.module.permanentlyDeleteKnowledgeItem('k', { expectedUpdatedAt: 'stamp' }), {
    code: 'KNOWLEDGE_ITEM_PURGE_BLOCKED',
    message: p.references[0].message
  });
  assert.deepEqual(blocked.writes, []);
});
test('actual async module propagates original repository rejection', async () => {
  const marker = {};
  const { module, writes } = asyncFixture({
    knowledgeEvidenceRepository: {
      supportsAsync: true,
      async list() {
        throw marker;
      }
    }
  });
  await assert.rejects(module.inspectKnowledgePurge('k'), error => error === marker);
  assert.deepEqual(writes, []);
});
test('sparse evidence Set iteration includes undefined while exclusive output keeps holes', () => {
  const evidence = Array(2);
  evidence[1] = { id: 'e' };
  const p = inspect({
    item: item(),
    evidence,
    questionSources: [
      { id: 'undefined-source', sourceType: 'knowledgeEvidence', sourceId: undefined },
      { id: 'e-source', sourceType: 'knowledgeEvidence', sourceId: 'e' }
    ]
  });
  assert.deepEqual(
    p.references.map(r => r.id),
    ['undefined-source', 'e-source']
  );
  assert.equal(p.exclusiveRecords.knowledgeEvidenceIds.length, 2);
  assert.equal(0 in p.exclusiveRecords.knowledgeEvidenceIds, false);
  assert.equal(p.exclusiveRecords.knowledgeEvidenceIds[1], 'e');
});
test('sparse reference lists skip holes while preserving matching row order', () => {
  const objectives = Array(3);
  objectives[1] = { id: 'o', knowledgeItemId: 'k' };
  const scopes = Array(2);
  scopes[1] = { id: 's', value: 'k' };
  assert.deepEqual(
    inspect({ item: item(), learningObjectives: objectives, analysisScopes: scopes }).references.map(r => r.id),
    ['o', 's']
  );
});
