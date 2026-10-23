import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';

const baseline = process.env.KNOWRA_METADATA_DTO_BASELINE === '1';
const commit = '2579b4e27051994c1c26715a292967dd9fb01916';
const root = new URL('../src/modules/knowledge/', import.meta.url);
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const load = async (path, extension = 'js') => {
  if (!baseline) return import(new URL(`${path}.js`, root));
  const source = execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/${path}.${extension}`], {
    cwd: new URL('../../../', import.meta.url),
    encoding: 'utf8'
  });
  return import(
    dataUrl(
      stripTypeScriptTypes(source)
        .replaceAll("'./_shared.js'", JSON.stringify(new URL('application/dto/_shared.js', root).href))
        .replaceAll("'../knowledge-errors.js'", JSON.stringify(new URL('application/knowledge-errors.js', root).href))
    )
  );
};
const folder = await load('application/dto/folder.dto');
const group = await load('application/dto/tag-group.dto');
const { TagGroup } = await load('domain/tag-group', 'ts');
const { createInMemoryTagGroupRepository } = await load('infrastructure/tag-group-repository', 'ts');
const createFolder = folder.buildCreateFolderDto;
const updateFolder = folder.buildUpdateFolderDto;
const createGroup = group.buildCreateTagGroupDto;
const updateGroup = group.buildUpdateTagGroupDto;
const valid = () => ({ id: ' id ', spaceId: ' space ', name: ' name ' });
const invalid = (fn, code, message) =>
  assert.throws(
    fn,
    error => error instanceof AppError && error.code === code && error.message === message && error.statusCode === 422
  );
const withUuid = fn => {
  const original = crypto.randomUUID;
  crypto.randomUUID = () => 'synthetic-uuid';
  syncBuiltinESMExports();
  try {
    return fn();
  } finally {
    crypto.randomUUID = original;
    syncBuiltinESMExports();
  }
};
const withIncludes = (replacement, fn) => {
  const original = Array.prototype.includes;
  Array.prototype.includes = function (value, ...rest) {
    if (this.length === 2 && this[0] === 'single' && this[1] === 'multiple') return replacement.call(this, value);
    return original.call(this, value, ...rest);
  };
  try {
    return fn();
  } finally {
    Array.prototype.includes = original;
  }
};
const traced = (values, events) =>
  new Proxy(values, {
    get(target, key, receiver) {
      events.push(String(key));
      return Reflect.get(target, key, receiver);
    }
  });

test('metadata DTO JS bridges preserve exact TS exports', { skip: baseline }, async () => {
  for (const path of ['application/dto/folder.dto', 'application/dto/tag-group.dto']) {
    const js = await import(new URL(`${path}.js`, root));
    const ts = await import(new URL(`${path}.ts`, root));
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
});

test('folder create preserves normalization, property order and unvalidated path identities', () => {
  assert.deepEqual(createFolder(valid()), { id: 'id', spaceId: 'space', parentId: null, name: 'name', pathCache: '/' });
  for (const pathCache of [undefined, null, false, 0, NaN, 4n, Symbol('path'), {}, [], () => 1]) {
    const dto = createFolder({ ...valid(), parentId: ' parent ', pathCache });
    assert.equal(dto.parentId, 'parent');
    assert.equal(dto.pathCache, pathCache ?? '/');
    assert.deepEqual(Object.keys(dto), ['id', 'spaceId', 'parentId', 'name', 'pathCache']);
  }
});

test('folder IDs use nullish default rather than truthiness', () =>
  withUuid(() => {
    for (const id of [undefined, null]) assert.equal(createFolder({ ...valid(), id }).id, 'folder-name-synthetic-uuid');
    for (const id of ['', false, 0, NaN, {}, []])
      invalid(() => createFolder({ ...valid(), id }), 'FOLDER_ID_INVALID', 'Folder id is invalid');
    assert.equal(createFolder({ ...valid(), id: ' provided ' }).id, 'provided');
  }));

test('folder update preserves omission, null and arbitrary path values without coercion', () => {
  assert.deepEqual(updateFolder(), {});
  assert.deepEqual(
    updateFolder({ id: {}, spaceId: {}, name: undefined, parentId: undefined, pathCache: undefined }),
    {}
  );
  assert.deepEqual(updateFolder({ name: ' next ', parentId: null, pathCache: null }), {
    name: 'next',
    parentId: null,
    pathCache: null
  });
  const marker = {
    toString() {
      throw new Error('must not coerce');
    }
  };
  assert.equal(updateFolder({ pathCache: marker }).pathCache, marker);
  let reads = 0;
  const dto = updateFolder({
    get pathCache() {
      return ++reads === 1 ? '/' : undefined;
    }
  });
  assert.equal(reads, 2);
  assert.equal(Object.hasOwn(dto, 'pathCache'), true);
  assert.equal(dto.pathCache, undefined);
});

test('folder getter order and repeated reads remain unchanged', () => {
  const events = [];
  createFolder(traced({ ...valid(), parentId: 'parent', pathCache: '/' }, events));
  assert.deepEqual(events, ['name', 'id', 'spaceId', 'parentId', 'pathCache']);
  events.length = 0;
  updateFolder(traced({ name: ' next ', parentId: null, pathCache: 0 }, events));
  assert.deepEqual(events, ['name', 'name', 'parentId', 'parentId', 'pathCache', 'pathCache']);
  events.length = 0;
  let count = 0;
  invalid(
    () =>
      updateFolder({
        get name() {
          events.push('name');
          return ++count === 1 ? 'ok' : null;
        }
      }),
    'FOLDER_NAME_REQUIRED',
    'Folder name is required'
  );
  assert.deepEqual(events, ['name', 'name']);
});

test('metadata DTOs preserve primitive boxing, inherited properties and null errors', () => {
  for (const value of [undefined, false, 0, NaN, 1n, Symbol('x'), 'text', []]) {
    assert.deepEqual(updateFolder(value), {});
    assert.deepEqual(updateGroup(value), {});
    invalid(() => createFolder(value), 'FOLDER_NAME_REQUIRED', 'Folder name is required');
    invalid(() => createGroup(value), 'TAG_GROUP_NAME_REQUIRED', 'Tag group name is required');
  }
  for (const fn of [createFolder, updateFolder, createGroup, updateGroup]) assert.throws(() => fn(null), TypeError);
  const input = function boxedInput() {};
  assert.deepEqual(updateFolder(input), { name: 'boxedInput' });
  assert.deepEqual(updateGroup(input), { name: 'boxedInput' });
  assert.equal(createFolder(Object.create(valid())).name, 'name');
  assert.equal(createGroup(Object.create(valid())).name, 'name');
  assert.deepEqual(updateGroup(Object.create({ name: ' next ', sortOrder: '2' })), { name: 'next', sortOrder: 2 });
});

test('folder validation priority and thrown getter identities are preserved', () => {
  invalid(() => createFolder({ id: 0, spaceId: 0 }), 'FOLDER_NAME_REQUIRED', 'Folder name is required');
  invalid(() => createFolder({ name: 'ok', id: 0, spaceId: 0 }), 'FOLDER_ID_INVALID', 'Folder id is invalid');
  invalid(
    () => createFolder({ name: 'ok', id: 'id', spaceId: 0, parentId: 0 }),
    'FOLDER_SPACE_REQUIRED',
    'Folder spaceId is required'
  );
  invalid(() => createFolder({ ...valid(), parentId: 0 }), 'FOLDER_PARENT_INVALID', 'Folder parentId is invalid');
  const failure = {};
  for (const key of ['name', 'id', 'spaceId', 'parentId', 'pathCache']) {
    const input = valid();
    Object.defineProperty(input, key, {
      get() {
        throw failure;
      }
    });
    assert.throws(
      () => createFolder(input),
      error => error === failure
    );
  }
});

test('tag group create keeps defaults, property order and Number/Boolean semantics', () => {
  assert.deepEqual(createGroup(valid()), {
    id: 'id',
    spaceId: 'space',
    code: null,
    name: 'name',
    selectionMode: 'multiple',
    isSystem: false,
    sortOrder: 0
  });
  for (const [sortOrder, expected] of [
    [undefined, 0],
    [null, 0],
    [false, 0],
    ['', 0],
    [' 2 ', 2],
    [NaN, 0],
    [-0, 0],
    [Infinity, Infinity],
    [2n, 2],
    [{ valueOf: () => 3 }, 3]
  ]) {
    const result = createGroup({ ...valid(), sortOrder, isSystem: 'false', code: ' code ', selectionMode: 'single' });
    assert.equal(result.sortOrder, expected);
    assert.equal(result.isSystem, true);
    assert.equal(result.code, 'code');
    assert.equal(result.selectionMode, 'single');
    assert.deepEqual(Object.keys(result), ['id', 'spaceId', 'code', 'name', 'selectionMode', 'isSystem', 'sortOrder']);
  }
  assert.throws(() => createGroup({ ...valid(), sortOrder: Symbol('x') }), TypeError);
});

test('tag group IDs retain truthy decision and double getter reads', () =>
  withUuid(() => {
    for (const id of [undefined, null, false, 0, NaN, '', 0n])
      assert.equal(createGroup({ ...valid(), id }).id, 'tag-group-name-synthetic-uuid');
    for (const id of [true, 1, {}, []])
      invalid(() => createGroup({ ...valid(), id }), 'TAG_GROUP_ID_INVALID', 'Tag group id is invalid');
    let reads = 0;
    const dto = createGroup({
      ...valid(),
      get id() {
        return ++reads === 1 ? 'first' : ' second ';
      }
    });
    assert.equal(dto.id, 'second');
    assert.equal(reads, 2);
  }));

test('tag group selection does not trim or coerce its input', () => {
  for (const selectionMode of [
    null,
    false,
    0,
    1n,
    '',
    ' single ',
    'SINGLE',
    {},
    [],
    new String('single'),
    Symbol('single')
  ]) {
    invalid(
      () => createGroup({ ...valid(), selectionMode }),
      'TAG_GROUP_SELECTION_MODE_INVALID',
      'Tag group selectionMode must be single or multiple'
    );
  }
  const marker = {
    toString() {
      throw new Error('must not coerce');
    }
  };
  invalid(
    () => updateGroup({ selectionMode: marker }),
    'TAG_GROUP_SELECTION_MODE_INVALID',
    'Tag group selectionMode must be single or multiple'
  );
  assert.equal(createGroup({ ...valid(), selectionMode: undefined }).selectionMode, 'multiple');
});

test('tag group dynamic includes keeps this, arbitrary return truthiness and unknown value identity', () => {
  const marker = {};
  const events = [];
  const result = withIncludes(
    function (value) {
      events.push([this.slice(), value]);
      return 'accepted';
    },
    () => ({
      created: createGroup({ ...valid(), selectionMode: marker }),
      updated: updateGroup({ selectionMode: marker }),
      model: new TagGroup({ ...valid(), selectionMode: marker })
    })
  );
  assert.equal(result.created.selectionMode, marker);
  assert.equal(result.updated.selectionMode, marker);
  assert.equal(result.model.selectionMode, marker);
  assert.equal(events.length, 3);
  for (const [receiver, value] of events) {
    assert.deepEqual(receiver, ['single', 'multiple']);
    assert.equal(value, marker);
  }
  invalid(
    () =>
      withIncludes(
        () => 0,
        () => createGroup(valid())
      ),
    'TAG_GROUP_SELECTION_MODE_INVALID',
    'Tag group selectionMode must be single or multiple'
  );
  const failure = {};
  assert.throws(
    () =>
      withIncludes(
        () => {
          throw failure;
        },
        () => updateGroup({ selectionMode: 'single' })
      ),
    error => error === failure
  );
  const original = Array.prototype.includes;
  try {
    Array.prototype.includes = null;
    assert.throws(() => createGroup(valid()), TypeError);
  } finally {
    Array.prototype.includes = original;
  }
});

test('tag group update uses only selected fields and preserves repeated undefined reads', () => {
  assert.deepEqual(updateGroup({ ...valid(), code: 0, isSystem: true, selectionMode: 'single', sortOrder: '7' }), {
    name: 'name',
    selectionMode: 'single',
    sortOrder: 7
  });
  let reads = 0;
  assert.deepEqual(
    updateGroup({
      get selectionMode() {
        return ++reads === 1 ? 'single' : undefined;
      }
    }),
    { selectionMode: 'multiple' }
  );
  assert.equal(reads, 2);
  reads = 0;
  assert.deepEqual(
    updateGroup({
      get sortOrder() {
        return ++reads === 1 ? 4 : undefined;
      }
    }),
    { sortOrder: 0 }
  );
  assert.equal(reads, 2);
});

test('tag group getter and coercion order preserves early validation and error identity', () => {
  const events = [];
  createGroup(
    traced(
      {
        ...valid(),
        code: 'code',
        selectionMode: 'single',
        isSystem: {},
        sortOrder: {
          [Symbol.toPrimitive](hint) {
            events.push(hint);
            return 3;
          }
        }
      },
      events
    )
  );
  assert.deepEqual(events, ['name', 'id', 'id', 'spaceId', 'code', 'selectionMode', 'isSystem', 'sortOrder', 'number']);
  events.length = 0;
  updateGroup(traced({ name: 'name', selectionMode: 'single', sortOrder: 4 }, events));
  assert.deepEqual(events, ['name', 'name', 'selectionMode', 'selectionMode', 'sortOrder', 'sortOrder']);
  const failure = {};
  assert.throws(
    () =>
      createGroup({
        ...valid(),
        sortOrder: {
          valueOf() {
            throw failure;
          }
        }
      }),
    error => error === failure
  );
  invalid(
    () => createGroup({ ...valid(), code: 0, selectionMode: 0 }),
    'TAG_GROUP_CODE_INVALID',
    'Tag group code is invalid'
  );
  invalid(
    () =>
      createGroup({
        ...valid(),
        selectionMode: 0,
        get sortOrder() {
          throw failure;
        }
      }),
    'TAG_GROUP_SELECTION_MODE_INVALID',
    'Tag group selectionMode must be single or multiple'
  );
});

test('historical tag group repository keeps unvalidated selection values and callback identity', () => {
  const marker = {};
  const events = [];
  const records = [];
  const repository = createInMemoryTagGroupRepository({
    records,
    onChange(value) {
      events.push(value);
    }
  });
  const record = { id: 'id', spaceId: 'space', name: 'name', selectionMode: marker };
  assert.equal(repository.create(record), record);
  assert.equal(repository.findById('id'), record);
  assert.equal(repository.list()[0].selectionMode, marker);
  assert.equal(repository.save(record), record);
  assert.equal(records[0], record);
  assert.deepEqual(events, [records, records]);
  const model = withIncludes(
    () => true,
    () => new TagGroup(createGroup({ ...valid(), selectionMode: marker }))
  );
  assert.equal(repository.save(model), model);
  assert.equal(repository.findById('id').selectionMode, marker);
});

test('persisted selection validation stays strict unless its original dynamic includes is replaced', async () => {
  const { createEmptyLocalState, validatePersistedLocalState, LOCAL_DATA_SCHEMA_VERSION } =
    await import('../src/infrastructure/local-data-schema.js');
  for (const selectionMode of [undefined, null, false, 0, '', 'legacy', {}, []]) {
    const state = createEmptyLocalState();
    state.spaces.push({ id: 'space', userId: 'owner', name: 'space' });
    state.tagGroups.push({ id: 'group', spaceId: 'space', name: 'group', selectionMode });
    const document = { schemaVersion: LOCAL_DATA_SCHEMA_VERSION, ...state };
    invalid(
      () => validatePersistedLocalState(document),
      'STORAGE_SNAPSHOT_INVALID',
      'TagGroup group has invalid selectionMode'
    );
    const loaded = withIncludes(
      () => true,
      () => validatePersistedLocalState(document)
    );
    assert.deepEqual(loaded.tagGroups[0].selectionMode, selectionMode);
    const repository = createInMemoryTagGroupRepository({ records: loaded.tagGroups });
    assert.equal(repository.findById('group'), loaded.tagGroups[0]);
  }
});
