import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { TagGroup } from '../src/modules/knowledge/domain/tag-group.js';
import { AppError } from '../src/errors/app-error.js';
import { createPostgresKnowledgeHttpHandlers } from '../src/modules/knowledge/http/postgres-async-handlers.js';
import { handleTagRoute } from '../src/modules/knowledge/http/tag-routes.js';
import { createInMemoryTagGroupRepository } from '../src/modules/knowledge/infrastructure/tag-group-repository.js';
import { createInMemoryTagRepository } from '../src/modules/knowledge/infrastructure/tag-repository.js';

// 准确实际父源文与独立固定 oracle；普通测试不读取历史 Git，也不从候选推导预期值。
export const tagGroupParent = '9929c946b1a11daecbc969a8928dcab304a40162';
export const tagGroupFrozenSource = String.raw`import { TagGroup } from '../../domain/tag-group.js';
import { buildCreateTagGroupDto, buildUpdateTagGroupDto } from '../dto/tag-group.dto.js';
import { conflictError, notFoundError } from '../knowledge-errors.js';

export function createAsyncTagGroupService({ repository, tagRepository, validateSpaceReference }) {
  async function requireGroup(id) { const group = await repository.findById(id); if (!group) throw notFoundError('TAG_GROUP_NOT_FOUND', 'Tag group not found'); return group; }
  async function assertName(spaceId, name, currentId = null) { if ((await repository.list({ spaceId })).some((group) => group.id !== currentId && group.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())) throw conflictError('TAG_GROUP_NAME_CONFLICT', 'A tag group with the same name already exists'); }
  return {
    async createTagGroup(input) { const dto = buildCreateTagGroupDto(input); if (await repository.findById(dto.id)) throw conflictError('TAG_GROUP_ID_CONFLICT', 'A tag group with the same id already exists'); await validateSpaceReference?.(dto.spaceId); await assertName(dto.spaceId, dto.name); return repository.create(new TagGroup(dto)); },
    async updateTagGroup(id, updates) { const current = await requireGroup(id); const dto = buildUpdateTagGroupDto(updates); if (dto.name) await assertName(current.spaceId, dto.name, id); if (dto.selectionMode && dto.selectionMode !== current.selectionMode && (await tagRepository.list({ spaceId: current.spaceId })).some((tag) => tag.groupId === id)) throw conflictError('TAG_GROUP_IN_USE', 'Remove or move tags before changing selection mode'); return repository.save(new TagGroup({ ...current, ...dto, id: current.id, spaceId: current.spaceId })); },
    async deleteTagGroup(id) { const current = await requireGroup(id); if (current.isSystem) throw conflictError('SYSTEM_TAG_GROUP_PROTECTED', 'System tag groups cannot be deleted'); if ((await tagRepository.list({ spaceId: current.spaceId })).some((tag) => tag.groupId === id)) throw conflictError('TAG_GROUP_NOT_EMPTY', 'Move or delete tags before deleting this group'); await repository.delete(id); return current; },
    listTagGroups(options = {}) { return repository.list(options); }
  };
}
`;
export const hash = value => createHash('sha256').update(value).digest('hex');
export const group = (extra = {}) => ({
  id: 'g',
  spaceId: 's',
  name: 'Alpha',
  code: null,
  selectionMode: 'multiple',
  isSystem: false,
  sortOrder: 3,
  createdAt: '2000-01-01T00:00:00.000Z',
  updatedAt: '2001-01-01T00:00:00.000Z',
  ...extra
});
export const input = (extra = {}) => ({
  id: 'new',
  spaceId: 's',
  name: '  New Group  ',
  selectionMode: 'multiple',
  ...extra
});
export function fixture(subject, options = {}) {
  const { groups = [], tags = [], mode = 'sync', validate = () => undefined } = options;
  const current = Object.hasOwn(options, 'current') ? options.current : group();
  const created = Object.hasOwn(options, 'created') ? options.created : { result: 'created' };
  const saved = Object.hasOwn(options, 'saved') ? options.saved : { result: 'saved' };
  const deleted = Object.hasOwn(options, 'deleted') ? options.deleted : { result: 'deleted' };
  const log = [],
    seen = {};
  const wrap = x =>
    mode === 'async'
      ? Promise.resolve(x)
      : mode === 'thenable'
        ? {
            then(resolve) {
              log.push('then');
              resolve(x);
            }
          }
        : x;
  const repository = {
    findById(id) {
      assert.equal(this, repository);
      log.push(['find', id]);
      return wrap(current);
    },
    list(options) {
      assert.equal(this, repository);
      log.push(['list', options]);
      seen.listOptions = options;
      return wrap(groups);
    },
    create(value) {
      assert.equal(this, repository);
      log.push('create');
      seen.created = value;
      return wrap(created);
    },
    save(value) {
      assert.equal(this, repository);
      log.push('save');
      seen.saved = value;
      return wrap(saved);
    },
    delete(id) {
      assert.equal(this, repository);
      log.push(['delete', id]);
      return wrap(deleted);
    }
  };
  const tagRepository = {
    list(options) {
      assert.equal(this, tagRepository);
      log.push(['tags', options]);
      return wrap(tags);
    }
  };
  const service = subject.createAsyncTagGroupService({
    repository,
    tagRepository,
    validateSpaceReference:
      validate === null
        ? null
        : space => {
            log.push(['validate', space]);
            return validate(space);
          }
  });
  return { service, repository, tagRepository, log, seen, current, groups, created, saved, deleted };
}
export function rejectCode(promise, code, status, message) {
  return assert.rejects(
    promise,
    e => e instanceof AppError && e.code === code && e.statusCode === status && (!message || e.message === message)
  );
}

export function tagGroupContractCases(subject) {
  const { createAsyncTagGroupService } = subject;
  const rows = [];
  const check = (name, run) => rows.push({ name, run });
  const makeFixture = fixture;
  const fixtureForSubject = options => makeFixture(subject, options);
  check('factory and method arities, async kinds, return key order', () => {
    const f = fixtureForSubject();
    assert.equal(createAsyncTagGroupService.length, 1);
    assert.deepEqual(Object.keys(f.service), ['createTagGroup', 'updateTagGroup', 'deleteTagGroup', 'listTagGroups']);
    assert.deepEqual(
      Object.values(f.service).map(fn => fn.length),
      [1, 2, 1, 0]
    );
    assert.deepEqual(
      Object.values(f.service).map(fn => fn.constructor.name),
      ['AsyncFunction', 'AsyncFunction', 'AsyncFunction', 'Function']
    );
  });
  check('missing/null factory options synchronously throw', () => {
    assert.throws(() => createAsyncTagGroupService(), TypeError);
    assert.throws(() => createAsyncTagGroupService(null), TypeError);
  });
  for (const mode of ['sync', 'async', 'thenable']) {
    check(`${mode}: create order, model normalization, return assimilation`, async () => {
      const f = fixtureForSubject({ current: null, mode });
      assert.equal(await f.service.createTagGroup(input()), f.created);
      assert.ok(f.seen.created instanceof TagGroup);
      assert.equal(f.seen.created.name, 'New Group');
      assert.equal(f.seen.created.id, 'new');
      assert.equal(f.seen.created.spaceId, 's');
      assert.deepEqual(
        f.log.filter(x => x !== 'then'),
        [['find', 'new'], ['validate', 's'], ['list', { spaceId: 's' }], 'create']
      );
    });
    check(`${mode}: update preserves id/space/time, returns save result`, async () => {
      const f = fixtureForSubject({ mode });
      assert.equal(
        await f.service.updateTagGroup('alias', { name: '  Changed  ', id: 'evil', spaceId: 'other', isSystem: true }),
        f.saved
      );
      assert.ok(f.seen.saved instanceof TagGroup);
      assert.equal(f.seen.saved.id, 'g');
      assert.equal(f.seen.saved.spaceId, 's');
      assert.equal(f.seen.saved.name, 'Changed');
      assert.equal(f.seen.saved.updatedAt, '2001-01-01T00:00:00.000Z');
      assert.equal(f.seen.saved.isSystem, false);
      assert.deepEqual(
        f.log.filter(x => x !== 'then'),
        [['find', 'alias'], ['list', { spaceId: 's' }], 'save']
      );
    });
    check(`${mode}: delete awaits result but returns original current identity`, async () => {
      const f = fixtureForSubject({ mode });
      assert.equal(await f.service.deleteTagGroup(null), f.current);
      assert.deepEqual(
        f.log.filter(x => x !== 'then'),
        [
          ['find', null],
          ['tags', { spaceId: 's' }],
          ['delete', null]
        ]
      );
    });
  }
  check('DTO validation precedes first create repository access', async () => {
    const f = fixtureForSubject();
    await rejectCode(f.service.createTagGroup({}), 'TAG_GROUP_NAME_REQUIRED', 422);
    assert.deepEqual(f.log, []);
  });
  check('create duplicate ID precedes validate/name search', async () => {
    const f = fixtureForSubject();
    await rejectCode(
      f.service.createTagGroup(input()),
      'TAG_GROUP_ID_CONFLICT',
      409,
      'A tag group with the same id already exists'
    );
    assert.deepEqual(f.log, [['find', 'new']]);
  });
  check('create falsey find result is not duplicate', async () => {
    for (const current of [false, 0, '', undefined]) {
      const f = fixtureForSubject({ current });
      await f.service.createTagGroup(input());
      assert.equal(f.log.at(-1), 'create');
    }
  });
  check('validate callback is awaited before list and exception identity preserved', async () => {
    const marker = { failure: 'validation' };
    const f = fixtureForSubject({
      current: null,
      validate: () => ({
        then(_resolve, reject) {
          reject(marker);
        }
      })
    });
    await assert.rejects(f.service.createTagGroup(input()), e => e === marker);
    assert.deepEqual(f.log, [
      ['find', 'new'],
      ['validate', 's']
    ]);
  });
  check('null validation is absent and create still proceeds', async () => {
    const f = fixtureForSubject({ current: null, validate: null });
    await f.service.createTagGroup(input());
    assert.deepEqual(f.log, [['find', 'new'], ['list', { spaceId: 's' }], 'create']);
  });
  check('non-callable non-null validator remains TypeError after find', async () => {
    const f = fixtureForSubject({ current: null });
    const s = createAsyncTagGroupService({
      repository: f.repository,
      tagRepository: f.tagRepository,
      validateSpaceReference: 0
    });
    await assert.rejects(s.createTagGroup(input()), TypeError);
    assert.deepEqual(f.log, [['find', 'new']]);
  });
  check('name collision uses trim and locale lowercase', async () => {
    const f = fixtureForSubject({ current: null, groups: [group({ id: 'other', name: ' new GROUP ' })] });
    await rejectCode(f.service.createTagGroup(input()), 'TAG_GROUP_NAME_CONFLICT', 409);
    assert.equal(
      f.log.some(x => x === 'create'),
      false
    );
  });
  check('default currentId=null excludes null id from name collision', async () => {
    const f = fixtureForSubject({ current: null, groups: [group({ id: null, name: 'new group' })] });
    await f.service.createTagGroup(input());
    assert.equal(f.log.at(-1), 'create');
  });
  check('update missing record wins over invalid DTO', async () => {
    const f = fixtureForSubject({ current: null });
    await rejectCode(f.service.updateTagGroup('g', { name: '' }), 'TAG_GROUP_NOT_FOUND', 404);
    assert.deepEqual(f.log, [['find', 'g']]);
  });
  check('update omitted DTO performs save without name/tag reads', async () => {
    const f = fixtureForSubject();
    await f.service.updateTagGroup('g');
    assert.deepEqual(f.log, [['find', 'g'], 'save']);
  });
  check('update current ID skips its own collision', async () => {
    const f = fixtureForSubject({ groups: [group()] });
    await f.service.updateTagGroup('g', { name: 'Alpha' });
    assert.equal(f.log.at(-1), 'save');
  });
  check('update alias compares requested id, not record id', async () => {
    const f = fixtureForSubject({ groups: [group()] });
    await rejectCode(f.service.updateTagGroup('alias', { name: 'Alpha' }), 'TAG_GROUP_NAME_CONFLICT', 409);
  });
  check('selection unchanged skips tag repository', async () => {
    const f = fixtureForSubject({ tags: [{ groupId: 'g' }] });
    await f.service.updateTagGroup('g', { selectionMode: 'multiple' });
    assert.deepEqual(f.log, [['find', 'g'], 'save']);
  });
  check('changed selection linked tag rejects before save', async () => {
    const f = fixtureForSubject({ tags: [{ groupId: 'g' }] });
    await rejectCode(f.service.updateTagGroup('g', { selectionMode: 'single' }), 'TAG_GROUP_IN_USE', 409);
    assert.deepEqual(f.log, [
      ['find', 'g'],
      ['tags', { spaceId: 's' }]
    ]);
  });
  check('changed selection strict groupId equality', async () => {
    const f = fixtureForSubject({ tags: [{ groupId: new String('g') }] });
    await f.service.updateTagGroup('g', { selectionMode: 'single' });
    assert.equal(f.log.at(-1), 'save');
  });
  check('name collision wins over selection in-use check', async () => {
    const f = fixtureForSubject({ groups: [group({ id: 'other' })], tags: [{ groupId: 'g' }] });
    await rejectCode(
      f.service.updateTagGroup('g', { name: 'Alpha', selectionMode: 'single' }),
      'TAG_GROUP_NAME_CONFLICT',
      409
    );
    assert.equal(
      f.log.some(x => Array.isArray(x) && x[0] === 'tags'),
      false
    );
  });
  check('system guard precedes tags and uses truthiness', async () => {
    for (const isSystem of [true, 1, 'false', {}]) {
      const f = fixtureForSubject({ current: group({ isSystem }) });
      await rejectCode(f.service.deleteTagGroup('g'), 'SYSTEM_TAG_GROUP_PROTECTED', 409);
      assert.deepEqual(f.log, [['find', 'g']]);
    }
  });
  check('delete matching tags protects nonempty group', async () => {
    const f = fixtureForSubject({ tags: [{ groupId: 'g' }] });
    await rejectCode(f.service.deleteTagGroup('g'), 'TAG_GROUP_NOT_EMPTY', 409);
    assert.equal(
      f.log.some(x => Array.isArray(x) && x[0] === 'delete'),
      false
    );
  });
  check('delete rejected promise identity is preserved', async () => {
    const marker = { failure: 'delete' };
    const f = fixtureForSubject();
    f.repository.delete = function (id) {
      assert.equal(this, f.repository);
      f.log.push(['delete', id]);
      return {
        then(_resolve, reject) {
          reject(marker);
        }
      };
    };
    await assert.rejects(f.service.deleteTagGroup('g'), e => e === marker);
  });
  check('list is a direct non-async identity passthrough', () => {
    for (const result of [[], Promise.resolve([]), { then() {} }]) {
      const f = fixtureForSubject();
      let arg;
      f.repository.list = function (options) {
        assert.equal(this, f.repository);
        arg = options;
        return result;
      };
      const options = { spaceId: 's', extra: true };
      assert.equal(f.service.listTagGroups(options), result);
      assert.equal(arg, options);
    }
  });
  check('list omitted/undefined options create distinct fresh objects, null forwarded', () => {
    const f = fixtureForSubject();
    const args = [];
    f.repository.list = options => {
      args.push(options);
      return options;
    };
    f.service.listTagGroups();
    f.service.listTagGroups(undefined);
    f.service.listTagGroups(null);
    assert.deepEqual(args, [{}, {}, null]);
    assert.notEqual(args[0], args[1]);
  });
  check('list sync exception is sync, async methods reject same identity', async () => {
    const marker = { failure: 'sync' };
    const f = fixtureForSubject();
    f.repository.list = () => {
      throw marker;
    };
    assert.throws(
      () => f.service.listTagGroups(),
      e => e === marker
    );
    f.repository.findById = () => {
      throw marker;
    };
    await assert.rejects(f.service.updateTagGroup('g', {}), e => e === marker);
  });
  check('missing tag repository is lazy, no added eager validation', async () => {
    const f = fixtureForSubject({ current: null });
    const s = createAsyncTagGroupService({ repository: f.repository });
    await s.createTagGroup(input());
    f.repository.findById = () => group();
    await s.updateTagGroup('g', {});
    await assert.rejects(s.deleteTagGroup('g'), TypeError);
  });
  check('repository methods are reread across async steps', async () => {
    const f = fixtureForSubject({ current: null });
    f.repository.findById = () => {
      f.repository.list = () => {
        f.log.push('replacement-list');
        return [];
      };
      return null;
    };
    await f.service.createTagGroup(input());
    assert.ok(f.log.includes('replacement-list'));
  });
  check('update spread reads then re-reads current id and spaceId', async () => {
    const f = fixtureForSubject();
    const reads = [];
    const current = group();
    Object.defineProperty(current, 'id', {
      enumerable: true,
      get() {
        reads.push('id');
        return 'g';
      }
    });
    Object.defineProperty(current, 'spaceId', {
      enumerable: true,
      get() {
        reads.push('space');
        return 's';
      }
    });
    f.repository.findById = () => current;
    await f.service.updateTagGroup('g', {});
    assert.deepEqual(reads, ['id', 'space', 'id', 'space']);
  });
  check('update does not add fresh updatedAt unlike sync sibling', async () => {
    const f = fixtureForSubject();
    await f.service.updateTagGroup('g', { sortOrder: -2 });
    assert.equal(f.seen.saved.updatedAt, f.current.updatedAt);
    assert.equal(f.seen.saved.sortOrder, -2);
  });
  check('existing create/save outcomes may be arbitrary and are not recast to entity', async () => {
    for (const result of [undefined, null, false, 42, 'saved']) {
      const f = fixtureForSubject({ current: null, created: result });
      assert.equal(await f.service.createTagGroup(input()), result);
      f.repository.findById = () => group();
      f.repository.save = () => result;
      assert.equal(await f.service.updateTagGroup('g', {}), result);
    }
  });
  check('custom some receiver and callback current-id short circuit retained', async () => {
    const f = fixtureForSubject({ current: null });
    let calls = 0;
    const items = {
      some(callback) {
        assert.equal(this, items);
        calls++;
        const row = {
          id: null,
          get name() {
            throw Error('must not read excluded row name');
          }
        };
        return callback(row);
      }
    };
    f.repository.list = () => items;
    await f.service.createTagGroup(input());
    assert.equal(calls, 1);
  });
  check('await find creates asynchronous continuation even for sync port', async () => {
    const f = fixtureForSubject({ current: null });
    const promise = f.service.createTagGroup(input());
    assert.deepEqual(f.log, [['find', 'new']]);
    await promise;
    assert.equal(f.log.at(-1), 'create');
  });

  check('factory destructures each dependency once in original order and keeps original repository', async () => {
    const f = fixtureForSubject({ current: null }),
      reads = [],
      options = {};
    for (const [key, value] of Object.entries({
      repository: f.repository,
      tagRepository: f.tagRepository,
      validateSpaceReference: null
    }))
      Object.defineProperty(options, key, {
        configurable: true,
        get() {
          reads.push(key);
          return value;
        }
      });
    const service = createAsyncTagGroupService(options);
    assert.deepEqual(reads, ['repository', 'tagRepository', 'validateSpaceReference']);
    Object.defineProperty(options, 'repository', {
      value: {
        list() {
          throw Error('replacement');
        }
      }
    });
    await service.createTagGroup(input());
    assert.deepEqual(reads, ['repository', 'tagRepository', 'validateSpaceReference']);
    assert.equal(f.log.at(-1), 'create');
  });
  check('validator is the original naked function with undefined this and one exact argument', async () => {
    const f = fixtureForSubject({ current: null }),
      calls = [];
    const options = {
      repository: f.repository,
      tagRepository: f.tagRepository,
      validateSpaceReference(...args) {
        calls.push({ receiver: this, args });
      }
    };
    const service = createAsyncTagGroupService(options);
    options.validateSpaceReference = () => {
      throw Error('must not reread options');
    };
    await service.createTagGroup(input());
    assert.deepEqual(calls, [{ receiver: undefined, args: ['s'] }]);
  });
  for (const operation of ['updateTagGroup', 'deleteTagGroup'])
    check(operation + ': every falsey required record is absent', async () => {
      for (const current of [null, undefined, false, 0, '', NaN]) {
        const f = fixtureForSubject({ current });
        await rejectCode(f.service[operation]('g', {}), 'TAG_GROUP_NOT_FOUND', 404, 'Tag group not found');
        assert.deepEqual(f.log, [['find', 'g']]);
      }
    });
  check('create treats all truthy find values as an ID conflict, not just objects', async () => {
    for (const current of [1, 'yes', [], {}, Symbol('record')]) {
      const f = fixtureForSubject({ current });
      await rejectCode(f.service.createTagGroup(input()), 'TAG_GROUP_ID_CONFLICT', 409);
      assert.deepEqual(f.log, [['find', 'new']]);
    }
  });
  check('delete allows every falsey system value and strict nonmatching group IDs', async () => {
    for (const isSystem of [null, undefined, false, 0, '', NaN]) {
      const f = fixtureForSubject({
        current: group({ isSystem }),
        tags: [{ groupId: new String('g') }, { groupId: 0 }]
      });
      assert.equal(await f.service.deleteTagGroup('g'), f.current);
      assert.deepEqual(f.log.at(-1), ['delete', 'g']);
    }
  });
  check('name comparison strict identity does not exclude boxed request IDs', async () => {
    const f = fixtureForSubject({ groups: [group()] });
    await rejectCode(f.service.updateTagGroup(new String('g'), { name: 'Alpha' }), 'TAG_GROUP_NAME_CONFLICT', 409);
    assert.equal(f.log.at(-1)[0], 'list');
  });
  check('raw Symbol and object IDs are forwarded without conversion to reads and deletes', async () => {
    for (const id of [
      Symbol('id'),
      {
        toString() {
          throw Error('must not convert');
        }
      },
      0,
      false,
      undefined
    ]) {
      const f = fixtureForSubject();
      assert.equal(await f.service.deleteTagGroup(id), f.current);
      assert.equal(f.log[0][1], id);
      assert.equal(f.log.at(-1)[1], id);
    }
  });
  check('tag some preserves receiver, strict callback result, and truthy nonboolean return', async () => {
    const f = fixtureForSubject(),
      list = {
        some(callback) {
          assert.equal(this, list);
          assert.equal(callback({ groupId: 'g' }), true);
          assert.equal(callback({ groupId: new String('g') }), false);
          return 'truthy';
        }
      };
    f.tagRepository.list = () => list;
    await rejectCode(f.service.deleteTagGroup('g'), 'TAG_GROUP_NOT_EMPTY', 409);
    assert.deepEqual(f.log, [['find', 'g']]);
  });
  check('name some preserves callback order and does not read name of excluded ID', async () => {
    const f = fixtureForSubject({ current: null }),
      trace = [];
    const rows = [
      {
        get id() {
          trace.push('excluded-id');
          return null;
        },
        get name() {
          throw Error('excluded name');
        }
      },
      {
        get id() {
          trace.push('included-id');
          return 'x';
        },
        get name() {
          trace.push('included-name');
          return ' NEW group ';
        }
      },
      {
        get id() {
          throw Error('must short circuit');
        }
      }
    ];
    f.repository.list = () => rows;
    await rejectCode(f.service.createTagGroup(input()), 'TAG_GROUP_NAME_CONFLICT', 409);
    assert.deepEqual(trace, ['excluded-id', 'included-id', 'included-name']);
  });
  check('list result then getter is never inspected or assimilated', () => {
    const f = fixtureForSubject(),
      value = {
        get then() {
          throw Error('must not assimilate');
        }
      };
    f.repository.list = () => value;
    assert.equal(f.service.listTagGroups(), value);
  });
  check('list method is fetched afresh every invocation with original receiver', () => {
    const f = fixtureForSubject(),
      trace = [],
      results = [{ n: 1 }, { n: 2 }];
    let reads = 0;
    Object.defineProperty(f.repository, 'list', {
      get() {
        const index = reads++;
        trace.push(['get', index]);
        return function (options) {
          trace.push(['call', index, this === f.repository, options]);
          return results[index];
        };
      }
    });
    const first = { first: true },
      second = { second: true };
    assert.equal(f.service.listTagGroups(first), results[0]);
    assert.equal(f.service.listTagGroups(second), results[1]);
    assert.deepEqual(trace, [
      ['get', 0],
      ['call', 0, true, first],
      ['get', 1],
      ['call', 1, true, second]
    ]);
  });
  for (const operation of ['createTagGroup', 'updateTagGroup'])
    check(operation + ': nested result thenables assimilate, first resolution wins, receiver retained', async () => {
      const trace = [],
        marker = { result: operation },
        inner = {
          then(resolve) {
            trace.push(['inner', this === inner]);
            resolve(marker);
          }
        };
      const result = {
        get then() {
          trace.push('then:get');
          return function (resolve, reject) {
            trace.push(['then:call', this === result]);
            resolve(inner);
            reject(Error('ignored'));
            throw Error('also ignored');
          };
        }
      };
      const f = fixtureForSubject({
        current: operation === 'createTagGroup' ? null : group(),
        created: result,
        saved: result
      });
      assert.equal(await f.service[operation](operation === 'createTagGroup' ? input() : 'g', {}), marker);
      assert.deepEqual(trace, ['then:get', ['then:call', true], ['inner', true]]);
    });
  check('validator completion must precede list even when resolve is externally held', async () => {
    let release;
    const f = fixtureForSubject({
      current: null,
      validate: () => ({
        then(resolve) {
          release = resolve;
        }
      })
    });
    const pending = f.service.createTagGroup(input());
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    try {
      assert.deepEqual(f.log, [
        ['find', 'new'],
        ['validate', 's']
      ]);
      assert.equal(typeof release, 'function');
    } finally {
      release?.();
    }
    assert.equal(await pending, f.created);
  });
  check('delete completion must precede returning current even when resolve is externally held', async () => {
    let release,
      settled = false;
    const f = fixtureForSubject();
    f.repository.delete = id => {
      f.log.push(['delete', id]);
      return {
        then(resolve) {
          release = resolve;
        }
      };
    };
    const pending = f.service.deleteTagGroup('g');
    pending.then(() => {
      settled = true;
    });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    try {
      assert.equal(settled, false);
      assert.equal(typeof release, 'function');
      assert.deepEqual(f.log, [
        ['find', 'g'],
        ['tags', { spaceId: 's' }],
        ['delete', 'g']
      ]);
    } finally {
      release?.();
    }
    assert.equal(await pending, f.current);
  });
  check('synchronous optional validator absence still produces await continuation', async () => {
    const trace = [],
      f = fixtureForSubject({ current: null, validate: null });
    f.repository.findById = () => {
      trace.push('find');
      queueMicrotask(() => trace.push('after-find'));
      return null;
    };
    f.repository.list = () => {
      trace.push('list');
      return [];
    };
    const pending = f.service.createTagGroup(input());
    queueMicrotask(() => trace.push('caller-microtask'));
    await pending;
    assert.deepEqual(trace, ['find', 'after-find', 'caller-microtask', 'list']);
  });
  check('update rereads mutable getters for spreads then explicit id and space overrides', async () => {
    const f = fixtureForSubject(),
      trace = [],
      current = group();
    let ids = 0,
      spaces = 0;
    Object.defineProperty(current, 'id', {
      enumerable: true,
      get() {
        trace.push('id');
        return ++ids === 1 ? 'spread-id' : 'final-id';
      }
    });
    Object.defineProperty(current, 'spaceId', {
      enumerable: true,
      get() {
        trace.push('space');
        return ++spaces === 1 ? 'spread-space' : 'final-space';
      }
    });
    f.repository.findById = () => current;
    await f.service.updateTagGroup('request-id', {});
    assert.deepEqual(trace, ['id', 'space', 'id', 'space']);
    assert.equal(f.seen.saved.id, 'final-id');
    assert.equal(f.seen.saved.spaceId, 'final-space');
  });
  check('save is fetched before evaluating model argument and record getters', async () => {
    const f = fixtureForSubject(),
      current = group(),
      trace = [];
    // CallExpression 先取 save，再求值 new TagGroup 参数；保留原 JavaScript 的求值次序。
    const original = f.repository.save;
    Object.defineProperty(f.repository, 'save', {
      configurable: true,
      get() {
        trace.push('save:get');
        return original;
      }
    });
    Object.defineProperty(current, 'name', {
      enumerable: true,
      get() {
        trace.push('name:get');
        return 'Alpha';
      }
    });
    f.repository.findById = () => current;
    await f.service.updateTagGroup('g', {});
    assert.deepEqual(trace, ['save:get', 'name:get']);
  });
  for (const [operation, stage, expected] of [
    ['createTagGroup', 'findById', []],
    ['createTagGroup', 'validate', [['find', 'new']]],
    [
      'createTagGroup',
      'list',
      [
        ['find', 'new'],
        ['validate', 's']
      ]
    ],
    [
      'createTagGroup',
      'create',
      [
        ['find', 'new'],
        ['validate', 's'],
        ['list', { spaceId: 's' }]
      ]
    ],
    ['updateTagGroup', 'findById', []],
    ['updateTagGroup', 'list', [['find', 'g']]],
    [
      'updateTagGroup',
      'tags',
      [
        ['find', 'g'],
        ['list', { spaceId: 's' }]
      ]
    ],
    [
      'updateTagGroup',
      'save',
      [
        ['find', 'g'],
        ['list', { spaceId: 's' }],
        ['tags', { spaceId: 's' }]
      ]
    ],
    ['deleteTagGroup', 'findById', []],
    ['deleteTagGroup', 'tags', [['find', 'g']]],
    [
      'deleteTagGroup',
      'delete',
      [
        ['find', 'g'],
        ['tags', { spaceId: 's' }]
      ]
    ]
  ])
    for (const failure of ['getter', 'throw', 'then-getter', 'then-reject'])
      check(`${operation}: ${stage} ${failure} preserves exact error identity and earlier-only order`, async () => {
        const marker = { operation, stage, failure },
          trace = [];
        const fail = () => {
          if (failure === 'throw') throw marker;
          if (failure === 'then-getter')
            return {
              get then() {
                throw marker;
              }
            };
          return {
            then(_resolve, reject) {
              reject(marker);
            }
          };
        };
        const f = fixtureForSubject({
          current: operation === 'createTagGroup' ? null : group(),
          validate: stage === 'validate' ? fail : () => undefined
        });
        let service = f.service;
        if (stage === 'validate' && failure === 'getter') {
          // validator 已在 factory 解构；此项验证其调用本身的原身份异常。
          service = createAsyncTagGroupService({
            repository: f.repository,
            tagRepository: f.tagRepository,
            validateSpaceReference() {
              throw marker;
            }
          });
        } else if (stage !== 'validate') {
          const target = stage === 'tags' ? f.tagRepository : f.repository,
            key = stage === 'tags' ? 'list' : stage;
          Object.defineProperty(target, key, {
            configurable: true,
            get() {
              trace.push('method:get');
              if (failure === 'getter') throw marker;
              return function () {
                assert.equal(this, target);
                trace.push('method:call');
                return fail();
              };
            }
          });
        }
        await assert.rejects(
          service[operation](operation === 'createTagGroup' ? input() : 'g', {
            name: 'Changed',
            selectionMode: 'single'
          }),
          error => error === marker
        );
        const expectedLog = stage === 'validate' && failure !== 'getter' ? [...expected, ['validate', 's']] : expected;
        assert.deepEqual(f.log, expectedLog);
        if (stage !== 'validate')
          assert.deepEqual(trace, failure === 'getter' ? ['method:get'] : ['method:get', 'method:call']);
      });
  for (const [operation, field] of [
    ['updateTagGroup', 'id'],
    ['updateTagGroup', 'spaceId'],
    ['updateTagGroup', 'name'],
    ['deleteTagGroup', 'isSystem'],
    ['deleteTagGroup', 'spaceId']
  ])
    check(operation + ': record getter failure at ' + field + ' is not wrapped or followed by writes', async () => {
      const marker = { field },
        current = group(),
        f = fixtureForSubject({ current });
      Object.defineProperty(current, field, {
        enumerable: true,
        get() {
          throw marker;
        }
      });
      await assert.rejects(f.service[operation]('g', {}), error => error === marker);
      assert.deepEqual(f.log, [['find', 'g']]);
    });

  check('thenable find record resolves to a distinct usable record before update and delete', async () => {
    for (const operation of ['updateTagGroup', 'deleteTagGroup']) {
      const current = group(),
        trace = [],
        placeholder = {
          ...group({ id: 'unresolved' }),
          then(resolve) {
            trace.push(['then', this === placeholder]);
            resolve(current);
          }
        };
      const f = fixtureForSubject({ current: placeholder });
      const value = await f.service[operation]('g', {});
      assert.deepEqual(trace, [['then', true]]);
      if (operation === 'deleteTagGroup') assert.equal(value, current);
      else {
        assert.equal(value, f.saved);
        assert.equal(f.seen.saved.id, 'g');
      }
    }
  });
  check('requireGroup and delete return each repeat then lookup and assimilate final changed thenable', async () => {
    const current = group(),
      trace = [],
      final = { resolved: 'delete-result' };
    let reads = 0;
    Object.defineProperty(current, 'then', {
      get() {
        trace.push(['then:get', ++reads]);
        if (reads < 3) return undefined;
        return function (resolve) {
          trace.push(['then:call', this === current]);
          resolve(final);
        };
      }
    });
    const f = fixtureForSubject({ current });
    assert.equal(await f.service.deleteTagGroup('g'), final);
    assert.deepEqual(trace, [
      ['then:get', 1],
      ['then:get', 2],
      ['then:get', 3],
      ['then:call', true]
    ]);
    assert.deepEqual(f.log, [
      ['find', 'g'],
      ['tags', { spaceId: 's' }],
      ['delete', 'g']
    ]);
  });
  check('input getters throw at create DTO before reads and update DTO after existence', async () => {
    const marker = { input: 'name' },
      invalid = {
        get name() {
          throw marker;
        }
      };
    const f = fixtureForSubject({ current: null });
    await assert.rejects(f.service.createTagGroup(invalid), error => error === marker);
    assert.deepEqual(f.log, []);
    f.repository.findById = id => {
      f.log.push(['find', id]);
      return group();
    };
    await assert.rejects(f.service.updateTagGroup('g', invalid), error => error === marker);
    assert.deepEqual(f.log, [['find', 'g']]);
  });
  check('name some custom truthy nonboolean return rejects even when it skips callback', async () => {
    const f = fixtureForSubject({ current: null });
    const groups = {
      some(callback) {
        assert.equal(this, groups);
        assert.equal(typeof callback, 'function');
        return 'nonboolean';
      }
    };
    f.repository.list = () => groups;
    await rejectCode(f.service.createTagGroup(input()), 'TAG_GROUP_NAME_CONFLICT', 409);
    assert.deepEqual(f.log, [
      ['find', 'new'],
      ['validate', 's']
    ]);
  });
  for (const field of ['repository', 'tagRepository', 'validateSpaceReference'])
    check(
      'factory dependency getter ' + field + ' throws synchronously with original identity and stops destructuring',
      () => {
        const marker = { field },
          trace = [],
          options = {};
        for (const key of ['repository', 'tagRepository', 'validateSpaceReference'])
          Object.defineProperty(options, key, {
            get() {
              trace.push(key);
              if (key === field) throw marker;
              return {};
            }
          });
        assert.throws(
          () => createAsyncTagGroupService(options),
          error => error === marker
        );
        assert.deepEqual(
          trace,
          ['repository', 'tagRepository', 'validateSpaceReference'].slice(
            0,
            ['repository', 'tagRepository', 'validateSpaceReference'].indexOf(field) + 1
          )
        );
      }
    );
  for (const stage of ['id', 'name', 'trim:get', 'trim:call', 'lower:get', 'lower:call'])
    check('name callback ' + stage + ' failure preserves identity and never calls create', async () => {
      const marker = { stage },
        trace = [],
        f = fixtureForSubject({ current: null });
      const trimmed = {
        get toLocaleLowerCase() {
          trace.push('lower:get');
          if (stage === 'lower:get') throw marker;
          return function () {
            trace.push('lower:call');
            assert.equal(this, trimmed);
            if (stage === 'lower:call') throw marker;
            return 'new group';
          };
        }
      };
      const name = {
        get trim() {
          trace.push('trim:get');
          if (stage === 'trim:get') throw marker;
          return function () {
            trace.push('trim:call');
            assert.equal(this, name);
            if (stage === 'trim:call') throw marker;
            return trimmed;
          };
        }
      };
      const row = {
        get id() {
          trace.push('id');
          if (stage === 'id') throw marker;
          return 'different';
        },
        get name() {
          trace.push('name');
          if (stage === 'name') throw marker;
          return name;
        }
      };
      f.repository.list = () => [row];
      await assert.rejects(f.service.createTagGroup(input()), error => error === marker);
      const stages = ['id', 'name', 'trim:get', 'trim:call', 'lower:get', 'lower:call'];
      assert.deepEqual(trace, stages.slice(0, stages.indexOf(stage) + 1));
      assert.deepEqual(f.log, [
        ['find', 'new'],
        ['validate', 's']
      ]);
    });
  for (const stage of ['some:get', 'some:call', 'groupId'])
    check('tag reference callback ' + stage + ' failure preserves identity before delete', async () => {
      const marker = { stage },
        trace = [],
        f = fixtureForSubject();
      const tags = {
        get some() {
          trace.push('some:get');
          if (stage === 'some:get') throw marker;
          return function (callback) {
            trace.push('some:call');
            assert.equal(this, tags);
            if (stage === 'some:call') throw marker;
            return callback({
              get groupId() {
                trace.push('groupId');
                throw marker;
              }
            });
          };
        }
      };
      f.tagRepository.list = () => tags;
      await assert.rejects(f.service.deleteTagGroup('g'), error => error === marker);
      const stages = ['some:get', 'some:call', 'groupId'];
      assert.deepEqual(trace, stages.slice(0, stages.indexOf(stage) + 1));
      assert.deepEqual(f.log, [['find', 'g']]);
    });
  return rows;
}

export async function runTagGroupRoute(service, method, url, body) {
  const knowledge = createPostgresKnowledgeHttpHandlers({ knowledgeModule: { tagGroupService: service } });
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
  const matched = await handleTagRoute({
    request,
    response,
    url: new URL(url, 'https://synthetic.invalid'),
    knowledge
  });
  return { response, matched };
}

// 仅实际函数与全新内存数据，不监听 socket，不连接 PostgreSQL，不实例化真实存储。
export function tagGroupConsumerCases(subject) {
  const rows = [],
    check = (name, run) => rows.push({ name, run });
  for (const mode of ['sync', 'async', 'thenable']) {
    check('real route -> async handler -> service: GET preserves ordered results with ' + mode + ' ports', async () => {
      const groups = [group({ id: 'b' }), group({ id: 'a' })],
        f = fixture(subject, { groups, mode });
      const { response, matched } = await runTagGroupRoute(
        f.service,
        'GET',
        '/api/knowledge/tag-groups?spaceId=s&extra=original'
      );
      assert.equal(matched, true);
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.content), { data: groups });
      assert.deepEqual(
        f.log.filter(row => row !== 'then'),
        [['list', { spaceId: 's', extra: 'original' }]]
      );
    });
    check(
      'real route -> async handler -> service: POST 201 preserves arbitrary repository result with ' + mode + ' ports',
      async () => {
        const f = fixture(subject, { current: null, mode, created: { custom: ['created', 1] } });
        const { response, matched } = await runTagGroupRoute(f.service, 'POST', '/api/knowledge/tag-groups', input());
        assert.equal(matched, true);
        assert.equal(response.status, 201);
        assert.deepEqual(JSON.parse(response.content), { data: { custom: ['created', 1] } });
        assert.deepEqual(
          f.log.filter(row => row !== 'then'),
          [['find', 'new'], ['validate', 's'], ['list', { spaceId: 's' }], 'create']
        );
      }
    );
    check(
      'real route -> async handler -> service: PATCH decodes ID and DELETE returns record with ' + mode + ' ports',
      async () => {
        const f = fixture(subject, { mode, saved: false });
        const update = await runTagGroupRoute(f.service, 'PATCH', '/api/knowledge/tag-groups/alias%20id', {
          sortOrder: 7
        });
        assert.equal(update.matched, true);
        assert.equal(update.response.status, 200);
        assert.deepEqual(JSON.parse(update.response.content), { data: false });
        assert.deepEqual(
          f.log.filter(row => row !== 'then'),
          [['find', 'alias id'], 'save']
        );
        f.log.length = 0;
        const remove = await runTagGroupRoute(f.service, 'DELETE', '/api/knowledge/tag-groups/alias%20id');
        assert.equal(remove.matched, true);
        assert.equal(remove.response.status, 200);
        assert.deepEqual(JSON.parse(remove.response.content), { data: f.current });
        assert.deepEqual(
          f.log.filter(row => row !== 'then'),
          [
            ['find', 'alias id'],
            ['tags', { spaceId: 's' }],
            ['delete', 'alias id']
          ]
        );
      }
    );
  }
  check('real POST route preserves ID conflict before validator or writes', async () => {
    const f = fixture(subject);
    await rejectCode(
      runTagGroupRoute(f.service, 'POST', '/api/knowledge/tag-groups', input()),
      'TAG_GROUP_ID_CONFLICT',
      409
    );
    assert.deepEqual(f.log, [['find', 'new']]);
  });
  check('real PATCH route missing record beats invalid body and DELETE protects system records', async () => {
    const f = fixture(subject, { current: null });
    await rejectCode(
      runTagGroupRoute(f.service, 'PATCH', '/api/knowledge/tag-groups/g', { name: '' }),
      'TAG_GROUP_NOT_FOUND',
      404
    );
    assert.deepEqual(f.log, [['find', 'g']]);
    f.repository.findById = () => group({ isSystem: 'yes' });
    await rejectCode(
      runTagGroupRoute(f.service, 'DELETE', '/api/knowledge/tag-groups/g'),
      'SYSTEM_TAG_GROUP_PROTECTED',
      409
    );
    assert.deepEqual(f.log, [['find', 'g']]);
  });
  for (const mode of ['sync', 'async', 'thenable'])
    check(
      'actual local repositories through ' +
        mode +
        ' adapter and real routes preserve complete CRUD and protected writes',
      async () => {
        const records = [],
          tags = [],
          changes = [],
          trace = [];
        const local = createInMemoryTagGroupRepository({
          records,
          onChange(value) {
            assert.equal(value, records);
            changes.push(value.map(item => item.id));
          }
        });
        const localTags = createInMemoryTagRepository({ records: tags });
        const adapt = (target, label) =>
          Object.fromEntries(
            Object.entries(target).map(([key, fn]) => [
              key,
              function (...args) {
                trace.push([label, key]);
                const value = fn.apply(target, args);
                return mode === 'async'
                  ? Promise.resolve(value)
                  : mode === 'thenable'
                    ? {
                        then(resolve) {
                          resolve(value);
                        }
                      }
                    : value;
              }
            ])
          );
        const service = subject.createAsyncTagGroupService({
          repository: adapt(local, 'groups'),
          tagRepository: adapt(localTags, 'tags'),
          validateSpaceReference(space) {
            assert.equal(space, 's');
            trace.push(['validate', space]);
          }
        });
        const create = await runTagGroupRoute(service, 'POST', '/api/knowledge/tag-groups', input());
        const created = JSON.parse(create.response.content).data;
        assert.equal(create.response.status, 201);
        assert.equal(records.length, 1);
        assert.deepEqual(created, {
          id: 'new',
          spaceId: 's',
          code: null,
          name: 'New Group',
          selectionMode: 'multiple',
          isSystem: false,
          sortOrder: 0,
          createdAt: created.createdAt,
          updatedAt: created.createdAt
        });
        assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T/);
        const before = records[0];
        assert.ok(before instanceof TagGroup);
        const update = await runTagGroupRoute(service, 'PATCH', '/api/knowledge/tag-groups/new', {
          name: ' Changed ',
          sortOrder: -2
        });
        assert.equal(update.response.status, 200);
        const saved = records[0];
        assert.notEqual(saved, before);
        assert.ok(saved instanceof TagGroup);
        assert.deepEqual(JSON.parse(update.response.content), { data: { ...created, name: 'Changed', sortOrder: -2 } });
        assert.equal(saved.updatedAt, before.updatedAt);
        const listed = await runTagGroupRoute(service, 'GET', '/api/knowledge/tag-groups?spaceId=s');
        assert.deepEqual(JSON.parse(listed.response.content), { data: [{ ...saved }] });
        localTags.save({ id: 'tag', spaceId: 's', name: 'Tag', groupId: 'new' });
        await rejectCode(
          runTagGroupRoute(service, 'PATCH', '/api/knowledge/tag-groups/new', { selectionMode: 'single' }),
          'TAG_GROUP_IN_USE',
          409
        );
        await rejectCode(
          runTagGroupRoute(service, 'DELETE', '/api/knowledge/tag-groups/new'),
          'TAG_GROUP_NOT_EMPTY',
          409
        );
        assert.equal(records[0], saved);
        assert.deepEqual(changes, [['new'], ['new']]);
        localTags.delete('tag');
        const removed = await runTagGroupRoute(service, 'DELETE', '/api/knowledge/tag-groups/new');
        assert.deepEqual(JSON.parse(removed.response.content), { data: { ...saved } });
        assert.deepEqual(records, []);
        assert.deepEqual(changes, [['new'], ['new'], []]);
        assert.deepEqual(trace, [
          ['groups', 'findById'],
          ['validate', 's'],
          ['groups', 'list'],
          ['groups', 'create'],
          ['groups', 'findById'],
          ['groups', 'list'],
          ['groups', 'save'],
          ['groups', 'list'],
          ['groups', 'findById'],
          ['tags', 'list'],
          ['groups', 'findById'],
          ['tags', 'list'],
          ['groups', 'findById'],
          ['tags', 'list'],
          ['groups', 'delete']
        ]);
      }
    );
  return rows;
}

// 仅替换依赖边界来刻画 JS 域外 DTO 值；不是实际 DTO 接受这些值的声明。
export function tagGroupBoundaryCases(subject, withBoundary) {
  const rows = [],
    check = (name, run) => rows.push({ name, run });
  const basic = overrides => ({
    createDto: value => value,
    updateDto: value => value ?? {},
    model: value => value,
    ...overrides
  });
  for (const name of [undefined, null, false, 0, '', NaN])
    check('boundary: update falsey dto.name skips collision without new guard: ' + String(name), () =>
      withBoundary(basic(), async () => {
        const f = fixture(subject);
        assert.equal(await f.service.updateTagGroup('g', { name }), f.saved);
        assert.deepEqual(f.log, [['find', 'g'], 'save']);
        assert.equal(f.seen.saved.name, name);
      })
    );
  for (const selectionMode of [undefined, null, false, 0, '', NaN])
    check('boundary: update falsey dto.selectionMode skips tags without new guard: ' + String(selectionMode), () =>
      withBoundary(basic(), async () => {
        const f = fixture(subject);
        assert.equal(await f.service.updateTagGroup('g', { selectionMode }), f.saved);
        assert.deepEqual(f.log, [['find', 'g'], 'save']);
        assert.equal(f.seen.saved.selectionMode, selectionMode);
      })
    );
  check('boundary: mutable DTO and current getters preserve every ordered reread and spread override', () =>
    withBoundary(basic(), async () => {
      const trace = [],
        dto = {},
        current = {},
        values = {
          id: 'record-id',
          spaceId: 'space',
          name: 'Before',
          selectionMode: 'multiple',
          updatedAt: 'old-time'
        };
      for (const [key, value] of Object.entries(values))
        Object.defineProperty(current, key, {
          enumerable: true,
          get() {
            trace.push('current:' + key);
            return value;
          }
        });
      for (const [key, value] of Object.entries({
        name: 'After',
        selectionMode: 'single',
        id: 'spoof',
        spaceId: 'spoof-space'
      }))
        Object.defineProperty(dto, key, {
          enumerable: true,
          get() {
            trace.push('dto:' + key);
            return value;
          }
        });
      const f = fixture(subject, { current });
      assert.equal(await f.service.updateTagGroup('requested', dto), f.saved);
      assert.deepEqual(trace, [
        'dto:name',
        'current:spaceId',
        'dto:name',
        'dto:selectionMode',
        'dto:selectionMode',
        'current:selectionMode',
        'current:spaceId',
        'current:id',
        'current:spaceId',
        'current:name',
        'current:selectionMode',
        'current:updatedAt',
        'dto:name',
        'dto:selectionMode',
        'dto:id',
        'dto:spaceId',
        'current:id',
        'current:spaceId'
      ]);
      assert.deepEqual(f.seen.saved, {
        id: 'record-id',
        spaceId: 'space',
        name: 'After',
        selectionMode: 'single',
        updatedAt: 'old-time'
      });
    })
  );
  check('boundary: create repeats DTO id and space reads in exact sequential positions', () =>
    withBoundary(basic(), async () => {
      const trace = [],
        dto = {};
      for (const [key, value] of Object.entries({ id: 'new', spaceId: 's', name: 'Name' }))
        Object.defineProperty(dto, key, {
          enumerable: true,
          get() {
            trace.push(key);
            return value;
          }
        });
      const f = fixture(subject, { current: null });
      assert.equal(await f.service.createTagGroup(dto), f.created);
      assert.equal(f.seen.created, dto);
      assert.deepEqual(trace, ['id', 'spaceId', 'spaceId', 'name']);
    })
  );
  check(
    'boundary: methods are fetched before DTO/model evaluation, preserve receiver and original model identity',
    () => {
      const trace = [],
        payload = {},
        result = {},
        f = fixture(subject, { current: null, created: result });
      const create = f.repository.create;
      Object.defineProperty(f.repository, 'create', {
        get() {
          trace.push('create:get');
          return create;
        }
      });
      return withBoundary(
        basic({
          model(value) {
            trace.push('model');
            assert.equal(value, payload);
            return payload;
          },
          createDto() {
            trace.push('dto');
            return payload;
          }
        }),
        async () => {
          assert.equal(await f.service.createTagGroup({}), result);
          assert.deepEqual(trace, ['dto', 'create:get', 'model']);
          assert.equal(f.seen.created, payload);
        }
      );
    }
  );
  for (const operation of ['createTagGroup', 'updateTagGroup'])
    check(
      'boundary: ' + operation + ' model exception preserves identity after required reads and before write call',
      () => {
        const marker = { model: operation },
          f = fixture(subject, { current: operation === 'createTagGroup' ? null : group() });
        return withBoundary(
          basic({
            model() {
              throw marker;
            }
          }),
          async () => {
            await assert.rejects(
              f.service[operation](operation === 'createTagGroup' ? input() : 'g', {}),
              error => error === marker
            );
            assert.deepEqual(
              f.log,
              operation === 'createTagGroup'
                ? [
                    ['find', 'new'],
                    ['validate', 's'],
                    ['list', { spaceId: 's' }]
                  ]
                : [['find', 'g']]
            );
          }
        );
      }
    );
  return rows;
}

export async function observeTagGroup(subject, seed) {
  let state = (seed + 54) >>> 0;
  const random = max => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % max;
  };
  const operation = ['createTagGroup', 'updateTagGroup', 'deleteTagGroup', 'listTagGroups'][seed % 4];
  const scenario = Math.floor(seed / 4) % 24,
    events = [],
    marker = { seed },
    seen = {};
  const id = ['g', 'alias', null, undefined, 0, false, new String('g')][random(7)];
  const currentValues = group({ id: 'g', isSystem: scenario === 3 ? 'protected' : false });
  const current = new Proxy(currentValues, {
    get(target, key, receiver) {
      events.push(['current:get', String(key)]);
      if (scenario === 13 && key === 'spaceId') throw marker;
      return Reflect.get(target, key, receiver);
    },
    ownKeys(target) {
      events.push(['current:keys']);
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      events.push(['current:descriptor', String(key)]);
      return Reflect.getOwnPropertyDescriptor(target, key);
    }
  });
  let found = operation === 'createTagGroup' ? null : current;
  if (scenario === 1) found = [null, false, 0, '', undefined, NaN][random(6)];
  if (scenario === 2) found = [true, 1, 'found', {}][random(4)];
  const mode = random(4);
  const stages =
    operation === 'createTagGroup'
      ? ['findById', 'validate', 'list', 'create']
      : operation === 'updateTagGroup'
        ? ['findById', 'list', 'tags', 'save']
        : operation === 'deleteTagGroup'
          ? ['findById', 'tags', 'delete']
          : ['list'];
  const failStage = stages[random(stages.length)];
  const wrap = (value, stage) => {
    if (scenario === 7 && stage === failStage) throw marker;
    if (scenario === 8 && stage === failStage)
      return {
        get then() {
          events.push([stage, 'then:get']);
          throw marker;
        }
      };
    if (scenario === 9 && stage === failStage)
      return {
        then(_resolve, reject) {
          events.push([stage, 'then:reject']);
          reject(marker);
        }
      };
    if (mode === 0) return value;
    if (mode === 1) return Promise.resolve(value);
    const thenable = {
      get then() {
        events.push([stage, 'then:get']);
        return function (resolve) {
          events.push([stage, 'then:call', this === thenable]);
          resolve(
            mode === 2
              ? value
              : {
                  then(next) {
                    events.push([stage, 'nested:then']);
                    next(value);
                  }
                }
          );
        };
      }
    };
    return thenable;
  };
  const rowName = scenario === 4 ? ' NEW group ' : 'Different';
  const nameRow = new Proxy(
    { id: scenario === 5 ? null : 'g', name: rowName },
    {
      get(target, key) {
        events.push(['name-row:get', key]);
        if (scenario === 14 && key === 'name') throw marker;
        return target[key];
      }
    }
  );
  const tagRow = new Proxy(
    { groupId: scenario === 6 ? id : new String('g') },
    {
      get(target, key) {
        events.push(['tag-row:get', key]);
        if (scenario === 15) throw marker;
        return target[key];
      }
    }
  );
  function view(items, label) {
    if (scenario === 16) return null;
    const target = {
      get some() {
        events.push([label, 'some:get']);
        if (scenario === 17) throw marker;
        return function (callback) {
          events.push([label, 'some:call', this === target]);
          if (scenario === 18) throw marker;
          const results = items.map(item => callback(item));
          events.push([label, 'callback-results', results]);
          return scenario === 19 ? 'truthy' : results.some(Boolean);
        };
      }
    };
    return target;
  }
  const created = scenario === 20 ? undefined : { operation: 'created', seed };
  const saved = scenario === 20 ? null : { operation: 'saved', seed };
  const repository = {},
    tagRepository = {};
  function method(target, key, stage, fn) {
    Object.defineProperty(target, key, {
      get() {
        events.push([stage, 'method:get']);
        if (scenario === 10 && stage === failStage) throw marker;
        return function (...args) {
          events.push([
            stage,
            'method:call',
            this === target,
            args.map(value =>
              typeof value === 'object' && value !== null
                ? key === 'create' || key === 'save'
                  ? 'model'
                  : { ...value }
                : value
            )
          ]);
          return fn(...args);
        };
      }
    });
  }
  method(repository, 'findById', 'findById', () => wrap(found, 'findById'));
  const listResult = view([nameRow], 'names');
  method(repository, 'list', 'list', () => wrap(listResult, 'list'));
  method(tagRepository, 'list', 'tags', () => wrap(view([tagRow], 'tags'), 'tags'));
  const modelSummary = value => ({
    keys: Object.keys(value),
    values: Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        key === 'createdAt' || key === 'updatedAt'
          ? operation === 'createTagGroup'
            ? ['generated-iso', typeof nested, /^\d{4}-\d{2}-\d{2}T/.test(nested), value.createdAt === value.updatedAt]
            : nested
          : nested
      ])
    ),
    prototype: Object.getPrototypeOf(value).constructor.name
  });
  method(repository, 'create', 'create', value => {
    seen.created = modelSummary(value);
    return wrap(created, 'create');
  });
  method(repository, 'save', 'save', value => {
    seen.saved = modelSummary(value);
    return wrap(saved, 'save');
  });
  method(repository, 'delete', 'delete', () => wrap({ ignored: 'delete-result' }, 'delete'));
  const options = {};
  const validator = function (space) {
    events.push(['validate:call', this === undefined, space]);
    return wrap(undefined, 'validate');
  };
  for (const [key, value] of Object.entries({
    repository,
    tagRepository,
    validateSpaceReference: scenario === 21 ? null : scenario === 22 ? 0 : validator
  }))
    Object.defineProperty(options, key, {
      get() {
        events.push(['factory:get', key]);
        return value;
      }
    });
  let outcome;
  try {
    const service = subject.createAsyncTagGroupService(options);
    let arg = operation === 'createTagGroup' ? input({ name: scenario === 11 ? '' : 'New Group' }) : id;
    const updates = { name: scenario === 12 ? '' : 'New Group', selectionMode: 'single', sortOrder: -4 };
    if (scenario === 23 && operation === 'createTagGroup') arg = null;
    const result = service[operation](operation === 'listTagGroups' ? { spaceId: 's' } : arg, updates);
    events.push(['after-call', result instanceof Promise]);
    // list 只观察同步身份，不在消费者侧吸收其结果，以免隐藏本来非 async 的合同。
    if (operation === 'listTagGroups')
      outcome = { kind: 'list', promise: result instanceof Promise, sameSyncView: result === listResult };
    else {
      const value = await result;
      outcome = {
        kind: 'return',
        identity: value === current ? 'current' : value === created ? 'created' : value === saved ? 'saved' : null,
        value: value === current ? undefined : value
      };
    }
  } catch (error) {
    outcome =
      error === marker
        ? { kind: 'throw', identity: 'marker' }
        : {
            kind: 'throw',
            name: error.name,
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            keys: Object.keys(error)
          };
  }
  return { operation, events, seen, outcome };
}
