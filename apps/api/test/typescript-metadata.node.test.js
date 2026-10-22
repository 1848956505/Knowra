import assert from 'node:assert/strict';
import test from 'node:test';

const timestamp = '2026-10-22T00:00:00.000Z';
const models = [
  {
    file: 'knowledge-space',
    name: 'KnowledgeSpace',
    input: { id: ' space ', userId: ' user ', name: ' name ' },
    expected: {
      id: ' space ',
      userId: ' user ',
      name: 'name',
      description: '',
      defaultFlag: true,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    required: ['id', 'userId', 'name']
  },
  {
    file: 'folder',
    name: 'Folder',
    input: { id: ' folder ', spaceId: ' space ', name: ' name ' },
    expected: {
      id: ' folder ',
      spaceId: ' space ',
      name: 'name',
      parentId: null,
      pathCache: '/',
      sortOrder: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      deletionPackage: null
    },
    required: ['id', 'spaceId', 'name']
  },
  {
    file: 'tag-group',
    name: 'TagGroup',
    input: { id: ' group ', spaceId: ' space ', name: ' name ' },
    expected: {
      id: ' group ',
      spaceId: ' space ',
      code: null,
      name: 'name',
      selectionMode: 'multiple',
      isSystem: false,
      sortOrder: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    required: ['id', 'spaceId', 'name']
  },
  {
    file: 'tag',
    name: 'Tag',
    input: { id: ' tag ', spaceId: ' space ', name: ' name ' },
    expected: {
      id: ' tag ',
      spaceId: ' space ',
      name: 'name',
      color: 'neutral',
      groupId: null,
      code: null,
      isSystem: false,
      sortOrder: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    required: ['id', 'spaceId', 'name']
  }
];

for (const { file, name, input, expected, required } of models) {
  test(`${name}: JS/TS exports, complete defaults, field order and JSON round-trip remain stable`, async () => {
    const legacy = await import(`../src/modules/knowledge/domain/${file}.js`);
    const migrated = await import(`../src/modules/knowledge/domain/${file}.ts`);
    assert.deepEqual(Object.keys(legacy), [name]);
    assert.deepEqual(Object.keys(migrated), [name]);
    assert.equal(legacy[name], migrated[name]);
    const Model = migrated[name];
    const value = new Model({ ...input, createdAt: timestamp });
    assert.ok(value instanceof legacy[name]);
    assert.deepEqual(Object.keys(value), Object.keys(expected));
    assert.deepEqual({ ...value }, expected);
    assert.deepEqual(new Model(JSON.parse(JSON.stringify(value))), value);
    const automatic = new Model(input);
    assert.equal(new Date(automatic.createdAt).toISOString(), automatic.createdAt);
    assert.equal(automatic.updatedAt, automatic.createdAt);
    const nullCreated = new Model({ ...input, createdAt: null });
    assert.equal(nullCreated.createdAt, null);
    assert.equal(nullCreated.updatedAt, null);
    assert.equal(new Model({ ...input, createdAt: timestamp, updatedAt: null }).updatedAt, null);
    assert.equal(new Model({ ...input, createdAt: timestamp, updatedAt: 'custom' }).updatedAt, 'custom');
    for (const field of required) {
      for (const invalid of [undefined, null, '', ' \t\n']) {
        assert.throws(() => new Model({ ...input, [field]: invalid }), new RegExp(`${field} is required`));
      }
      assert.throws(() => new Model({ ...input, [field]: 1 }), TypeError);
    }
    const customTrim = { trim: () => 'synthetic' };
    const unusual = new Model({ ...input, id: customTrim, name: customTrim });
    assert.equal(unusual.id, customTrim);
    assert.equal(unusual.name, 'synthetic');
  });
}

test('KnowledgeSpace trims descriptions and preserves Boolean conversion and trim failures', async () => {
  const { KnowledgeSpace } = await import('../src/modules/knowledge/domain/knowledge-space.ts');
  const input = { id: 's', userId: 'u', name: ' name ' };
  assert.equal(new KnowledgeSpace({ ...input, description: ' description ' }).description, 'description');
  assert.equal(new KnowledgeSpace({ ...input, description: { trim: () => 'custom' } }).description, 'custom');
  for (const description of [null, 0, false, {}]) {
    assert.throws(() => new KnowledgeSpace({ ...input, description }), TypeError);
  }
  for (const [defaultFlag, expected] of [
    [null, false],
    ['', false],
    [0, false],
    ['false', true],
    [{}, true]
  ]) {
    assert.equal(new KnowledgeSpace({ ...input, defaultFlag }).defaultFlag, expected);
  }
});

test('Folder preserves uncoerced sortOrder, open values and deletionPackage reference identity', async () => {
  const { Folder } = await import('../src/modules/knowledge/domain/folder.ts');
  const input = { id: 'f', spaceId: 's', name: 'folder' };
  for (const sortOrder of ['2', 'bad', null, true, Infinity, -Infinity, NaN, -0, { synthetic: true }]) {
    assert.equal(new Folder({ ...input, sortOrder }).sortOrder, sortOrder);
  }
  const deletionPackage = { nested: ['original'] };
  const parentId = { synthetic: 'parent' };
  const folder = new Folder({ ...input, parentId, pathCache: '', deletedAt: 'deleted', deletionPackage });
  assert.equal(folder.parentId, parentId);
  assert.equal(folder.pathCache, '');
  assert.equal(folder.deletedAt, 'deleted');
  assert.equal(folder.deletionPackage, deletionPackage);
  deletionPackage.nested.push('changed');
  assert.deepEqual(folder.deletionPackage.nested, ['original', 'changed']);
  assert.equal(new Folder({ ...input, pathCache: null }).pathCache, null);
});

test('Tag and TagGroup retain Number-or-zero sortOrder and Boolean system flags', async () => {
  const { Tag } = await import('../src/modules/knowledge/domain/tag.ts');
  const { TagGroup } = await import('../src/modules/knowledge/domain/tag-group.ts');
  const input = { id: 't', spaceId: 's', name: 'name' };
  for (const Model of [Tag, TagGroup]) {
    for (const [sortOrder, expected] of [
      ['2', 2],
      ['bad', 0],
      [null, 0],
      [true, 1],
      [false, 0],
      ['', 0],
      [Infinity, Infinity],
      [-Infinity, -Infinity],
      [NaN, 0],
      [-0, 0],
      [-2, -2],
      [{ valueOf: () => 3 }, 3]
    ]) {
      assert.equal(new Model({ ...input, sortOrder }).sortOrder, expected);
    }
    assert.throws(() => new Model({ ...input, sortOrder: Symbol('synthetic') }), TypeError);
    for (const [isSystem, expected] of [
      [null, false],
      ['', false],
      [0, false],
      ['false', true],
      [{}, true]
    ]) {
      assert.equal(new Model({ ...input, isSystem }).isSystem, expected);
    }
    for (const code of ['', ' code ', null, { synthetic: true }]) {
      assert.equal(new Model({ ...input, code }).code, code);
    }
  }
});

test('Tag keeps unrestricted color and groupId values without trimming or cloning', async () => {
  const { Tag } = await import('../src/modules/knowledge/domain/tag.ts');
  for (const value of ['', ' custom ', null, 0, false, { synthetic: true }]) {
    const tag = new Tag({ id: 't', spaceId: 's', name: 'tag', color: value, groupId: value });
    assert.equal(tag.color, value);
    assert.equal(tag.groupId, value);
  }
});

test('TagGroup accepts only exact single and multiple selection modes', async () => {
  const { TagGroup } = await import('../src/modules/knowledge/domain/tag-group.ts');
  const input = { id: 'g', spaceId: 's', name: 'group' };
  for (const selectionMode of ['single', 'multiple']) {
    assert.equal(new TagGroup({ ...input, selectionMode }).selectionMode, selectionMode);
  }
  for (const selectionMode of [null, '', ' single ', 'SINGLE', 'custom', false, 0, {}]) {
    assert.throws(() => new TagGroup({ ...input, selectionMode }), /Tag group selectionMode is invalid/);
  }
});

test('default tag definitions are deeply frozen while built groups are fresh mutable model inputs', async () => {
  const legacy = await import('../src/modules/knowledge/domain/default-tag-groups.js');
  const migrated = await import('../src/modules/knowledge/domain/default-tag-groups.ts');
  const { TagGroup } = await import('../src/modules/knowledge/domain/tag-group.ts');
  assert.deepEqual(Object.keys(legacy), ['DEFAULT_TAG_GROUP_DEFINITIONS', 'buildDefaultTagGroups']);
  assert.deepEqual(Object.keys(migrated), Object.keys(legacy));
  for (const key of Object.keys(legacy)) assert.equal(legacy[key], migrated[key]);
  const { DEFAULT_TAG_GROUP_DEFINITIONS: definitions, buildDefaultTagGroups } = migrated;
  assert.deepEqual(definitions, [
    { code: 'ordinary', name: '普通标签', selectionMode: 'multiple' },
    { code: 'mastery', name: '掌握程度', selectionMode: 'single' },
    { code: 'importance', name: '重要程度', selectionMode: 'single' },
    { code: 'purpose', name: '用途', selectionMode: 'multiple' }
  ]);
  assert.ok(Object.isFrozen(definitions));
  for (const definition of definitions) {
    assert.ok(Object.isFrozen(definition));
    assert.deepEqual(Object.keys(definition), ['code', 'name', 'selectionMode']);
    assert.throws(() => {
      definition.name = 'changed';
    }, TypeError);
  }
  assert.throws(() => definitions.push({}), TypeError);
  const groups = buildDefaultTagGroups(' synthetic-space ');
  const nextGroups = buildDefaultTagGroups(' synthetic-space ');
  assert.ok(!Object.isFrozen(groups));
  assert.notEqual(groups, nextGroups);
  assert.deepEqual(groups, nextGroups);
  for (const [index, group] of groups.entries()) {
    assert.ok(!Object.isFrozen(group));
    assert.notEqual(group, nextGroups[index]);
    assert.deepEqual(Object.keys(group), ['id', 'spaceId', 'code', 'name', 'selectionMode', 'isSystem', 'sortOrder']);
    assert.deepEqual(group, {
      id: `tag-group- synthetic-space -${definitions[index].code}`,
      spaceId: ' synthetic-space ',
      ...definitions[index],
      isSystem: true,
      sortOrder: index + 1
    });
    const model = new TagGroup({ ...group, createdAt: timestamp });
    assert.equal(model.id, group.id);
    assert.equal(model.spaceId, group.spaceId);
    assert.equal(model.code, group.code);
    assert.equal(model.selectionMode, group.selectionMode);
    assert.equal(model.isSystem, true);
    assert.equal(model.sortOrder, index + 1);
  }
  groups[0].name = 'changed';
  groups.push({ synthetic: true });
  assert.equal(groups.length, 5);
  assert.equal(nextGroups[0].name, '普通标签');
  for (const spaceId of ['', null, undefined, 0]) {
    const built = buildDefaultTagGroups(spaceId);
    assert.equal(built[0].spaceId, spaceId);
    assert.equal(built[0].id, `tag-group-${spaceId}-ordinary`);
  }
});
