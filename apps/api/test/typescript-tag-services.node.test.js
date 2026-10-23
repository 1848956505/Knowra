import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { Tag } from '../src/modules/knowledge/domain/tag.js';
import { TagGroup } from '../src/modules/knowledge/domain/tag-group.js';
import { createInMemoryTagRepository } from '../src/modules/knowledge/infrastructure/tag-repository.js';
import { createInMemoryTagGroupRepository } from '../src/modules/knowledge/infrastructure/tag-group-repository.js';

const baseline = process.env.KNOWRA_TAG_SERVICES_BASELINE === '1';
const commit = 'ab6e5df8a13d3ea93e7520367b5dc3be085a74cc';
const application = new URL('../src/modules/knowledge/application/', import.meta.url);
async function loadService(name) {
  if (!baseline) return import(new URL(`${name}.js`, application));
  const source = execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/application/${name}.js`], {
    cwd: new URL('../../../', import.meta.url),
    encoding: 'utf8'
  }).replace(/(from\s+['"])(\.[^'"]+)(['"])/g, (_, before, path, after) => {
    return `${before}${new URL(path, application).href}${after}`;
  });
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const tagModule = await loadService('tag-service');
const groupModule = await loadService('tag-group-service');
const { createTagService } = tagModule;
const { createTagGroupService } = groupModule;
const oldDate = '2001-02-03T04:05:06.000Z';
const date = '2040-05-06T07:08:09.000Z';
const tag = (id = 't', extra = {}) => ({
  id,
  spaceId: 's',
  name: `Tag ${id}`,
  groupId: 'g',
  createdAt: oldDate,
  updatedAt: oldDate,
  ...extra
});
const group = (id = 'g', extra = {}) => ({
  id,
  spaceId: 's',
  name: `Group ${id}`,
  selectionMode: 'multiple',
  createdAt: oldDate,
  updatedAt: oldDate,
  ...extra
});
const errorCode =
  (code, statusCode = 409) =>
  error =>
    error.code === code && error.statusCode === statusCode;
const sameError = expected => error => error === expected;
function withDate(run) {
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [date]));
    }
    static now() {
      return new RealDate(date).getTime();
    }
  };
  try {
    return run();
  } finally {
    globalThis.Date = RealDate;
  }
}
const cases = [
  {
    label: '标签',
    factory: createTagService,
    create: 'createTag',
    update: 'updateTag',
    remove: 'deleteTag',
    list: 'listTags',
    write: 'save',
    row: tag,
    Model: Tag,
    prefix: 'TAG',
    repository: createInMemoryTagRepository
  },
  {
    label: '标签组',
    factory: createTagGroupService,
    create: 'createTagGroup',
    update: 'updateTagGroup',
    remove: 'deleteTagGroup',
    list: 'listTagGroups',
    write: 'create',
    row: group,
    Model: TagGroup,
    prefix: 'TAG_GROUP',
    repository: createInMemoryTagGroupRepository
  }
];

test('两个 JS 兼容入口与 TS 导出保持同一函数身份', { skip: baseline }, async () => {
  const tagTs = await import(new URL('tag-service.ts', application));
  const groupTs = await import(new URL('tag-group-service.ts', application));
  assert.deepEqual(Object.keys(tagModule), ['createTagService']);
  assert.deepEqual(Object.keys(groupModule), ['createTagGroupService']);
  assert.equal(createTagService, tagTs.createTagService);
  assert.equal(createTagGroupService, groupTs.createTagGroupService);
});

for (const spec of cases) {
  test(`${spec.label}默认同步服务独立持有仓库，方法集合不扩张`, () => {
    const a = spec.factory();
    const b = spec.factory();
    const methods = [spec.create, spec.update, spec.remove, spec.list];
    if (spec.prefix === 'TAG') methods.push('reorderTags');
    assert.deepEqual(Object.keys(a).sort(), methods.sort());
    assert.deepEqual(a[spec.list](), []);
    const created = a[spec.create]({ id: 'a', spaceId: ' s ', name: ' Name ' });
    assert.ok(created instanceof spec.Model);
    assert.equal(created.then, undefined);
    assert.equal(created.spaceId, 's');
    assert.equal(created.name, 'Name');
    assert.equal(created.code, null);
    assert.equal(created.isSystem, false);
    assert.equal(created.sortOrder, 0);
    assert.equal(created.createdAt, created.updatedAt);
    assert.deepEqual(b[spec.list](), []);
    assert.equal(a[spec.list]()[0], created);
    assert.equal(a[spec.remove]('a'), created);
    assert.deepEqual(a[spec.list](), []);
  });

  test(`${spec.label}工厂默认仅针对 undefined，非法 JS 输入延续原生异常`, () => {
    assert.throws(() => spec.factory(null), TypeError);
    for (const options of [false, 0, '']) assert.deepEqual(spec.factory(options)[spec.list](), []);
    for (const repository of [null, false, 0]) {
      const service = spec.factory({ repository });
      assert.throws(() => service[spec.list](), TypeError);
    }
    const service = spec.factory();
    assert.throws(() => service[spec.create](null), TypeError);
    for (const input of [undefined, false, 1, '', {}]) {
      assert.throws(() => service[spec.create](input), errorCode(`${spec.prefix}_NAME_REQUIRED`, 422));
    }
    assert.deepEqual(service[spec.list](null), []);
    service[spec.create]({ id: 'x', spaceId: 's', name: 'new' });
    assert.throws(() => service[spec.list](null), TypeError);
  });

  test(`${spec.label}创建时只接受 DTO 字段并生成独立 ID、默认时间`, () => {
    withDate(() => {
      const service = spec.factory();
      const created = service[spec.create]({
        spaceId: 's',
        name: ' one ',
        createdAt: oldDate,
        updatedAt: oldDate,
        code: ' code ',
        sortOrder: '7',
        isSystem: 'yes',
        marker: true
      });
      assert.match(created.id, spec.prefix === 'TAG' ? /^tag-one-/ : /^tag-group-one-/);
      assert.equal(created.code, 'code');
      assert.equal(created.sortOrder, 7);
      assert.equal(created.isSystem, true);
      assert.equal(created.createdAt, date);
      assert.equal(created.updatedAt, date);
      assert.equal('marker' in created, false);
      const other = spec.factory()[spec.create]({ spaceId: 's', name: 'one' });
      assert.notEqual(other.id, created.id);
    });
  });

  test(`${spec.label}创建校验先于仓库调用，ID 冲突先于外部引用与名称检查`, () => {
    const calls = [];
    const repository = {
      findById(id) {
        calls.push(['find', id]);
        return {};
      },
      list() {
        calls.push('list');
        return [];
      }
    };
    const service = spec.factory({
      repository,
      validateSpaceReference() {
        calls.push('space');
      },
      validateGroupReference() {
        calls.push('group');
      }
    });
    assert.throws(
      () => service[spec.create]({ id: 'x', name: '', spaceId: '' }),
      errorCode(`${spec.prefix}_NAME_REQUIRED`, 422)
    );
    assert.deepEqual(calls, []);
    assert.throws(
      () => service[spec.create]({ id: 'x', name: 'valid', spaceId: '' }),
      errorCode(`${spec.prefix}_SPACE_REQUIRED`, 422)
    );
    assert.deepEqual(calls, []);
    assert.throws(
      () => service[spec.create]({ id: 'x', name: 'valid', spaceId: 's' }),
      errorCode(`${spec.prefix}_ID_CONFLICT`)
    );
    assert.deepEqual(calls, [['find', 'x']]);
  });

  test(`${spec.label}创建回调参数、捕获时机和无接收者调用保持不变`, () => {
    const calls = [];
    let callbackGets = 0;
    let repositoryGets = 0;
    const repository = {
      findById(id) {
        calls.push(['find', this, id]);
        return null;
      },
      list(options) {
        calls.push(['list', this, options]);
        return [];
      },
      [spec.write](value) {
        calls.push(['write', this, value]);
        return value;
      }
    };
    const options = {
      get repository() {
        repositoryGets += 1;
        return repository;
      },
      get validateSpaceReference() {
        callbackGets += 1;
        return function (...args) {
          calls.push(['space', this, ...args]);
          return false;
        };
      },
      validateGroupReference(...args) {
        calls.push(['group', this, ...args]);
        return false;
      }
    };
    const service = spec.factory(options);
    Object.defineProperty(options, 'repository', { value: null });
    Object.defineProperty(options, 'validateSpaceReference', {
      value() {
        throw new Error('replacement must not run');
      }
    });
    options.validateGroupReference = () => {
      throw new Error('replacement must not run');
    };
    const created = service[spec.create]({ id: 'x', spaceId: 's', name: 'Name', groupId: 'g' });
    assert.equal(callbackGets, 1);
    assert.equal(repositoryGets, 1);
    const expected = [
      ['find', repository, 'x'],
      ['space', undefined, 's']
    ];
    if (spec.prefix === 'TAG') expected.push(['group', undefined, 'g', 's']);
    expected.push(['list', repository, { spaceId: 's' }], ['write', repository, created]);
    assert.deepEqual(calls, expected);
  });

  test(`${spec.label}引用回调抛出原对象且阻止后续检查，非函数回调仅在触及时失败`, () => {
    const marker = { reason: 'callback' };
    const calls = [];
    const repository = {
      findById() {
        calls.push('find');
        return null;
      },
      list() {
        calls.push('list');
        return [];
      }
    };
    const service = spec.factory({
      repository,
      validateSpaceReference() {
        throw marker;
      }
    });
    assert.throws(() => service[spec.create]({ id: 'x', spaceId: 's', name: 'Name' }), sameError(marker));
    assert.deepEqual(calls, ['find']);
    const invalid = spec.factory({ repository, validateSpaceReference: false });
    assert.deepEqual(invalid[spec.list](), []);
    assert.throws(() => invalid[spec.create]({ id: 'x', spaceId: 's', name: 'Name' }), TypeError);
  });

  test(`${spec.label}名称冲突使用同空间、修剪与 Unicode locale 小写，不排除空组或系统项`, () => {
    const repository = spec.repository({ records: [spec.row('other', { name: ' ÄBC ', isSystem: true })] });
    const service = spec.factory({ repository });
    assert.throws(
      () => service[spec.create]({ id: 'x', spaceId: 's', name: ' äbc ' }),
      errorCode(`${spec.prefix}_NAME_CONFLICT`)
    );
    const anotherSpace = service[spec.create]({ id: 'x', spaceId: 'other-space', name: 'äbc' });
    assert.equal(anotherSpace.spaceId, 'other-space');
    assert.equal(service[spec.update]('other', { name: 'äbc' }).name, 'äbc');
    const dotted = 'İ';
    const lowered = dotted.toLocaleLowerCase();
    service[spec.create]({ id: 'unicode', spaceId: 's', name: dotted });
    assert.throws(
      () => service[spec.create]({ id: 'unicode-copy', spaceId: 's', name: lowered }),
      errorCode(`${spec.prefix}_NAME_CONFLICT`)
    );
  });

  test(`${spec.label}更新先查存在再解析 DTO，名称冲突先于移动或模式限制`, () => {
    const calls = [];
    const existing = spec.row('x', { isSystem: true });
    const repository = {
      findById(id) {
        calls.push(['find', id]);
        return id === 'x' ? existing : null;
      },
      list() {
        calls.push('names');
        return [spec.row('other', { name: 'duplicate' })];
      }
    };
    const service = spec.factory({
      repository,
      tagRepository: {
        list() {
          calls.push('tags');
          return [tag('a', { groupId: 'x' })];
        }
      },
      validateGroupReference() {
        calls.push('group');
      }
    });
    assert.throws(() => service[spec.update]('missing', null), errorCode(`${spec.prefix}_NOT_FOUND`, 404));
    assert.deepEqual(calls, [['find', 'missing']]);
    calls.length = 0;
    assert.throws(() => service[spec.update]('x', null), TypeError);
    assert.deepEqual(calls, [['find', 'x']]);
    calls.length = 0;
    assert.throws(
      () => service[spec.update]('x', { name: 'duplicate', groupId: 'other', selectionMode: 'single' }),
      errorCode(`${spec.prefix}_NAME_CONFLICT`)
    );
    assert.deepEqual(calls, [['find', 'x'], 'names']);
  });

  test(`${spec.label}更新不允许 DTO 外字段覆盖身份和创建信息，缺省更新仍构造模型`, () => {
    withDate(() => {
      const original = spec.row('x', { code: 'stable', isSystem: true, marker: 'discarded' });
      const records = [original];
      const service = spec.factory({ repository: spec.repository({ records }) });
      const updated = service[spec.update]('x', {
        id: 'changed',
        spaceId: 'changed',
        code: 'changed',
        isSystem: false,
        createdAt: date,
        updatedAt: 'changed',
        sortOrder: '4',
        marker: true
      });
      assert.ok(updated instanceof spec.Model);
      assert.notEqual(updated, original);
      assert.equal(updated.id, 'x');
      assert.equal(updated.spaceId, 's');
      assert.equal(updated.code, 'stable');
      assert.equal(updated.isSystem, true);
      assert.equal(updated.createdAt, oldDate);
      assert.equal(updated.updatedAt, spec.prefix === 'TAG' ? oldDate : date);
      assert.equal(updated.sortOrder, 4);
      assert.equal('marker' in updated, false);
      assert.equal(records[0], updated);
      const again = service[spec.update]('x');
      assert.notEqual(again, updated);
      assert.ok(again instanceof spec.Model);
    });
  });

  test(`${spec.label}仓库方法在每次调用时动态读取并保留接收者`, () => {
    const calls = [];
    const listResult = { list: 'sentinel' };
    const repository = {};
    const service = spec.factory({ repository });
    Object.defineProperty(repository, 'list', {
      configurable: true,
      get() {
        calls.push('get-list');
        return function (options) {
          calls.push(['list', this, options]);
          return listResult;
        };
      }
    });
    const options = { dynamic: true };
    assert.equal(service[spec.list](options), listResult);
    assert.deepEqual(calls, ['get-list', ['list', repository, options]]);
    Object.defineProperty(repository, 'list', {
      value: function (value) {
        return [this, value];
      },
      writable: true
    });
    assert.deepEqual(service[spec.list](null), [repository, null]);
    const firstDefault = service[spec.list]()[1];
    const secondDefault = service[spec.list]()[1];
    assert.deepEqual(firstDefault, {});
    assert.notEqual(firstDefault, secondDefault);
    repository.list = value => value;
    assert.equal(service[spec.list](false), false);
  });

  test(`${spec.label}删除返回原 find 对象而不返回 delete 值，并保留动态方法接收者`, () => {
    const original = spec.row('x');
    const sentinel = { deleted: true };
    const calls = [];
    const repository = {};
    for (const name of ['findById', 'delete']) {
      Object.defineProperty(repository, name, {
        get() {
          calls.push(`get-${name}`);
          return function (id) {
            calls.push([name, this, id]);
            return name === 'findById' ? original : sentinel;
          };
        }
      });
    }
    const service = spec.factory({ repository });
    assert.equal(service[spec.remove]('lookup-id'), original);
    assert.deepEqual(calls, [
      'get-findById',
      ['findById', repository, 'lookup-id'],
      'get-delete',
      ['delete', repository, 'lookup-id']
    ]);
  });

  test(`${spec.label}服务不拦截仓库 getter、方法或持久化钩子的异常身份`, () => {
    const marker = { reason: 'repository' };
    const service = spec.factory({
      repository: {
        get list() {
          throw marker;
        }
      }
    });
    assert.throws(() => service[spec.list](), sameError(marker));
    const original = spec.row('x');
    const deleting = spec.factory({
      repository: {
        findById: () => original,
        delete() {
          throw marker;
        }
      }
    });
    assert.throws(() => deleting[spec.remove]('x'), sameError(marker));
    const records = [];
    const repository = spec.repository({
      records,
      onChange() {
        throw marker;
      }
    });
    const creating = spec.factory({ repository });
    assert.throws(() => creating[spec.create]({ id: 'x', spaceId: 's', name: 'new' }), sameError(marker));
    assert.equal(records.length, 1);
    assert.ok(records[0] instanceof spec.Model);
  });

  test(`${spec.label}外部验证回调允许同步嵌套调用，内层写入影响外层名称检查`, () => {
    let service;
    let nested = false;
    let inner;
    const calls = [];
    service = spec.factory({
      validateSpaceReference(spaceId) {
        calls.push([this, spaceId]);
        if (!nested) {
          nested = true;
          inner = service[spec.create]({ id: 'inner', spaceId, name: 'same' });
        }
      }
    });
    assert.throws(
      () => service[spec.create]({ id: 'outer', spaceId: 's', name: 'same' }),
      errorCode(`${spec.prefix}_NAME_CONFLICT`)
    );
    assert.deepEqual(calls, [
      [undefined, 's'],
      [undefined, 's']
    ]);
    assert.deepEqual(service[spec.list](), [inner]);
  });

  test(`${spec.label}列表排序过滤仍由仓库处理，原对象可见且服务方法不依赖 this`, () => {
    const a = spec.row('a', { name: '中', sortOrder: 2 });
    const b = spec.row('b', { name: 'Ä', sortOrder: 1 });
    const c = spec.row('c', { name: 'B', sortOrder: 1, spaceId: 'elsewhere' });
    const records = [a, b, c];
    const service = spec.factory({ repository: spec.repository({ records }) });
    const list = service[spec.list];
    assert.deepEqual(list({ spaceId: 's' }), [b, a]);
    assert.equal(list({ spaceId: 's' })[0], b);
    assert.deepEqual(
      list({ spaceId: '' }).map(value => value.id),
      [b, c]
        .sort((x, y) => x.name.localeCompare(y.name))
        .concat(a)
        .map(value => value.id)
    );
    b.name = 'mutated';
    assert.equal(list({ spaceId: 's' })[0].name, 'mutated');
    const remove = service[spec.remove];
    assert.equal(remove('a'), a);
  });
}

test('标签 create/update 忽略 save 返回值，但传入规范模型并允许仓库修改其引用', () => {
  const saved = [];
  const sentinel = { sentinel: true };
  const original = tag('x');
  const repository = {
    findById: id => (id === 'x' ? original : null),
    list: () => [],
    save(value) {
      assert.equal(this, repository);
      saved.push(value);
      value.repositoryMarker = 'mutated';
      return sentinel;
    }
  };
  const service = createTagService({ repository });
  const created = service.createTag({ id: 'new', spaceId: 's', name: ' new ', color: 'AMBER' });
  assert.equal(created, saved[0]);
  assert.notEqual(created, sentinel);
  assert.ok(created instanceof Tag);
  assert.equal(created.color, 'orange');
  assert.equal(created.repositoryMarker, 'mutated');
  const updated = service.updateTag('x', { name: ' updated ', color: 'CYAN' });
  assert.equal(updated, saved[1]);
  assert.equal(updated.color, 'blue');
  assert.equal(updated.updatedAt, oldDate);
});

test('标签组 create/update 原样返回不同仓库值，包括 Promise 和 undefined', () => {
  const saved = [];
  const sentinel = Promise.resolve('created');
  const repository = {
    findById: id => (id === 'x' ? group('x') : null),
    list: () => [],
    create(value) {
      assert.equal(this, repository);
      saved.push(value);
      return sentinel;
    },
    save(value) {
      assert.equal(this, repository);
      saved.push(value);
      return undefined;
    }
  };
  const service = createTagGroupService({ repository });
  assert.equal(service.createTagGroup({ id: 'new', spaceId: 's', name: 'new' }), sentinel);
  assert.equal(service.updateTagGroup('x', {}), undefined);
  assert.ok(saved.every(value => value instanceof TagGroup));
});

test('标签验证空间先于组引用再检查名称，组回调异常保持身份', () => {
  const marker = { group: 'missing' };
  const calls = [];
  const service = createTagService({
    repository: {
      findById() {
        calls.push('find');
        return null;
      },
      list() {
        calls.push('names');
        return [];
      }
    },
    validateSpaceReference(value) {
      calls.push(['space', this, value]);
    },
    validateGroupReference(...values) {
      calls.push(['group', this, ...values]);
      throw marker;
    }
  });
  assert.throws(() => service.createTag({ id: 'x', spaceId: 's', name: 'name' }), sameError(marker));
  assert.deepEqual(calls, ['find', ['space', undefined, 's'], ['group', undefined, null, 's']]);
});

test('系统标签禁止改变组或删除，但同组更新仍验证且缺省组不验证', () => {
  const original = tag('x', { isSystem: true });
  const calls = [];
  const repository = {
    findById: () => original,
    save: value => value,
    delete() {
      calls.push('delete');
    }
  };
  const service = createTagService({
    repository,
    validateGroupReference(...args) {
      calls.push([this, ...args]);
    }
  });
  assert.throws(() => service.updateTag('x', { groupId: null }), errorCode('SYSTEM_TAG_PROTECTED'));
  assert.throws(() => service.updateTag('x', { groupId: 'different' }), errorCode('SYSTEM_TAG_PROTECTED'));
  assert.throws(() => service.deleteTag('x'), errorCode('SYSTEM_TAG_PROTECTED'));
  assert.deepEqual(calls, []);
  service.updateTag('x', {});
  assert.deepEqual(calls, []);
  service.updateTag('x', { groupId: ' g ' });
  assert.deepEqual(calls, [[undefined, 'g', 's']]);
  original.isSystem = false;
  service.updateTag('x', { groupId: null });
  assert.deepEqual(calls.at(-1), [undefined, null, 's']);
});

test('标签组可选 tagRepository 仅在模式确实改变或非系统删除时求值', () => {
  for (const tagRepository of [undefined, null]) {
    const original = group('g');
    const repository = createInMemoryTagGroupRepository({ records: [original] });
    const service = createTagGroupService({ repository, tagRepository });
    assert.equal(service.updateTagGroup('g', { selectionMode: 'single' }).selectionMode, 'single');
    assert.equal(service.deleteTagGroup('g').id, 'g');
  }
  const original = group('g', { isSystem: true });
  const calls = [];
  const marker = { list: 'getter' };
  const tagRepository = {
    get list() {
      calls.push('get-tags');
      throw marker;
    }
  };
  const service = createTagGroupService({
    repository: { findById: () => original, save: value => value },
    tagRepository
  });
  service.updateTagGroup('g', {});
  service.updateTagGroup('g', { selectionMode: 'multiple' });
  assert.throws(() => service.deleteTagGroup('g'), errorCode('SYSTEM_TAG_GROUP_PROTECTED'));
  assert.deepEqual(calls, []);
  assert.throws(() => service.updateTagGroup('g', { selectionMode: 'single' }), sameError(marker));
  original.isSystem = false;
  assert.throws(() => service.deleteTagGroup('g'), sameError(marker));
  assert.deepEqual(calls, ['get-tags', 'get-tags']);
});

test('标签组使用请求 ID 判定占用，动态 tagRepository 方法保持接收者与空间参数', () => {
  const original = group('actual');
  const calls = [];
  const tags = [tag('t', { groupId: 'lookup' })];
  const tagRepository = {
    list(options) {
      calls.push([this, options]);
      return tags;
    }
  };
  const options = {
    repository: { findById: () => original, save: value => value, delete: () => null },
    tagRepository
  };
  const service = createTagGroupService(options);
  options.tagRepository = null;
  assert.throws(() => service.updateTagGroup('lookup', { selectionMode: 'single' }), errorCode('TAG_GROUP_IN_USE'));
  assert.throws(() => service.deleteTagGroup('lookup'), errorCode('TAG_GROUP_NOT_EMPTY'));
  assert.deepEqual(calls, [
    [tagRepository, { spaceId: 's' }],
    [tagRepository, { spaceId: 's' }]
  ]);
  tagRepository.list = () => [tag('t', { groupId: 'actual' })];
  assert.equal(service.updateTagGroup('lookup', { selectionMode: 'single' }).id, 'actual');
  assert.equal(service.deleteTagGroup('lookup'), original);
});

test('标签组缺失 list 方法不被可选链掩盖，空组和非关联标签允许更新删除', () => {
  for (const tagRepository of [false, {}, { list: null }]) {
    const service = createTagGroupService({
      repository: { findById: () => group('g'), save: value => value },
      tagRepository
    });
    assert.equal(service.updateTagGroup('g', {}).id, 'g');
    assert.throws(() => service.updateTagGroup('g', { selectionMode: 'single' }), TypeError);
    assert.throws(() => service.deleteTagGroup('g'), TypeError);
  }
  for (const rows of [[], [tag('unrelated', { groupId: 'elsewhere' })]]) {
    const original = group('g');
    const service = createTagGroupService({
      repository: { findById: () => original, save: value => value, delete: () => null },
      tagRepository: { list: () => rows }
    });
    assert.equal(service.updateTagGroup('g', { selectionMode: 'single' }).selectionMode, 'single');
    assert.equal(service.deleteTagGroup('g'), original);
  }
});

test('标签排序缺省为空，不验证 ID 类型并先完成全部查询与组检查', () => {
  const calls = [];
  const rows = new Map([
    ['a', tag('a')],
    ['b', tag('b', { groupId: 'other' })]
  ]);
  const repository = {
    findById(id) {
      calls.push(['find', id]);
      return rows.get(id);
    },
    save(value) {
      calls.push(['save', value]);
      return value;
    }
  };
  const service = createTagService({ repository });
  assert.deepEqual(service.reorderTags(), []);
  assert.deepEqual(calls, []);
  for (const input of [null, false, 4, 'a', {}]) assert.throws(() => service.reorderTags(input), TypeError);
  assert.throws(() => service.reorderTags(['a', 'missing', 'b']), errorCode('TAG_NOT_FOUND', 404));
  assert.deepEqual(calls, [
    ['find', 'a'],
    ['find', 'missing']
  ]);
  calls.length = 0;
  assert.throws(() => service.reorderTags(['a', 'b']), errorCode('TAG_REORDER_GROUP_MISMATCH'));
  assert.deepEqual(calls, [
    ['find', 'a'],
    ['find', 'b']
  ]);
  calls.length = 0;
  assert.throws(() => service.reorderTags([null]), errorCode('TAG_NOT_FOUND', 404));
  assert.deepEqual(calls, [['find', null]]);
});

test('标签排序按输入顺序保存新模型、更新时间且返回仓库哨兵值', () => {
  withDate(() => {
    const a = tag('a', { sortOrder: 91 });
    const b = tag('b', { sortOrder: 82 });
    const calls = [];
    const sentinels = [{ saved: 'b' }, undefined];
    const repository = {
      findById(id) {
        calls.push(['find', id]);
        return id === 'a' ? a : b;
      },
      save(value) {
        calls.push(['save', this, value]);
        return sentinels[calls.filter(item => item[0] === 'save').length - 1];
      }
    };
    const result = createTagService({ repository }).reorderTags(['b', 'a']);
    assert.deepEqual(result, sentinels);
    assert.equal(result[0], sentinels[0]);
    assert.deepEqual(calls.slice(0, 2), [
      ['find', 'b'],
      ['find', 'a']
    ]);
    const saved = calls.slice(2).map(item => item[2]);
    assert.ok(saved.every(value => value instanceof Tag));
    assert.deepEqual(
      saved.map(value => [value.id, value.sortOrder, value.createdAt, value.updatedAt]),
      [
        ['b', 1, oldDate, date],
        ['a', 2, oldDate, date]
      ]
    );
    assert.ok(calls.slice(2).every(item => item[1] === repository));
    assert.notEqual(saved[0], b);
    assert.equal(b.sortOrder, 82);
    assert.equal(a.sortOrder, 91);
  });
});

test('标签排序重复 ID 不去重，使用写入前已捕获记录并动态重新读取 save', () => {
  const original = tag('a', { sortOrder: 9 });
  const calls = [];
  let saveGets = 0;
  const repository = {
    findById(id) {
      calls.push(['find', id]);
      return original;
    },
    get save() {
      saveGets += 1;
      const call = saveGets;
      return function (value) {
        calls.push(['save', this, value]);
        if (call === 1)
          repository.findById = () => {
            throw new Error('must not look up again');
          };
        return call;
      };
    }
  };
  assert.deepEqual(createTagService({ repository }).reorderTags(['a', 'a']), [1, 2]);
  assert.equal(saveGets, 2);
  assert.deepEqual(calls.slice(0, 2), [
    ['find', 'a'],
    ['find', 'a']
  ]);
  assert.deepEqual(
    calls.slice(2).map(item => item[2].sortOrder),
    [1, 2]
  );
  assert.notEqual(calls[2][2], calls[3][2]);
  assert.equal(original.sortOrder, 9);
});

test('标签排序保留稀疏数组孔洞，Set 仍观察到孔洞产生的 undefined', () => {
  const calls = [];
  let original = tag('a');
  const service = createTagService({
    repository: {
      findById(id) {
        calls.push(id);
        return original;
      },
      save: value => value
    }
  });
  const empty = new Array(3);
  const emptyResult = service.reorderTags(empty);
  assert.equal(emptyResult.length, 3);
  assert.deepEqual(Object.keys(emptyResult), []);
  assert.deepEqual(calls, []);
  const sparse = new Array(2);
  sparse[1] = 'a';
  assert.throws(() => service.reorderTags(sparse), errorCode('TAG_REORDER_GROUP_MISMATCH'));
  assert.deepEqual(calls, ['a']);
  original = tag('a', { groupId: undefined });
  const result = service.reorderTags(sparse);
  assert.equal(result.length, 2);
  assert.equal(0 in result, false);
  assert.equal(result[1].sortOrder, 2);
  assert.equal(result[1].groupId, null);
});

test('标签排序访问数组 getter 后立即查询，读取下一项发生于前项查询之后', () => {
  const calls = [];
  const ids = [];
  for (const [index, id] of ['a', 'b'].entries()) {
    Object.defineProperty(ids, index, {
      get() {
        calls.push(`get-${id}`);
        return id;
      },
      configurable: true
    });
  }
  const service = createTagService({
    repository: {
      findById(id) {
        calls.push(`find-${id}`);
        return tag(id);
      },
      save(value) {
        calls.push(`save-${value.id}`);
        return value;
      }
    }
  });
  service.reorderTags(ids);
  assert.deepEqual(calls, ['get-a', 'find-a', 'get-b', 'find-b', 'save-a', 'save-b']);
  const marker = { getter: true };
  Object.defineProperty(ids, 1, {
    get() {
      throw marker;
    }
  });
  calls.length = 0;
  assert.throws(() => service.reorderTags(ids), sameError(marker));
  assert.deepEqual(calls, ['get-a', 'find-a']);
});

test('标签排序不固定 map 实现，传入查询回调可被直接嵌套调用', () => {
  const original = tag('a');
  const calls = [];
  const input = {
    map(callback) {
      calls.push(['map', this]);
      assert.equal(callback.call({ ignored: true }, 'a'), original);
      return [callback('a')];
    }
  };
  const service = createTagService({
    repository: {
      findById(id) {
        calls.push(['find', id]);
        return original;
      },
      save: value => value
    }
  });
  assert.equal(service.reorderTags(input)[0].id, 'a');
  assert.deepEqual(calls, [
    ['map', input],
    ['find', 'a'],
    ['find', 'a']
  ]);
});

test('标签排序后续持久化回调抛错不回滚已保存项，也不继续保存剩余项', () => {
  const originals = ['a', 'b', 'c'].map(id => tag(id, { sortOrder: 9 }));
  const records = [...originals];
  const marker = { persisted: 2 };
  let writes = 0;
  const repository = createInMemoryTagRepository({
    records,
    onChange(values) {
      assert.equal(values, records);
      writes += 1;
      if (writes === 2) throw marker;
    }
  });
  assert.throws(() => createTagService({ repository }).reorderTags(['a', 'b', 'c']), sameError(marker));
  assert.equal(writes, 2);
  assert.deepEqual(
    records.map(value => value.sortOrder),
    [1, 2, 9]
  );
  assert.notEqual(records[0], originals[0]);
  assert.notEqual(records[1], originals[1]);
  assert.equal(records[2], originals[2]);
});

test('名称检查保留 getter 短路顺序：当前 ID 跳过名称，首个冲突之后不读取', () => {
  for (const spec of cases) {
    const calls = [];
    const own = {
      get id() {
        calls.push('own-id');
        return 'x';
      },
      get name() {
        throw new Error('own name must not be read');
      }
    };
    const match = {
      get id() {
        calls.push('match-id');
        return 'other';
      },
      get name() {
        calls.push('match-name');
        return ' DUPLICATE ';
      }
    };
    const later = {
      get id() {
        throw new Error('later ID must not be read');
      }
    };
    const service = spec.factory({ repository: { findById: () => spec.row('x'), list: () => [own, match, later] } });
    assert.throws(() => service[spec.update]('x', { name: 'duplicate' }), errorCode(`${spec.prefix}_NAME_CONFLICT`));
    assert.deepEqual(calls, ['own-id', 'match-id', 'match-name']);
  }
});

test('标签与标签组更新排除自身的 ID 来源差异不被统一', () => {
  for (const spec of cases) {
    const existing = spec.row('actual', { name: 'same' });
    const service = spec.factory({
      repository: { findById: () => existing, list: () => [existing], save: value => value }
    });
    if (spec.prefix === 'TAG') assert.equal(service[spec.update]('lookup', { name: 'same' }).id, 'actual');
    else assert.throws(() => service[spec.update]('lookup', { name: 'same' }), errorCode('TAG_GROUP_NAME_CONFLICT'));
  }
});

test('验证回调中的仓库方法替换立即影响后续名称检查与保存', () => {
  for (const spec of cases) {
    const calls = [];
    const sentinel = { returned: spec.prefix };
    const repository = {
      findById: () => null,
      list() {
        throw new Error('old list must not run');
      },
      [spec.write]() {
        throw new Error('old write must not run');
      }
    };
    const service = spec.factory({
      repository,
      validateSpaceReference() {
        repository.list = function (options) {
          calls.push(['list', this, options]);
          return [];
        };
        repository[spec.write] = function (value) {
          calls.push(['write', this, value]);
          return sentinel;
        };
      }
    });
    const result = service[spec.create]({ id: 'x', spaceId: 's', name: 'new' });
    assert.equal(calls[0][1], repository);
    assert.deepEqual(calls[0][2], { spaceId: 's' });
    assert.equal(calls[1][1], repository);
    assert.ok(calls[1][2] instanceof spec.Model);
    assert.equal(result, spec.prefix === 'TAG' ? calls[1][2] : sentinel);
  }
});

test('更新标签组验证回调可修改已捕获记录，构造模型时读取修改后的身份字段', () => {
  const original = tag('before', { color: 'neutral' });
  const calls = [];
  const service = createTagService({
    repository: { findById: () => original, save: value => value },
    validateGroupReference(...args) {
      calls.push([this, ...args]);
      original.id = 'after';
      original.spaceId = 'new-space';
      original.color = 'violet';
    }
  });
  const updated = service.updateTag('lookup', { groupId: 'new-group' });
  assert.deepEqual(calls, [[undefined, 'new-group', 's']]);
  assert.equal(updated.id, 'after');
  assert.equal(updated.spaceId, 'new-space');
  assert.equal(updated.color, 'violet');
  assert.equal(updated.groupId, 'new-group');
});

test('缺失记录按真值判定，查找 Promise 不被等待而在创建时触发 ID 冲突', () => {
  for (const spec of cases) {
    for (const absent of [undefined, null, false, 0, '']) {
      const service = spec.factory({ repository: { findById: () => absent } });
      assert.throws(() => service[spec.update]('x', {}), errorCode(`${spec.prefix}_NOT_FOUND`, 404));
      assert.throws(() => service[spec.remove]('x'), errorCode(`${spec.prefix}_NOT_FOUND`, 404));
    }
    const promise = Promise.resolve(null);
    const service = spec.factory({ repository: { findById: () => promise } });
    assert.throws(
      () => service[spec.create]({ id: 'x', spaceId: 's', name: 'new' }),
      errorCode(`${spec.prefix}_ID_CONFLICT`)
    );
  }
});

test('验证回调返回值不参与判断，Promise 回调也不将同步服务转换为异步', () => {
  for (const spec of cases) {
    const calls = [];
    const service = spec.factory({
      validateSpaceReference() {
        calls.push('space');
        return Promise.resolve(false);
      },
      validateGroupReference() {
        calls.push('group');
        return Promise.resolve(false);
      }
    });
    const created = service[spec.create]({ id: 'x', spaceId: 's', name: 'new' });
    assert.ok(created instanceof spec.Model);
    assert.equal(created.then, undefined);
    assert.deepEqual(calls, spec.prefix === 'TAG' ? ['space', 'group'] : ['space']);
  }
});

test('标签与标签组保留各自 DTO 的非法 ID、名称、颜色和模式边界', () => {
  for (const id of [false, 0, '']) {
    assert.throws(
      () => createTagService().createTag({ id, spaceId: 's', name: 'new' }),
      errorCode('TAG_ID_INVALID', 422)
    );
    assert.match(createTagGroupService().createTagGroup({ id, spaceId: 's', name: 'new' }).id, /^tag-group-new-/);
  }
  for (const name of ['x'.repeat(31), 'line\nbreak']) {
    assert.throws(
      () => createTagService().createTag({ id: 'x', spaceId: 's', name }),
      errorCode('TAG_NAME_INVALID', 422)
    );
    assert.equal(createTagGroupService().createTagGroup({ id: 'x', spaceId: 's', name }).name, name);
  }
  assert.throws(
    () => createTagService().createTag({ id: 'x', spaceId: 's', name: 'new', color: null }),
    errorCode('TAG_COLOR_INVALID', 422)
  );
  assert.throws(
    () => createTagGroupService().createTagGroup({ id: 'x', spaceId: 's', name: 'new', selectionMode: null }),
    errorCode('TAG_GROUP_SELECTION_MODE_INVALID', 422)
  );
  const service = createTagService();
  service.createTag({ id: 'x', spaceId: 's', name: 'new' });
  assert.throws(() => service.updateTag('x', { groupId: '' }), errorCode('TAG_GROUP_ID_INVALID', 422));
});

test('服务名称检查信任动态 some 方法，不强制复制数组或把结果限定为布尔值', () => {
  for (const spec of cases) {
    const rows = {
      some(callback) {
        assert.equal(this, rows);
        assert.equal(callback(spec.row('other', { name: 'different' })), false);
        return { truthy: true };
      }
    };
    const service = spec.factory({ repository: { findById: () => null, list: () => rows } });
    assert.throws(
      () => service[spec.create]({ id: 'x', spaceId: 's', name: 'new' }),
      errorCode(`${spec.prefix}_NAME_CONFLICT`)
    );
  }
});
