import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// 普通模式只加载当前检出；显式基线模式才读取指定主线的真实 JS writer。
const baseline = process.env.KNOWRA_ATOMIC_JSON_BASELINE === '1';
const commit = '53463fd29bdba432c62053368efd36eec059bba2';
const infrastructure = new URL('../src/infrastructure/', import.meta.url);
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const serializerUrl = new URL('json-chunks.js', infrastructure).href;
let writerUrl = new URL('atomic-json-file.js', infrastructure).href;
let writerSource;
if (baseline) {
  writerSource = execFileSync('git', ['show', `${commit}:apps/api/src/infrastructure/atomic-json-file.js`], {
    cwd: new URL('../../../', import.meta.url),
    encoding: 'utf8'
  });
  assert.equal(writerSource.split("'./json-chunks.js'").length, 2);
  writerUrl = dataModule(writerSource.replace("'./json-chunks.js'", JSON.stringify(serializerUrl)));
} else {
  writerSource = stripTypeScriptTypes(fs.readFileSync(new URL('atomic-json-file.ts', infrastructure), 'utf8'));
}
const { writeJsonFileAtomically: write } = await import(writerUrl);

// 以下测试串行执行；临时修改的原型和 console 均以 finally 恢复。
test('JS bridge exposes only the identical TS writer', { skip: baseline }, async () => {
  const bridge = await import(new URL('atomic-json-file.js', infrastructure));
  const implementation = await import(new URL('atomic-json-file.ts', infrastructure));
  assert.deepEqual(Object.keys(bridge), ['writeJsonFileAtomically']);
  assert.deepEqual(Object.keys(implementation), ['writeJsonFileAtomically']);
  assert.equal(bridge.writeJsonFileAtomically, implementation.writeJsonFileAtomically);
});

const target = path.join(path.sep, 'atomic-json-test-no-real-io', 'data.json');
const temp = path.join(path.dirname(target), `.data.json.${process.pid}-fixed.tmp`);
const backup = path.join(path.dirname(target), `.data.json.${process.pid}-fixed.bak`);
const roles = value => (value === target ? 'target' : value === temp ? 'temp' : value === backup ? 'backup' : value);
const sentinel = (label, code) => Object.assign(new Error(label), code === undefined ? {} : { code });
const sameThrown = (fn, expected) => {
  let observed = false;
  try {
    fn();
  } catch (e) {
    observed = true;
    assert.ok(Object.is(e, expected));
  }
  assert.equal(observed, true);
};
const nativeThrown = (fn, name, message) => {
  try {
    fn();
  } catch (e) {
    assert.equal(e.constructor, name === 'TypeError' ? TypeError : Error);
    assert.equal(e.name, name);
    assert.equal(e.message, message);
    return e;
  }
  assert.fail(`Expected ${name}: ${message}`);
};
const withProperty = (object, key, descriptor, fn) => {
  const previous = Object.getOwnPropertyDescriptor(object, key);
  try {
    Object.defineProperty(object, key, { configurable: true, ...descriptor });
    return fn();
  } finally {
    if (previous) Object.defineProperty(object, key, previous);
    else delete object[key];
  }
};
function fake(hooks = {}, initial = true) {
  const events = [],
    files = new Map(initial ? [[target, 'OLD']] : []),
    counts = {};
  let openedPath;
  const action = (op, args, effect) => {
    const n = (counts[op] = (counts[op] ?? 0) + 1);
    events.push([
      op,
      ...args.map(arg =>
        typeof arg === 'string' && arg.length > 160
          ? { length: arg.length, prefix: arg.slice(0, 15), suffix: arg.slice(-15) }
          : roles(arg)
      )
    ]);
    if (hooks[op]) return hooks[op]({ n, args, effect, events, files });
    return effect();
  };
  const fileSystem = {
    mkdirSync(...args) {
      return action('mkdir', args, () => undefined);
    },
    openSync(...args) {
      return action('open', args, () => {
        openedPath = args[0];
        files.set(openedPath, '');
        return 19;
      });
    },
    writeFileSync(...args) {
      return action('write', args, () => {
        files.set(openedPath, files.get(openedPath) + args[1]);
      });
    },
    fsyncSync(...args) {
      return action('fsync', args, () => undefined);
    },
    closeSync(...args) {
      return action('close', args, () => undefined);
    },
    renameSync(...args) {
      return action('rename', args, () => {
        assert.ok(files.has(args[0]), 'fake rename source missing');
        files.set(args[1], files.get(args[0]));
        files.delete(args[0]);
      });
    },
    existsSync(...args) {
      return action('exists', args, () => files.has(args[0]));
    },
    rmSync(...args) {
      return action('remove', args, () => {
        files.delete(args[0]);
      });
    }
  };
  return {
    events,
    files,
    counts,
    fileSystem,
    write(value, options = {}, filePath = target) {
      return write(filePath, value, { fileSystem, createUniqueId: () => 'fixed', ...options });
    },
    names() {
      return events.map(e => e[0]);
    }
  };
}
function snap(f) {
  return {
    events: f.events,
    files: [...f.files].map(([k, v]) => [roles(k), v.length > 200 ? { length: v.length } : v])
  };
}
function captureConsole(fn) {
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args);
  try {
    return { result: fn(logs), logs };
  } finally {
    console.error = original;
  }
}
function changingBigInt(fn, finalValue) {
  let gets = 0;
  const events = [];
  return withProperty(
    BigInt.prototype,
    'toJSON',
    {
      get() {
        const n = ++gets;
        events.push(['toJSON:get', n]);
        return function (key) {
          events.push(['toJSON:call', n, key]);
          return n < 3 ? this.valueOf() : finalValue;
        };
      }
    },
    () => fn(events)
  );
}

test('basic exact sync order and payload', () => {
  const f = fake();
  let guards = 0;
  f.write(
    { a: 1 },
    {
      beforeCommit() {
        guards++;
        f.events.push(['guard']);
      }
    }
  );
  assert.equal(guards, 1);
  assert.equal(f.files.get(target), '{\n  "a": 1\n}');
  assert.deepEqual(f.names(), ['mkdir', 'open', 'write', 'fsync', 'close', 'guard', 'rename', 'exists', 'exists']);
  assert.deepEqual([...f.files.keys()], [target]);
  return snap(f);
});
test('chunk threshold counts UTF-16 units, not bytes', () => {
  const rows = [];
  for (const [size, expectedWrites] of [
    [65534, 1],
    [65535, 1],
    [65536, 1],
    [65537, 1]
  ]) {
    const f = fake();
    f.write('中'.repeat(size));
    assert.equal(f.counts.write, expectedWrites);
    const contents = f.files.get(target);
    assert.equal(contents, JSON.stringify('中'.repeat(size), null, 2));
    assert.ok(Buffer.byteLength(contents) > 65536);
    rows.push({ inputLength: size, events: f.events });
  }
  return { rows };
});
test('multiple buffered/direct writes preserve exact JSON and order', () => {
  const f = fake();
  const value = { short: 'a'.repeat(45000), huge: 'b'.repeat(70000), tail: 'c'.repeat(45000) };
  f.write(value);
  assert.equal(f.files.get(target), JSON.stringify(value, null, 2));
  assert.equal(f.counts.write, 3);
  return snap(f);
});
for (const [label, value] of [
  ['undefined', undefined],
  ['function', () => {}],
  ['symbol', Symbol('x')]
])
  test(`omitted root ${label} closes and cleans without write/sync/rename`, () => {
    const f = fake();
    nativeThrown(() => f.write(value), 'TypeError', 'JSON root must be serializable');
    assert.deepEqual(f.names(), ['mkdir', 'open', 'close', 'exists', 'remove', 'exists']);
    assert.equal(f.files.get(target), 'OLD');
    return snap(f);
  });
for (const position of ['root', 'array', 'object', 'late'])
  for (const finalValue of [undefined, () => {}, Symbol('omitted')])
    test(`native undefined length ${position}/${typeof finalValue}`, () =>
      changingBigInt(events => {
        const f = fake();
        const value =
          position === 'root'
            ? 1n
            : position === 'array'
              ? [1n]
              : position === 'object'
                ? { x: 1n }
                : {
                    big: 'z'.repeat(70000),
                    x: 1n,
                    get later() {
                      throw new Error('must not run');
                    }
                  };
        nativeThrown(() => f.write(value), 'TypeError', "Cannot read properties of undefined (reading 'length')");
        assert.equal(f.counts.rename, undefined);
        assert.equal(f.counts.fsync, undefined);
        assert.equal(f.counts.close, 1);
        assert.equal(f.files.get(target), 'OLD');
        assert.deepEqual([...f.files.keys()], [target]);
        assert.equal(f.counts.write, position === 'late' ? 2 : undefined);
        return { hookEvents: events, ...snap(f) };
      }, finalValue));
test('serializer getter failure stops later getters and preserves exact identity', () => {
  const failure = sentinel('getter');
  const value = {
    get first() {
      throw failure;
    },
    get later() {
      throw new Error('must not read');
    }
  };
  const f = fake();
  sameThrown(() => f.write(value), failure);
  assert.deepEqual(f.names(), ['mkdir', 'open', 'close', 'exists', 'remove', 'exists']);
  return snap(f);
});
test('partial write then throw preserves target and cleans temp', () => {
  const failure = sentinel('partial write');
  const f = fake({
    write({ args, files }) {
      files.set(temp, args[1].slice(0, 10));
      throw failure;
    }
  });
  sameThrown(() => f.write({ long: 'z'.repeat(70000) }), failure);
  assert.equal(f.files.get(target), 'OLD');
  assert.deepEqual([...f.files.keys()], [target]);
  return snap(f);
});
test('later write failure leaves earlier temp bytes only until cleanup', () => {
  const failure = sentinel('second write');
  const f = fake({
    write({ n, effect }) {
      if (n === 2) throw failure;
      return effect();
    }
  });
  sameThrown(() => f.write({ a: 'z'.repeat(70000), b: 'x'.repeat(70000) }), failure);
  assert.equal(f.counts.write, 2);
  assert.equal(f.files.get(target), 'OLD');
  return snap(f);
});
for (const op of ['mkdir', 'open', 'write', 'fsync', 'close'])
  test(`${op} failure exact identity and cleanup scope`, () => {
    const failure = sentinel(op);
    const f = fake({
      [op]() {
        throw failure;
      }
    });
    sameThrown(() => f.write({ ok: true }), failure);
    assert.equal(f.files.get(target), 'OLD');
    if (op === 'mkdir') assert.deepEqual(f.names(), ['mkdir']);
    if (op === 'open') assert.deepEqual(f.names(), ['mkdir', 'open', 'exists', 'exists']);
    if (op === 'write' || op === 'fsync') assert.equal(f.counts.close, 1);
    assert.equal(f.counts.rename, undefined);
    return snap(f);
  });
test('close failure masks earlier serializer error', () =>
  changingBigInt(events => {
    const close = sentinel('close masks undefined length');
    const f = fake({
      close() {
        throw close;
      }
    });
    sameThrown(() => f.write(1n), close);
    assert.equal(f.counts.close, 1);
    return { hookEvents: events, ...snap(f) };
  }));
for (const stage of ['mkdir', 'open', 'write', 'fsync', 'close', 'rename'])
  for (const reason of [undefined, null, false, 0, 'plain', Symbol('reason'), 1n])
    test(`primitive thrown ${stage}/${typeof reason}/${String(reason)}`, () => {
      const f = fake({
        [stage]() {
          throw reason;
        }
      });
      sameThrown(() => f.write({ a: 1 }), reason);
      return snap(f);
    });
for (const code of ['EACCES', 'EEXIST', 'EPERM'])
  test(`Windows ${code} fallback guard runs three times`, () => {
    const first = sentinel('first', code);
    const f = fake({
      rename({ n, effect }) {
        if (n === 1) throw first;
        return effect();
      }
    });
    let guards = 0;
    f.write(
      { new: 1 },
      {
        beforeCommit() {
          f.events.push(['guard', ++guards]);
        }
      }
    );
    assert.equal(guards, 3);
    assert.equal(f.counts.rename, 3);
    assert.deepEqual([...f.files.keys()], [target]);
    assert.equal(f.files.get(target), '{\n  "new": 1\n}');
    return snap(f);
  });
test('no fallback without existing target; code getter not read', () => {
  let reads = 0;
  const first = {
    get code() {
      reads++;
      throw new Error('must not read');
    }
  };
  const f = fake(
    {
      rename() {
        throw first;
      }
    },
    false
  );
  sameThrown(() => f.write({ a: 1 }), first);
  assert.equal(reads, 0);
  return snap(f);
});
test('rename code truthy nonmatching value is not coerced', () => {
  let conversion = 0;
  const code = {
    toString() {
      conversion++;
      return 'EPERM';
    }
  };
  const first = { code };
  const f = fake({
    rename() {
      throw first;
    }
  });
  sameThrown(() => f.write({ a: 1 }), first);
  assert.equal(conversion, 0);
  assert.equal(f.counts.rename, 1);
  return snap(f);
});
test('initial guard EPERM can trigger fallback before first rename', () => {
  const first = sentinel('guard', 'EPERM');
  const f = fake();
  let guards = 0;
  f.write(
    { a: 1 },
    {
      beforeCommit() {
        f.events.push(['guard', ++guards]);
        if (guards === 1) throw first;
      }
    }
  );
  assert.equal(guards, 3);
  assert.equal(f.counts.rename, 2);
  return snap(f);
});
test('second guard failure happens before backup rename and keeps old file', () => {
  const first = sentinel('first', 'EPERM'),
    second = sentinel('guard 2');
  const f = fake({
    rename({ n, effect }) {
      if (n === 1) throw first;
      return effect();
    }
  });
  let guards = 0;
  sameThrown(
    () =>
      f.write(
        { a: 1 },
        {
          beforeCommit() {
            if (++guards === 2) throw second;
          }
        }
      ),
    second
  );
  assert.equal(f.counts.rename, 1);
  assert.equal(f.files.get(target), 'OLD');
  return snap(f);
});
test('backup rename failure has no restore path', () => {
  const first = sentinel('first', 'EPERM'),
    second = sentinel('backup');
  const f = fake({
    rename({ n, effect }) {
      if (n === 1) throw first;
      if (n === 2) throw second;
      return effect();
    }
  });
  sameThrown(() => f.write({ a: 1 }), second);
  assert.equal(f.counts.rename, 2);
  assert.equal(f.files.get(target), 'OLD');
  return snap(f);
});
for (const failStage of ['guard3', 'rename3'])
  test(`${failStage} restores old target before rethrow`, () => {
    const first = sentinel('first', 'EPERM'),
      last = sentinel(failStage);
    const f = fake({
      rename({ n, effect }) {
        if (n === 1) throw first;
        if (n === 3 && failStage === 'rename3') throw last;
        return effect();
      }
    });
    let guards = 0;
    sameThrown(
      () =>
        f.write(
          { a: 1 },
          {
            beforeCommit() {
              if (++guards === 3 && failStage === 'guard3') throw last;
            }
          }
        ),
      last
    );
    assert.equal(f.files.get(target), 'OLD');
    assert.deepEqual([...f.files.keys()], [target]);
    assert.equal(last.restoreError, undefined);
    return snap(f);
  });
test('partial rename destination is removed before backup restore', () => {
  const first = sentinel('first', 'EPERM'),
    last = sentinel('replace');
  const f = fake({
    rename({ n, effect, files }) {
      if (n === 1) throw first;
      if (n === 3) {
        files.set(target, 'PARTIAL');
        throw last;
      }
      return effect();
    }
  });
  sameThrown(() => f.write({ a: 1 }), last);
  assert.equal(f.files.get(target), 'OLD');
  const removeTarget = f.events.findIndex(e => e[0] === 'remove' && e[1] === 'target');
  const restore = f.events.findIndex(e => e[0] === 'rename' && e[1] === 'backup');
  assert.ok(removeTarget < restore);
  return snap(f);
});
for (const reason of [sentinel('restore'), undefined, null, false, 0, '', 1, 'truthy', Symbol('restore'), 1n])
  test(`restore failure attached; truthiness controls backup preservation/${typeof reason}/${String(reason)}`, () => {
    const first = sentinel('first', 'EPERM'),
      last = sentinel('replace');
    const f = fake({
      rename({ n, effect }) {
        if (n === 1) throw first;
        if (n === 3) throw last;
        if (n === 4) throw reason;
        return effect();
      }
    });
    sameThrown(() => f.write({ a: 1 }), last);
    assert.ok(Object.is(last.restoreError, reason));
    assert.equal(f.files.has(backup), Boolean(reason));
    assert.equal(f.files.has(target), false);
    return snap(f);
  });
test('restore assignment setter may mask original then backup removed', () => {
  const first = sentinel('first', 'EPERM'),
    restore = sentinel('restore'),
    mask = sentinel('setter');
  const original = {
    set restoreError(value) {
      assert.equal(value, restore);
      throw mask;
    }
  };
  const f = fake({
    rename({ n, effect }) {
      if (n === 1) throw first;
      if (n === 3) throw original;
      if (n === 4) throw restore;
      return effect();
    }
  });
  sameThrown(() => f.write({ a: 1 }), mask);
  assert.equal(f.files.has(backup), false);
  return snap(f);
});
for (const [original, message] of [
  [undefined, "Cannot set properties of undefined (setting 'restoreError')"],
  [null, "Cannot set properties of null (setting 'restoreError')"],
  [false, "Cannot create property 'restoreError' on boolean 'false'"],
  [0, "Cannot create property 'restoreError' on number '0'"],
  ['plain', "Cannot create property 'restoreError' on string 'plain'"],
  [Symbol('original'), "Cannot create property 'restoreError' on symbol 'Symbol(original)'"],
  [1n, "Cannot create property 'restoreError' on bigint '1'"],
  [Object.freeze({}), 'Cannot add property restoreError, object is not extensible']
])
  test(`restore assignment to invalid target masks original/${typeof original}/${String(original)}`, () => {
    const first = sentinel('first', 'EPERM'),
      restore = sentinel('restore');
    const f = fake({
      rename({ n, effect }) {
        if (n === 1) throw first;
        if (n === 3) throw original;
        if (n === 4) throw restore;
        return effect();
      }
    });
    let caught;
    try {
      f.write({ a: 1 });
    } catch (e) {
      caught = e;
    }
    assert.equal(caught.constructor, TypeError);
    assert.equal(caught.message, message);
    assert.equal(f.files.has(backup), false);
    return { error: { name: caught.name, message: caught.message }, ...snap(f) };
  });
test('outer restoreError getter masks original and prevents preservation', () => {
  const read = sentinel('restoreError getter');
  const original = {
    get restoreError() {
      throw read;
    }
  };
  const f = fake({
    write() {
      throw original;
    }
  });
  sameThrown(() => f.write({ a: 1 }), read);
  assert.deepEqual(f.names(), ['mkdir', 'open', 'write', 'close', 'exists', 'remove', 'exists']);
  return snap(f);
});
test('error code getter and exists failure mask initial replacement error', () => {
  const rows = [];
  for (const mode of ['code', 'exists']) {
    const mask = sentinel(mode);
    const original = {
      get code() {
        throw mask;
      }
    };
    const f = fake({
      rename() {
        throw original;
      },
      ...(mode === 'exists'
        ? {
            exists({ n, effect }) {
              if (n === 1) throw mask;
              return effect();
            }
          }
        : {})
    });
    sameThrown(() => f.write({ a: 1 }), mask);
    rows.push(snap(f));
  }
  return { rows };
});
test('cleanup failures are logged and swallowed if logger/error.message succeed', () => {
  const remove = sentinel('cleanup');
  const f = fake({
    remove() {
      throw remove;
    }
  });
  const initial = sentinel('initial');
  const outcome = captureConsole(logs => {
    sameThrown(
      () =>
        f.write({
          get x() {
            throw initial;
          }
        }),
      initial
    );
    assert.equal(logs.length, 1);
    assert.equal(logs[0][1], 'cleanup');
  });
  assert.equal(f.files.has(temp), true);
  return { logs: outcome.logs, ...snap(f) };
});
test('cleanup message getter masks primary and skips backup cleanup', () => {
  const mask = sentinel('message getter');
  const cleanup = {
    get message() {
      throw mask;
    }
  };
  const f = fake({
    remove() {
      throw cleanup;
    }
  });
  const outcome = captureConsole(() => sameThrown(() => f.write(undefined), mask));
  assert.equal(outcome.logs.length, 0);
  assert.equal(f.counts.exists, 1);
  return snap(f);
});
test('console.error failure masks original cleanup error', () => {
  const mask = sentinel('logger');
  const original = console.error;
  const f = fake({
    remove() {
      throw sentinel('cleanup');
    }
  });
  try {
    console.error = () => {
      throw mask;
    };
    sameThrown(() => f.write(undefined), mask);
  } finally {
    console.error = original;
  }
  assert.equal(f.counts.exists, 1);
  return snap(f);
});
for (const result of [
  undefined,
  null,
  true,
  0,
  -0,
  NaN,
  '',
  1,
  'yes',
  Symbol('ok'),
  1n,
  {},
  [],
  () => {},
  { then: false },
  { then: 0 },
  { then: null },
  { then: undefined }
])
  test(`guard accepted return/${typeof result}/${String(result)}`, () => {
    const f = fake();
    f.write({ a: 1 }, { beforeCommit: () => result });
    assert.equal(f.counts.rename, 1);
    return snap(f);
  });
for (const result of [false, { then: true }, { then: 1 }, { then: 'not function' }, Promise.resolve(1), { then() {} }])
  test(`guard rejects strict false or truthy then/${String(result)}`, () => {
    const f = fake();
    if (result === false)
      nativeThrown(
        () => f.write({ a: 1 }, { beforeCommit: () => result }),
        'Error',
        'Atomic JSON commit guard rejected'
      );
    else
      nativeThrown(
        () => f.write({ a: 1 }, { beforeCommit: () => result }),
        'TypeError',
        'Atomic JSON commit guard must be synchronous'
      );
    assert.equal(f.counts.rename, undefined);
    assert.equal(f.files.get(target), 'OLD');
    return snap(f);
  });
test('then getter observed once and exact thrown identity preserved', () => {
  const thrown = sentinel('then getter');
  let gets = 0;
  const result = {
    get then() {
      gets++;
      throw thrown;
    }
  };
  const f = fake();
  sameThrown(() => f.write({ a: 1 }, { beforeCommit: () => result }), thrown);
  assert.equal(gets, 1);
  return snap(f);
});
for (const guard of [null, undefined])
  test(`nullish beforeCommit ${String(guard)} is accepted`, () => {
    const f = fake();
    f.write({ a: 1 }, { beforeCommit: guard });
    assert.equal(f.counts.rename, 1);
    return snap(f);
  });
for (const guard of [false, 0, '', {}, 1n, Symbol('bad')])
  test(`noncallable beforeCommit ${typeof guard} fails after fsync/close`, () => {
    const f = fake();
    nativeThrown(() => f.write({ a: 1 }, { beforeCommit: guard }), 'TypeError', 'beforeCommit is not a function');
    assert.equal(f.counts.fsync, 1);
    assert.equal(f.counts.close, 1);
    assert.equal(f.counts.rename, undefined);
    return snap(f);
  });
test('strict callback this is undefined and return is ignored beyond check', () => {
  const f = fake();
  f.write(
    { a: 1 },
    {
      beforeCommit: function () {
        assert.equal(this, undefined);
        return { then: 0 };
      }
    }
  );
  return snap(f);
});
for (const id of [
  undefined,
  null,
  false,
  0,
  1,
  1n,
  '',
  {},
  {
    toString() {
      return 'custom';
    }
  }
])
  test(`ID native template accepted/${typeof id}/${String(id)}`, () => {
    const f = fake();
    let expected;
    try {
      f.write({ a: 1 }, { createUniqueId: () => id });
    } catch (e) {
      expected = e;
    }
    assert.equal(expected, undefined);
    assert.equal(f.counts.mkdir, 1);
    assert.deepEqual([...f.files.keys()], [target]);
    assert.equal(f.files.get(target), '{\n  "a": 1\n}');
    return snap(f);
  });
test('ID conversion default/string hint and Symbol failure happen before mkdir', () => {
  const f = fake();
  const failure = sentinel('id conversion');
  const value = {
    [Symbol.toPrimitive](hint) {
      assert.equal(hint, 'string');
      throw failure;
    }
  };
  sameThrown(() => f.write({ a: 1 }, { createUniqueId: () => value }), failure);
  assert.deepEqual(f.names(), []);
  nativeThrown(
    () => f.write({ a: 1 }, { createUniqueId: () => Symbol('id') }),
    'TypeError',
    'Cannot convert a Symbol value to a string'
  );
  assert.deepEqual(f.names(), []);
  return snap(f);
});
test('invalid paths reject before uniqueId and filesystem calls', () => {
  const rows = [];
  for (const filePath of [
    undefined,
    null,
    0,
    {},
    new String('/synthetic/data'),
    Buffer.from('/synthetic/data'),
    new URL('file:///synthetic/data')
  ]) {
    const f = fake();
    let calls = 0;
    let caught;
    try {
      f.write(
        { a: 1 },
        {
          createUniqueId() {
            calls++;
            return 'fixed';
          }
        },
        filePath
      );
    } catch (e) {
      caught = e;
    }
    if (filePath === undefined) continue;
    assert.ok(caught instanceof TypeError);
    assert.equal(calls, 0);
    assert.deepEqual(f.names(), []);
    rows.push({ type: typeof filePath, error: caught.message });
  }
  return { rows };
});
test('injected descriptor is unvalidated and threaded unchanged', () => {
  const token = { opaque: true };
  const f = fake({
    open({ effect }) {
      effect();
      return token;
    },
    write({ args, effect }) {
      assert.equal(args[0], token);
      return effect();
    },
    fsync({ args }) {
      assert.equal(args[0], token);
    },
    close({ args }) {
      assert.equal(args[0], token);
    }
  });
  f.write({ a: 1 });
  return snap(f);
});
test('ignored FS return values can be thenables and exists uses truthiness', () => {
  const thenable = {
    then() {
      throw new Error('must never call');
    }
  };
  const f = fake(
    Object.fromEntries(
      ['mkdir', 'write', 'fsync', 'close', 'rename', 'remove'].map(op => [
        op,
        ({ effect }) => {
          effect();
          return thenable;
        }
      ])
    )
  );
  f.write({ a: 1 });
  assert.equal(f.files.get(target), '{\n  "a": 1\n}');
  return snap(f);
});
test('injected FS calls preserve method receiver and fresh property reads', () => {
  const f = fake();
  const original = f.fileSystem.writeFileSync;
  let getCount = 0;
  Object.defineProperty(f.fileSystem, 'writeFileSync', {
    get() {
      getCount++;
      return function (...args) {
        assert.equal(this, f.fileSystem);
        return original(...args);
      };
    }
  });
  f.write({ a: 'z'.repeat(70000), b: 'z'.repeat(70000) });
  assert.equal(getCount, f.counts.write);
  return { getCount, ...snap(f) };
});

test('real generator IteratorClose stops future getters and skips missing ancestor finally', () => {
  const failure = sentinel('write interrupt');
  let later = 0;
  const value = {
    large: 'x'.repeat(70000),
    get later() {
      later++;
      return 1;
    }
  };
  const f = fake({
    write() {
      throw failure;
    }
  });
  const add = Set.prototype.add,
    remove = Set.prototype.delete;
  withProperty(
    Set.prototype,
    'add',
    {
      value: function (v) {
        if (v === value) f.events.push(['ancestor:add']);
        return add.call(this, v);
      }
    },
    () =>
      withProperty(
        Set.prototype,
        'delete',
        {
          value: function (v) {
            if (v === value) f.events.push(['ancestor:delete']);
            return remove.call(this, v);
          }
        },
        () => sameThrown(() => f.write(value), failure)
      )
  );
  assert.equal(later, 0);
  assert.equal(f.names().includes('ancestor:add'), true);
  assert.equal(f.names().includes('ancestor:delete'), false);
  return snap(f);
});
test('real serializer fully consumes ancestors before fsync', () => {
  const value = { a: 1 };
  const f = fake();
  const add = Set.prototype.add,
    remove = Set.prototype.delete;
  withProperty(
    Set.prototype,
    'add',
    {
      value: function (v) {
        if (v === value) f.events.push(['ancestor:add']);
        return add.call(this, v);
      }
    },
    () =>
      withProperty(
        Set.prototype,
        'delete',
        {
          value: function (v) {
            if (v === value) f.events.push(['ancestor:delete']);
            return remove.call(this, v);
          }
        },
        () => f.write(value)
      )
  );
  assert.ok(f.names().indexOf('ancestor:delete') < f.names().indexOf('fsync'));
  return snap(f);
});
for (const response of [undefined, null, 0, '', false, 1, 'present', {}, [], 1n])
  test(`existsSync historical truthiness/${typeof response}/${String(response)}`, () => {
    const first = sentinel('replace', 'EPERM');
    const f = fake({
      rename({ n, effect }) {
        if (n === 1) throw first;
        return effect();
      },
      exists({ n, effect }) {
        if (n === 1) return response;
        return effect();
      }
    });
    if (response) f.write({ a: 1 });
    else sameThrown(() => f.write({ a: 1 }), first);
    assert.equal(f.counts.rename, response ? 3 : 1);
    return snap(f);
  });
test('Promise descriptor from injected open is never awaited', () => {
  const descriptor = Promise.resolve(21);
  const f = fake({
    open({ effect }) {
      effect();
      return descriptor;
    },
    write({ args, effect }) {
      assert.equal(args[0], descriptor);
      return effect();
    },
    fsync({ args }) {
      assert.equal(args[0], descriptor);
    },
    close({ args }) {
      assert.equal(args[0], descriptor);
    }
  });
  f.write({ a: 1 });
  return snap(f);
});
test('undefined path exact public call rejects before ID and file-system access', () => {
  const f = fake();
  let calls = 0;
  let caught;
  try {
    write(
      undefined,
      { a: 1 },
      {
        fileSystem: f.fileSystem,
        createUniqueId() {
          calls++;
          return 'fixed';
        }
      }
    );
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof TypeError);
  assert.equal(calls, 0);
  assert.deepEqual(f.names(), []);
  return { error: caught.message, ...snap(f) };
});
test('options destructuring property access occurs before path validation', () => {
  const f = fake();
  const events = [];
  let caught;
  const options = {
    get fileSystem() {
      events.push('fs');
      return f.fileSystem;
    },
    get createUniqueId() {
      events.push('id');
      return () => {
        events.push('call id');
        return 'fixed';
      };
    },
    get beforeCommit() {
      events.push('guard');
      return () => {};
    }
  };
  try {
    write(null, { a: 1 }, options);
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof TypeError);
  assert.deepEqual(events, ['fs', 'id', 'guard']);
  assert.deepEqual(f.names(), []);
  return { events, error: caught.message };
});
test('null options fails during destructuring before path validation', () => {
  let caught;
  try {
    write(null, { a: 1 }, null);
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof TypeError);
  assert.match(caught.message, /fileSystem/);
  return { error: caught.message };
});
test('primitive options with inherited port properties remain historically accepted', () => {
  const f = fake();
  withProperty(Number.prototype, 'fileSystem', { value: f.fileSystem }, () =>
    withProperty(Number.prototype, 'createUniqueId', { value: () => 'fixed' }, () => write(target, { a: 1 }, 0))
  );
  assert.equal(f.files.get(target), '{\n  "a": 1\n}');
  return snap(f);
});

test('revoked thrown proxy is masked by outer restoreError read', () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  const f = fake({
    write() {
      throw proxy;
    }
  });
  nativeThrown(() => f.write({ a: 1 }), 'TypeError', "Cannot perform 'get' on a proxy that has been revoked");
  assert.equal(f.counts.close, 1);
  assert.equal(f.files.get(target), 'OLD');
  return snap(f);
});
test('revoked guard result fails at then read after close', () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  const f = fake();
  nativeThrown(
    () => f.write({ a: 1 }, { beforeCommit: () => proxy }),
    'TypeError',
    "Cannot perform 'get' on a proxy that has been revoked"
  );
  assert.equal(f.counts.close, 1);
  assert.equal(f.counts.rename, undefined);
  return snap(f);
});
test('false proxy set trap during restore masks original and removes backup', () => {
  const first = sentinel('first', 'EPERM'),
    restore = sentinel('restore');
  const original = new Proxy(
    {},
    {
      set() {
        return false;
      }
    }
  );
  const f = fake({
    rename({ n, effect }) {
      if (n === 1) throw first;
      if (n === 3) throw original;
      if (n === 4) throw restore;
      return effect();
    }
  });
  nativeThrown(
    () => f.write({ a: 1 }),
    'TypeError',
    "'set' on proxy: trap returned falsish for property 'restoreError'"
  );
  assert.equal(f.files.has(backup), false);
  return snap(f);
});
test('preexisting truthy restoreError skips backup cleanup even without attempted restore', () => {
  const original = { restoreError: 'preexisting' };
  const f = fake({
    write() {
      throw original;
    }
  });
  sameThrown(() => f.write({ a: 1 }), original);
  assert.equal(f.counts.exists, 1);
  assert.equal(f.files.get(target), 'OLD');
  return snap(f);
});
test('cleanup logger may report throw after successful commit', () => {
  const failure = sentinel('logger');
  const old = console.error;
  const f = fake({
    exists() {
      throw sentinel('exists after commit');
    }
  });
  try {
    console.error = () => {
      throw failure;
    };
    sameThrown(() => f.write({ a: 1 }), failure);
  } finally {
    console.error = old;
  }
  assert.equal(f.files.get(target), '{\n  "a": 1\n}');
  assert.equal(f.counts.rename, 1);
  assert.equal(f.counts.exists, 1);
  return snap(f);
});

// 只替换真实 writer 的导入来隔离 IteratorClose；不是新增的公开 serializer 注入接口。
async function syntheticWriter(generatorSource) {
  assert.equal(writerSource.split("'./json-chunks.js'").length, 2);
  return (
    await import(dataModule(writerSource.replace("'./json-chunks.js'", JSON.stringify(dataModule(generatorSource)))))
  ).writeJsonFileAtomically;
}
for (const [label, generatorSource, expected] of [
  [
    'body length failure closes iterator',
    `export function* jsonChunks(value){try {value.events.push(['generator:start']);yield undefined;value.events.push(['generator:resumed']);}finally{value.events.push(['generator:finally']);}}`,
    'length'
  ],
  [
    'iterator return throw does not replace loop body throw',
    `export function* jsonChunks(value){try {value.events.push(['generator:start']);yield undefined;}finally{value.events.push(['generator:finally']);throw value.closeError;}}`,
    'length'
  ],
  [
    'next throw exact identity then descriptor close',
    `export function* jsonChunks(value){try {value.events.push(['generator:start']);throw value.nextError;}finally{value.events.push(['generator:finally']);}}`,
    'next'
  ]
]) {
  const synthetic = await syntheticWriter(generatorSource);
  test(label, () => {
    const f = fake();
    const nextError = sentinel('next'),
      closeError = sentinel('iterator close');
    const value = { events: f.events, nextError, closeError };
    const operation = () => synthetic(target, value, { fileSystem: f.fileSystem, createUniqueId: () => 'fixed' });
    if (expected === 'length')
      nativeThrown(operation, 'TypeError', "Cannot read properties of undefined (reading 'length')");
    else sameThrown(operation, nextError);
    assert.ok(f.names().indexOf('generator:finally') < f.names().indexOf('close'));
    assert.equal(f.names().includes('generator:resumed'), false);
    return snap(f);
  });
}

// 真实文件系统只触及测试新建的合成临时目录，所有出口都会删除目录。
function run(name, fn) {
  test(name, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-atomic-json-synthetic-'));
    try {
      const target = path.join(root, 'data.json');
      fs.writeFileSync(target, 'OLD');
      fn({ root, target });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      assert.equal(fs.existsSync(root), false);
    }
  });
}
const fixed = { createUniqueId: () => 'fixed' };
function exactThrow(operation, expected) {
  let caught = false;
  try {
    operation();
  } catch (error) {
    caught = true;
    assert.equal(error, expected);
  }
  assert.ok(caught);
}
function cleanOld(root, target) {
  assert.equal(fs.readFileSync(target, 'utf8'), 'OLD');
  assert.deepEqual(fs.readdirSync(root), ['data.json']);
}
function bigintHook(fn) {
  const old = Object.getOwnPropertyDescriptor(BigInt.prototype, 'toJSON');
  let reads = 0;
  try {
    Object.defineProperty(BigInt.prototype, 'toJSON', {
      configurable: true,
      get() {
        const n = ++reads;
        return function () {
          return n < 3 ? this.valueOf() : undefined;
        };
      }
    });
    fn();
  } finally {
    if (old) Object.defineProperty(BigInt.prototype, 'toJSON', old);
    else delete BigInt.prototype.toJSON;
  }
}
run('native success with coerced id and multi-byte huge string', ({ root, target }) => {
  const value = { a: '中'.repeat(70000), b: [1, null] };
  write(target, value, { createUniqueId: () => ({ toString: () => 'custom' }) });
  assert.equal(fs.readFileSync(target, 'utf8'), JSON.stringify(value, null, 2));
  assert.deepEqual(fs.readdirSync(root), ['data.json']);
});
run('native undefined chunk preserves bytes and removes temp', ({ root, target }) =>
  bigintHook(() => {
    assert.throws(() => write(target, { x: 1n }, fixed), {
      name: 'TypeError',
      message: "Cannot read properties of undefined (reading 'length')"
    });
    cleanOld(root, target);
  })
);
run('native omitted root preserves bytes and removes temp', ({ root, target }) => {
  assert.throws(() => write(target, undefined, fixed), {
    name: 'TypeError',
    message: 'JSON root must be serializable'
  });
  cleanOld(root, target);
});
run('native partial write then throw cleans temp and keeps old target', ({ root, target }) => {
  const failure = new Error('partial');
  let calls = 0;
  const fileSystem = {
    ...fs,
    writeFileSync(fd, data, encoding) {
      if (++calls === 2) {
        fs.writeFileSync(fd, data.slice(0, 4), encoding);
        throw failure;
      }
      return fs.writeFileSync(fd, data, encoding);
    }
  };
  exactThrow(() => write(target, { a: 'x'.repeat(70000), b: 'y'.repeat(70000) }, { ...fixed, fileSystem }), failure);
  assert.equal(calls, 2);
  cleanOld(root, target);
});
run('native Windows fallback succeeds with exactly three guards', ({ root, target }) => {
  let calls = 0,
    guards = 0;
  const fileSystem = {
    ...fs,
    renameSync(from, to) {
      if (++calls === 1) throw Object.assign(new Error('first'), { code: 'EPERM' });
      return fs.renameSync(from, to);
    }
  };
  write(
    target,
    { a: 1 },
    {
      ...fixed,
      fileSystem,
      beforeCommit() {
        guards++;
      }
    }
  );
  assert.equal(guards, 3);
  assert.equal(calls, 3);
  assert.equal(fs.readFileSync(target, 'utf8'), '{\n  "a": 1\n}');
  assert.deepEqual(fs.readdirSync(root), ['data.json']);
});
run('native fallback replacement failure restores old file', ({ root, target }) => {
  let calls = 0;
  const failure = new Error('third');
  const fileSystem = {
    ...fs,
    renameSync(from, to) {
      calls++;
      if (calls === 1) throw Object.assign(new Error('first'), { code: 'EPERM' });
      if (calls === 3) throw failure;
      return fs.renameSync(from, to);
    }
  };
  exactThrow(() => write(target, { a: 1 }, { ...fixed, fileSystem }), failure);
  assert.equal(calls, 4);
  cleanOld(root, target);
});
run('native restore failure preserves backup containing old bytes', ({ root, target }) => {
  let calls = 0;
  const failure = new Error('third'),
    restore = new Error('restore');
  const fileSystem = {
    ...fs,
    renameSync(from, to) {
      calls++;
      if (calls === 1) throw Object.assign(new Error('first'), { code: 'EPERM' });
      if (calls === 3) throw failure;
      if (calls === 4) throw restore;
      return fs.renameSync(from, to);
    }
  };
  exactThrow(() => write(target, { a: 1 }, { ...fixed, fileSystem }), failure);
  assert.equal(failure.restoreError, restore);
  assert.equal(fs.existsSync(target), false);
  const names = fs.readdirSync(root);
  assert.equal(names.length, 1);
  assert.ok(names[0].endsWith('.bak'));
  assert.equal(fs.readFileSync(path.join(root, names[0]), 'utf8'), 'OLD');
});
run('native close failure masks undefined length without fd leak', ({ root, target }) =>
  bigintHook(() => {
    const failure = new Error('close');
    const fileSystem = {
      ...fs,
      closeSync(fd) {
        fs.closeSync(fd);
        throw failure;
      }
    };
    exactThrow(() => write(target, 1n, { ...fixed, fileSystem }), failure);
    cleanOld(root, target);
  })
);
run('native truthy noncallable then guard return rejects before rename', ({ root, target }) => {
  assert.throws(() => write(target, { a: 1 }, { ...fixed, beforeCommit: () => ({ then: 1 }) }), {
    name: 'TypeError',
    message: 'Atomic JSON commit guard must be synchronous'
  });
  cleanOld(root, target);
});
run('native path null byte fails in FS rather than path module', ({ root, target }) => {
  let ids = 0;
  assert.throws(
    () =>
      write(path.join(root, 'bad\0.json'), 1, {
        createUniqueId() {
          ids++;
          return 'fixed';
        }
      }),
    { code: 'ERR_INVALID_ARG_VALUE' }
  );
  assert.equal(ids, 1);
  cleanOld(root, target);
});
run('native URL path rejects before id invocation', ({ root, target }) => {
  let ids = 0;
  assert.throws(
    () =>
      write(pathToFileURL(target), 1, {
        createUniqueId() {
          ids++;
          return 'fixed';
        }
      }),
    { code: 'ERR_INVALID_ARG_TYPE' }
  );
  assert.equal(ids, 0);
  cleanOld(root, target);
});
run('native fsync return thenable is ignored not awaited', ({ root, target }) => {
  const fileSystem = {
    ...fs,
    fsyncSync(fd) {
      fs.fsyncSync(fd);
      return {
        then() {
          throw new Error('must not invoke');
        }
      };
    }
  };
  write(target, { a: 1 }, { ...fixed, fileSystem });
  assert.equal(fs.readFileSync(target, 'utf8'), '{\n  "a": 1\n}');
  assert.deepEqual(fs.readdirSync(root), ['data.json']);
});

// 独立审查中的 20 个边界改为固定预期，不以候选实现输出作为 oracle。
function boundaryHarness(options = {}) {
  const descriptor = Object.hasOwn(options, 'descriptor') ? options.descriptor : 17;
  const value = Object.hasOwn(options, 'value') ? options.value : 'x'.repeat(70000);
  const { beforeCommit, createUniqueId, override = {} } = options;
  const events = [];
  let writes = 0;
  const fileSystem = {
    mkdirSync() {
      events.push(['mkdir', this === fileSystem]);
      return { then: 1 };
    },
    openSync() {
      events.push(['open', this === fileSystem]);
      return descriptor;
    },
    get writeFileSync() {
      events.push(['get-write']);
      return function (fd, data, encoding) {
        assert.equal(fd, descriptor);
        assert.equal(this, fileSystem);
        assert.equal(typeof data, 'string');
        events.push(['write', data.length, encoding]);
        writes++;
        return { then: 1 };
      };
    },
    fsyncSync(fd) {
      assert.equal(fd, descriptor);
      events.push(['fsync', this === fileSystem]);
      return Symbol('ignored');
    },
    closeSync(fd) {
      assert.equal(fd, descriptor);
      events.push(['close', this === fileSystem]);
    },
    renameSync() {
      events.push(['rename', this === fileSystem]);
    },
    existsSync(file) {
      events.push(['exists', file.endsWith('.tmp') ? 'tmp' : 'bak']);
      return false;
    },
    rmSync() {
      assert.fail('missing synthetic paths must not be removed');
    }
  };
  for (const [name, fn] of Object.entries(override))
    Object.defineProperty(fileSystem, name, { value: fn(events, fileSystem), configurable: true });
  let thrown;
  let completed = false;
  try {
    write(target, value, {
      fileSystem,
      createUniqueId:
        createUniqueId ??
        function () {
          assert.equal(this, undefined);
          events.push(['id']);
          return 'fixed';
        },
      beforeCommit:
        beforeCommit ??
        function () {
          assert.equal(this, undefined);
          events.push(['guard']);
          return { then: 0 };
        }
    });
    completed = true;
  } catch (error) {
    thrown = error;
  }
  return { events, writes, thrown, completed };
}
const boundarySuccessEvents = [
  ['id'],
  ['mkdir', true],
  ['open', true],
  ['get-write'],
  ['write', 70002, 'utf8'],
  ['fsync', true],
  ['close', true],
  ['guard'],
  ['rename', true],
  ['exists', 'tmp'],
  ['exists', 'bak']
];
for (const [label, descriptor] of [
  ['number', 17],
  ['symbol', Symbol('opaque')],
  ['object', { id: 'opaque' }],
  ['promise', Promise.resolve(17)],
  ['null', null],
  ['undefined', undefined]
]) {
  test(`independent opaque descriptor ${label} is passed unchanged to every operation`, () => {
    const result = boundaryHarness({ descriptor });
    assert.equal(result.completed, true);
    assert.equal(result.thrown, undefined);
    assert.equal(result.writes, 1);
    assert.deepEqual(result.events, boundarySuccessEvents);
  });
}
test('independent undefined length fails before evaluating writeFileSync getter', () =>
  changingBigInt(() => {
    const result = boundaryHarness({ value: 1n });
    assert.equal(result.completed, false);
    assert.equal(result.thrown.constructor, TypeError);
    assert.equal(result.thrown.message, "Cannot read properties of undefined (reading 'length')");
    assert.equal(result.writes, 0);
    assert.deepEqual(result.events, [
      ['id'],
      ['mkdir', true],
      ['open', true],
      ['close', true],
      ['exists', 'tmp'],
      ['exists', 'bak']
    ]);
  }));
test('independent fresh write getter is observed for every buffered or direct write', () => {
  const result = boundaryHarness({ value: { a: 'x'.repeat(70000), b: 'y'.repeat(70000) } });
  assert.equal(result.completed, true);
  assert.equal(result.writes, 5);
  assert.deepEqual(result.events, [
    ['id'],
    ['mkdir', true],
    ['open', true],
    ['get-write'],
    ['write', 9, 'utf8'],
    ['get-write'],
    ['write', 70002, 'utf8'],
    ['get-write'],
    ['write', 9, 'utf8'],
    ['get-write'],
    ['write', 70002, 'utf8'],
    ['get-write'],
    ['write', 2, 'utf8'],
    ['fsync', true],
    ['close', true],
    ['guard'],
    ['rename', true],
    ['exists', 'tmp'],
    ['exists', 'bak']
  ]);
});
for (const [label, result, Constructor, message] of [
  ['truthy noncallable then', { then: 1 }, TypeError, 'Atomic JSON commit guard must be synchronous'],
  ['false', false, Error, 'Atomic JSON commit guard rejected']
])
  test(`independent ${label} guard rejects before rename`, () => {
    const observed = boundaryHarness({
      beforeCommit() {
        assert.equal(this, undefined);
        return result;
      }
    });
    assert.equal(observed.completed, false);
    assert.equal(observed.thrown.constructor, Constructor);
    assert.equal(observed.thrown.message, message);
    assert.deepEqual(observed.events, [
      ...boundarySuccessEvents.slice(0, 7),
      ['exists', 'bak'],
      ['exists', 'tmp'],
      ['exists', 'bak']
    ]);
  });
test('independent numeric unique ID preserves strict callback receiver before IO', () => {
  const result = boundaryHarness({
    createUniqueId() {
      assert.equal(this, undefined);
      return 17;
    }
  });
  assert.equal(result.completed, true);
  assert.deepEqual(result.events, boundarySuccessEvents.slice(1));
});
test('independent symbol unique ID fails before any file-system access', () => {
  const result = boundaryHarness({
    createUniqueId() {
      assert.equal(this, undefined);
      return Symbol('bad-id');
    }
  });
  assert.equal(result.completed, false);
  assert.equal(result.thrown.constructor, TypeError);
  assert.equal(result.thrown.message, 'Cannot convert a Symbol value to a string');
  assert.deepEqual(result.events, []);
});
test('independent close failure masks serializer failure without changing identity', () => {
  const reason = sentinel('close-mask');
  const result = boundaryHarness({
    value: undefined,
    override: {
      closeSync: events =>
        function () {
          events.push(['close-mask']);
          throw reason;
        }
    }
  });
  assert.equal(result.completed, false);
  assert.equal(result.thrown, reason);
  assert.deepEqual(result.events, [
    ['id'],
    ['mkdir', true],
    ['open', true],
    ['close-mask'],
    ['exists', 'tmp'],
    ['exists', 'bak']
  ]);
});
test('independent outer restoreError getter masks original without changing identity', () => {
  const reason = sentinel('restore getter-mask');
  const result = boundaryHarness({
    override: {
      writeFileSync: events =>
        function () {
          events.push(['write-throw']);
          throw {
            get restoreError() {
              throw reason;
            }
          };
        }
    }
  });
  assert.equal(result.completed, false);
  assert.equal(result.thrown, reason);
  assert.deepEqual(result.events, [
    ['id'],
    ['mkdir', true],
    ['open', true],
    ['write-throw'],
    ['close', true],
    ['exists', 'tmp'],
    ['exists', 'bak']
  ]);
});
for (const key of ['createUniqueId', 'beforeCommit'])
  for (const bad of [17, {}, Symbol('noncallable')]) {
    test(`independent noncallable ${key}/${typeof bad} retains its native error`, () => {
      const result = boundaryHarness({ [key]: bad });
      assert.equal(result.completed, false);
      assert.equal(result.thrown.constructor, TypeError);
      assert.equal(result.thrown.message, `${key} is not a function`);
      assert.deepEqual(
        result.events,
        key === 'createUniqueId'
          ? []
          : [...boundarySuccessEvents.slice(0, 7), ['exists', 'bak'], ['exists', 'tmp'], ['exists', 'bak']]
      );
    });
  }

test('normal JSON values retain fixed pretty-printed payloads and undefined writer result', () => {
  for (const [value, expected] of [
    [null, 'null'],
    [true, 'true'],
    [false, 'false'],
    [0, '0'],
    [-0, '0'],
    [1.25, '1.25'],
    [NaN, 'null'],
    [Infinity, 'null'],
    ['', '""'],
    ['中文😀', '"中文😀"'],
    [[], '[]'],
    [{}, '{}'],
    [{ a: [1, true, null], omit: undefined }, '{\n  "a": [\n    1,\n    true,\n    null\n  ]\n}']
  ]) {
    const f = fake();
    assert.equal(f.write(value), undefined);
    assert.equal(f.files.get(target), expected);
    assert.deepEqual([...f.files.keys()], [target]);
  }
});
test('sparse arrays retain null holes, inherited values and ignored extra properties', () => {
  const value = new Array(4);
  value[2] = undefined;
  value[3] = Symbol('omitted');
  const prototype = Object.create(Array.prototype);
  Object.defineProperty(prototype, '1', { value: 'inherited' });
  Object.setPrototypeOf(value, prototype);
  value.extra = 'ignored';
  const f = fake();
  f.write({ value });
  assert.equal(f.files.get(target), '{\n  "value": [\n    null,\n    "inherited",\n    null,\n    null\n  ]\n}');
});
test('custom JSON hooks preserve lookup order, receiver, property keys and exact output', () => {
  const events = [];
  const item = {
    get toJSON() {
      events.push('lookup');
      return function (key) {
        assert.equal(this, item);
        events.push(['call', key]);
        return { custom: true };
      };
    }
  };
  const f = fake();
  f.write({ item, date: new Date(0) });
  assert.deepEqual(events, ['lookup', 'lookup', ['call', 'item']]);
  assert.equal(
    f.files.get(target),
    '{\n  "item": {\n    "custom": true\n  },\n  "date": "1970-01-01T00:00:00.000Z"\n}'
  );
});
test('secure open, writes, cleanup and normal commit use exact arguments and order', () => {
  const f = fake();
  f.write(
    { a: 1 },
    {
      beforeCommit() {
        f.events.push(['guard']);
      }
    }
  );
  assert.deepEqual(f.events, [
    ['mkdir', path.dirname(target), { recursive: true }],
    ['open', 'temp', 'wx', 0o600],
    ['write', 19, '{\n  "a": 1\n}', 'utf8'],
    ['fsync', 19],
    ['close', 19],
    ['guard'],
    ['rename', 'temp', 'target'],
    ['exists', 'temp'],
    ['exists', 'backup']
  ]);
});
test('64 KiB buffering boundary and direct writes retain exact fixed chunk payloads', () => {
  for (const [value, expected] of [
    [
      ['a'.repeat(65530), 1],
      [`[\n  "${'a'.repeat(65530)}"`, ',\n  1\n]']
    ],
    [['x'.repeat(65536)], ['[\n  ', `"${'x'.repeat(65536)}"`, '\n]']],
    ['中'.repeat(65534), [`"${'中'.repeat(65534)}"`]]
  ]) {
    const actual = [];
    const f = fake({
      write({ args, effect }) {
        actual.push(args[1]);
        return effect();
      }
    });
    f.write(value);
    assert.deepEqual(actual, expected);
    assert.equal(f.files.get(target), expected.join(''));
  }
});
test('all injected fs methods use fresh getter lookup with the original port as receiver', () => {
  const f = fake();
  const gets = [];
  for (const key of [
    'mkdirSync',
    'openSync',
    'writeFileSync',
    'fsyncSync',
    'closeSync',
    'renameSync',
    'existsSync',
    'rmSync'
  ]) {
    const method = f.fileSystem[key];
    Object.defineProperty(f.fileSystem, key, {
      configurable: true,
      get() {
        assert.equal(this, f.fileSystem);
        gets.push(key);
        return function (...args) {
          assert.equal(this, f.fileSystem);
          return method.apply(this, args);
        };
      }
    });
  }
  f.write({ a: 1 });
  assert.deepEqual(gets, [
    'mkdirSync',
    'openSync',
    'writeFileSync',
    'fsyncSync',
    'closeSync',
    'renameSync',
    'existsSync',
    'existsSync'
  ]);
  gets.length = 0;
  nativeThrown(() => f.write(undefined), 'TypeError', 'JSON root must be serializable');
  assert.deepEqual(gets, ['mkdirSync', 'openSync', 'closeSync', 'existsSync', 'rmSync', 'existsSync']);
  assert.deepEqual(f.events.at(-2), ['remove', 'temp', { force: true, maxRetries: 5, retryDelay: 50 }]);
});
test('a fresh write getter failure closes the descriptor and preserves exact error identity', () => {
  const reason = sentinel('write getter');
  const f = fake();
  let gets = 0;
  const method = f.fileSystem.writeFileSync;
  Object.defineProperty(f.fileSystem, 'writeFileSync', {
    get() {
      if (++gets === 2) throw reason;
      return method;
    }
  });
  sameThrown(() => f.write({ a: 'x'.repeat(70000) }), reason);
  assert.equal(gets, 2);
  assert.equal(f.counts.write, 1);
  assert.equal(f.counts.close, 1);
  assert.equal(f.counts.fsync, undefined);
  assert.equal(f.files.get(target), 'OLD');
  assert.deepEqual([...f.files.keys()], [target]);
});

test('restoreError getter after a failed Windows restore masks original and removes backup', () => {
  const first = sentinel('first', 'EPERM');
  const restore = sentinel('restore');
  const mask = sentinel('restore getter');
  const events = [];
  const original = {
    set restoreError(value) {
      assert.equal(value, restore);
      events.push('set');
    },
    get restoreError() {
      events.push('get');
      throw mask;
    }
  };
  const f = fake({
    rename({ n, effect }) {
      if (n === 1) throw first;
      if (n === 3) throw original;
      if (n === 4) throw restore;
      return effect();
    }
  });
  sameThrown(() => f.write({ a: 1 }), mask);
  assert.deepEqual(events, ['set', 'get']);
  assert.equal(f.counts.rename, 4);
  assert.equal(f.files.has(target), false);
  assert.equal(f.files.has(temp), false);
  assert.equal(f.files.has(backup), false);
  assert.deepEqual(f.events.slice(-4), [
    ['exists', 'temp'],
    ['remove', 'temp', { force: true, maxRetries: 5, retryDelay: 50 }],
    ['exists', 'backup'],
    ['remove', 'backup', { force: true, maxRetries: 5, retryDelay: 50 }]
  ]);
});
