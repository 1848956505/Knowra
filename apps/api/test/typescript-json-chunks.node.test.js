import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

// 普通测试只使用当前检出和独立固定期望；只有显式基线模式读取历史对象。
const baseline = process.env.KNOWRA_JSON_CHUNKS_BASELINE === '1';
const commit = '738c837654903a3537ec0bac696b06643ca09906';
const infrastructure = new URL('../src/infrastructure/', import.meta.url);
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let serializerUrl = new URL('json-chunks.js', infrastructure).href;
let atomicUrl = new URL('atomic-json-file.js', infrastructure).href;
if (baseline) {
  const historical = file =>
    execFileSync('git', ['show', `${commit}:apps/api/src/infrastructure/${file}`], {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8'
    });
  serializerUrl = dataModule(historical('json-chunks.js'));
  // 执行真实旧消费者，只重映射其 serializer import，不复制或模拟消费循环。
  const atomicSource = historical('atomic-json-file.js');
  assert.equal(atomicSource.split("'./json-chunks.js'").length, 2);
  atomicUrl = dataModule(atomicSource.replace("'./json-chunks.js'", JSON.stringify(serializerUrl)));
}
const { jsonChunks } = await import(serializerUrl);
const { writeJsonFileAtomically } = await import(atomicUrl);
const chunks = value => [...jsonChunks(value)];
const text = value => chunks(value).join('');
const sameThrown = (operation, reason) => {
  let threw = false;
  try {
    operation();
  } catch (actual) {
    threw = true;
    assert.ok(Object.is(actual, reason));
  }
  assert.equal(threw, true);
};
const withProperty = (target, key, descriptor, operation) => {
  const original = Object.getOwnPropertyDescriptor(target, key);
  try {
    Object.defineProperty(target, key, { configurable: true, ...descriptor });
    return operation();
  } finally {
    if (original) Object.defineProperty(target, key, original);
    else delete target[key];
  }
};
const withChangingBigIntJSON = (operation, finalValue = undefined) => {
  let gets = 0;
  const events = [];
  return withProperty(
    BigInt.prototype,
    'toJSON',
    {
      get() {
        const number = ++gets;
        events.push(['get', number]);
        return function (key) {
          events.push(['call', number, key, typeof this, this.valueOf()]);
          return number < 3 ? this.valueOf() : finalValue;
        };
      }
    },
    () => operation(events)
  );
};
const observeAncestors = (values, operation) => {
  const add = Set.prototype.add;
  const remove = Set.prototype.delete;
  const events = [];
  try {
    Set.prototype.add = function (value) {
      if (values.includes(value)) events.push(['add', values.indexOf(value)]);
      return add.call(this, value);
    };
    Set.prototype.delete = function (value) {
      if (values.includes(value)) events.push(['delete', values.indexOf(value)]);
      return remove.call(this, value);
    };
    operation(events);
  } finally {
    Set.prototype.add = add;
    Set.prototype.delete = remove;
  }
  return events;
};
const targetPath = path.join(path.sep, 'json-chunks-no-real-io', 'data.json');
const temporaryPath = path.join(path.dirname(targetPath), `.data.json.${process.pid}-fixed.tmp`);
const backupPath = path.join(path.dirname(targetPath), `.data.json.${process.pid}-fixed.bak`);
const fakeFileSystem = (failures = {}) => {
  const events = [];
  const files = new Set();
  const record = (name, args) => {
    events.push([name, ...args]);
    if (Object.hasOwn(failures, name)) throw failures[name];
  };
  const fileSystem = {
    mkdirSync(...args) {
      record('mkdir', args);
    },
    openSync(...args) {
      record('open', args);
      files.add(args[0]);
      return 17;
    },
    writeFileSync(...args) {
      record('write', args);
    },
    fsyncSync(...args) {
      record('fsync', args);
    },
    closeSync(...args) {
      record('close', args);
    },
    renameSync(from, to) {
      record('rename', [from, to]);
      files.delete(from);
      files.add(to);
    },
    existsSync(file) {
      record('exists', [file]);
      return files.has(file);
    },
    rmSync(file, options) {
      record('remove', [file, options]);
      files.delete(file);
    }
  };
  return {
    fileSystem,
    events,
    files,
    write(value, options = {}) {
      return writeJsonFileAtomically(targetPath, value, {
        fileSystem,
        createUniqueId: () => 'fixed',
        ...options
      });
    }
  };
};
const operationNames = fake => fake.events.map(event => event[0]);
const writtenBuffers = fake => fake.events.filter(event => event[0] === 'write').map(event => event[2]);

// 所有用例都串行运行；临时原型/内建修改均以 finally 恢复原 descriptor。
test('JS bridge exposes only the identical TS generator', { skip: baseline }, async () => {
  const bridge = await import(new URL('json-chunks.js', infrastructure));
  const implementation = await import(new URL('json-chunks.ts', infrastructure));
  assert.deepEqual(Object.keys(bridge), ['jsonChunks']);
  assert.deepEqual(Object.keys(implementation), ['jsonChunks']);
  assert.equal(bridge.jsonChunks, implementation.jsonChunks);
});

test('primitive roots keep fixed scalar chunks including nonfinite numbers and negative zero', () => {
  for (const [value, expected] of [
    [null, 'null'],
    [false, 'false'],
    [true, 'true'],
    [0, '0'],
    [-0, '0'],
    [1.25, '1.25'],
    [NaN, 'null'],
    [Infinity, 'null'],
    [-Infinity, 'null'],
    ['', '""'],
    ['中文😀', '"中文😀"']
  ])
    assert.deepEqual(chunks(value), [expected]);
});

test('omitted roots and omitted arguments yield nothing rather than an undefined chunk', () => {
  for (const value of [undefined, Symbol('root'), () => 1, function named() {}]) {
    assert.deepEqual(chunks(value), []);
  }
  assert.deepEqual([...jsonChunks()], []);
});

test('unknown object classes retain enumerable-property behavior without JSON input validation', () => {
  const bare = Object.create(null);
  bare.a = 1;
  for (const [value, expected] of [
    [{}, '{}'],
    [[], '[]'],
    [new Map([['a', 1]]), '{}'],
    [new Set([1]), '{}'],
    [/x/g, '{}'],
    [new Error('hidden'), '{}'],
    [Object(Symbol('boxed')), '{}'],
    [bare, '{\n  "a": 1\n}'],
    [new Uint8Array([3, 4]), '{\n  "0": 3,\n  "1": 4\n}']
  ])
    assert.equal(text(value), expected);
});

test('nested records retain exact chunk boundaries, indentation and omitted properties', () => {
  assert.deepEqual(chunks({ a: [1, { b: true }], skip: undefined, n: null }), [
    '{',
    '\n  "a": ',
    '[',
    '\n    ',
    '1',
    ',\n    ',
    '{',
    '\n      "b": ',
    'true',
    '\n    ',
    '}',
    '\n  ',
    ']',
    ',\n  "n": ',
    'null',
    '\n',
    '}'
  ]);
});

test('string values and property names retain native escapes and lone-surrogate escaping', () => {
  assert.equal(
    text({ 'a"\n': '\\"\b\f\n\r\t\u0000\ud800' }),
    '{\n  "a\\"\\n": "\\\\\\"\\b\\f\\n\\r\\t\\u0000\\ud800"\n}'
  );
});

test('generator construction and return or throw before first next perform no reads', () => {
  let reads = 0;
  const value = {
    get toJSON() {
      reads++;
      throw new Error('must remain lazy');
    }
  };
  const iterator = jsonChunks(value);
  assert.equal(reads, 0);
  assert.deepEqual(iterator.return('stop'), { value: 'stop', done: true });
  const reason = {};
  sameThrown(() => jsonChunks(value).throw(reason), reason);
  assert.equal(reads, 0);
});

test('object opener suspends before Object.keys and property access', () => {
  const events = [];
  const value = new Proxy(
    { a: 1 },
    {
      ownKeys(target) {
        events.push('keys');
        return Reflect.ownKeys(target);
      },
      get(target, key, receiver) {
        if (key === 'a') events.push('a');
        return Reflect.get(target, key, receiver);
      }
    }
  );
  const iterator = jsonChunks(value);
  assert.deepEqual(iterator.next('ignored'), { value: '{', done: false });
  assert.deepEqual(events, []);
  assert.deepEqual(iterator.next(), { value: '\n  "a": ', done: false });
  assert.deepEqual(events, ['keys', 'a']);
  assert.deepEqual([...iterator], ['1', '\n', '}']);
});

test('array separator suspends before index getter and early return does not read it', () => {
  let reads = 0;
  const value = [1];
  Object.defineProperty(value, '0', {
    get() {
      reads++;
      return 1;
    }
  });
  const iterator = jsonChunks(value);
  assert.deepEqual(iterator.next(), { value: '[', done: false });
  assert.deepEqual(iterator.next(), { value: '\n  ', done: false });
  assert.equal(reads, 0);
  assert.deepEqual(iterator.return('stopped'), { value: 'stopped', done: true });
  assert.equal(reads, 0);
  assert.deepEqual(iterator.next(), { value: undefined, done: true });
});

test('throwing into a suspended generator preserves identity and closes without later reads', () => {
  const reason = Symbol('injected');
  let reads = 0;
  const iterator = jsonChunks({
    get later() {
      reads++;
      return 1;
    }
  });
  assert.deepEqual(iterator.next(), { value: '{', done: false });
  sameThrown(() => iterator.throw(reason), reason);
  assert.equal(reads, 0);
  assert.deepEqual(iterator.next(), { value: undefined, done: true });
});

test('toJSON receives the original receiver and root, object-property or array-index key', () => {
  const events = [];
  const make = label => ({
    toJSON(key) {
      events.push([label, key, this]);
      return label;
    }
  });
  const root = make('root');
  const property = make('property');
  const index = make('index');
  assert.equal(text(root), '"root"');
  assert.equal(text({ property, array: [index] }), '{\n  "property": "property",\n  "array": [\n    "index"\n  ]\n}');
  assert.deepEqual(events, [
    ['root', '', root],
    ['property', 'property', property],
    ['index', '0', index]
  ]);
  const callable = () => 1;
  callable.toJSON = () => {
    assert.fail('functions do not enter normalization');
  };
  assert.deepEqual(chunks(callable), []);
});

test('toJSON is looked up twice and invokes the changing second function with the receiver', () => {
  const events = [];
  let gets = 0;
  const value = {
    get toJSON() {
      const number = ++gets;
      events.push(['get', number]);
      return function (key) {
        events.push(['call', number, key, this === value]);
        return number;
      };
    }
  };
  assert.deepEqual(chunks(value), ['2']);
  assert.deepEqual(events, [
    ['get', 1],
    ['get', 2],
    ['call', 2, '', true]
  ]);
});

test('a noncallable second toJSON lookup preserves the native TypeError', () => {
  for (const replacement of [undefined, null, 3, {}, Symbol('not callable')]) {
    let gets = 0;
    const value = {
      get toJSON() {
        return ++gets === 1 ? () => 1 : replacement;
      }
    };
    assert.throws(
      () => chunks(value),
      error => error.constructor === TypeError && /toJSON/.test(error.message)
    );
    assert.equal(gets, 2);
  }
});

test('toJSON returned objects are not recursively normalized but returned boxes are unboxed', () => {
  let nestedCalls = 0;
  const returned = {
    toJSON() {
      nestedCalls++;
      return 'unexpected';
    },
    x: 1
  };
  assert.equal(text({ toJSON: () => returned }), '{\n  "x": 1\n}');
  assert.equal(nestedCalls, 0);
  const boxed = new Number(2);
  boxed.valueOf = () => 7;
  assert.deepEqual(chunks({ toJSON: () => boxed }), ['7']);
  for (const result of [undefined, Symbol('omitted'), () => 1]) assert.deepEqual(chunks({ toJSON: () => result }), []);
});

test('nonfunction toJSON properties remain ordinary enumerable data with one normalization read', () => {
  let gets = 0;
  const value = {
    get toJSON() {
      gets++;
      return 4;
    }
  };
  assert.equal(text(value), '{\n  "toJSON": 4\n}');
  assert.equal(gets, 2);
  const hidden = Object.create({ toJSON: 5 });
  hidden.x = 1;
  assert.equal(text(hidden), '{\n  "x": 1\n}');
});

test('Date and ordinary Number, String and Boolean boxes keep their established scalar outputs', () => {
  for (const [value, expected] of [
    [new Date(0), '"1970-01-01T00:00:00.000Z"'],
    [new Date(NaN), 'null'],
    [new Number(4), '4'],
    [new Number(NaN), 'null'],
    [new String('value'), '"value"'],
    [new Boolean(false), 'false']
  ])
    assert.deepEqual(chunks(value), [expected]);
});

test('custom boxed valueOf accepts arbitrary results including omitted primitives and records', () => {
  for (const [result, expected] of [
    [null, ['null']],
    [undefined, []],
    [Symbol('result'), []],
    [() => 1, []],
    [false, ['false']],
    [0, ['0']],
    ['value', ['"value"']],
    [{ nested: true }, ['{', '\n  "nested": ', 'true', '\n', '}']],
    [[1], ['[', '\n  ', '1', '\n', ']']]
  ]) {
    const value = new Number(1);
    let calls = 0;
    value.valueOf = function () {
      assert.equal(this, value);
      calls++;
      return result;
    };
    assert.deepEqual(chunks(value), expected);
    assert.equal(calls, 1);
  }
});

test('a box returned by custom valueOf is not unboxed a second time', () => {
  const returned = new Number(8);
  returned.x = 1;
  returned.valueOf = () => {
    assert.fail('second valueOf is not normalization');
  };
  const value = new Boolean(false);
  value.valueOf = () => returned;
  assert.equal(text(value), '{\n  "x": 1\n}');
});

test('BigInt Symbol.toStringTag spoof invokes custom valueOf getter and method without a new guard', () => {
  const events = [];
  const value = {
    get [Symbol.toStringTag]() {
      events.push('tag');
      return 'BigInt';
    },
    get valueOf() {
      events.push('valueOf:get');
      return function () {
        events.push(['valueOf:call', this === value]);
        return null;
      };
    }
  };
  assert.deepEqual(chunks(value), ['null']);
  assert.deepEqual(events, ['tag', 'valueOf:get', ['valueOf:call', true]]);
  const ordinary = { [Symbol.toStringTag]: 'Number', valueOf: () => 7, x: 2 };
  assert.equal(text(ordinary), '{\n  "x": 2\n}');
});

test('throwing user getters and methods preserve every exact thrown identity', () => {
  const reasons = [new Error('sentinel'), {}, undefined, null, false, 0, '', Symbol('thrown')];
  for (const reason of reasons) {
    const factories = [
      () => ({
        get toJSON() {
          throw reason;
        }
      }),
      () => {
        let count = 0;
        return {
          get toJSON() {
            if (++count === 2) throw reason;
            return () => 1;
          }
        };
      },
      () => ({
        toJSON() {
          throw reason;
        }
      }),
      () => ({
        get [Symbol.toStringTag]() {
          throw reason;
        }
      }),
      () => ({
        [Symbol.toStringTag]: 'BigInt',
        get valueOf() {
          throw reason;
        }
      }),
      () => ({
        [Symbol.toStringTag]: 'BigInt',
        valueOf() {
          throw reason;
        }
      }),
      () => ({
        get property() {
          throw reason;
        }
      })
    ];
    for (const make of factories) sameThrown(() => chunks(make()), reason);
  }
});

test('unhandled BigInt, revoked proxies and invalid boxed receivers retain native TypeErrors', () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const value of [
    1n,
    Object(1n),
    revoked.proxy,
    Object.create(Number.prototype),
    Object.create(String.prototype),
    Object.create(Boolean.prototype),
    { [Symbol.toStringTag]: 'BigInt', valueOf: 1 }
  ])
    assert.throws(
      () => chunks(value),
      error => error.constructor === TypeError
    );
});

test('arrays encode holes and omitted values as null, use inherited indexes and ignore extra keys', () => {
  const value = [undefined, undefined, Symbol('item'), () => 1, null];
  delete value[1];
  const prototype = Object.create(Array.prototype);
  Object.defineProperty(prototype, '1', { value: 'inherited' });
  Object.setPrototypeOf(value, prototype);
  value.extra = 'ignored';
  value[Symbol('extra')] = 'ignored';
  assert.equal(text(value), '[\n  null,\n  "inherited",\n  null,\n  null,\n  null\n]');
  assert.equal(text(new Array(2)), '[\n  null,\n  null\n]');
});

test('array length is captured once and shrinking or extending the array does not change the bound', () => {
  const shrinking = [1, 2, 3];
  Object.defineProperty(shrinking, '0', {
    get() {
      shrinking.length = 1;
      return 1;
    }
  });
  assert.equal(text(shrinking), '[\n  1,\n  null,\n  null\n]');
  const growing = [1];
  Object.defineProperty(growing, '0', {
    get() {
      growing.push(2);
      return 1;
    }
  });
  assert.equal(text(growing), '[\n  1\n]');
});

test('proxy array length is read once but comparison coercion repeats with the number hint', () => {
  const events = [];
  let comparisons = 0;
  const value = new Proxy([1, 2, 3], {
    get(target, key, receiver) {
      if (key === 'length') {
        events.push('length');
        return {
          [Symbol.toPrimitive](hint) {
            events.push(hint);
            return ++comparisons === 1 ? 2 : 0;
          }
        };
      }
      if (key === '0') events.push('index:0');
      return Reflect.get(target, key, receiver);
    }
  });
  assert.equal(text(value), '[\n  1\n]');
  assert.deepEqual(events, ['length', 'number', 'index:0', 'number']);
});

test('proxy array lengths retain relational-loop coercion rather than native stringify length rules', () => {
  for (const [length, expected] of [
    [undefined, '[]'],
    [NaN, '[]'],
    [-2, '[]'],
    ['2', '[\n  1,\n  2\n]'],
    [2.5, '[\n  1,\n  2,\n  3\n]'],
    [2n, '[\n  1,\n  2\n]']
  ]) {
    const value = new Proxy([1, 2, 3], {
      get: (target, key, receiver) => (key === 'length' ? length : Reflect.get(target, key, receiver))
    });
    assert.equal(text(value), expected);
  }
  const symbolLength = new Proxy([], {
    get: (target, key, receiver) => (key === 'length' ? Symbol('length') : Reflect.get(target, key, receiver))
  });
  const iterator = jsonChunks(symbolLength);
  assert.deepEqual(iterator.next(), { value: '[', done: false });
  assert.throws(() => iterator.next(), TypeError);
});

test('array proxies observe length and indexes in order without ownKeys or descriptor enumeration', () => {
  const events = [];
  const value = new Proxy([10, 20], {
    get(target, key, receiver) {
      if (key === 'length' || key === '0' || key === '1') events.push(key);
      return Reflect.get(target, key, receiver);
    },
    ownKeys() {
      assert.fail('array ownKeys must not run');
    },
    getOwnPropertyDescriptor() {
      assert.fail('array descriptors must not run');
    }
  });
  assert.equal(text(value), '[\n  10,\n  20\n]');
  assert.deepEqual(events, ['length', '0', '1']);
});

test('Object.keys snapshots ignore new keys, revisit deleted keys and preserve native key order', () => {
  const value = {
    get a() {
      delete value.b;
      value.c = 3;
      return 1;
    },
    b: 2
  };
  assert.equal(text(value), '{\n  "a": 1\n}');
  const ordered = { z: 3, 2: 'two', 1: 'one', a: 4, [Symbol('hidden')]: 5 };
  Object.defineProperty(ordered, 'hidden', { value: 6 });
  assert.equal(text(ordered), '{\n  "1": "one",\n  "2": "two",\n  "z": 3,\n  "a": 4\n}');
  const inherited = Object.create({ b: 'fallback' });
  Object.defineProperty(inherited, 'a', {
    enumerable: true,
    get() {
      delete inherited.b;
      return 1;
    }
  });
  inherited.b = 2;
  assert.equal(text(inherited), '{\n  "a": 1,\n  "b": "fallback"\n}');
});

test('object proxies take one ownKeys snapshot and inspect descriptors before reading values', () => {
  const events = [];
  const hidden = Symbol('hidden');
  const target = { a: 1, b: 2, [hidden]: 3 };
  const value = new Proxy(target, {
    ownKeys() {
      events.push('keys');
      return ['b', hidden, 'a'];
    },
    getOwnPropertyDescriptor(object, key) {
      events.push(['descriptor', key]);
      return Reflect.getOwnPropertyDescriptor(object, key);
    },
    get(object, key, receiver) {
      if (key === 'a' || key === 'b') events.push(['get', key]);
      return Reflect.get(object, key, receiver);
    }
  });
  assert.equal(text(value), '{\n  "b": 2,\n  "a": 1\n}');
  assert.deepEqual(events, ['keys', ['descriptor', 'b'], ['descriptor', 'a'], ['get', 'b'], ['get', 'a']]);
});

test('proxy traps and array length coercion propagate exact failures without wrapping', () => {
  for (const reason of [new Error('proxy'), {}, undefined, Symbol('proxy')]) {
    for (const value of [
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw reason;
          }
        }
      ),
      new Proxy(
        {},
        {
          ownKeys() {
            throw reason;
          }
        }
      ),
      new Proxy(
        { a: 1 },
        {
          getOwnPropertyDescriptor() {
            throw reason;
          }
        }
      ),
      new Proxy([], {
        get(target, key, receiver) {
          if (key === 'length') throw reason;
          return Reflect.get(target, key, receiver);
        }
      }),
      new Proxy([], {
        get(target, key, receiver) {
          return key === 'length'
            ? {
                valueOf() {
                  throw reason;
                }
              }
            : Reflect.get(target, key, receiver);
        }
      })
    ])
      sameThrown(() => chunks(value), reason);
  }
});

test('shared references are serialized again after their normal ancestor cleanup', () => {
  const shared = { x: 1 };
  assert.equal(text({ a: shared, b: shared }), '{\n  "a": {\n    "x": 1\n  },\n  "b": {\n    "x": 1\n  }\n}');
  assert.equal(text([shared, shared]), '[\n  {\n    "x": 1\n  },\n  {\n    "x": 1\n  }\n]');
});

test('cycle errors retain their exact message after already yielding object and array prefixes', () => {
  for (const array of [false, true]) {
    const value = array ? [] : {};
    if (array) value.push(value);
    else value.self = value;
    const iterator = jsonChunks(value);
    assert.deepEqual(iterator.next(), { value: array ? '[' : '{', done: false });
    assert.deepEqual(iterator.next(), { value: array ? '\n  ' : '\n  "self": ', done: false });
    assert.throws(
      () => iterator.next(),
      error => error.constructor === TypeError && error.message === 'Converting circular structure to JSON'
    );
    assert.deepEqual(iterator.next(), { value: undefined, done: true });
  }
});

test('ancestor removal happens only after resuming past the closing delimiter on normal completion', () => {
  const value = {};
  const events = observeAncestors([value], current => {
    const iterator = jsonChunks(value);
    assert.deepEqual(iterator.next(), { value: '{', done: false });
    assert.deepEqual(iterator.next(), { value: '}', done: false });
    assert.deepEqual(current, [['add', 0]]);
    assert.deepEqual(iterator.next(), { value: undefined, done: true });
  });
  assert.deepEqual(events, [
    ['add', 0],
    ['delete', 0]
  ]);
});

test('early return and injected throw do not add finally-style ancestor cleanup', () => {
  for (const mode of ['return', 'throw']) {
    const child = {};
    const root = { child };
    const reason = {};
    const events = observeAncestors([root, child], () => {
      const iterator = jsonChunks(root);
      iterator.next();
      iterator.next();
      assert.deepEqual(iterator.next(), { value: '{', done: false });
      if (mode === 'return') assert.deepEqual(iterator.return('stop'), { value: 'stop', done: true });
      else sameThrown(() => iterator.throw(reason), reason);
    });
    assert.deepEqual(events, [
      ['add', 0],
      ['add', 1]
    ]);
  }
});

test('abrupt cycle failure does not clean ancestors but a new generator gets an independent set', () => {
  const value = {};
  value.self = value;
  const events = observeAncestors([value], () => assert.throws(() => chunks(value), TypeError));
  assert.deepEqual(events, [['add', 0]]);
  delete value.self;
  assert.deepEqual(chunks(value), ['{', '}']);
});

test('toJSON runs before cycle detection and may eliminate or introduce an ancestor reference', () => {
  const value = {};
  value.self = value;
  value.toJSON = () => 4;
  assert.deepEqual(chunks(value), ['4']);
  const root = {};
  root.child = { toJSON: () => root };
  assert.throws(
    () => chunks(root),
    error => error.message === 'Converting circular structure to JSON'
  );
});

test('inherited changing BigInt toJSON yields native undefined at roots and nested positions', () => {
  for (const [wrap, key, expected] of [
    [value => value, '', [undefined]],
    [value => [value], '0', ['[', '\n  ', undefined, '\n', ']']],
    [value => ({ value }), 'value', ['{', '\n  "value": ', undefined, '\n', '}']]
  ])
    withChangingBigIntJSON(events => {
      assert.deepEqual(chunks(wrap(1n)), expected);
      assert.deepEqual(events, [
        ['get', 1],
        ['get', 2],
        ['call', 2, key, 'bigint', 1n],
        ['get', 3],
        ['call', 3, '', 'bigint', 1n]
      ]);
    });
});

test('native BigInt stringify also permits undefined yields when its third toJSON returns a function or symbol', () => {
  for (const finalValue of [() => 1, Symbol('native omission')])
    withChangingBigIntJSON(() => assert.deepEqual(chunks(1n), [undefined]), finalValue);
});

test('JSON.rawJSON remains one scalar chunk with its original lexeme at every nesting level', () => {
  for (const lexeme of ['123456789012345678901234567890', '-0', '1e+100', 'true', 'null', '"raw"']) {
    const raw = JSON.rawJSON(lexeme);
    assert.deepEqual(chunks(raw), [lexeme]);
    assert.equal(text({ raw }), `{\n  "raw": ${lexeme}\n}`);
  }
  const raw = JSON.rawJSON('456');
  const value = new Number(1);
  value.valueOf = () => raw;
  assert.deepEqual(chunks(value), ['456']);
});

test('optional JSON.isRawJSON preserves absence and noncallable native failure behavior', () => {
  const raw = JSON.rawJSON('123');
  for (const missing of [undefined, null])
    withProperty(JSON, 'isRawJSON', { value: missing }, () => {
      assert.equal(text(raw), '{\n  "rawJSON": "123"\n}');
      assert.equal(text({ a: 1 }), '{\n  "a": 1\n}');
    });
  withProperty(JSON, 'isRawJSON', { value: 7 }, () => {
    assert.deepEqual(chunks(1), ['1']);
    assert.throws(() => chunks({}), TypeError);
  });
});

test('JSON.isRawJSON uses its original receiver, truthiness, and exact thrown identities', () => {
  const value = { a: 1 };
  const events = [];
  withProperty(
    JSON,
    'isRawJSON',
    {
      value: function (input) {
        events.push([this === JSON, input]);
        return {};
      }
    },
    () => {
      assert.deepEqual(chunks(value), ['{"a":1}']);
      assert.deepEqual(chunks(null), ['null']);
    }
  );
  assert.deepEqual(events, [[true, value]]);
  for (const reason of [undefined, {}, new Error('raw'), Symbol('raw')])
    withProperty(
      JSON,
      'isRawJSON',
      {
        value() {
          throw reason;
        }
      },
      () => sameThrown(() => chunks({}), reason)
    );
});

test('actual atomic consumer buffers small JSON and preserves secure open, sync, close and commit order', () => {
  const fake = fakeFileSystem();
  let guarded = 0;
  assert.equal(
    fake.write(
      { a: [1, true] },
      {
        beforeCommit() {
          guarded++;
          fake.events.push(['guard']);
        }
      }
    ),
    undefined
  );
  assert.deepEqual(fake.events, [
    ['mkdir', path.dirname(targetPath), { recursive: true }],
    ['open', temporaryPath, 'wx', 0o600],
    ['write', 17, '{\n  "a": [\n    1,\n    true\n  ]\n}', 'utf8'],
    ['fsync', 17],
    ['close', 17],
    ['guard'],
    ['rename', temporaryPath, targetPath],
    ['exists', temporaryPath],
    ['exists', backupPath]
  ]);
  assert.equal(guarded, 1);
  assert.deepEqual([...fake.files], [targetPath]);
});

test('actual atomic consumer rejects omitted roots, closes and cleans without writing or committing', () => {
  for (const value of [undefined, Symbol('root'), () => 1]) {
    const fake = fakeFileSystem();
    assert.throws(
      () => fake.write(value),
      error => error.constructor === TypeError && error.message === 'JSON root must be serializable'
    );
    assert.deepEqual(operationNames(fake), ['mkdir', 'open', 'close', 'exists', 'remove', 'exists']);
    assert.deepEqual([...fake.files], []);
  }
});

test('actual atomic consumer keeps the undefined chunk.length TypeError and closes and cleans before any write', () => {
  for (const wrap of [value => value, value => [value], value => ({ value })]) {
    const fake = fakeFileSystem();
    withChangingBigIntJSON(() => {
      assert.throws(
        () =>
          fake.write(wrap(1n), {
            beforeCommit() {
              assert.fail('must not reach commit');
            }
          }),
        error =>
          error.constructor === TypeError && error.message === "Cannot read properties of undefined (reading 'length')"
      );
    });
    assert.deepEqual(operationNames(fake), ['mkdir', 'open', 'close', 'exists', 'remove', 'exists']);
    assert.deepEqual(fake.events.at(-2), ['remove', temporaryPath, { force: true, maxRetries: 5, retryDelay: 50 }]);
    assert.deepEqual([...fake.files], []);
  }
});

test('atomic buffering allows exactly 64 KiB then flushes before the next chunk', () => {
  const value = 'a'.repeat(65530);
  const fake = fakeFileSystem();
  fake.write([value, 1]);
  assert.deepEqual(writtenBuffers(fake), [`[\n  "${value}"`, ',\n  1\n]']);
  assert.equal(writtenBuffers(fake)[0].length, 64 * 1024);
  assert.deepEqual(operationNames(fake), [
    'mkdir',
    'open',
    'write',
    'write',
    'fsync',
    'close',
    'rename',
    'exists',
    'exists'
  ]);
});

test('atomic oversized scalar chunks are written directly after flushing any buffered prefix', () => {
  const value = 'x'.repeat(65536);
  const fake = fakeFileSystem();
  fake.write([value]);
  assert.deepEqual(writtenBuffers(fake), ['[\n  ', `"${value}"`, '\n]']);
  assert.equal(writtenBuffers(fake)[1].length, 65538);
  const root = fakeFileSystem();
  root.write(value);
  assert.deepEqual(writtenBuffers(root), [`"${value}"`]);
});

test('atomic serialization failures preserve identity with no commit, including after a prior flush', () => {
  for (const large of [false, true]) {
    for (const reason of [new Error('getter'), {}, undefined, Symbol('getter')]) {
      const fake = fakeFileSystem();
      const value = {
        first: large ? 'x'.repeat(65536) : 1,
        get bad() {
          throw reason;
        }
      };
      sameThrown(() => fake.write(value), reason);
      assert.equal(operationNames(fake).includes('write'), large);
      assert.equal(operationNames(fake).includes('fsync'), false);
      assert.equal(operationNames(fake).includes('rename'), false);
      assert.deepEqual(operationNames(fake).slice(-4), ['close', 'exists', 'remove', 'exists']);
      assert.deepEqual([...fake.files], []);
    }
  }
});

test('atomic write, fsync and close failures retain their identities and always attempt cleanup', () => {
  for (const operation of ['write', 'fsync', 'close']) {
    const reason = new Error(operation);
    const fake = fakeFileSystem({ [operation]: reason });
    sameThrown(() => fake.write({ a: 1 }), reason);
    assert.equal(operationNames(fake).filter(name => name === 'close').length, 1);
    assert.equal(operationNames(fake).includes('rename'), false);
    assert.deepEqual(operationNames(fake).slice(-3), ['exists', 'remove', 'exists']);
    assert.deepEqual([...fake.files], []);
  }
});

test('atomic close failure retains its existing precedence over a serialization failure', () => {
  const closeReason = new Error('close wins');
  const serializationReason = new Error('serialization');
  const fake = fakeFileSystem({ close: closeReason });
  sameThrown(
    () =>
      fake.write({
        get bad() {
          throw serializationReason;
        }
      }),
    closeReason
  );
  assert.deepEqual(operationNames(fake), ['mkdir', 'open', 'close', 'exists', 'remove', 'exists']);
});
