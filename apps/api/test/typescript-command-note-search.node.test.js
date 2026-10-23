import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

// 普通测试只读当前检出；显式旧实现模式要求准确父对象，缺失即失败。
const baseline = process.env.KNOWRA_COMMAND_SEARCH_BASELINE === '1';
const parent = '04b0e73e77f7b9246c6a0aecef17d34833aaaaa7';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/modules/knowledge/application/command-note-search.js';
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
const {
  commandSearchInput: input,
  commandSearchResults: results,
  assertCommandSearchOwner: owner
} = await import(moduleUrl(helper));
const { createSearchService } = await import(moduleUrl('apps/api/src/modules/knowledge/application/search-service.js'));
const { createAsyncSearchService } = await import(
  moduleUrl('apps/api/src/modules/knowledge/application/postgres-async/search-service.js')
);
const { createKnowledgeHttpHandlers } = await import(
  moduleUrl('apps/api/src/modules/knowledge/http/knowledge-handlers.js')
);
const { createPostgresKnowledgeHttpHandlers } = await import(
  moduleUrl('apps/api/src/modules/knowledge/http/postgres-async-handlers.js')
);
const { createInMemoryNoteRepository } = await import(
  new URL('apps/api/src/modules/knowledge/infrastructure/note-repository.ts', root)
);
const { createInMemoryKnowledgeSpaceRepository } = await import(
  new URL('apps/api/src/modules/knowledge/infrastructure/knowledge-space-repository.ts', root)
);

test('JS bridge exports only the identical three synchronous TS functions', { skip: baseline }, async () => {
  const js = await import(new URL(helper, root));
  const ts = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(js), ['assertCommandSearchOwner', 'commandSearchInput', 'commandSearchResults']);
  assert.deepEqual(Object.keys(ts), Object.keys(js));
  for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
});
const base = { spaceId: 's', query: 'q', limit: 30 };
const note = (fields = {}) => ({ id: 'n', title: 'title', spaceId: 's', plainText: 'body q', ...fields });
const code = (fn, expected, status = 422) =>
  assert.throws(fn, error => error.code === expected && error.statusCode === status);
const snippet = (text, query) => results([note({ plainText: text })], { ...base, query })[0].snippet;
test('synchronous identities, arities, and omitted input', () => {
  assert.deepEqual([input.length, owner.length, results.length], [0, 2, 2]);
  code(() => input(), 'COMMAND_SEARCH_SPACE_REQUIRED');
  code(() => input(undefined), 'COMMAND_SEARCH_SPACE_REQUIRED');
  assert.throws(() => input(null), TypeError);
  assert.equal(input(base) instanceof Promise, false);
});
test('validation order and native exceptions are not wrapped', () => {
  const sentinel = new Error('getter');
  let later = 0;
  code(
    () =>
      input({
        spaceId: 0,
        get query() {
          later++;
          throw sentinel;
        }
      }),
    'COMMAND_SEARCH_SPACE_REQUIRED'
  );
  assert.equal(later, 0);
  assert.throws(
    () =>
      input({
        get spaceId() {
          throw sentinel;
        }
      }),
    error => error === sentinel
  );
  code(
    () =>
      input({
        spaceId: 's',
        query: 0,
        get limit() {
          throw sentinel;
        }
      }),
    'COMMAND_SEARCH_QUERY_INVALID'
  );
});
test('UTF-16 length before trim and empty query remains allowed', () => {
  assert.deepEqual(input({ spaceId: ' s ', query: '  ', limit: null }), { query: '', spaceId: 's', limit: 30 });
  code(() => input({ spaceId: ' '.repeat(200) + 's', query: 'q' }), 'COMMAND_SEARCH_SPACE_REQUIRED');
  code(() => input({ spaceId: 's', query: '🙂'.repeat(101) }), 'COMMAND_SEARCH_QUERY_INVALID');
  assert.equal(input({ spaceId: 's', query: '🙂'.repeat(100) }).query.length, 200);
});
test('Number coercion, cap, nullish default, and safe integer', () => {
  for (const [value, expected] of [
    ['0x10', 16],
    ['2e1', 20],
    [true, 1],
    [2n, 2],
    [999, 30],
    [undefined, 30],
    [null, 30]
  ])
    assert.equal(input({ ...base, limit: value }).limit, expected);
  for (const value of ['', false, 0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
    code(() => input({ ...base, limit: value }), 'COMMAND_SEARCH_LIMIT_INVALID');
  assert.throws(() => input({ ...base, limit: Symbol('x') }), TypeError);
  let calls = 0;
  assert.equal(
    input({
      ...base,
      limit: {
        [Symbol.toPrimitive](hint) {
          assert.equal(hint, 'number');
          calls++;
          return 2;
        }
      }
    }).limit,
    2
  );
  assert.equal(calls, 1);
});
test('input property read counts and exact order', () => {
  const reads = [];
  const x = {
    get spaceId() {
      reads.push('space');
      return ' s ';
    },
    get query() {
      reads.push('query');
      return ' q ';
    },
    get limit() {
      reads.push('limit');
      return {
        [Symbol.toPrimitive]() {
          reads.push('convert');
          return 2;
        }
      };
    }
  };
  assert.deepEqual(input(x), { query: 'q', spaceId: 's', limit: 2 });
  assert.deepEqual(reads, ['space', 'space', 'space', 'query', 'query', 'limit', 'convert', 'query', 'space']);
});
test('unknown field contract counterexample is real', () => {
  let q = 0,
    s = 0;
  const actual = input({
    get spaceId() {
      return ++s < 4
        ? 's'
        : {
            trim() {
              return false;
            }
          };
    },
    get query() {
      return ++q < 3
        ? 'q'
        : {
            trim() {
              return 42;
            }
          };
    }
  });
  assert.deepEqual(actual, { query: 42, spaceId: false, limit: 30 });
});
test('supported changing string getters are not snapshotted', () => {
  let q = 0,
    s = 0;
  assert.deepEqual(
    input({
      get spaceId() {
        return ++s < 4 ? 's' : ' late-space ';
      },
      get query() {
        return ++q < 3 ? 'q' : ' late-query ';
      }
    }),
    { query: 'late-query', spaceId: 'late-space', limit: 30 }
  );
});
test('owner uses truthiness and strict identity without type assertion', () => {
  const sentinel = new Error('owner getter');
  const x = {
    get userId() {
      throw sentinel;
    }
  };
  for (const id of ['', 0, false, null, undefined]) code(() => owner(x, id), 'KNOWLEDGE_SPACE_NOT_FOUND', 404);
  code(() => owner(null, 'o'), 'KNOWLEDGE_SPACE_NOT_FOUND', 404);
  code(() => owner({ userId: 1 }, '1'), 'KNOWLEDGE_SPACE_NOT_FOUND', 404);
  const identity = {};
  assert.equal(owner({ userId: identity }, identity), undefined);
  assert.throws(
    () => owner(x, 'o'),
    error => error === sentinel
  );
});
test('filter then slice then projection: later rows can throw before first projection', () => {
  const sentinel = new Error('late-filter');
  let projected = 0;
  assert.throws(
    () =>
      results(
        [
          {
            ...note(),
            get id() {
              projected++;
              return 'n';
            }
          },
          {
            get spaceId() {
              throw sentinel;
            }
          }
        ],
        { ...base, limit: 1 }
      ),
    error => error === sentinel
  );
  assert.equal(projected, 0);
});
test('space comparison precedes deleted access, duplicates preserved, nullish folder only', () => {
  const bad = {
    spaceId: 'other',
    get deleted() {
      throw new Error('must not read');
    }
  };
  const row = note({ folderId: '' });
  const actual = results(
    [bad, row, row, note({ id: 'deleted', deleted: 'false' }), note({ id: 'null-folder', folderId: null })],
    base
  );
  assert.deepEqual(
    actual.map(x => x.id),
    ['n', 'n', 'null-folder']
  );
  assert.deepEqual(
    actual.map(x => x.folderId),
    ['', '', null]
  );
  assert.notEqual(actual[0], actual[1]);
  assert.deepEqual(Object.keys(actual[0]), ['id', 'title', 'folderId', 'snippet']);
  assert.equal('rawMarkdown' in actual[0], false);
});
test('spaceId reread once per filtered row and input.limit read after full filter', () => {
  const reads = [];
  let call = 0;
  const actual = results([note({ id: 's', spaceId: 's' }), note({ id: 't', spaceId: 't' })], {
    get spaceId() {
      reads.push('space');
      return ++call === 1 ? 's' : 't';
    },
    get limit() {
      reads.push('limit');
      return 30;
    },
    get query() {
      reads.push('query');
      return 'q';
    }
  });
  assert.deepEqual(
    actual.map(x => x.id),
    ['s', 't']
  );
  assert.deepEqual(reads, ['space', 'space', 'limit', 'query', 'query']);
});
test('sparse arrays and null row preserve native filter behavior', () => {
  const rows = [];
  rows[2] = note();
  assert.equal(results(rows, base).length, 1);
  assert.throws(() => results([null], base), TypeError);
});
test('projection order, query evaluation, then text conversion', () => {
  const reads = [];
  const row = {
    spaceId: 's',
    get deleted() {
      reads.push('deleted');
      return false;
    },
    get id() {
      reads.push('id');
      return 'n';
    },
    get title() {
      reads.push('title');
      return 't';
    },
    get folderId() {
      reads.push('folder');
      return null;
    },
    get plainText() {
      reads.push('text');
      return {
        [Symbol.toPrimitive](hint) {
          reads.push(`convert:${hint}`);
          return ' q ';
        }
      };
    }
  };
  assert.equal(
    results([row], {
      ...base,
      get query() {
        reads.push('query');
        return 'q';
      }
    })[0].snippet,
    'q'
  );
  assert.deepEqual(reads, ['deleted', 'id', 'title', 'folder', 'text', 'query', 'convert:string']);
});
test('projection creates independent mutable outputs and does not filter by query', () => {
  const row = Object.freeze(note());
  const rows = Object.freeze([row]);
  const actual = results(rows, { ...base, query: 'absent' });
  assert.equal(actual.length, 1);
  assert.equal(actual[0].snippet, 'body q');
  actual[0].title = 'new';
  actual.push(actual[0]);
  assert.equal(row.title, 'title');
});
test('results trusts numeric limit; validation and 30 cap belong only to input helper', () => {
  const rows = Array.from({ length: 35 }, (_, i) => note({ id: String(i) }));
  assert.equal(results(rows, { ...base, limit: 100 }).length, 35);
  assert.equal(results(rows, { ...base, limit: -1 }).length, 34);
  assert.equal(results(rows, { ...base, limit: NaN }).length, 0);
});
test('surrogate boundary protection is not malformed-text repair', () => {
  const value = snippet('\ud800q', 'q');
  assert.equal(value, '\ud800q');
  assert.equal(value.isWellFormed(), false);
});
test('plainText is unknown, native String/nullish behavior retained', () => {
  assert.equal(snippet(undefined, 'q'), '');
  assert.equal(snippet(null, 'q'), '');
  assert.equal(snippet(123, 'q'), '123');
  assert.equal(snippet(Symbol('x'), 'q'), 'Symbol(x)');
  const sentinel = new Error('text');
  assert.throws(
    () =>
      snippet(
        {
          toString() {
            throw sentinel;
          }
        },
        'q'
      ),
    error => error === sentinel
  );
});
test('snippet both edges, UTF-16 cap and whitespace after slicing', () => {
  assert.equal(snippet('a'.repeat(300), 'absent'), 'a'.repeat(218) + '…');
  assert.equal(
    snippet('a'.repeat(300) + 'q' + 'b'.repeat(300), 'q'),
    '…' + 'a'.repeat(108) + 'q' + 'b'.repeat(109) + '…'
  );
  assert.equal(snippet(' '.repeat(250) + 'q', 'absent'), '…');
  assert.equal(snippet('  a\n\t b  ', 'q'), 'a b');
});
test('Turkish lowercase expansion maps back to original UTF-16', () => {
  const value = snippet('İ'.repeat(350) + '🙂中文偏移边界' + '末文'.repeat(200), '中文偏移边界');
  assert.ok(value.includes('🙂中文偏移边界'));
  assert.ok(value.length <= 220);
  assert.ok(value.isWellFormed());
  assert.equal(
    snippet('a'.repeat(300) + 'İ' + 'b'.repeat(300), 'i\u0307'),
    '…' + 'a'.repeat(108) + 'İ' + 'b'.repeat(109) + '…'
  );
});
test('both clipping boundaries preserve complete surrogate pairs', () => {
  const left = snippet('x'.repeat(100) + '🙂' + 'a'.repeat(107) + 'q' + 'b'.repeat(300), 'q');
  assert.ok(left.isWellFormed());
  assert.ok(left.length <= 220);
  assert.ok(left.includes('q'));
  const right = snippet('a'.repeat(217) + '🙂' + 'b'.repeat(100), 'absent');
  assert.equal(right, 'a'.repeat(217) + '…');
  assert.ok(right.isWellFormed());
});
test('200 UTF-16 query remains complete within 220 character snippet', () => {
  const query = '长'.repeat(200),
    value = snippet('🙂前'.repeat(100) + query + '🙂后'.repeat(100), query);
  assert.ok(value.includes(query));
  assert.ok(value.isWellFormed());
  assert.ok(value.length <= 220);
});
test('real synchronous search service and repositories use validated scoped input', () => {
  const notes = createInMemoryNoteRepository({
    records: [
      note({ id: 'found', rawMarkdown: 'body q' }),
      note({ id: 'gone', rawMarkdown: 'body q', deleted: true }),
      note({ id: 'other', rawMarkdown: 'body q', spaceId: 'other' })
    ]
  });
  const spaces = createInMemoryKnowledgeSpaceRepository({ records: [{ id: 's', name: 'S', userId: 'o' }] });
  const service = createSearchService({
    listNotes: opts => notes.list(opts),
    findKnowledgeSpace: id => spaces.findById(id)
  });
  assert.deepEqual(
    service.searchCommandNotes({ spaceId: ' s ', query: ' Q ', limit: '2' }, 'o').map(x => x.id),
    ['found']
  );
  assert.deepEqual(service.searchCommandNotes({ spaceId: 's', query: '  ' }, 'o'), []);
  code(() => service.searchCommandNotes({ spaceId: 's', query: 'q' }, 'foreign'), 'KNOWLEDGE_SPACE_NOT_FOUND', 404);
});
test('real async search service uses synthetic async collaborators, not PostgreSQL', async () => {
  const service = createAsyncSearchService({
    listNotes: async () => [note(), note({ id: 'gone', deleted: true }), note({ id: 'other', spaceId: 'other' })],
    findKnowledgeSpace: async () => ({ userId: 'o' })
  });
  assert.deepEqual(
    (await service.searchCommandNotes({ spaceId: 's', query: 'q' }, 'o')).map(x => x.id),
    ['n']
  );
  await assert.rejects(
    service.searchCommandNotes({ spaceId: 's', query: 'q' }, 'foreign'),
    error => error.code === 'KNOWLEDGE_SPACE_NOT_FOUND'
  );
});

for (const field of ['spaceId', 'query']) {
  const reads = field === 'spaceId' ? 4 : 3;
  for (let stage = 1; stage <= reads; stage += 1) {
    for (const value of [null, undefined]) {
      test(`supported ${field} getter becomes ${value} at read ${stage}: no unsound successful return`, () => {
        let count = 0;
        const request = { ...base };
        Object.defineProperty(request, field, {
          get() {
            return ++count === stage ? value : 'q';
          }
        });
        if (stage === 1) {
          code(
            () => input(request),
            field === 'spaceId' ? 'COMMAND_SEARCH_SPACE_REQUIRED' : 'COMMAND_SEARCH_QUERY_INVALID'
          );
        } else {
          assert.throws(() => input(request), TypeError);
        }
        assert.equal(count, stage);
      });
    }
  }
}
for (const [field, total] of [
  ['spaceId', 4],
  ['query', 3]
]) {
  for (let stage = 1; stage <= total; stage += 1) {
    test(`${field} getter error identity at read ${stage}`, () => {
      let reads = 0;
      const marker = Symbol(field);
      const request = { ...base };
      Object.defineProperty(request, field, {
        get() {
          if (++reads === stage) throw marker;
          return 's';
        }
      });
      assert.throws(
        () => input(request),
        error => error === marker
      );
      assert.equal(reads, stage);
    });
  }
}
test('fixed error codes, messages, status and own property shape', () => {
  for (const [request, expectedCode, message] of [
    [{ query: 'q' }, 'COMMAND_SEARCH_SPACE_REQUIRED', '请选择有效的当前空间后搜索。'],
    [{ spaceId: 's' }, 'COMMAND_SEARCH_QUERY_INVALID', '搜索关键字最多 200 字符。'],
    [{ ...base, limit: 0 }, 'COMMAND_SEARCH_LIMIT_INVALID', '搜索数量必须为正整数。']
  ]) {
    assert.throws(
      () => input(request),
      error => {
        assert.equal(error.name, 'AppError');
        assert.equal(error.code, expectedCode);
        assert.equal(error.statusCode, 422);
        assert.equal(error.message, message);
        assert.deepEqual(Object.keys(error), ['name', 'code', 'statusCode']);
        return true;
      }
    );
  }
  assert.throws(() => owner({}, 'o'), {
    name: 'AppError',
    code: 'KNOWLEDGE_SPACE_NOT_FOUND',
    statusCode: 404,
    message: '知识空间不存在。'
  });
});
test('Number coercion error and receiver are preserved without wrapping', () => {
  const marker = {};
  const limit = {
    valueOf() {
      assert.equal(this, limit);
      throw marker;
    }
  };
  assert.throws(
    () => input({ ...base, limit }),
    error => error === marker
  );
  assert.throws(
    () =>
      input({
        ...base,
        get limit() {
          throw marker;
        }
      }),
    error => error === marker
  );
  const trace = [];
  const fallback = {
    valueOf() {
      trace.push('valueOf');
      return {};
    },
    toString() {
      trace.push('toString');
      return '0b10';
    }
  };
  assert.equal(input({ ...base, limit: fallback }).limit, 2);
  assert.deepEqual(trace, ['valueOf', 'toString']);
});
test('query length validation is UTF-16 before trim; inherited request fields are read', () => {
  code(() => input({ ...base, query: ' '.repeat(201) }), 'COMMAND_SEARCH_QUERY_INVALID');
  assert.equal(input({ ...base, query: ' '.repeat(200) }).query, '');
  assert.equal(input(Object.create({ spaceId: 's', query: ' q ', limit: 3 })).query, 'q');
});
test('successful changing supported getters can return unvalidated late strings', () => {
  let s = 0,
    q = 0;
  const actual = input({
    get spaceId() {
      return ++s === 4 ? '' : 's';
    },
    get query() {
      return ++q === 3 ? 'q'.repeat(201) : 'q';
    }
  });
  assert.deepEqual(actual, { spaceId: '', query: 'q'.repeat(201), limit: 30 });
  assert.equal(typeof actual.query, 'string');
  assert.equal(typeof actual.spaceId, 'string');
});
test('no query filtering, sorting, deduplication or extra field leakage in results', () => {
  const row = note({ id: 'z', plainText: 'unmatched text', secret: 'never project' });
  const actual = results([row, note({ id: 'a', plainText: 'other' }), row], base);
  assert.deepEqual(
    actual.map(value => value.id),
    ['z', 'a', 'z']
  );
  assert.deepEqual(actual[0], { id: 'z', title: 'title', folderId: null, snippet: 'unmatched text' });
  assert.deepEqual(Object.keys(actual[0]), ['id', 'title', 'folderId', 'snippet']);
});
test('result projection is fresh and mutable without mutating frozen inputs', () => {
  const row = Object.freeze(note());
  const rows = Object.freeze([row, row]);
  const a = results(rows, Object.freeze({ ...base })),
    b = results(rows, base);
  assert.notEqual(a, b);
  assert.notEqual(a[0], a[1]);
  a[0].title = 'changed';
  a.push({ id: 'extra', title: 'extra', folderId: null, snippet: '' });
  assert.equal(row.title, 'title');
  assert.equal(b.length, 2);
});
test('results fully filter before reading limit, then project in exact order', () => {
  const trace = [];
  const row = {};
  for (const [key, value] of Object.entries({
    spaceId: 's',
    deleted: false,
    id: 'n',
    title: 't',
    folderId: null,
    plainText: {
      toString() {
        trace.push('String');
        return 'q';
      }
    }
  })) {
    Object.defineProperty(row, key, {
      get() {
        trace.push(key);
        return value;
      }
    });
  }
  const request = {
    get spaceId() {
      trace.push('input.spaceId');
      return 's';
    },
    get limit() {
      trace.push('input.limit');
      return 1;
    },
    get query() {
      trace.push('input.query');
      return 'q';
    }
  };
  assert.equal(results([row], request)[0].snippet, 'q');
  assert.deepEqual(trace, [
    'spaceId',
    'input.spaceId',
    'deleted',
    'input.limit',
    'id',
    'title',
    'folderId',
    'plainText',
    'input.query',
    'String'
  ]);
});
test('deleted uses truthiness, not boolean equality', () => {
  for (const deleted of [true, 'false', 1, [], {}]) assert.equal(results([note({ deleted })], base).length, 0);
  for (const deleted of [false, 0, '', null, undefined, NaN])
    assert.equal(results([note({ deleted })], base).length, 1);
});
test('slice accepts fractional/infinite limits and result helper has no top-level default', () => {
  const rows = [note({ id: 'a' }), note({ id: 'b' })];
  assert.equal(results(rows, { ...base, limit: Infinity }).length, 2);
  assert.equal(results(rows, { ...base, limit: 1.9 }).length, 1);
  assert.throws(() => results(null, base), TypeError);
  assert.throws(() => results(rows, null), TypeError);
});
test('query is re-read for each projected row', () => {
  let reads = 0;
  const a = 'a'.repeat(300) + 'first' + 'b'.repeat(300) + 'second' + 'c'.repeat(300);
  const out = results([note({ plainText: a }), note({ plainText: a })], {
    ...base,
    get query() {
      return ++reads === 1 ? 'first' : 'second';
    }
  });
  assert.ok(out[0].snippet.includes('first'));
  assert.ok(out[1].snippet.includes('second'));
  assert.equal(reads, 2);
});
test('folded match within a lowercase expansion maps the whole original code point', () => {
  assert.equal(
    snippet('a'.repeat(300) + 'İ' + 'b'.repeat(300), '\u0307'),
    '…' + 'a'.repeat(108) + 'İ' + 'b'.repeat(109) + '…'
  );
});
test('end of text backfills context and exact window boundary has no ellipsis', () => {
  assert.equal(snippet('a'.repeat(300) + 'q', 'q'), '…' + 'a'.repeat(217) + 'q');
  assert.equal(snippet('a'.repeat(218), 'none'), 'a'.repeat(218));
  assert.equal(snippet('', ''), '');
  assert.equal(snippet('q'.repeat(219), ''), 'q'.repeat(218) + '…');
});
for (const asyncMode of [false, true]) {
  test(`actual ${asyncMode ? 'async' : 'sync'} service rejects owner before notes and preserves errors`, async () => {
    const trace = [],
      marker = {};
    const create = asyncMode ? createAsyncSearchService : createSearchService;
    const service = create({
      findKnowledgeSpace(id) {
        trace.push(['space', id]);
        return { userId: 'foreign' };
      },
      listNotes() {
        trace.push('notes');
        throw marker;
      }
    });
    const invoke = () => service.searchCommandNotes({ spaceId: 's', query: 'q' }, 'o');
    if (asyncMode) await assert.rejects(invoke, error => error.code === 'KNOWLEDGE_SPACE_NOT_FOUND');
    else code(invoke, 'KNOWLEDGE_SPACE_NOT_FOUND', 404);
    assert.deepEqual(trace, [['space', 's']]);
    const failed = create({
      findKnowledgeSpace() {
        throw marker;
      },
      listNotes() {
        throw new Error('not reached');
      }
    });
    if (asyncMode)
      await assert.rejects(
        () => failed.searchCommandNotes(base, 'o'),
        error => error === marker
      );
    else
      assert.throws(
        () => failed.searchCommandNotes(base, 'o'),
        error => error === marker
      );
  });
  test(`actual ${asyncMode ? 'async' : 'sync'} HTTP handler passes server owner and retains legacy branches`, async () => {
    const calls = [],
      response = [];
    const searchService = {
      searchCommandNotes(query, ownerId) {
        calls.push(['command', query, ownerId]);
        return response;
      },
      searchNotes(query) {
        calls.push(['legacy', query]);
        return [{ id: 'n', full: true }];
      }
    };
    const create = asyncMode ? createPostgresKnowledgeHttpHandlers : createKnowledgeHttpHandlers;
    const handler = create({ knowledgeModule: { searchService }, ownerId: 'server-owner' });
    const query = { result: 'command', spaceId: 's', query: 'q', ownerId: 'forged', userId: 'forged' };
    assert.equal(await handler.searchNotes(query), response);
    assert.deepEqual(calls[0], ['command', query, 'server-owner']);
    assert.deepEqual(await handler.searchNotes({ result: 'ids' }), ['n']);
    assert.deepEqual(await handler.searchNotes({}), [{ id: 'n', full: true }]);
  });
  test(`actual ${asyncMode ? 'async' : 'sync'} HTTP note-link owner path rejects before relation read`, async () => {
    const calls = [],
      result = { links: true };
    let userId = 'foreign';
    const knowledgeModule = {
      noteService: {
        getNote(id) {
          calls.push(['note', id]);
          return { spaceId: 's' };
        },
        getNoteLinkRelations(id) {
          calls.push(['links', id]);
          return result;
        }
      },
      repositories: {
        knowledgeSpaceRepository: {
          findById(id) {
            calls.push(['space', id]);
            return { userId };
          }
        }
      }
    };
    const create = asyncMode ? createPostgresKnowledgeHttpHandlers : createKnowledgeHttpHandlers;
    const handler = create({ knowledgeModule, ownerId: 'o' });
    if (asyncMode)
      await assert.rejects(
        () => handler.getNoteLinkRelations({ id: 'n' }),
        error => error.code === 'KNOWLEDGE_SPACE_NOT_FOUND'
      );
    else code(() => handler.getNoteLinkRelations({ id: 'n' }), 'KNOWLEDGE_SPACE_NOT_FOUND', 404);
    assert.deepEqual(calls, [
      ['note', 'n'],
      ['space', 's']
    ]);
    userId = 'o';
    calls.length = 0;
    assert.equal(await handler.getNoteLinkRelations({ id: 'n' }), result);
    assert.deepEqual(calls, [
      ['note', 'n'],
      ['space', 's'],
      ['links', 'n']
    ]);
  });
}

// TS 标准库 Object.assign 对 primitive 的交叉返回类型隐藏装箱；保留旧行为，不宣称该逃逸在支持域内。
test('Object.assign boxed string intersection escape retains custom trim runtime values', () => {
  const boxedQuery = Object.assign('q', {
    trim() {
      return 42;
    }
  });
  const boxedSpace = Object.assign('s', {
    trim() {
      return false;
    }
  });
  let q = 0,
    s = 0;
  const actual = input({
    get query() {
      return ++q < 3 ? 'q' : boxedQuery;
    },
    get spaceId() {
      return ++s < 4 ? 's' : boxedSpace;
    }
  });
  assert.equal(typeof boxedQuery, 'object');
  assert.equal(typeof boxedSpace, 'object');
  assert.deepEqual(actual, { query: 42, spaceId: false, limit: 30 });
});
