import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';

const baseline = process.env.KNOWRA_TAG_DTO_BASELINE === '1';
const commit = '644208c1d8b93be8106a3377a84efe63bf0c582e';
const root = new URL('../src/modules/knowledge/', import.meta.url);
const load = async (path, extension = 'js') => {
  if (!baseline) return import(new URL(`${path}.js`, root));
  const source = execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/${path}.${extension}`], {
    cwd: new URL('../../../', import.meta.url),
    encoding: 'utf8'
  });
  const javascript = stripTypeScriptTypes(source)
    .replaceAll("'./_shared.js'", JSON.stringify(new URL('application/dto/_shared.js', root).href))
    .replaceAll("'../knowledge-errors.js'", JSON.stringify(new URL('application/knowledge-errors.js', root).href));
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
};
const { buildCreateTagDto: create, buildUpdateTagDto: update } = await load('application/dto/tag.dto');
const { Tag } = await load('domain/tag', 'ts');
const { createInMemoryTagRepository } = await load('infrastructure/tag-repository', 'ts');
const valid = () => ({ id: ' id ', spaceId: ' space ', name: ' name ' });
const invalid = (fn, code, message) =>
  assert.throws(
    fn,
    error => error instanceof AppError && error.code === code && error.message === message && error.statusCode === 422
  );
const invalidColor = fn => invalid(fn, 'TAG_COLOR_INVALID', 'Tag color is invalid');
const withUuid = fn => {
  const original = crypto.randomUUID;
  const events = [];
  crypto.randomUUID = () => {
    events.push('uuid');
    return 'synthetic-uuid';
  };
  syncBuiltinESMExports();
  try {
    return fn(events);
  } finally {
    crypto.randomUUID = original;
    syncBuiltinESMExports();
  }
};
const withHas = (replacement, fn) => {
  const original = Set.prototype.has;
  Set.prototype.has = function (value) {
    if (this.size === 6 && [...this].join('|') === 'neutral|blue|green|orange|red|violet')
      return replacement.call(this, value);
    return original.call(this, value);
  };
  try {
    return fn();
  } finally {
    Set.prototype.has = original;
  }
};
const withAlias = (key, descriptor, fn) => {
  const original = Object.getOwnPropertyDescriptor(Object.prototype, key);
  Object.defineProperty(Object.prototype, key, { configurable: true, ...descriptor });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(Object.prototype, key, original);
    else delete Object.prototype[key];
  }
};
const traced = (values, events) =>
  new Proxy(values, {
    get(target, key, receiver) {
      events.push(String(key));
      return Reflect.get(target, key, receiver);
    }
  });

test('tag DTO JS bridge preserves exact TS export identity', { skip: baseline }, async () => {
  const js = await import(new URL('application/dto/tag.dto.js', root));
  const ts = await import(new URL('application/dto/tag.dto.ts', root));
  assert.deepEqual(Object.keys(js), Object.keys(ts));
  for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
});

test('tag create keeps defaults, normalized fields and property order', () => {
  assert.deepEqual(create(valid()), {
    id: 'id',
    spaceId: 'space',
    name: 'name',
    color: 'neutral',
    groupId: null,
    code: null,
    isSystem: false,
    sortOrder: 0
  });
  assert.deepEqual(create({ ...valid(), groupId: ' group ', code: ' code ', isSystem: 'false', sortOrder: ' 2 ' }), {
    id: 'id',
    spaceId: 'space',
    name: 'name',
    color: 'neutral',
    groupId: 'group',
    code: 'code',
    isSystem: true,
    sortOrder: 2
  });
  assert.deepEqual(Object.keys(create(valid())), [
    'id',
    'spaceId',
    'name',
    'color',
    'groupId',
    'code',
    'isSystem',
    'sortOrder'
  ]);
});

test('tag colors preserve six native values, seven aliases, case folding and no trimming', () => {
  for (const [source, expected] of Object.entries({
    neutral: 'neutral',
    blue: 'blue',
    green: 'green',
    orange: 'orange',
    red: 'red',
    violet: 'violet',
    slate: 'neutral',
    cyan: 'blue',
    amber: 'orange',
    mastery: 'green',
    importance: 'orange',
    purpose: 'blue',
    '#3c68ff': 'blue'
  })) {
    for (const color of [source, source.toUpperCase()]) {
      assert.equal(create({ ...valid(), color }).color, expected);
      assert.deepEqual(update({ color }), { color: expected });
    }
  }
  for (const color of [
    null,
    false,
    0,
    NaN,
    '',
    ' blue ',
    'purple',
    {},
    [],
    Symbol('blue'),
    '__proto__',
    'constructor',
    'toString'
  ]) {
    invalidColor(() => create({ ...valid(), color }));
    invalidColor(() => update({ color }));
  }
  assert.equal(create({ ...valid(), color: ['blue'] }).color, 'blue');
  assert.equal(create({ ...valid(), color: new String('CYAN') }).color, 'blue');
});

test('tag name trim, UTF-16 length and line-break validation keep native boundaries', () => {
  for (const name of ['', ' \n ', undefined, null, 0, false, {}, new String('name')])
    invalid(() => create({ ...valid(), name }), 'TAG_NAME_REQUIRED', 'Tag name is required');
  for (const name of ['x'.repeat(31), '😀'.repeat(16), 'a\nb', 'a\rb'])
    invalid(
      () => create({ ...valid(), name }),
      'TAG_NAME_INVALID',
      'Tag name must contain 1 to 30 characters without line breaks'
    );
  for (const name of ['x'.repeat(30), '😀'.repeat(15), 'a\u2028b', 'a\u2029b', '\u200b'])
    assert.equal(create({ ...valid(), name: ` ${name} ` }).name, name);
  assert.equal(update({ name: '\n name \r' }).name, 'name');
  const original = String.prototype.trim;
  const events = [];
  String.prototype.trim = function () {
    events.push(String(this));
    return original.call(this);
  };
  try {
    update({ name: ' name ', groupId: ' group ' });
  } finally {
    String.prototype.trim = original;
  }
  assert.deepEqual(events, [' name ', ' group ']);
});

test('tag color String conversion happens once for aliases and twice for fallback', () => {
  for (const [values, expected, count] of [
    [['CYAN'], 'blue', 1],
    [['RED', 'GREEN'], 'green', 2],
    [['missing', 'BLUE'], 'blue', 2]
  ]) {
    const events = [];
    let calls = 0;
    const color = {
      [Symbol.toPrimitive](hint) {
        events.push(hint);
        return values[calls++];
      }
    };
    assert.equal(update({ color }).color, expected);
    assert.equal(calls, count);
    assert.deepEqual(events, Array(count).fill('string'));
  }
  const failure = {};
  let calls = 0;
  assert.throws(
    () =>
      update({
        color: {
          toString() {
            if (++calls === 2) throw failure;
            return 'blue';
          }
        }
      }),
    error => error === failure
  );
  assert.equal(calls, 2);
});

test('tag color ordinary inherited alias lookup and getter order remain observable', () => {
  const events = [];
  const color = {
    toString() {
      events.push('string');
      return 'inherited-color';
    }
  };
  withAlias(
    'inherited-color',
    {
      get() {
        events.push('alias');
        return 'green';
      }
    },
    () => assert.equal(update({ color }).color, 'green')
  );
  assert.deepEqual(events, ['string', 'alias']);
  for (const alias of [undefined, null]) {
    events.length = 0;
    let calls = 0;
    withAlias(
      'inherited-color',
      {
        get() {
          events.push('alias');
          return alias;
        }
      },
      () =>
        assert.equal(
          update({
            color: {
              toString() {
                events.push('string');
                return ++calls === 1 ? 'inherited-color' : 'red';
              }
            }
          }).color,
          'red'
        )
    );
    assert.deepEqual(events, ['string', 'alias', 'string']);
  }
  const failure = {};
  withAlias(
    'inherited-color',
    {
      get() {
        throw failure;
      }
    },
    () =>
      assert.throws(
        () => update({ color }),
        error => error === failure
      )
  );
});

test('tag dynamic Set.has preserves receiver, truthiness and inherited value identity', () => {
  const marker = {};
  for (const value of [Object.prototype, Object, marker, false, 0, Symbol('alias')]) {
    const key = value === Object.prototype ? '__proto__' : value === Object ? 'constructor' : 'inherited-color';
    const exercise = () =>
      withHas(
        function (color) {
          assert.equal(color, value);
          assert.deepEqual([...this], ['neutral', 'blue', 'green', 'orange', 'red', 'violet']);
          return { accepted: true };
        },
        () => assert.equal(update({ color: key }).color, value)
      );
    if (key === 'inherited-color') withAlias(key, { value }, exercise);
    else exercise();
  }
  for (const result of [false, 0, '', null, undefined])
    withHas(
      () => result,
      () => invalidColor(() => update({ color: 'blue' }))
    );
  for (const result of [true, 1, 'yes', {}, []])
    withHas(
      () => result,
      () => assert.equal(update({ color: 'unsupported' }).color, 'unsupported')
    );
  const failure = {};
  withHas(
    () => {
      throw failure;
    },
    () =>
      assert.throws(
        () => update({ color: 'blue' }),
        error => error === failure
      )
  );
});

test('tag Set.has getter lookup occurs after both fallback conversions', () => {
  const original = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
  const events = [];
  Object.defineProperty(Set.prototype, 'has', {
    configurable: true,
    get() {
      events.push('get has');
      return function (color) {
        events.push(['call has', color, this.size]);
        return true;
      };
    }
  });
  let result;
  try {
    result = update({
      color: {
        toString() {
          events.push('string');
          return 'BLUE';
        }
      }
    });
  } finally {
    Object.defineProperty(Set.prototype, 'has', original);
  }
  assert.deepEqual(events, ['string', 'string', 'get has', ['call has', 'blue', 6]]);
  assert.equal(result.color, 'blue');
});

test('tag IDs preserve nullish defaults, repeated reads and UUID timing', () =>
  withUuid(events => {
    for (const id of [undefined, null]) assert.equal(create({ ...valid(), id }).id, 'tag-name-synthetic-uuid');
    assert.equal(events.length, 2);
    for (const id of ['', false, 0, NaN, {}, []])
      invalid(() => create({ ...valid(), id }), 'TAG_ID_INVALID', 'Tag id is invalid');
    assert.equal(events.length, 2);
    invalid(() => create({ name: 'name', spaceId: 0 }), 'TAG_SPACE_REQUIRED', 'Tag spaceId is required');
    assert.equal(events.length, 3);
    invalid(() => create({ name: ' '.repeat(2) }), 'TAG_NAME_REQUIRED', 'Tag name is required');
    assert.equal(events.length, 3);
    for (const [id, expected] of [
      [undefined, 1],
      [null, 2],
      ['id', 3]
    ]) {
      let reads = 0;
      create({
        ...valid(),
        get id() {
          reads++;
          return id;
        }
      });
      assert.equal(reads, expected);
    }
  }));

test('tag getter order and repeated update reads preserve undefined and null behavior', () => {
  const events = [];
  create(traced(valid(), events));
  assert.deepEqual(events, ['name', 'id', 'id', 'id', 'spaceId', 'color', 'groupId', 'code', 'isSystem', 'sortOrder']);
  events.length = 0;
  update(traced({ name: ' next ', color: 'cyan', groupId: null, sortOrder: '2' }, events));
  assert.deepEqual(events, ['name', 'name', 'color', 'color', 'groupId', 'groupId', 'sortOrder', 'sortOrder']);
  for (const [key, first, expected] of [
    ['color', 'red', 'neutral'],
    ['groupId', 'group', null],
    ['sortOrder', 2, 0]
  ]) {
    let reads = 0;
    const result = update({
      get [key]() {
        return ++reads === 1 ? first : undefined;
      }
    });
    assert.equal(reads, 2);
    assert.equal(Object.hasOwn(result, key), true);
    assert.equal(result[key], expected);
  }
  let reads = 0;
  invalid(
    () =>
      update({
        get name() {
          return ++reads === 1 ? 'name' : undefined;
        }
      }),
    'TAG_NAME_REQUIRED',
    'Tag name is required'
  );
  assert.equal(reads, 2);
});

test('tag updates omit absent fields, ignore create-only fields and retain nullable group', () => {
  assert.deepEqual(update(), {});
  assert.deepEqual(
    update({
      id: 0,
      spaceId: 0,
      code: 0,
      isSystem: true,
      name: undefined,
      color: undefined,
      groupId: undefined,
      sortOrder: undefined
    }),
    {}
  );
  assert.deepEqual(update({ groupId: null }), { groupId: null });
  invalid(() => update({ groupId: '' }), 'TAG_GROUP_ID_INVALID', 'Tag group id is invalid');
});

test('tag inputs preserve primitive boxing, inherited fields and null TypeErrors', () => {
  for (const input of [undefined, false, 0, NaN, 1n, Symbol('input'), 'text', []]) {
    assert.deepEqual(update(input), {});
    invalid(() => create(input), 'TAG_NAME_REQUIRED', 'Tag name is required');
  }
  for (const fn of [create, update]) assert.throws(() => fn(null), TypeError);
  const input = function inheritedInput() {};
  assert.deepEqual(update(input), { name: 'inheritedInput' });
  assert.equal(create(Object.create(valid())).name, 'name');
  assert.deepEqual(update(Object.create({ color: 'CYAN', groupId: null })), { color: 'blue', groupId: null });
});

test('tag optional IDs and Number/Boolean coercion retain native values and failures', () => {
  for (const [sortOrder, expected] of [
    [undefined, 0],
    [null, 0],
    [false, 0],
    ['', 0],
    [NaN, 0],
    [-0, 0],
    [Infinity, Infinity],
    [2n, 2],
    [{ valueOf: () => 3 }, 3]
  ]) {
    const dto = create({ ...valid(), sortOrder });
    assert.equal(dto.sortOrder, expected);
    assert.equal(update({ sortOrder }).sortOrder, sortOrder === undefined ? undefined : expected);
  }
  for (const isSystem of [undefined, null, false, 0, '', true, 1, 'false', {}, []])
    assert.equal(create({ ...valid(), isSystem }).isSystem, Boolean(isSystem));
  assert.throws(() => create({ ...valid(), sortOrder: Symbol('number') }), TypeError);
  const failure = {};
  assert.throws(
    () =>
      update({
        sortOrder: {
          valueOf() {
            throw failure;
          }
        }
      }),
    error => error === failure
  );
  for (const [key, code, message] of [
    ['groupId', 'TAG_GROUP_ID_INVALID', 'Tag group id is invalid'],
    ['code', 'TAG_CODE_INVALID', 'Tag code is invalid']
  ]) {
    for (const value of [undefined, null]) assert.equal(create({ ...valid(), [key]: value })[key], null);
    for (const value of ['', ' ', false, 0, {}, []]) invalid(() => create({ ...valid(), [key]: value }), code, message);
  }
});

test('tag validation priority and thrown getter identities stay unchanged', () => {
  invalid(() => create({ id: 0, spaceId: 0 }), 'TAG_NAME_REQUIRED', 'Tag name is required');
  invalid(() => create({ name: 'name', id: 0, spaceId: 0 }), 'TAG_ID_INVALID', 'Tag id is invalid');
  invalid(() => create({ ...valid(), spaceId: 0, color: 0 }), 'TAG_SPACE_REQUIRED', 'Tag spaceId is required');
  invalidColor(() => create({ ...valid(), color: 0, groupId: 0 }));
  invalid(() => create({ ...valid(), groupId: 0, code: 0 }), 'TAG_GROUP_ID_INVALID', 'Tag group id is invalid');
  invalid(
    () => create({ ...valid(), code: 0, sortOrder: Symbol('number') }),
    'TAG_CODE_INVALID',
    'Tag code is invalid'
  );
  const failure = {};
  for (const key of ['name', 'id', 'spaceId', 'color', 'groupId', 'code', 'isSystem', 'sortOrder']) {
    const input = valid();
    Object.defineProperty(input, key, {
      get() {
        throw failure;
      }
    });
    assert.throws(
      () => create(input),
      error => error === failure
    );
  }
  for (const key of ['name', 'color', 'groupId', 'sortOrder'])
    assert.throws(
      () =>
        update({
          get [key]() {
            throw failure;
          }
        }),
      error => error === failure
    );
});

test('tag model default and direct in-memory repository retain unvalidated color identity', () => {
  for (const color of [undefined, null, false, 0, {}, [], Symbol('color')]) {
    const model = new Tag({ id: 'id', spaceId: 'space', name: ' name ', color, createdAt: null, updatedAt: null });
    assert.equal(model.color, color === undefined ? 'neutral' : color);
    assert.equal(model.name, 'name');
    assert.equal(model.createdAt, null);
    assert.equal(model.updatedAt, null);
    const records = [];
    const events = [];
    const repository = createInMemoryTagRepository({
      records,
      onChange(value) {
        events.push(value);
      }
    });
    assert.equal(repository.save(model), model);
    assert.equal(repository.findById('id'), model);
    assert.equal(repository.list()[0], model);
    assert.equal(records[0], model);
    assert.equal(events[0], records);
  }
});

test('native DTO rejection is distinct from dynamic override compatibility through model and repository', () => {
  const marker = {};
  withAlias('inherited-color', { value: marker }, () => {
    invalidColor(() => create({ ...valid(), color: 'inherited-color' }));
    const model = withHas(
      () => true,
      () => new Tag(create({ ...valid(), color: 'inherited-color' }))
    );
    assert.equal(model.color, marker);
    const repository = createInMemoryTagRepository();
    assert.equal(repository.save(model), model);
    assert.equal(repository.findById('id').color, marker);
    invalidColor(() => update({ color: 'inherited-color' }));
  });
});
