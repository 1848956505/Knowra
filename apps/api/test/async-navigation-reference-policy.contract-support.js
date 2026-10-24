import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createAsyncTagGroupService } from '../src/modules/knowledge/application/postgres-async/tag-group-service.js';
import { createAsyncTagService } from '../src/modules/knowledge/application/postgres-async/tag-service.js';
import { createAsyncNoteService } from '../src/modules/knowledge/application/postgres-async/note-service.js';
import { createInMemoryTagRepository } from '../src/modules/knowledge/infrastructure/tag-repository.js';
import { createInMemoryTagGroupRepository } from '../src/modules/knowledge/infrastructure/tag-group-repository.js';
import { createPostgresTagRepository } from '../src/modules/knowledge/infrastructure/postgres/tag-repository.js';
import { createPostgresKnowledgeHttpHandlers } from '../src/modules/knowledge/http/postgres-async-handlers.js';
import { handleTagRoute } from '../src/modules/knowledge/http/tag-routes.js';
import { handleNoteRoute } from '../src/modules/knowledge/http/note-routes.js';
import { AppError } from '../src/errors/app-error.js';

// 准确实际父源文和独立固定 oracle。普通入口不读取 Git，也不从候选求预期值。
export const referenceParent = '4e24fd58e7aef9000efe0b1a6467df7f07afae94';
export const referenceFrozenSource =
  "import { validationError } from '../knowledge-errors.js';\n\n// 保留 PostgreSQL 批量读取与异步校验顺序。\nexport function createAsyncNavigationReferencePolicy({\n  knowledgeSpaceRepository,\n  folderRepository,\n  tagRepository,\n  tagGroupRepository\n}) {\n  async function assertSpaceReference(spaceId, entityName) {\n    if (!spaceId || !(await knowledgeSpaceRepository.findById(spaceId))) {\n      throw validationError(`${entityName}_SPACE_NOT_FOUND`, 'The referenced knowledge space does not exist');\n    }\n  }\n\n  async function assertNoteReferences({ spaceId, folderId, tagIds }) {\n    await assertSpaceReference(spaceId, 'NOTE');\n    if (folderId) {\n      const folder = await folderRepository.findById(folderId);\n      if (!folder) throw validationError('NOTE_FOLDER_NOT_FOUND', 'The referenced folder does not exist');\n      if (folder.spaceId !== spaceId) throw validationError('NOTE_FOLDER_SPACE_MISMATCH', 'The referenced folder belongs to another knowledge space');\n    }\n    const tags = await tagRepository.findByIds(tagIds ?? []);\n    const tagMap = new Map(tags.map((tag) => [tag.id, tag]));\n    for (const tagId of tagIds ?? []) {\n      const tag = tagMap.get(tagId);\n      if (!tag) throw validationError('NOTE_TAG_NOT_FOUND', 'A referenced tag does not exist');\n      if (tag.spaceId !== spaceId) throw validationError('NOTE_TAG_SPACE_MISMATCH', 'A referenced tag belongs to another knowledge space');\n    }\n  }\n\n  async function normalizeTagIds(tagIds) {\n    const uniqueIds = [...new Set(tagIds)];\n    const tags = await tagRepository.findByIds(uniqueIds);\n    const byId = new Map(tags.map((tag) => [tag.id, tag]));\n    const normalized = [];\n    const singleIndexes = new Map();\n    for (const tagId of uniqueIds) {\n      const tag = byId.get(tagId);\n      const group = tag?.groupId ? await tagGroupRepository.findById(tag.groupId) : null;\n      if (group?.selectionMode === 'single') {\n        const previous = singleIndexes.get(group.id);\n        if (previous !== undefined) normalized[previous] = null;\n        singleIndexes.set(group.id, normalized.length);\n      }\n      normalized.push(tagId);\n    }\n    return normalized.filter(Boolean);\n  }\n\n  async function assertTagGroupReference(groupId, spaceId) {\n    if (!groupId) return;\n    const group = await tagGroupRepository.findById(groupId);\n    if (!group) throw validationError('TAG_GROUP_NOT_FOUND', 'The referenced tag group does not exist');\n    if (group.spaceId !== spaceId) throw validationError('TAG_GROUP_SPACE_MISMATCH', 'The referenced tag group belongs to another knowledge space');\n  }\n\n  return { assertSpaceReference, assertNoteReferences, assertTagGroupReference, normalizeTagIds };\n}\n";
export const hash = value => createHash('sha256').update(value).digest('hex');
const tag = (extra = {}) => ({ id: 't', spaceId: 's', groupId: 'g', ...extra });
const group = (extra = {}) => ({ id: 'g', spaceId: 's', selectionMode: 'multiple', ...extra });
function makeFixture(create, o = {}) {
  const log = [];
  const mode = o.mode ?? 'sync';
  const wrap = x =>
    mode === 'promise'
      ? Promise.resolve(x)
      : mode === 'thenable'
        ? {
            then(resolve) {
              log.push('then');
              resolve(x);
            }
          }
        : x;
  const value = (key, fallback) => (Object.hasOwn(o, key) ? o[key] : fallback);
  const spaces = {
    findById(id) {
      assert.equal(this, spaces);
      log.push(['space', id]);
      return wrap(value('space', { id: 's' }));
    }
  };
  const folders = {
    findById(id) {
      assert.equal(this, folders);
      log.push(['folder', id]);
      return wrap(value('folder', { id: 'f', spaceId: 's' }));
    }
  };
  const tags = {
    findByIds(ids) {
      assert.equal(this, tags);
      log.push(['tags', ids]);
      return wrap(value('tags', [tag()]));
    }
  };
  const groups = {
    findById(id) {
      assert.equal(this, groups);
      log.push(['group', id]);
      return wrap(value('group', group()));
    }
  };
  const options = {
    knowledgeSpaceRepository: spaces,
    folderRepository: folders,
    tagRepository: tags,
    tagGroupRepository: groups
  };
  return { policy: create(options), options, log, spaces, folders, tags, groups };
}
function code(promise, expected, message) {
  return assert.rejects(
    promise,
    e => e instanceof AppError && e.code === expected && e.statusCode === 422 && (!message || e.message === message)
  );
}
export function referenceContractCases(subject) {
  const create = subject.createAsyncNavigationReferencePolicy;
  const fixture = options => makeFixture(create, options);
  const rows = [];
  const check = (name, run) => rows.push({ name, run });
  check('factory arity, method order, all async', () => {
    const p = fixture().policy;
    assert.equal(create.length, 1);
    assert.deepEqual(Object.keys(p), [
      'assertSpaceReference',
      'assertNoteReferences',
      'assertTagGroupReference',
      'normalizeTagIds'
    ]);
    assert.deepEqual(
      Object.values(p).map(f => f.length),
      [2, 1, 2, 1]
    );
    assert.ok(Object.values(p).every(f => f.constructor.name === 'AsyncFunction'));
  });
  check('factory missing options throws but missing repositories stay lazy', async () => {
    assert.throws(() => create(), TypeError);
    assert.throws(() => create(null), TypeError);
    const p = create({});
    await p.assertTagGroupReference(null, 's');
    await code(p.assertSpaceReference(null, 'TAG'), 'TAG_SPACE_NOT_FOUND');
    await assert.rejects(p.assertSpaceReference('s', 'TAG'), TypeError);
  });
  for (const mode of ['sync', 'promise', 'thenable']) {
    check(`${mode}: space resolves void`, async () => {
      const f = fixture({ mode });
      assert.equal(await f.policy.assertSpaceReference('s', 'TAG'), undefined);
      assert.deepEqual(
        f.log.filter(x => x !== 'then'),
        [['space', 's']]
      );
    });
    check(`${mode}: note exact sequential dependency order`, async () => {
      const f = fixture({ mode }),
        ids = ['t'];
      assert.equal(await f.policy.assertNoteReferences({ spaceId: 's', folderId: 'f', tagIds: ids }), undefined);
      assert.deepEqual(
        f.log.filter(x => x !== 'then'),
        [
          ['space', 's'],
          ['folder', 'f'],
          ['tags', ids]
        ]
      );
      assert.equal(f.log.find(x => x[0] === 'tags')[1], ids);
    });
    check(`${mode}: tag group strict space comparison`, async () => {
      const f = fixture({ mode });
      assert.equal(await f.policy.assertTagGroupReference('g', 's'), undefined);
      await code(
        f.policy.assertTagGroupReference('g', 1),
        'TAG_GROUP_SPACE_MISMATCH',
        'The referenced tag group belongs to another knowledge space'
      );
    });
    check(`${mode}: normalize keeps last single group ID without refresh`, async () => {
      const f = fixture({
        mode,
        tags: [tag({ id: 'a' }), tag({ id: 'b' })],
        group: group({ selectionMode: 'single' })
      });
      assert.deepEqual(await f.policy.normalizeTagIds(['a', 'b', 'a']), ['b']);
      assert.deepEqual(
        f.log.filter(x => x !== 'then'),
        [
          ['tags', ['a', 'b']],
          ['group', 'g'],
          ['group', 'g']
        ]
      );
    });
  }
  for (const id of [null, undefined, 0, false, '', NaN])
    check(`falsey space ${String(id)} short-circuits repository`, async () => {
      const f = fixture();
      await code(
        f.policy.assertSpaceReference(id, 'ENTITY'),
        'ENTITY_SPACE_NOT_FOUND',
        'The referenced knowledge space does not exist'
      );
      assert.deepEqual(f.log, []);
    });
  check('space accepts truthy non-record lookup result', async () => {
    const f = fixture({ space: 42 });
    await f.policy.assertSpaceReference({ id: 'opaque' }, 'ENTITY');
    assert.equal(f.log.length, 1);
  });
  check('entityName is converted only on failure, Symbols still throw TypeError', async () => {
    let count = 0;
    const name = {
      toString() {
        count++;
        return 'CUSTOM';
      }
    };
    const f = fixture();
    await f.policy.assertSpaceReference('s', name);
    assert.equal(count, 0);
    await code(f.policy.assertSpaceReference(null, name), 'CUSTOM_SPACE_NOT_FOUND');
    assert.equal(count, 1);
    await assert.rejects(f.policy.assertSpaceReference(null, Symbol()), TypeError);
  });
  check('note destructuring exception is rejection', async () => {
    const f = fixture();
    const p = f.policy.assertNoteReferences(null);
    assert.ok(p instanceof Promise);
    await assert.rejects(p, TypeError);
    assert.deepEqual(f.log, []);
  });
  check('space failure wins over folder and tag reads', async () => {
    const f = fixture({ space: null });
    await code(
      f.policy.assertNoteReferences({ spaceId: 's', folderId: 'f', tagIds: ['missing'] }),
      'NOTE_SPACE_NOT_FOUND'
    );
    assert.deepEqual(f.log, [['space', 's']]);
  });
  check('folder absent wins over batch tags', async () => {
    const f = fixture({ folder: null });
    await code(
      f.policy.assertNoteReferences({ spaceId: 's', folderId: 'f', tagIds: ['missing'] }),
      'NOTE_FOLDER_NOT_FOUND',
      'The referenced folder does not exist'
    );
    assert.deepEqual(f.log, [
      ['space', 's'],
      ['folder', 'f']
    ]);
  });
  check('folder strict space mismatch wins over batch tags', async () => {
    const f = fixture({ folder: { spaceId: 1 } });
    await code(
      f.policy.assertNoteReferences({ spaceId: '1', folderId: 'f', tagIds: [] }),
      'NOTE_FOLDER_SPACE_MISMATCH'
    );
    assert.equal(f.log.length, 2);
  });
  check('missing tag is not-found before later mismatched tag', async () => {
    const f = fixture({ tags: [tag({ id: 'later', spaceId: 'other' })] });
    await code(
      f.policy.assertNoteReferences({ spaceId: 's', tagIds: ['missing', 'later'] }),
      'NOTE_TAG_NOT_FOUND',
      'A referenced tag does not exist'
    );
  });
  check('first mismatched tag wins before later missing tag', async () => {
    const f = fixture({ tags: [tag({ id: 'first', spaceId: 'other' })] });
    await code(
      f.policy.assertNoteReferences({ spaceId: 's', tagIds: ['first', 'missing'] }),
      'NOTE_TAG_SPACE_MISMATCH'
    );
  });
  check('absent/null tags still invoke batch with fresh [] and no group queries', async () => {
    const f = fixture();
    await f.policy.assertNoteReferences({ spaceId: 's' });
    await f.policy.assertNoteReferences({ spaceId: 's', tagIds: null });
    const calls = f.log.filter(x => x[0] === 'tags');
    assert.deepEqual(
      calls.map(x => x[1]),
      [[], []]
    );
    assert.notEqual(calls[0][1], calls[1][1]);
    assert.equal(
      f.log.some(x => x[0] === 'group'),
      false
    );
  });
  check('duplicate returned IDs use final Map entry', async () => {
    const f = fixture({ tags: [tag({ spaceId: 'other' }), tag()] });
    await f.policy.assertNoteReferences({ spaceId: 's', tagIds: ['t'] });
    const bad = fixture({ tags: [tag(), tag({ spaceId: 'other' })] });
    await code(bad.policy.assertNoteReferences({ spaceId: 's', tagIds: ['t'] }), 'NOTE_TAG_SPACE_MISMATCH');
  });
  check('Map uses object identity, number/string distinction and NaN SameValueZero', async () => {
    const object = { id: 'x' };
    const f = fixture({ tags: [tag({ id: object }), tag({ id: NaN }), tag({ id: 1 })] });
    await f.policy.assertNoteReferences({ spaceId: 's', tagIds: [object, NaN, 1] });
    await code(f.policy.assertNoteReferences({ spaceId: 's', tagIds: ['1'] }), 'NOTE_TAG_NOT_FOUND');
    await code(f.policy.assertNoteReferences({ spaceId: 's', tagIds: [{ id: 'x' }] }), 'NOTE_TAG_NOT_FOUND');
  });
  check('note validation does not query groups or enforce single-selection', async () => {
    const f = fixture({ tags: [tag({ id: 'a' }), tag({ id: 'b' })], group: group({ selectionMode: 'single' }) });
    await f.policy.assertNoteReferences({ spaceId: 's', tagIds: ['a', 'b'] });
    assert.equal(
      f.log.some(x => x[0] === 'group'),
      false
    );
  });
  check('one-shot tag iterable may be consumed by batch repository before validation loop', async () => {
    const f = fixture({ tags: [] });
    function* ids() {
      yield 'missing';
    }
    const iterable = ids();
    f.tags.findByIds = function (value) {
      assert.equal(value, iterable);
      assert.deepEqual([...value], ['missing']);
      return [];
    };
    await f.policy.assertNoteReferences({ spaceId: 's', tagIds: iterable });
  });
  check('custom result map keeps receiver and no array spread assumption', async () => {
    const f = fixture();
    const result = {
      map(callback) {
        assert.equal(this, result);
        assert.equal(typeof callback, 'function');
        return [['t', tag()]];
      }
    };
    f.tags.findByIds = () => result;
    await f.policy.assertNoteReferences({ spaceId: 's', tagIds: ['t'] });
  });
  check('sparse tag result map remains Map iterable TypeError', async () => {
    const f = fixture({ tags: new Array(1) });
    await assert.rejects(f.policy.assertNoteReferences({ spaceId: 's', tagIds: [] }), TypeError);
  });
  check('normalization Set dedupes and Boolean removes falsey values without String coercion', async () => {
    const object = {},
      symbol = Symbol();
    const f = fixture({ tags: [] });
    const result = await f.policy.normalizeTagIds([0, false, '', null, undefined, NaN, object, symbol, 'x', 'x']);
    assert.deepEqual(result, [object, symbol, 'x']);
    assert.equal(result[0], object);
  });
  check('empty/null/omitted normalization still calls batch', async () => {
    const f = fixture({ tags: [] });
    for (const value of [null, undefined, []]) assert.deepEqual(await f.policy.normalizeTagIds(value), []);
    assert.deepEqual(f.log, [
      ['tags', []],
      ['tags', []],
      ['tags', []]
    ]);
  });
  check('normalization custom iterable consumed once by Set, repository receives fresh unique array', async () => {
    let starts = 0;
    const ids = {
      [Symbol.iterator]() {
        starts++;
        return ['a', 'a', 'b'][Symbol.iterator]();
      }
    };
    const f = fixture({ tags: [] });
    assert.deepEqual(await f.policy.normalizeTagIds(ids), ['a', 'b']);
    assert.equal(starts, 1);
    assert.deepEqual(f.log, [['tags', ['a', 'b']]]);
  });
  check('unknown tag and missing group stay in normalized result', async () => {
    const f = fixture({ tags: [tag({ id: 'a' })], group: null });
    assert.deepEqual(await f.policy.normalizeTagIds(['a', 'missing']), ['a', 'missing']);
  });
  check('falsey groupId never queries groups', async () => {
    const f = fixture({ tags: [tag({ id: 'a', groupId: 0 })] });
    assert.deepEqual(await f.policy.normalizeTagIds(['a']), ['a']);
    assert.deepEqual(f.log, [['tags', ['a']]]);
  });
  check('group match is exact string single only', async () => {
    for (const selectionMode of ['Single', 'multiple', false, 1, undefined]) {
      const f = fixture({ tags: [tag({ id: 'a' }), tag({ id: 'b' })], group: group({ selectionMode }) });
      assert.deepEqual(await f.policy.normalizeTagIds(['a', 'b']), ['a', 'b']);
    }
  });
  check('normalization groups use resolved group.id, not requested groupId', async () => {
    const f = fixture({
      tags: [tag({ id: 'a', groupId: 'one' }), tag({ id: 'b', groupId: 'two' })],
      group: group({ id: undefined, selectionMode: 'single' })
    });
    assert.deepEqual(await f.policy.normalizeTagIds(['a', 'b']), ['b']);
  });
  check('tag groupId getter is read twice, group id getter twice, without caching', async () => {
    const reads = [];
    const row = {
      id: 'a',
      get groupId() {
        reads.push('tag.groupId');
        return reads.length === 1 ? 'first' : 'second';
      }
    };
    const rec = {
      selectionMode: 'single',
      get id() {
        reads.push('group.id');
        return 'g';
      }
    };
    const f = fixture({ tags: [row], group: rec });
    assert.deepEqual(await f.policy.normalizeTagIds(['a']), ['a']);
    assert.deepEqual(reads, ['tag.groupId', 'tag.groupId', 'group.id', 'group.id']);
    assert.deepEqual(f.log, [
      ['tags', ['a']],
      ['group', 'second']
    ]);
  });
  check('group requests are sequential, later calls wait for first resolution', async () => {
    const f = fixture({ tags: [tag({ id: 'a', groupId: '1' }), tag({ id: 'b', groupId: '2' })] });
    let release;
    const log = [];
    f.groups.findById = id => {
      log.push(id);
      return id === '1' ? new Promise(r => (release = r)) : group();
    };
    const p = f.policy.normalizeTagIds(['a', 'b']);
    p.catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    try {
      assert.deepEqual(log, ['1']);
    } finally {
      release?.(group());
      await p.catch(() => {});
    }
    assert.deepEqual(log, ['1', '2']);
  });
  check('methods are looked up anew after earlier awaits', async () => {
    const f = fixture();
    let old = 0,
      newer = 0;
    f.folders.findById = () => {
      old++;
      return { spaceId: 's' };
    };
    f.spaces.findById = () => ({
      then(resolve) {
        f.folders.findById = () => {
          newer++;
          return { spaceId: 's' };
        };
        resolve({});
      }
    });
    await f.policy.assertNoteReferences({ spaceId: 's', folderId: 'f', tagIds: [] });
    assert.equal(old, 0);
    assert.equal(newer, 1);
  });
  check('factory captures repositories once, not options subsequent mutation', async () => {
    const f = fixture();
    f.options.knowledgeSpaceRepository = {
      findById() {
        throw Error('replacement');
      }
    };
    await f.policy.assertSpaceReference('s', 'TAG');
    assert.deepEqual(f.log, [['space', 's']]);
  });
  for (const stage of ['space', 'folder', 'tags', 'group'])
    check(`${stage} synchronous throw preserves rejection identity`, async () => {
      const marker = { stage };
      const f = fixture();
      const object = { space: f.spaces, folder: f.folders, tags: f.tags, group: f.groups }[stage];
      object[stage === 'tags' ? 'findByIds' : 'findById'] = () => {
        throw marker;
      };
      const p =
        stage === 'group'
          ? f.policy.assertTagGroupReference('g', 's')
          : f.policy.assertNoteReferences({ spaceId: 's', folderId: 'f', tagIds: ['t'] });
      await assert.rejects(p, e => e === marker);
    });
  for (const stage of ['space', 'folder', 'tags', 'group'])
    check(`${stage} rejected thenable preserves rejection identity`, async () => {
      const marker = { stage };
      const f = fixture();
      const object = { space: f.spaces, folder: f.folders, tags: f.tags, group: f.groups }[stage];
      object[stage === 'tags' ? 'findByIds' : 'findById'] = () => ({
        then(_resolve, reject) {
          reject(marker);
        }
      });
      const p =
        stage === 'group'
          ? f.policy.normalizeTagIds(['t'])
          : f.policy.assertNoteReferences({ spaceId: 's', folderId: 'f', tagIds: ['t'] });
      await assert.rejects(p, e => e === marker);
    });
  check('tag group falsey skips lookup; absent group has exact error', async () => {
    const f = fixture({ group: null });
    for (const id of [null, undefined, 0, false, ''])
      assert.equal(await f.policy.assertTagGroupReference(id, 's'), undefined);
    assert.deepEqual(f.log, []);
    await code(
      f.policy.assertTagGroupReference('g', 's'),
      'TAG_GROUP_NOT_FOUND',
      'The referenced tag group does not exist'
    );
  });

  for (const kind of ['tag', 'group'])
    check(`${kind} space comparison never coerces numbers, strings or boxed strings`, async () => {
      for (const [recordSpace, requestedSpace] of [
        [1, '1'],
        ['1', 1],
        [new String('s'), 's']
      ]) {
        const f = fixture({ tags: [tag({ spaceId: recordSpace })], group: group({ spaceId: recordSpace }) });
        await code(
          kind === 'tag'
            ? f.policy.assertNoteReferences({ spaceId: requestedSpace, tagIds: ['t'] })
            : f.policy.assertTagGroupReference('g', requestedSpace),
          kind === 'tag' ? 'NOTE_TAG_SPACE_MISMATCH' : 'TAG_GROUP_SPACE_MISMATCH'
        );
      }
    });
  for (const operation of ['note', 'normalize'])
    check(`${operation} input iterator exception preserves identity and ordering`, async () => {
      const f = fixture(),
        marker = { operation },
        events = [],
        ids = {
          [Symbol.iterator]() {
            events.push('iterator');
            throw marker;
          }
        };
      const pending =
        operation === 'note'
          ? f.policy.assertNoteReferences({ spaceId: 's', tagIds: ids })
          : f.policy.normalizeTagIds(ids);
      await assert.rejects(pending, error => error === marker);
      assert.deepEqual(events, ['iterator']);
      assert.deepEqual(
        f.log,
        operation === 'note'
          ? [
              ['space', 's'],
              ['tags', ids]
            ]
          : []
      );
    });
  check(
    'factory dependency getters are captured once in original order; getter exceptions are synchronous',
    async () => {
      const keys = ['knowledgeSpaceRepository', 'folderRepository', 'tagRepository', 'tagGroupRepository'];
      for (const failure of [...keys, null]) {
        const marker = { failure },
          trace = [],
          f = fixture(),
          options = {};
        for (const key of keys)
          Object.defineProperty(options, key, {
            get() {
              trace.push(key);
              if (key === failure) throw marker;
              return f.options[key];
            }
          });
        if (failure) {
          assert.throws(
            () => create(options),
            e => e === marker
          );
          assert.deepEqual(trace, keys.slice(0, keys.indexOf(failure) + 1));
        } else {
          const policy = create(options);
          await policy.assertSpaceReference('s', 'TAG');
          assert.deepEqual(trace, keys);
        }
      }
    }
  );
  check(
    'destructured note input getters run once in space/folder/tags order before any repository access',
    async () => {
      const trace = [],
        f = fixture();
      const input = {};
      for (const [key, value] of [
        ['spaceId', 's'],
        ['folderId', 'f'],
        ['tagIds', ['t']]
      ])
        Object.defineProperty(input, key, {
          get() {
            trace.push(key);
            return value;
          }
        });
      await f.policy.assertNoteReferences(input);
      assert.deepEqual(trace, ['spaceId', 'folderId', 'tagIds']);
      assert.deepEqual(f.log, [
        ['space', 's'],
        ['folder', 'f'],
        ['tags', ['t']]
      ]);
    }
  );
  for (const field of ['spaceId', 'folderId', 'tagIds'])
    check(`input ${field} getter rejection preserves identity before repository reads`, async () => {
      const marker = { field },
        f = fixture(),
        input = { spaceId: 's', folderId: 'f', tagIds: ['t'] };
      Object.defineProperty(input, field, {
        get() {
          throw marker;
        }
      });
      await assert.rejects(f.policy.assertNoteReferences(input), e => e === marker);
      assert.deepEqual(f.log, []);
    });
  check('all falsey folder IDs skip optional folder lookup without coercion', async () => {
    for (const folderId of [null, undefined, 0, false, '', NaN]) {
      const f = fixture();
      await f.policy.assertNoteReferences({ spaceId: 's', folderId, tagIds: [] });
      assert.deepEqual(f.log, [
        ['space', 's'],
        ['tags', []]
      ]);
    }
  });
  check('all falsey space repository results produce exact missing-space error', async () => {
    for (const space of [null, undefined, 0, false, '', NaN]) {
      const f = fixture({ space });
      await code(
        f.policy.assertSpaceReference('s', 'ENTITY'),
        'ENTITY_SPACE_NOT_FOUND',
        'The referenced knowledge space does not exist'
      );
      assert.deepEqual(f.log, [['space', 's']]);
    }
  });
  for (const kind of ['folder', 'group'])
    check(`${kind} falsey repository records are absent, not merely null`, async () => {
      for (const record of [null, undefined, 0, false, '', NaN]) {
        const f = fixture({ [kind]: record });
        await code(
          kind === 'folder'
            ? f.policy.assertNoteReferences({ spaceId: 's', folderId: 'f', tagIds: [] })
            : f.policy.assertTagGroupReference('g', 's'),
          kind === 'folder' ? 'NOTE_FOLDER_NOT_FOUND' : 'TAG_GROUP_NOT_FOUND'
        );
      }
    });
  check('opaque Symbol/object IDs are passed unchanged and never coerced', async () => {
    const opaque = {
        toString() {
          throw Error('not a string');
        }
      },
      symbol = Symbol('id');
    for (const id of [opaque, symbol, 1]) {
      const f = fixture({ folder: { spaceId: id }, tags: [tag({ id, spaceId: id })], group: { spaceId: id } });
      await f.policy.assertNoteReferences({ spaceId: id, folderId: id, tagIds: [id] });
      await f.policy.assertTagGroupReference(id, id);
      assert.deepEqual(f.log, [
        ['space', id],
        ['folder', id],
        ['tags', [id]],
        ['group', id]
      ]);
    }
  });
  check('assert batch receives original frozen array with duplicates, unlike normalization', async () => {
    const ids = Object.freeze(['t', 't']),
      f = fixture();
    await f.policy.assertNoteReferences({ spaceId: 's', tagIds: ids });
    assert.equal(f.log[1][1], ids);
    assert.deepEqual(f.log[1][1], ['t', 't']);
    const result = await f.policy.normalizeTagIds(ids);
    assert.deepEqual(result, ['t']);
    assert.notEqual(f.log[2][1], ids);
    assert.deepEqual(f.log[2][1], ['t']);
  });
  check('assert batch preserves Set/string identity and iteration, including missing ID failure', async () => {
    for (const ids of [new Set(['t']), 't']) {
      const f = fixture();
      await f.policy.assertNoteReferences({ spaceId: 's', tagIds: ids });
      assert.equal(f.log[1][1], ids);
    }
    const f = fixture({ tags: [] }),
      ids = new Set(['missing']);
    await code(f.policy.assertNoteReferences({ spaceId: 's', tagIds: ids }), 'NOTE_TAG_NOT_FOUND');
    assert.equal(f.log[1][1], ids);
  });
  check('assert repeatable iterable is not materialized or deduplicated before repository', async () => {
    const events = [],
      ids = {
        [Symbol.iterator]() {
          events.push('iterate');
          return ['t', 't'][Symbol.iterator]();
        }
      },
      f = fixture();
    f.tags.findByIds = function (value) {
      assert.equal(this, f.tags);
      assert.equal(value, ids);
      events.push('batch');
      return [tag()];
    };
    await f.policy.assertNoteReferences({ spaceId: 's', tagIds: ids });
    assert.deepEqual(events, ['batch', 'iterate']);
  });
  check('assert loop closes its iterator on first reference failure and does not scan later IDs', async () => {
    const events = [],
      ids = {
        [Symbol.iterator]() {
          let n = 0;
          return {
            next() {
              events.push('next');
              return n++ ? { value: 'later', done: false } : { value: 'missing', done: false };
            },
            return() {
              events.push('return');
              return { done: true };
            }
          };
        }
      },
      f = fixture({ tags: [] });
    await code(f.policy.assertNoteReferences({ spaceId: 's', tagIds: ids }), 'NOTE_TAG_NOT_FOUND');
    assert.deepEqual(events, ['next', 'return']);
  });
  check('normalization duplicate Map records last-win, including group association', async () => {
    const f = fixture({
      tags: [tag({ id: 'a' }), tag({ id: 'a', groupId: null }), tag({ id: 'b' })],
      group: group({ selectionMode: 'single' })
    });
    assert.deepEqual(await f.policy.normalizeTagIds(['a', 'b']), ['a', 'b']);
    assert.deepEqual(f.log, [
      ['tags', ['a', 'b']],
      ['group', 'g']
    ]);
  });
  check('normalization Map keys use identity, SameValueZero and never string coercion', async () => {
    const object = {},
      symbol = Symbol('a'),
      f = fixture({
        tags: [tag({ id: object }), tag({ id: symbol }), tag({ id: 1 }), tag({ id: '1', groupId: null })],
        group: group({ selectionMode: 'single' })
      });
    assert.deepEqual(await f.policy.normalizeTagIds([object, symbol, 1, '1']), [1, '1']);
  });
  check('group IDs also preserve Map object identity and SameValueZero', async () => {
    for (const [left, right, expected] of [
      [NaN, NaN, ['b']],
      [1, '1', ['a', 'b']],
      [{}, {}, ['a', 'b']]
    ]) {
      const f = fixture({ tags: [tag({ id: 'a', groupId: 'first' }), tag({ id: 'b', groupId: 'last' })] });
      f.groups.findById = id => group({ id: id === 'first' ? left : right, selectionMode: 'single' });
      assert.deepEqual(await f.policy.normalizeTagIds(['a', 'b']), expected);
    }
  });
  check('group id getters get and set use independently changing values, not a cached ID', async () => {
    const events = [],
      f = fixture({ tags: [tag({ id: 'a' }), tag({ id: 'b' })] });
    let reads = 0;
    f.groups.findById = () => ({
      selectionMode: 'single',
      get id() {
        events.push(++reads);
        return reads === 1 ? 'read-first' : reads === 2 ? 'write-first' : reads === 3 ? 'write-first' : 'write-last';
      }
    });
    assert.deepEqual(await f.policy.normalizeTagIds(['a', 'b']), ['b']);
    assert.deepEqual(events, [1, 2, 3, 4]);
  });
  check('tag groupId is only read once if falsey, while truthy value is read again for the actual query', async () => {
    const events = [],
      f = fixture({
        tags: [
          {
            id: 'a',
            get groupId() {
              events.push('a');
              return 0;
            }
          },
          {
            id: 'b',
            get groupId() {
              events.push('b');
              return events.length === 2 ? 'guard' : 'request';
            }
          }
        ]
      });
    f.groups.findById = id => {
      events.push(id);
      return null;
    };
    assert.deepEqual(await f.policy.normalizeTagIds(['a', 'b']), ['a', 'b']);
    assert.deepEqual(events, ['a', 'b', 'b', 'request']);
  });
  check('normalization does not cache repeated group lookup or selection result across awaits', async () => {
    const f = fixture({ tags: [tag({ id: 'a' }), tag({ id: 'b' }), tag({ id: 'c' })] }),
      events = [];
    f.groups.findById = function (id) {
      assert.equal(this, f.groups);
      events.push(id);
      return events.length === 1 ? group({ selectionMode: 'single' }) : null;
    };
    assert.deepEqual(await f.policy.normalizeTagIds(['a', 'b', 'c']), ['a', 'b', 'c']);
    assert.deepEqual(events, ['g', 'g', 'g']);
  });
  check('earlier group await can replace later group method before dynamic lookup', async () => {
    const f = fixture({ tags: [tag({ id: 'a' }), tag({ id: 'b' })] }),
      events = [];
    f.groups.findById = function (id) {
      events.push(['first', id, this === f.groups]);
      return {
        then(resolve) {
          f.groups.findById = function (next) {
            events.push(['second', next, this === f.groups]);
            return group({ selectionMode: 'multiple' });
          };
          resolve(group({ selectionMode: 'single' }));
        }
      };
    };
    assert.deepEqual(await f.policy.normalizeTagIds(['a', 'b']), ['a', 'b']);
    assert.deepEqual(events, [
      ['first', 'g', true],
      ['second', 'g', true]
    ]);
  });
  check('normalization custom map view invokes exact callback in order and preserves receiver', async () => {
    const f = fixture(),
      events = [],
      a = tag({ id: 'a', groupId: null }),
      b = tag({ id: 'b', groupId: null });
    const view = {
      map(callback) {
        assert.equal(this, view);
        events.push('map');
        assert.deepEqual(callback(a), ['a', a]);
        assert.deepEqual(callback(b), ['b', b]);
        return [
          ['a', a],
          ['b', b]
        ];
      }
    };
    f.tags.findByIds = () => view;
    assert.deepEqual(await f.policy.normalizeTagIds(['b', 'a']), ['b', 'a']);
    assert.deepEqual(events, ['map']);
  });
  check('custom tag view map gets original callback and row ID getter exactly once', async () => {
    const f = fixture(),
      events = [],
      row = {
        spaceId: 's',
        get id() {
          events.push('id');
          return 't';
        }
      },
      view = {
        map(callback) {
          assert.equal(this, view);
          events.push('map');
          return [callback(row)];
        }
      };
    f.tags.findByIds = () => view;
    await f.policy.assertNoteReferences({ spaceId: 's', tagIds: ['t'] });
    assert.deepEqual(events, ['map', 'id']);
  });
  check('normalization sparse repository array fails at Map rather than being repaired', async () => {
    const f = fixture({ tags: new Array(1) });
    await assert.rejects(f.policy.normalizeTagIds([]), TypeError);
  });
  for (const operation of ['note', 'normalize'])
    for (const stage of ['map:get', 'map:call', 'id'])
      check(`${operation}: tag view ${stage} exception preserves identity`, async () => {
        const f = fixture(),
          marker = { operation, stage },
          events = [];
        f.tags.findByIds = () => ({
          get map() {
            events.push('map:get');
            if (stage === 'map:get') throw marker;
            return function (callback) {
              events.push('map:call');
              if (stage === 'map:call') throw marker;
              return [
                callback({
                  get id() {
                    events.push('id');
                    throw marker;
                  }
                })
              ];
            };
          }
        });
        await assert.rejects(
          operation === 'note'
            ? f.policy.assertNoteReferences({ spaceId: 's', tagIds: ['t'] })
            : f.policy.normalizeTagIds(['t']),
          e => e === marker
        );
        assert.deepEqual(
          events,
          ['map:get', 'map:call', 'id'].slice(0, ['map:get', 'map:call', 'id'].indexOf(stage) + 1)
        );
      });
  for (const [operation, stage, expected] of [
    ['note', 'space', []],
    ['note', 'folder', [['space', 's']]],
    [
      'note',
      'tags',
      [
        ['space', 's'],
        ['folder', 'f']
      ]
    ],
    ['normalize', 'tags', []],
    ['normalize', 'group', [['tags', ['t']]]],
    ['group', 'group', []]
  ])
    for (const failure of ['method-get', 'sync-throw', 'then-get', 'then-reject'])
      check(`${operation}: ${stage} ${failure} exact exception and prior-only order`, async () => {
        const f = fixture(),
          marker = { operation, stage, failure },
          events = [],
          repo = { space: f.spaces, folder: f.folders, tags: f.tags, group: f.groups }[stage],
          key = stage === 'tags' ? 'findByIds' : 'findById';
        Object.defineProperty(repo, key, {
          get() {
            events.push('get');
            if (failure === 'method-get') throw marker;
            return function () {
              events.push('call');
              assert.equal(this, repo);
              if (failure === 'sync-throw') throw marker;
              if (failure === 'then-get')
                return {
                  get then() {
                    events.push('then:get');
                    throw marker;
                  }
                };
              return {
                then(_resolve, reject) {
                  events.push('then:call');
                  reject(marker);
                }
              };
            };
          }
        });
        await assert.rejects(
          operation === 'note'
            ? f.policy.assertNoteReferences({ spaceId: 's', folderId: 'f', tagIds: ['t'] })
            : operation === 'group'
              ? f.policy.assertTagGroupReference('g', 's')
              : f.policy.normalizeTagIds(['t']),
          e => e === marker
        );
        assert.deepEqual(f.log, expected);
        assert.deepEqual(
          events,
          failure === 'method-get'
            ? ['get']
            : failure === 'sync-throw'
              ? ['get', 'call']
              : ['get', 'call', failure === 'then-get' ? 'then:get' : 'then:call']
        );
      });
  for (const method of ['assertSpaceReference', 'assertNoteReferences', 'assertTagGroupReference', 'normalizeTagIds'])
    check(`${method}: exact thenable assimilation keeps receiver and first resolution`, async () => {
      const f = fixture(),
        events = [],
        target =
          method === 'assertSpaceReference' ? f.spaces : method === 'assertTagGroupReference' ? f.groups : f.tags,
        key = target === f.tags ? 'findByIds' : 'findById',
        value = target === f.tags ? [tag()] : target === f.groups ? group() : {};
      const inner = {
        then(resolve) {
          assert.equal(this, inner);
          events.push('inner');
          resolve(value);
        }
      };
      const outer = {
        get then() {
          events.push('outer:get');
          return function (resolve, reject) {
            assert.equal(this, outer);
            events.push('outer:call');
            resolve(inner);
            reject(Error('ignored rejection'));
            throw Error('ignored throw');
          };
        }
      };
      target[key] = () => outer;
      const result = await (method === 'assertNoteReferences'
        ? f.policy[method]({ spaceId: 's', tagIds: ['t'] })
        : method === 'normalizeTagIds'
          ? f.policy[method](['t'])
          : f.policy[method](
              method === 'assertSpaceReference' ? 's' : 'g',
              method === 'assertSpaceReference' ? 'TAG' : 's'
            ));
      assert.deepEqual(result, method === 'normalizeTagIds' ? ['t'] : undefined);
      assert.deepEqual(events, ['outer:get', 'outer:call', 'inner']);
    });
  check('awaited space finishes before even reading folder method, then tags after folder completion', async () => {
    const f = fixture(),
      events = [];
    let releaseSpace, releaseFolder;
    f.spaces.findById = () => ({
      then(resolve) {
        events.push('space:pending');
        releaseSpace = resolve;
      }
    });
    Object.defineProperty(f.folders, 'findById', {
      get() {
        events.push('folder:get');
        return () => ({
          then(resolve) {
            events.push('folder:pending');
            releaseFolder = resolve;
          }
        });
      }
    });
    f.tags.findByIds = () => {
      events.push('tags');
      return [];
    };
    const pending = f.policy.assertNoteReferences({ spaceId: 's', folderId: 'f', tagIds: [] });
    pending.catch(() => {});
    try {
      for (let i = 0; i < 6; i++) await Promise.resolve();
      assert.deepEqual(events, ['space:pending']);
      releaseSpace({});
      for (let i = 0; i < 8; i++) await Promise.resolve();
      assert.deepEqual(events, ['space:pending', 'folder:get', 'folder:pending']);
      releaseFolder({ spaceId: 's' });
      await pending;
      assert.deepEqual(events, ['space:pending', 'folder:get', 'folder:pending', 'tags']);
    } finally {
      releaseSpace?.({});
      releaseFolder?.({ spaceId: 's' });
      await pending.catch(() => {});
    }
  });
  check('rejected first group prevents every later group read', async () => {
    const f = fixture({ tags: [tag({ id: 'a' }), tag({ id: 'b' })] }),
      marker = { rejected: 'first' },
      events = [];
    f.groups.findById = () => {
      events.push('group');
      return {
        then(_resolve, reject) {
          events.push('reject');
          reject(marker);
        }
      };
    };
    await assert.rejects(f.policy.normalizeTagIds(['a', 'b']), e => e === marker);
    assert.deepEqual(events, ['group', 'reject']);
  });

  return rows;
}
export function referenceConsumerCases(subject) {
  const create = subject.createAsyncNavigationReferencePolicy;
  const fixture = options => makeFixture(create, options);
  const rows = [];
  const check = (name, run) => rows.push({ name, run });
  check('actual PG tag reader distinguishes arrays from Set/string without database connection', async () => {
    const calls = [];
    const db = {
      tag: {
        findMany: async options => {
          calls.push(options);
          return [tag({ name: 'Tag' })];
        }
      }
    };
    const repository = createPostgresTagRepository({ db });
    const f = fixture();
    const policy = create({ ...f.options, tagRepository: repository });
    await policy.assertNoteReferences({ spaceId: 's', tagIds: ['t'] });
    assert.equal(calls.length, 1);
    await code(policy.assertNoteReferences({ spaceId: 's', tagIds: new Set(['t']) }), 'NOTE_TAG_NOT_FOUND');
    assert.equal(calls.length, 1);
    await code(policy.assertNoteReferences({ spaceId: 's', tagIds: 't' }), 'NOTE_TAG_NOT_FOUND');
    assert.equal(calls.length, 1);
    assert.deepEqual(await policy.normalizeTagIds(new Set(['t'])), ['t']);
    assert.equal(calls.length, 2);
  });
  // Real adjacent service consumers with only fresh in-memory records. No composition root, database, socket or persistence.
  for (const mode of ['sync', 'promise', 'thenable'])
    check(`${mode}: actual tag/group/note service consumers enforce references and normalize`, async () => {
      const records = [
        { id: 'a', spaceId: 's', name: 'A', groupId: 'g' },
        { id: 'b', spaceId: 's', name: 'B', groupId: 'g' }
      ];
      const groups = createInMemoryTagGroupRepository({
        records: [{ id: 'g', spaceId: 's', name: 'Group', selectionMode: 'single' }]
      });
      const tags = createInMemoryTagRepository({ records });
      const wrap = x =>
        mode === 'promise'
          ? Promise.resolve(x)
          : mode === 'thenable'
            ? {
                then(resolve) {
                  resolve(x);
                }
              }
            : x;
      const policy = create({
        knowledgeSpaceRepository: { findById: id => wrap(id === 's' ? { id } : null) },
        folderRepository: { findById: id => wrap(id === 'f' ? { id, spaceId: 's' } : null) },
        tagRepository: { findByIds: ids => wrap([...ids].map(id => tags.findById(id)).filter(Boolean)) },
        tagGroupRepository: { findById: id => wrap(groups.findById(id)) }
      });
      const tagService = createAsyncTagService({
        repository: tags,
        validateSpaceReference: id => policy.assertSpaceReference(id, 'TAG'),
        validateGroupReference: policy.assertTagGroupReference
      });
      await code(tagService.createTag({ id: 'c', name: 'C', spaceId: 'missing', groupId: 'g' }), 'TAG_SPACE_NOT_FOUND');
      assert.equal(tags.findById('c'), null);
      const newTag = await tagService.createTag({ id: 'c', name: 'C', spaceId: 's', groupId: 'g' });
      assert.equal(newTag.id, 'c');
      const groupService = createAsyncTagGroupService({
        repository: groups,
        tagRepository: tags,
        validateSpaceReference: id => policy.assertSpaceReference(id, 'TAG_GROUP')
      });
      await code(
        groupService.createTagGroup({ id: 'new', name: 'New', spaceId: 'missing' }),
        'TAG_GROUP_SPACE_NOT_FOUND'
      );
      const notes = new Map();
      const repository = {
        findById: id => wrap(notes.get(id) ?? null),
        save: note => {
          notes.set(note.id, note);
          return wrap(note);
        },
        list: () => wrap([...notes.values()])
      };
      const noteService = createAsyncNoteService({
        repository,
        validateNoteReferences: policy.assertNoteReferences,
        normalizeTagIds: policy.normalizeTagIds
      });
      const note = await noteService.createNote({
        id: 'n',
        spaceId: 's',
        folderId: 'f',
        tagIds: ['a'],
        title: 'Note',
        rawMarkdown: 'hello'
      });
      assert.equal(note.id, 'n');
      const changed = await noteService.setNoteTags('n', ['a', 'b']);
      assert.deepEqual(changed.tagIds, ['b']);
      await code(noteService.setNoteTags('n', ['missing']), 'NOTE_TAG_NOT_FOUND');
      assert.deepEqual(notes.get('n').tagIds, ['b']);
    });

  for (const mode of ['sync', 'promise', 'thenable'])
    check(`${mode}: real tag/group/note routes reach policy and reject before writes`, async () => {
      const wrap = value =>
        mode === 'promise'
          ? Promise.resolve(value)
          : mode === 'thenable'
            ? {
                then(resolve) {
                  resolve(value);
                }
              }
            : value;
      const tags = createInMemoryTagRepository({
          records: [
            { id: 'a', spaceId: 's', name: 'A', groupId: 'g' },
            { id: 'b', spaceId: 's', name: 'B', groupId: 'g' }
          ]
        }),
        groups = createInMemoryTagGroupRepository({
          records: [{ id: 'g', spaceId: 's', name: 'Single', selectionMode: 'single' }]
        }),
        notes = new Map(),
        writes = [];
      const f = fixture(),
        policy = create({
          ...f.options,
          knowledgeSpaceRepository: { findById: id => wrap(id === 's' ? { id } : null) },
          tagRepository: { findByIds: ids => wrap([...ids].map(id => tags.findById(id)).filter(Boolean)) },
          tagGroupRepository: { findById: id => wrap(groups.findById(id)) }
        });
      const tagService = createAsyncTagService({
        repository: tags,
        validateSpaceReference: id => policy.assertSpaceReference(id, 'TAG'),
        validateGroupReference: policy.assertTagGroupReference
      });
      const tagGroupService = createAsyncTagGroupService({
        repository: groups,
        tagRepository: tags,
        validateSpaceReference: id => policy.assertSpaceReference(id, 'TAG_GROUP')
      });
      const noteService = createAsyncNoteService({
        repository: {
          findById: id => wrap(notes.get(id) ?? null),
          save: note => {
            writes.push(note.id);
            notes.set(note.id, note);
            return wrap(note);
          },
          list: () => wrap([...notes.values()])
        },
        validateNoteReferences: policy.assertNoteReferences,
        normalizeTagIds: policy.normalizeTagIds
      });
      const module = { tagService, tagGroupService, noteService };
      const tagResult = await runReferenceRoute(module, 'POST', '/api/knowledge/tags', {
        id: 'c',
        name: 'C',
        spaceId: 's',
        groupId: 'g'
      });
      assert.equal(tagResult.status, 201);
      assert.equal(tagResult.body.data.id, 'c');
      await code(
        runReferenceRoute(module, 'POST', '/api/knowledge/tags', {
          id: 'bad',
          name: 'Bad',
          spaceId: 's',
          groupId: 'absent'
        }),
        'TAG_GROUP_NOT_FOUND'
      );
      assert.equal(tags.findById('bad'), null);
      const groupResult = await runReferenceRoute(module, 'POST', '/api/knowledge/tag-groups', {
        id: 'new',
        name: 'New',
        spaceId: 's'
      });
      assert.equal(groupResult.status, 201);
      assert.equal(groupResult.body.data.id, 'new');
      await code(
        runReferenceRoute(module, 'POST', '/api/knowledge/tag-groups', { id: 'bad', name: 'Bad', spaceId: 'missing' }),
        'TAG_GROUP_SPACE_NOT_FOUND'
      );
      assert.equal(groups.findById('bad'), null);
      const noteResult = await runReferenceRoute(module, 'POST', '/api/knowledge/notes', {
        id: 'note with space',
        spaceId: 's',
        title: 'Synthetic',
        rawMarkdown: '',
        tagIds: ['a']
      });
      assert.equal(noteResult.status, 201);
      assert.deepEqual(noteResult.body.data.tagIds, ['a']);
      const update = await runReferenceRoute(module, 'PUT', '/api/knowledge/notes/note%20with%20space/tags', {
        tagIds: ['a', 'b', 'a']
      });
      assert.equal(update.status, 200);
      assert.deepEqual(update.body.data.tagIds, ['b']);
      const before = notes.get('note with space');
      await code(
        runReferenceRoute(module, 'PUT', '/api/knowledge/notes/note%20with%20space/tags', { tagIds: ['missing'] }),
        'NOTE_TAG_NOT_FOUND'
      );
      assert.equal(notes.get('note with space'), before);
      assert.deepEqual(writes, ['note with space', 'note with space']);
    });
  check('real PG repository query shape and row mapping stay intact with synthetic db-double only', async () => {
    const calls = [],
      db = {
        tag: {
          findMany: async query => {
            calls.push(query);
            return [
              { id: 'a', spaceId: 's', name: 'A', groupId: null },
              { id: 'b', spaceId: 'other', name: 'B', groupId: null }
            ];
          }
        }
      },
      repository = createPostgresTagRepository({ db }),
      f = fixture(),
      policy = create({ ...f.options, tagRepository: repository });
    await policy.assertNoteReferences({ spaceId: 's', tagIds: ['a', 'a'] });
    assert.deepEqual(calls, [{ where: { id: { in: ['a'] } } }]);
    await code(policy.assertNoteReferences({ spaceId: 's', tagIds: ['b'] }), 'NOTE_TAG_SPACE_MISMATCH');
    assert.deepEqual(calls[1], { where: { id: { in: ['b'] } } });
    assert.deepEqual(await policy.normalizeTagIds(new Set(['a'])), ['a']);
    assert.deepEqual(calls[2], { where: { id: { in: ['a'] } } });
    await policy.assertNoteReferences({ spaceId: 's' });
    assert.deepEqual(await policy.normalizeTagIds(null), []);
    assert.equal(calls.length, 3);
  });

  return rows;
}

// 只调用实际 route/handler 函数并使用合成内存流；没有监听端口或连接数据库。
async function runReferenceRoute(knowledgeModule, method, path, body) {
  const knowledge = createPostgresKnowledgeHttpHandlers({ knowledgeModule });
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  request.method = method;
  request.headers = { 'content-type': 'application/json' };
  const response = {
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(content) {
      this.content = content;
    }
  };
  const route = path.startsWith('/api/knowledge/notes') ? handleNoteRoute : handleTagRoute;
  assert.equal(await route({ request, response, url: new URL(path, 'https://synthetic.invalid'), knowledge }), true);
  return { status: response.status, body: JSON.parse(response.content) };
}

// 每个 seed 都新建对象、迭代器和 getter，不能让旧实现消耗新实现的输入。
export async function observeReference(subject, seed) {
  const variant = Math.floor(seed / 4),
    operation = ['space', 'note', 'group', 'normalize'][seed % 4],
    trace = [],
    marker = { marker: true },
    object = { opaque: true },
    other = { opaque: true },
    symbol = Symbol('tag');
  const encode = value =>
    value === object
      ? 'object:first'
      : value === other
        ? 'object:other'
        : value === symbol
          ? 'symbol:tag'
          : value === undefined
            ? 'undefined'
            : typeof value === 'number' && Number.isNaN(value)
              ? 'NaN'
              : Object.is(value, -0)
                ? '-0'
                : Array.isArray(value)
                  ? value.map(encode)
                  : value;
  const ids = ['a', 'b', 1, '1', object, other, symbol, NaN, 0, false, '', null, undefined],
    id = ids[Math.floor(variant / 3) % ids.length];
  const space = variant % 11 === 0 ? 1 : 's',
    mode = variant % 3,
    failStage = ['none', 'space', 'folder', 'tags', 'group'][Math.floor(variant / 9) % 5],
    failure = ['get', 'throw', 'then-get', 'reject'][Math.floor(variant / 45) % 4];
  let groupReads = 0,
    groupIdReads = 0;
  const rows = [
    { id: 'a', spaceId: space, groupId: 'g' },
    { id: 'b', spaceId: space, groupId: 'g' },
    { id, spaceId: variant % 7 === 0 ? 'foreign' : space, groupId: 'alias' }
  ];
  if (variant % 13 === 0) rows.push({ id: 'a', spaceId: 'foreign', groupId: null });
  const tags = variant % 19 === 0 ? new Array(1) : variant % 17 === 0 ? [] : rows;
  const resultFor = stage =>
    stage === 'space'
      ? variant % 8 === 0
        ? null
        : 42
      : stage === 'folder'
        ? variant % 10 === 0
          ? null
          : {
              get spaceId() {
                trace.push('folder.spaceId');
                return variant % 9 === 0 ? 'foreign' : space;
              }
            }
        : stage === 'tags'
          ? tags
          : variant % 12 === 0
            ? null
            : {
                get selectionMode() {
                  trace.push('group.mode');
                  return variant % 5 === 0 ? 'multiple' : 'single';
                },
                get id() {
                  trace.push(['group.id', ++groupIdReads]);
                  return variant % 7 === 0 ? undefined : variant % 11 === 0 ? NaN : 'g';
                }
              };
  const repositories = {};
  for (const stage of ['space', 'folder', 'tags', 'group']) {
    const repository = {};
    repositories[stage] = repository;
    Object.defineProperty(repository, stage === 'tags' ? 'findByIds' : 'findById', {
      get() {
        trace.push([stage, 'get']);
        if (failStage === stage && failure === 'get') throw marker;
        return function (arg) {
          trace.push([stage, 'call', this === repository, encode(arg)]);
          if (stage === 'group') trace.push(['group-call', ++groupReads]);
          if (failStage === stage && failure === 'throw') throw marker;
          const value = resultFor(stage);
          if (failStage === stage && failure === 'then-get')
            return {
              get then() {
                trace.push([stage, 'then:get']);
                throw marker;
              }
            };
          if (failStage === stage && failure === 'reject')
            return {
              then(_resolve, reject) {
                trace.push([stage, 'reject']);
                reject(marker);
              }
            };
          if (mode === 0) return value;
          if (mode === 1)
            return Promise.resolve().then(() => {
              trace.push([stage, 'promise']);
              return value;
            });
          const thenable = {
            get then() {
              trace.push([stage, 'then:get']);
              return function (resolve) {
                trace.push([stage, 'then:call', this === thenable]);
                resolve(value);
              };
            }
          };
          return thenable;
        };
      }
    });
  }
  const policy = subject.createAsyncNavigationReferencePolicy({
    knowledgeSpaceRepository: repositories.space,
    folderRepository: repositories.folder,
    tagRepository: repositories.tags,
    tagGroupRepository: repositories.group
  });
  const inputIds = variant % 23 === 0 ? null : variant % 29 === 0 ? undefined : [id, 'a', 'b', id];
  let outcome;
  try {
    const promise =
      operation === 'space'
        ? policy.assertSpaceReference(variant % 6 === 0 ? null : space, variant % 14 === 0 ? symbol : 'ENTITY')
        : operation === 'group'
          ? policy.assertTagGroupReference(variant % 6 === 0 ? 0 : 'g', space)
          : operation === 'note'
            ? policy.assertNoteReferences({
                get spaceId() {
                  trace.push('input.space');
                  return space;
                },
                get folderId() {
                  trace.push('input.folder');
                  return variant % 4 === 0 ? null : 'f';
                },
                get tagIds() {
                  trace.push('input.tags');
                  return inputIds;
                }
              })
            : policy.normalizeTagIds(inputIds);
    trace.push(['returned-promise', promise instanceof Promise]);
    const value = await promise;
    outcome = { kind: 'fulfilled', value: encode(value) };
  } catch (error) {
    outcome =
      error === marker
        ? { kind: 'marker' }
        : { kind: error.name, code: error.code, message: error.message, status: error.statusCode };
  }
  return { operation, trace, outcome };
}
