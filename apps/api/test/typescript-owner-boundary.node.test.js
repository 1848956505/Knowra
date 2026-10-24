import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { parse } from '@babel/parser';
import {
  boundaryError,
  ownerBoundaryContractCases,
  ownerBoundaryFrozenSource,
  ownerBoundaryParent
} from './owner-boundary.contract-support.js';

const baseline = process.env.KNOWRA_OWNER_BOUNDARY_BASELINE === '1';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/infrastructure/owner-boundary.js';
const errorUrl = new URL('apps/api/src/errors/app-error.js', root).href;
const sourceUrl = new URL(helper, root);
const expectedHash = '2fc2191086c61bd1b9fa7cd56f712721c2e7dc4f918cce528473875525860f4e';

function loadSource(source, label) {
  const dependency = "'../errors/app-error.js'";
  assert.equal(source.split(dependency).length, 2, 'Frozen dependency must occur exactly once');
  const rewritten = source.replace(dependency, JSON.stringify(errorUrl));
  return import(`data:text/javascript;base64,${Buffer.from(`${rewritten}\n// ${label}`).toString('base64')}`);
}

// 普通运行不读取任何 Git 信息；显式模式只读取准确父对象，失败不回退候选或固定正文。
const historicalSource = baseline
  ? execFileSync('git', ['show', `${ownerBoundaryParent}:${helper}`], { cwd: root, encoding: 'utf8' })
  : null;
const api = baseline ? await loadSource(historicalSource, 'exact-parent') : await import(sourceUrl);
const frozenApi = await loadSource(ownerBoundaryFrozenSource, 'fixed-oracle');

for (const entry of ownerBoundaryContractCases(api)) test(entry.name, entry.run);

test('fixed independent JS body has its recorded exact-parent hash', () => {
  assert.equal(createHash('sha256').update(ownerBoundaryFrozenSource).digest('hex'), expectedHash);
  if (baseline) assert.equal(historicalSource, ownerBoundaryFrozenSource);
});

function executableAst(source) {
  const parsed = parse(source, { sourceType: 'module' });
  function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
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
  }
  return normalize(parsed.program);
}

test(
  'candidate type erasure has the exact frozen executable AST, allowing only AppError bridge extension',
  { skip: baseline },
  () => {
    const source = readFileSync(new URL(helper.replace(/\.js$/, '.ts'), root), 'utf8');
    const erased = stripTypeScriptTypes(source);
    assert.equal(erased.split("'../errors/app-error.ts'").length, 2);
    const normalized = erased.replace("'../errors/app-error.ts'", "'../errors/app-error.js'");
    assert.deepEqual(executableAst(normalized), executableAst(ownerBoundaryFrozenSource));
  }
);

test('JS bridge is only a same-identity three-function TS re-export', { skip: baseline }, async () => {
  const typed = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(api), Object.keys(typed));
  for (const key of Object.keys(api)) assert.equal(api[key], typed[key]);
  const parsed = parse(readFileSync(sourceUrl, 'utf8'), { sourceType: 'module' }).program;
  assert.equal(parsed.body.length, 1);
  assert.deepEqual(parsed.directives, []);
  const statement = parsed.body[0];
  assert.equal(statement.type, 'ExportNamedDeclaration');
  assert.equal(statement.declaration, null);
  assert.equal(statement.source.value, './owner-boundary.ts');
  assert.deepEqual(statement.specifiers.map(item => item.exported.name).sort(), Object.keys(api));
  assert.ok(
    statement.specifiers.every(item => item.type === 'ExportSpecifier' && item.local.name === item.exported.name)
  );
});

// 相同种子为两个实现分别构造输入；比较结果、异常形态/身份与全部有序观察，而不是 JSON 成功值。
async function observe(subject, seed) {
  let state = (seed + 1) >>> 0;
  const random = max => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % max;
  };
  const events = [];
  const sentinel = { synthetic: seed };
  const values = [undefined, null, '', ' \n ', 'a', ' a ', 'b', 'B', 0, false, 2n, Symbol('s'), NaN];
  function scalar(label) {
    const chosen = random(17);
    if (chosen < values.length) return values[chosen];
    return {
      [Symbol.toPrimitive](hint) {
        events.push([label, hint]);
        if (chosen === 16) throw sentinel;
        return chosen === 13 ? ' a ' : chosen === 14 ? false : 0;
      }
    };
  }
  const rows = new Array(random(7));
  for (let index = 0; index < rows.length; index++) {
    const variant = random(11);
    const first = scalar(`convert:${index}:first`);
    const second = scalar(`convert:${index}:second`);
    let reads = 0;
    if (variant === 0) continue;
    if (variant === 1) {
      rows[index] = null;
      continue;
    }
    rows[index] = {
      get userId() {
        events.push(['owner', index, ++reads]);
        if (variant === 2) throw sentinel;
        return variant === 3 && reads > 1 ? second : first;
      },
      get id() {
        events.push(['id', index]);
        if (variant === 4) throw sentinel;
        return variant === 5
          ? {
              toString() {
                throw sentinel;
              }
            }
          : index;
      }
    };
  }
  const mode = random(4);
  if (mode === 1) {
    const proto = Object.create(Array.prototype);
    Object.defineProperty(proto, 0, { value: { userId: 'a', id: 'inherited' } });
    Object.setPrototypeOf(rows, proto);
  } else if (mode === 2) {
    rows.map = function (callback) {
      events.push(['map', this === rows]);
      return Array.prototype.map.call(this, callback);
    };
    rows.filter = function (callback) {
      events.push(['filter', this === rows]);
      return Array.prototype.filter.call(this, callback);
    };
  } else if (mode === 3) Object.freeze(rows);
  const owner = scalar('configured');
  const fallback = scalar('fallback');
  const operation = seed % 3;
  function invoke() {
    if (operation === 0) return subject.assertSpacesOwnedBy(rows, owner);
    if (operation === 1)
      return subject.resolveSingleOwnerId({
        get configuredOwnerId() {
          events.push('configured option');
          return owner;
        },
        get spaces() {
          events.push('spaces option');
          return rows;
        },
        get fallbackOwnerId() {
          events.push('fallback option');
          return fallback;
        }
      });
    const resultKind = random(5);
    const delegate = {
      findMany(query) {
        events.push(['query', this === delegate, Object.keys(query), Object.keys(query.select), query]);
        if (resultKind === 0) return rows;
        if (resultKind === 1) return Promise.resolve(rows);
        if (resultKind === 2)
          return {
            then(fulfill) {
              events.push('then');
              fulfill(rows);
            }
          };
        if (resultKind === 3) throw sentinel;
        return Promise.reject(sentinel);
      }
    };
    return subject.assertPostgresOwnerBoundary({ knowledgeSpace: delegate }, owner);
  }
  let outcome;
  try {
    const raw = invoke();
    const asynchronous = raw instanceof Promise;
    outcome = { kind: 'return', asynchronous, value: asynchronous ? await raw : raw };
  } catch (error) {
    outcome =
      error === sentinel
        ? { kind: 'throw', identity: 'sentinel' }
        : {
            kind: 'throw',
            name: error.name,
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            keys: Object.keys(error)
          };
  }
  return { outcome, events };
}

test('6144 deterministic fresh-input differentials preserve ordered observations and exact errors', async () => {
  const counts = new Map();
  for (let seed = 0; seed < 6144; seed++) {
    const expected = await observe(frozenApi, seed);
    const actual = await observe(api, seed);
    assert.deepEqual(actual, expected, `Differential seed ${seed}`);
    const key = expected.outcome.code ?? expected.outcome.identity ?? expected.outcome.kind;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const key of ['return', 'sentinel', 'OWNER_ID_REQUIRED', 'OWNER_BOUNDARY_VIOLATION'])
    assert.ok(counts.get(key) > 10, `Missing differential outcome: ${key}`);
});

const mutations = [
  ['nullish owner becomes truthy', "value ?? ''", "value || ''"],
  ['remove trim', "String(value ?? '').trim()", "String(value ?? '')"],
  ['case folding', "String(value ?? '').trim()", "String(value ?? '').trim().toLowerCase()"],
  [
    'empty owners become foreign',
    'spaceOwnerId && spaceOwnerId !== normalizedOwnerId',
    'spaceOwnerId !== normalizedOwnerId'
  ],
  ['owner comparison inverted', 'spaceOwnerId !== normalizedOwnerId', 'spaceOwnerId === normalizedOwnerId'],
  ['filter replaced by early find', 'spaces.filter((space) => {', '[spaces.find((space) => {'],
  ['skip foreign ids', 'foreignSpaces.map((space) => space.id)', '[]'],
  [
    'read ids during owner scan',
    'const spaceOwnerId = normalizeOwnerId(space?.userId);',
    'void space?.id; const spaceOwnerId = normalizeOwnerId(space?.userId);'
  ],
  ['clone spaces before filter', 'spaces.filter((space)', '[...spaces].filter((space)'],
  ['use native map instead of own map', 'spaces.map((space)', 'Array.prototype.map.call(spaces, (space)'],
  [
    'remove stored deduplication',
    '[...new Set(\n    spaces.map((space) => normalizeOwnerId(space?.userId)).filter(Boolean)\n  )]',
    'spaces.map((space) => normalizeOwnerId(space?.userId)).filter(Boolean)'
  ],
  [
    'allow configured to override mixed owners',
    'if (storedOwners.length > 1)',
    'if (!configured && storedOwners.length > 1)'
  ],
  ['drop mixed rejection', 'if (storedOwners.length > 1)', 'if (storedOwners.length > 1000)'],
  ['drop second verification pass', 'assertSpacesOwnedBy(spaces, ownerId);\n  return ownerId;', 'return ownerId;'],
  [
    'eager fallback conversion',
    'const configured = normalizeOwnerId(configuredOwnerId);',
    'normalizeOwnerId(fallbackOwnerId); const configured = normalizeOwnerId(configuredOwnerId);'
  ],
  [
    'stored nullish becomes truthy',
    '?? storedOwners[0]\n    ?? normalizeOwnerId(fallbackOwnerId)',
    '?? (storedOwners[0] || normalizeOwnerId(fallbackOwnerId))'
  ],
  [
    'fallback before stored',
    '?? storedOwners[0]\n    ?? normalizeOwnerId(fallbackOwnerId)',
    '?? normalizeOwnerId(fallbackOwnerId)\n    ?? storedOwners[0]'
  ],
  ['changed default owner', "fallbackOwnerId = 'demo'", "fallbackOwnerId = 'anonymous'"],
  [
    'required error status drift',
    "'A server owner id is required',\n      500",
    "'A server owner id is required',\n      400"
  ],
  ['required error code drift', "'OWNER_ID_REQUIRED'", "'OWNER_REQUIRED'"],
  ['foreign error message drift', "'Knowledge storage contains spaces owned by another user'", "'Wrong owner'"],
  [
    'synchronous check becomes async',
    'export function assertSpacesOwnedBy(',
    'export async function assertSpacesOwnedBy('
  ],
  [
    'synchronous resolver becomes async',
    'export function resolveSingleOwnerId(',
    'export async function resolveSingleOwnerId('
  ],
  [
    'PG premature owner validation',
    'const spaces = await client.knowledgeSpace.findMany({',
    'assertSpacesOwnedBy([], ownerId); const spaces = await client.knowledgeSpace.findMany({'
  ],
  ['PG loses delegate receiver', 'client.knowledgeSpace.findMany({', '(0, client.knowledgeSpace.findMany)({'],
  [
    'PG adds filtering',
    'select: { id: true, userId: true }',
    'select: { id: true, userId: true }, where: { userId: ownerId }'
  ],
  ['PG drops id select', 'select: { id: true, userId: true }', 'select: { userId: true }'],
  ['PG changes select order', 'select: { id: true, userId: true }', 'select: { userId: true, id: true }'],
  [
    'PG drops await',
    'const spaces = await client.knowledgeSpace.findMany({',
    'const spaces = client.knowledgeSpace.findMany({'
  ],
  [
    'PG wraps thrown identity',
    'return assertSpacesOwnedBy(spaces, ownerId);',
    "try { return assertSpacesOwnedBy(spaces, ownerId); } catch { throw Error('wrapped'); }"
  ]
];

for (const [label, from, to] of mutations)
  test(`behavior mutation is killed by fixed runtime assertions: ${label}`, async () => {
    assert.equal(ownerBoundaryFrozenSource.split(from).length, 2, `Mutation anchor must be unique: ${label}`);
    let changed = ownerBoundaryFrozenSource.replace(from, to);
    if (label === 'filter replaced by early find')
      changed = changed.replace(
        'return spaceOwnerId && spaceOwnerId !== normalizedOwnerId;\n  });',
        'return spaceOwnerId && spaceOwnerId !== normalizedOwnerId;\n  })].filter(Boolean);'
      );
    const mutant = await loadSource(changed, label);
    let killed = false;
    for (const entry of ownerBoundaryContractCases(mutant)) {
      try {
        await entry.run();
      } catch {
        killed = true;
        break;
      }
    }
    assert.equal(killed, true, `Live behavior mutation: ${label}`);
  });

// 当前真实消费者；显式历史模式只证明旧叶子合同，不冒充整个旧依赖图的验收。
if (!baseline) {
  const { createKnowledgeBaseSnapshotService } =
    await import('../src/modules/knowledge/application/knowledge-base-snapshot-service.js');
  const { createAppContext } = await import('../src/app.factory.js');
  const { createPostgresAppContext } = await import('../src/postgres-app.factory.js');
  const { phase1PostgresTests } = await import('./phase1-postgres.test.js');

  test('actual snapshot refuses foreign owner before notes, attachment preparation or commit', () => {
    const events = [];
    const prepared = {
      data: {
        spaces: [{ id: 's', userId: 'foreign' }],
        get notes() {
          return assert.fail('notes accessed');
        }
      }
    };
    const body = {};
    const service = createKnowledgeBaseSnapshotService({
      ownerId: 'owner',
      dataStore: {
        prepareImport(value) {
          events.push(['prepare', value]);
          return prepared;
        },
        commitImport() {
          return assert.fail('commit');
        }
      },
      attachmentStore: {
        prepareAttachmentsSnapshot() {
          return assert.fail('attachment preparation');
        }
      }
    });
    boundaryError(
      () => service.importKnowledgeBase(body),
      'OWNER_BOUNDARY_VIOLATION',
      'Knowledge storage contains spaces owned by another user'
    );
    assert.deepEqual(events, [['prepare', body]]);
  });

  test('actual snapshot matching synthetic import preserves prepared state and ordered commit/export', () => {
    const events = [];
    const prepared = { data: { spaces: [{ id: 's', userId: ' owner ' }], notes: [], attachments: [] } };
    const snapshot = { version: 1, data: prepared.data };
    const body = {};
    const service = createKnowledgeBaseSnapshotService({
      ownerId: 'owner',
      dataStore: {
        prepareImport(value) {
          events.push(['prepare', value]);
          return prepared;
        },
        commitImport(value) {
          events.push(['commit', value]);
        },
        exportSnapshot() {
          events.push(['export']);
          return snapshot;
        }
      },
      attachmentStore: null
    });
    const result = service.importKnowledgeBase(body);
    assert.deepEqual(events, [['prepare', body], ['commit', prepared], ['export']]);
    assert.equal(result.data, prepared.data);
    assert.deepEqual(result.attachmentFiles, []);
  });

  test('actual local factory refuses mixed synthetic owners before repository/attachment assembly', () => {
    const dataStore = {
      state: {
        spaces: [
          { id: 'a', userId: 'a' },
          { id: 'b', userId: 'b' }
        ]
      },
      get filePath() {
        return assert.fail('storage assembled');
      }
    };
    const attachmentStore = new Proxy(
      {},
      {
        get() {
          return assert.fail('attachments accessed');
        }
      }
    );
    boundaryError(
      () => createAppContext({ dataStore, ownerId: 'a', attachmentStore }),
      'OWNER_BOUNDARY_VIOLATION',
      'Knowledge storage contains multiple owners'
    );
  });

  for (const failure of ['foreign', 'query throw', 'query reject', 'owner getter'])
    test(`actual PG factory disconnects synthetic client on ${failure}, without owner upsert`, async () => {
      const events = [];
      const sentinel = {};
      const delegate = {
        findMany(query) {
          assert.equal(this, delegate);
          events.push(['query', query]);
          if (failure === 'query throw') throw sentinel;
          if (failure === 'query reject') return Promise.reject(sentinel);
          if (failure === 'owner getter')
            return [
              {
                get userId() {
                  throw sentinel;
                }
              }
            ];
          return [{ userId: 'foreign' }];
        }
      };
      const client = {
        $connect() {
          events.push('connect');
        },
        $disconnect() {
          events.push('disconnect');
        },
        knowledgeSpace: delegate,
        user: {
          upsert() {
            return assert.fail('owner upsert');
          }
        }
      };
      await assert.rejects(createPostgresAppContext({ client, ownerId: 'owner' }), error =>
        failure === 'foreign' ? error.code === 'OWNER_BOUNDARY_VIOLATION' : error === sentinel
      );
      assert.deepEqual(events, ['connect', ['query', { select: { id: true, userId: true } }], 'disconnect']);
    });

  test('actual PG factory retains cleanup failure precedence rather than silently swallowing it', async () => {
    const events = [];
    const boundaryFailure = {};
    const disconnectFailure = {};
    const client = {
      $connect() {
        events.push('connect');
      },
      $disconnect() {
        events.push('disconnect');
        throw disconnectFailure;
      },
      knowledgeSpace: {
        findMany() {
          events.push('query');
          throw boundaryFailure;
        }
      },
      user: {
        upsert() {
          return assert.fail('owner upsert');
        }
      }
    };
    await assert.rejects(createPostgresAppContext({ client, ownerId: 'owner' }), error => error === disconnectFailure);
    assert.deepEqual(events, ['connect', 'query', 'disconnect']);
  });

  for (const name of [
    'PostgreSQL app context refuses a database containing a foreign owner',
    'single-owner boundary rejects mixed local knowledge spaces'
  ])
    test(`existing phase1 contract actually runs: ${name}`, async () => {
      const selected = phase1PostgresTests.filter(entry => entry.name === name);
      assert.equal(selected.length, 1, `Exact existing test missing or duplicated: ${name}`);
      await selected[0].run();
    });
}
