import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { calculateContentHash as hash, createNoteLinkUrl as url } from '@study-accelerator/content-anchor';
import { createInMemoryNoteRepository } from '../src/modules/knowledge/infrastructure/note-repository.js';
import { createEmptyLocalState } from '../src/infrastructure/local-data-schema.js';

// 普通检出只导入当前文件；显式旧模式要求固定真实父 Git 对象，缺失立即失败。
const baseline = process.env.KNOWRA_NOTE_LINKS_BASELINE === '1';
const parent = '3c8f591947cf8bd341913e37994d6fc42b67c693';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/modules/knowledge/application/note-link-relations.js';
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
  addedNoteLinkTargets: added,
  assertNoteLinkTarget: assertTarget,
  buildNoteLinkRelations: relations
} = await import(moduleUrl(helper));
const { createNoteService } = await import(moduleUrl('apps/api/src/modules/knowledge/application/note-service.js'));
const { createAsyncNoteService } = await import(
  moduleUrl('apps/api/src/modules/knowledge/application/postgres-async/note-service.js')
);
const { prepareBatchState } = await import(moduleUrl('apps/api/src/modules/sync/batch-domain.js'));

test('JS bridge exposes only three identical synchronous TS functions', { skip: baseline }, async () => {
  const js = await import(new URL(helper, root));
  const ts = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(js), ['addedNoteLinkTargets', 'assertNoteLinkTarget', 'buildNoteLinkRelations']);
  assert.deepEqual(Object.keys(ts), Object.keys(js));
  for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
});
const link = (id, occ = 'ref000001', label = id) => `[${label}](${url(id, occ)})`;
const note = (id, rawMarkdown = '', extra = {}) => ({ id, title: id, rawMarkdown, spaceId: 's', ...extra });
test('export arity and synchronous shape', () => {
  assert.deepEqual([added.length, assertTarget.length, relations.length], [1, 2, 2]);
  assert.equal(added('') instanceof Promise, false);
  assert.equal(assertTarget(null, 's'), undefined);
});
test('added targets use occurrence identities, insertion order and target deduplication', () => {
  const before = link('old');
  const markdown = [link('b'), link('old', 'ref000002'), link('a', 'ref000003'), link('b', 'ref000004')].join(' ');
  assert.deepEqual(added(markdown, before), ['b', 'a']);
  assert.deepEqual(added(markdown), ['b', 'old', 'a']);
  assert.deepEqual(added(markdown, undefined), ['b', 'old', 'a']);
});
test('legacy bracket IDs contribute relations but not newly validated targets', () => {
  assert.deepEqual(added('[[legacy]]'), []);
  assert.deepEqual(relations(note('n', '[[legacy]]'), []).outgoing, [
    { id: 'legacy', title: '目标已删除', folderId: null, status: 'deleted', occurrences: [] }
  ]);
});
test('code and images are not validated targets; link references are', () => {
  const target = url('target', 'ref000001');
  assert.deepEqual(added('`' + link('code') + '`\n\n!' + link('image') + '\n\n[visible][x]\n\n[x]: ' + target), [
    'target'
  ]);
});
test('old markdown is coerced before new markdown; original conversion error wins', () => {
  const trace = [];
  const old = {
    toString() {
      trace.push('old');
      return '';
    }
  };
  const fresh = {
    toString() {
      trace.push('new');
      return link('x');
    }
  };
  assert.deepEqual(added(fresh, old), ['x']);
  assert.deepEqual(trace, ['old', 'new']);
  const marker = {};
  trace.length = 0;
  assert.throws(
    () =>
      added(fresh, {
        toString() {
          trace.push('old');
          throw marker;
        }
      }),
    e => e === marker
  );
  assert.deepEqual(trace, ['old']);
});
test('assert target keeps falsey bypass and raw strict comparison', () => {
  for (const value of [null, undefined, false, 0, NaN, '']) assert.equal(assertTarget(value, Symbol()), undefined);
  const token = {};
  assert.equal(assertTarget({ spaceId: token }, token), undefined);
  assert.throws(() => assertTarget({ spaceId: token }, {}), {
    code: 'NOTE_LINK_TARGET_INVALID',
    message: '链接目标必须是当前空间内的笔记。',
    statusCode: 422
  });
  assert.equal(assertTarget({}, undefined), undefined);
});
test('assert target does not inspect unrelated fields or catch getter errors', () => {
  const marker = {};
  let reads = 0;
  assert.equal(
    assertTarget(
      {
        get spaceId() {
          reads++;
          return 's';
        },
        get id() {
          throw marker;
        }
      },
      's'
    ),
    undefined
  );
  assert.equal(reads, 1);
  assert.throws(
    () =>
      assertTarget(
        {
          get spaceId() {
            throw marker;
          }
        },
        's'
      ),
    e => e === marker
  );
});
test('missing space remains undefined and output is mutable with exact key order', () => {
  const r = relations({ id: 'n', rawMarkdown: '' }, []);
  assert.deepEqual(Object.keys(r), ['noteId', 'spaceId', 'contentHash', 'outgoing', 'backlinks']);
  assert.equal(r.spaceId, undefined);
  assert.equal(r.contentHash, hash(''));
  assert.equal(Object.isFrozen(r), false);
  r.outgoing.push({});
  r.backlinks.push({});
});
test('last duplicate ID wins outgoing lookup; original occurrence order retained', () => {
  const markdown = link('a', 'ref000001') + ' ' + link('a', 'ref000002');
  const r = relations(note('n', markdown), [
    note('a', '', { title: 'first' }),
    note('a', '', { title: 'last', folderId: 'f' })
  ]);
  assert.equal(r.outgoing.length, 1);
  assert.equal(r.outgoing[0].title, 'last');
  assert.equal(r.outgoing[0].folderId, 'f');
  assert.deepEqual(
    r.outgoing[0].occurrences.map(x => x.occurrenceId),
    ['ref000001', 'ref000002']
  );
});
test('foreign rows excluded; trash status uses truthiness, not boolean normalization', () => {
  const r = relations(
    note('n', [link('foreign'), link('deleted', 'ref000002'), link('active', 'ref000003')].join(' ')),
    [
      note('foreign', '', { spaceId: 't' }),
      note('deleted', '', { deleted: 'false' }),
      note('active', '', { deleted: 0 })
    ]
  );
  assert.deepEqual(
    r.outgoing.map(x => [x.id, x.status]),
    [
      ['foreign', 'deleted'],
      ['deleted', 'deleted'],
      ['active', 'active']
    ]
  );
  assert.equal(r.outgoing[0].title, '目标已删除');
});
test('backlinks preserve row order and duplicates, exclude deleted/self/foreign', () => {
  const rows = [
    note('b', link('n')),
    note('b', link('n', 'ref000002')),
    note('a', '[[n]]'),
    note('n', link('n')),
    note('deleted', link('n'), { deleted: [] }),
    note('foreign', link('n'), { spaceId: 't' })
  ];
  const r = relations(note('n'), rows);
  assert.deepEqual(
    r.backlinks.map(x => x.id),
    ['b', 'b', 'a']
  );
  assert.equal(r.backlinks[2].occurrences.length, 0);
});
test('outgoing title and folder defaults are nullish, not truthy', () => {
  const r = relations(note('n', [link('a'), link('b', 'ref000002')].join(' ')), [
    note('a', '', { title: '', folderId: '' }),
    note('b', '', { title: null, folderId: undefined })
  ]);
  assert.deepEqual(
    r.outgoing.map(x => [x.title, x.folderId]),
    [
      ['', ''],
      ['目标已删除', null]
    ]
  );
});
test('source space getter is read for each row and final result, not cached', () => {
  let reads = 0;
  const n = {
    id: 'n',
    rawMarkdown: link('a') + ' ' + link('b', 'ref000002'),
    get spaceId() {
      return ['s', 't', 'final'][reads++];
    }
  };
  const r = relations(n, [note('a'), note('b', '', { spaceId: 't' })]);
  assert.equal(reads, 3);
  assert.equal(r.spaceId, 'final');
  assert.deepEqual(
    r.outgoing.map(x => x.status),
    ['active', 'active']
  );
});
test('source markdown is independently read for parse and final hash', () => {
  let reads = 0;
  const n = {
    id: 'n',
    spaceId: 's',
    get rawMarkdown() {
      reads++;
      return reads === 1 ? link('a') : 'later';
    }
  };
  const r = relations(n, [note('a')]);
  assert.equal(reads, 2);
  assert.equal(r.outgoing[0].id, 'a');
  assert.equal(r.contentHash, hash('later'));
});
test('target title and folder getters precede status getter', () => {
  const trace = [];
  const marker = {};
  const row = note('a', '', {
    get title() {
      return 'unused';
    }
  });
  Object.defineProperties(row, {
    title: {
      get() {
        trace.push('title');
        return 'a';
      }
    },
    folderId: {
      get() {
        trace.push('folder');
        throw marker;
      }
    },
    deleted: {
      get() {
        trace.push('deleted');
        return false;
      }
    }
  });
  assert.throws(
    () => relations(note('n', link('a')), [row]),
    e => e === marker
  );
  assert.deepEqual(trace, ['title', 'folder']);
});
test('filter reads row space then source space before any source parse', () => {
  const trace = [];
  const marker = {};
  const row = {
    get spaceId() {
      trace.push('row.space');
      return 's';
    }
  };
  const n = {
    get spaceId() {
      trace.push('note.space');
      throw marker;
    },
    get rawMarkdown() {
      trace.push('markdown');
      return '';
    }
  };
  assert.throws(
    () => relations(n, [row]),
    e => e === marker
  );
  assert.deepEqual(trace, ['row.space', 'note.space']);
});
test('sparse rows are skipped, null rows are not silently normalized', () => {
  const rows = [];
  rows.length = 2;
  rows[1] = note('a');
  assert.equal(relations(note('n', link('a')), rows).outgoing[0].status, 'active');
  assert.throws(() => relations(note('n'), [null]), TypeError);
  assert.throws(() => relations(note('n'), null), TypeError);
});
test('input records and nested reference identities are not mutated', () => {
  const source = Object.freeze(note('n', link('a')));
  const target = Object.freeze(note('a', link('n'), { folderId: 'f' }));
  const rows = Object.freeze([source, target]);
  const r = relations(source, rows);
  assert.equal(r.backlinks[0].id, 'a');
  assert.equal(rows[1], target);
  assert.equal(r.outgoing[0] === target, false);
});

for (const value of [undefined, null, false, 0, '', NaN, true, 'false', [], {}, Symbol('deleted')])
  test(`deleted truthiness controls outgoing and backlinks: ${String(value)}`, () => {
    const r = relations(note('n', link('a')), [note('a', link('n'), { deleted: value })]);
    assert.equal(r.outgoing[0].status, value ? 'deleted' : 'active');
    assert.equal(r.backlinks.length, value ? 0 : 1);
  });
for (const spaceId of [undefined, null, 's', ''])
  test(`source space is returned unchanged and compared strictly: ${String(spaceId)}`, () => {
    const r = relations(note('n', link('a'), { spaceId }), [note('a', '', { spaceId }), note('b')]);
    assert.equal(r.spaceId, spaceId);
    assert.equal(r.outgoing[0].status, 'active');
  });
test('all property reads retain exact ordering through outgoing, backlinks and final hash', () => {
  const trace = [];
  function watched(name, fields) {
    const record = {};
    for (const [key, value] of Object.entries(fields))
      Object.defineProperty(record, key, {
        get() {
          trace.push(`${name}.${key}`);
          return value;
        }
      });
    return record;
  }
  const source = watched('source', note('n', link('a')));
  const target = watched('target', note('a', link('n'), { folderId: 'f', deleted: false }));
  const r = relations(source, [target]);
  assert.equal(r.backlinks.length, 1);
  assert.deepEqual(trace, [
    'target.spaceId',
    'source.spaceId',
    'target.id',
    'source.rawMarkdown',
    'target.title',
    'target.folderId',
    'target.deleted',
    'target.deleted',
    'target.id',
    'source.id',
    'target.rawMarkdown',
    'source.id',
    'source.id',
    'target.id',
    'target.title',
    'target.folderId',
    'source.id',
    'source.spaceId',
    'source.rawMarkdown'
  ]);
});
test('note id is independently read for eligibility, each occurrence, includes and returned ID', () => {
  const ids = ['not-source', 'x', 'y', 'x', 'final'];
  const source = {
    rawMarkdown: '',
    spaceId: 's',
    get id() {
      return ids.shift();
    }
  };
  const r = relations(source, [note('a', `${link('x')} ${link('y', 'ref000002')}`)]);
  assert.equal(r.backlinks.length, 1);
  assert.deepEqual(
    r.backlinks[0].occurrences.map(item => item.targetNoteId),
    ['x', 'y']
  );
  assert.equal(r.noteId, 'final');
  assert.deepEqual(ids, []);
});
test('deleted is read again for backlink eligibility after outgoing status', () => {
  let reads = 0;
  const target = note('a', link('n'));
  Object.defineProperty(target, 'deleted', {
    get() {
      return ++reads === 2;
    }
  });
  const r = relations(note('n', link('a')), [target]);
  assert.equal(r.outgoing[0].status, 'active');
  assert.equal(r.backlinks.length, 0);
  assert.equal(reads, 2);
});
test('backlink summary is a new mutable projection with exact keys and no private fields', () => {
  const target = note('a', link('n'), { folderId: '', privateField: 'hidden', deleted: false });
  const r = relations(note('n'), [target]);
  assert.deepEqual(Object.keys(r.backlinks[0]), ['id', 'title', 'folderId', 'occurrences']);
  assert.equal(r.backlinks[0].folderId, '');
  assert.equal('privateField' in r.backlinks[0], false);
  r.backlinks[0].id = 'changed';
  r.backlinks[0].occurrences.length = 0;
  assert.equal(target.id, 'a');
});
test('missing and deleted outgoing groups retain exact key order and parser occurrence data', () => {
  const r = relations(note('n', link('missing', 'ref000001', 'label')), []);
  assert.deepEqual(Object.keys(r.outgoing[0]), ['id', 'title', 'folderId', 'status', 'occurrences']);
  assert.equal(r.outgoing[0].occurrences[0].label, 'label');
  assert.equal(r.outgoing[0].occurrences[0].occurrenceId, 'ref000001');
  assert.equal(typeof r.outgoing[0].occurrences[0].sourceStart, 'number');
});
for (const key of ['title', 'folderId', 'deleted'])
  test(`outgoing ${key} getter error preserves identity and stops before backlinks`, () => {
    const marker = {};
    const target = note('a', link('n'));
    Object.defineProperty(target, key, {
      get() {
        throw marker;
      }
    });
    assert.throws(
      () => relations(note('n', link('a')), [target]),
      error => error === marker
    );
  });
test('final rawMarkdown error is not replaced by earlier parse or normalized', () => {
  let reads = 0;
  const marker = {};
  const source = {
    id: 'n',
    spaceId: 's',
    get rawMarkdown() {
      if (++reads === 2) throw marker;
      return '';
    }
  };
  assert.throws(
    () => relations(source, []),
    error => error === marker
  );
  assert.equal(reads, 2);
});
test('actual local note-service passes real repository rows into synchronous relation query', () => {
  const rows = [note('n', link('a')), note('a', link('n'))];
  const repository = createInMemoryNoteRepository({ records: rows });
  const service = createNoteService({ repository });
  const r = service.getNoteLinkRelations('n');
  assert.deepEqual(r, relations(rows[0], rows));
  assert.equal(r instanceof Promise, false);
  assert.throws(() => service.getNoteLinkRelations('missing'), { code: 'NOTE_NOT_FOUND' });
});
test('actual async note-service awaits find and scoped list, but helper result remains synchronous', async () => {
  const rows = [note('n', link('a')), note('a', link('n'))];
  const calls = [];
  const service = createAsyncNoteService({
    repository: {
      async findById(id) {
        calls.push(['find', id]);
        return rows.find(row => row.id === id);
      },
      async list(options) {
        calls.push(['list', options]);
        return rows;
      }
    }
  });
  assert.deepEqual(await service.getNoteLinkRelations('n'), relations(rows[0], rows));
  assert.deepEqual(calls, [
    ['find', 'n'],
    ['list', { spaceId: 's', includeDeleted: true }]
  ]);
});
for (const asyncMode of [false, true]) {
  const factory = asyncMode ? createAsyncNoteService : createNoteService;
  for (const operation of ['createNote', 'updateNote'])
    test(`actual ${asyncMode ? 'async' : 'sync'} ${operation} rejects new foreign links before writes`, async () => {
      const calls = [];
      const rows = [note('n'), note('foreign', '', { spaceId: 'other' })];
      const repository = {
        findById(id) {
          calls.push(['find', id]);
          return rows.find(row => row.id === id);
        },
        save(row) {
          calls.push(['save', row.id]);
          return row;
        }
      };
      const service = factory({ repository });
      const input = { id: 'created', title: 'created', spaceId: 's', rawMarkdown: link('foreign') };
      const run = () =>
        operation === 'createNote'
          ? service.createNote(input)
          : service.updateNote('n', { rawMarkdown: input.rawMarkdown });
      if (asyncMode) await assert.rejects(run, { code: 'NOTE_LINK_TARGET_INVALID', statusCode: 422 });
      else assert.throws(run, { code: 'NOTE_LINK_TARGET_INVALID', statusCode: 422 });
      assert.equal(
        calls.some(item => item[0] === 'save'),
        false
      );
    });
  test(`actual ${asyncMode ? 'async' : 'sync'} update preserves unchanged foreign and legacy links`, async () => {
    const markdown = `${link('foreign')} [[legacy]]`;
    const calls = [];
    const source = note('n', markdown);
    const repository = {
      findById(id) {
        calls.push(['find', id]);
        return id === 'n' ? source : note(id, '', { spaceId: 'other' });
      },
      save(row) {
        calls.push(['save', row.id]);
        return row;
      }
    };
    const service = factory({ repository });
    const saved = await service.updateNote('n', { rawMarkdown: `${markdown} suffix [[another-legacy]]` });
    assert.equal(saved.rawMarkdown, `${markdown} suffix [[another-legacy]]`);
    assert.deepEqual(calls, [
      ['find', 'n'],
      ['save', 'n']
    ]);
  });
}

// 完整同步消费者在内存中构造事务后像；不使用真实磁盘或 PostgreSQL。
import { Note } from '../src/modules/knowledge/domain/note.js';
import { NoteVersion } from '../src/modules/knowledge/domain/note-version.js';
import { KnowledgeSpace } from '../src/modules/knowledge/domain/knowledge-space.js';
function syncFixture(beforeMarkdown, afterMarkdown) {
  const before = createEmptyLocalState();
  before.spaces.push(
    ...['s', 'other'].map(id => ({ ...new KnowledgeSpace({ id, name: id, userId: 'owner', defaultFlag: id === 's' }) }))
  );
  before.notes.push(
    ...[note('n', beforeMarkdown), note('foreign', '', { spaceId: 'other' })].map(value => ({ ...new Note(value) }))
  );
  before.noteVersions.push(
    ...before.notes.map(value => ({
      ...new NoteVersion({ id: `v-${value.id}`, noteId: value.id, content: value.rawMarkdown })
    }))
  );
  const next = { ...before.notes[0], rawMarkdown: afterMarkdown };
  const version = { ...new NoteVersion({ id: 'next-version', noteId: 'n', content: afterMarkdown }) };
  return {
    before,
    changes: [
      { collection: 'noteVersions', id: version.id, value: version },
      { collection: 'notes', id: 'n', value: next }
    ]
  };
}
test('actual sync batch rejects newly added foreign occurrence before modifying input', () => {
  const { before, changes } = syncFixture('', link('foreign'));
  const snapshot = structuredClone(before);
  assert.throws(() => prepareBatchState(before, changes, 'owner'), {
    code: 'NOTE_LINK_TARGET_INVALID',
    statusCode: 422
  });
  assert.deepEqual(before, snapshot);
});
for (const [name, old, fresh] of [
  ['unchanged foreign occurrence', link('foreign'), `${link('foreign')} suffix`],
  ['legacy foreign bracket', '', '[[foreign]]'],
  ['permanently missing target', '', link('missing')]
])
  test(`actual sync batch permits ${name} and validates full synthetic state`, () => {
    const { before, changes } = syncFixture(old, fresh);
    const snapshot = structuredClone(before);
    const { state, aliases } = prepareBatchState(before, changes, 'owner');
    assert.equal(state.notes.find(item => item.id === 'n').rawMarkdown, fresh);
    assert.deepEqual(aliases, {});
    assert.deepEqual(before, snapshot);
  });
