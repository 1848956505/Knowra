import assert from 'node:assert/strict';

// 手写固定 oracle；独立于实现、Git 与 node:test 注册，可供旧叶子和变异验证复用。
export function migrationReportContractCases(api) {
  const { createMigrationReport: create } = api;
  const cases = [];
  const add = (name, run) => cases.push({ name, run });
  const keys = [
    'phase',
    'migration',
    'generatedAt',
    'sourceFile',
    'storageRootDir',
    'status',
    'counts',
    'repairs',
    'warnings',
    'errors',
    'attachmentFiles',
    'checksum'
  ];
  add('exports, function lengths and exact tool shape', () => {
    assert.deepEqual(Object.keys(api), ['createMigrationReport']);
    assert.equal(create.length, 0);
    const tools = create();
    assert.deepEqual(Object.keys(tools), ['report', 'count', 'repair', 'warn', 'error', 'finish']);
    assert.deepEqual(
      ['count', 'repair', 'warn', 'error', 'finish'].map(k => tools[k].length),
      [2, 2, 2, 2, 0]
    );
    assert.equal(create.constructor.name, 'Function');
  });
  add('default schema, initial values, order and JSON bytes', () => {
    const { report } = create({ generatedAt: 'stamp' });
    assert.deepEqual(Object.keys(report), keys);
    assert.equal(
      JSON.stringify(report),
      '{"phase":"Phase1.0","migration":"json-to-postgres","generatedAt":"stamp","sourceFile":null,"storageRootDir":null,"status":"ready","counts":{},"repairs":[],"warnings":[],"errors":[],"attachmentFiles":[],"checksum":null}'
    );
    assert.equal(Object.getPrototypeOf(report), Object.prototype);
    assert.equal(Object.getPrototypeOf(report.counts), Object.prototype);
  });
  add('destructuring reads source, root, time once in that order and date only on undefined', () => {
    const events = [],
      OriginalDate = globalThis.Date;
    globalThis.Date = class extends OriginalDate {
      constructor() {
        events.push('new Date');
        super(0);
      }
      toISOString() {
        events.push('toISOString');
        return 'clock';
      }
    };
    try {
      const options = Object.fromEntries([]);
      for (const name of ['sourceFile', 'storageRootDir', 'generatedAt'])
        Object.defineProperty(options, name, {
          get() {
            events.push(name);
            return undefined;
          }
        });
      const report = create(options).report;
      assert.deepEqual(events, ['sourceFile', 'storageRootDir', 'generatedAt', 'new Date', 'toISOString']);
      assert.equal(report.generatedAt, 'clock');
      events.length = 0;
      assert.equal(create({ generatedAt: null }).report.generatedAt, null);
      assert.deepEqual(events, []);
      create();
      assert.deepEqual(events, ['new Date', 'toISOString']);
    } finally {
      globalThis.Date = OriginalDate;
    }
  });
  add('nullish source/root only; other scalar values and object identities remain raw', () => {
    for (const value of [undefined, null, false, 0, '', NaN, 2n, Symbol('value'), { nested: true }]) {
      const report = create({ sourceFile: value, storageRootDir: value, generatedAt: value }).report;
      assert.equal(report.sourceFile, value ?? null);
      assert.equal(report.storageRootDir, value ?? null);
      if (value !== undefined) assert.equal(report.generatedAt, value);
    }
  });
  add('unrelated options getters are never read', () => {
    const opts = {
      generatedAt: 't',
      get apiKey() {
        throw Error('must not read');
      },
      get privateData() {
        throw Error('must not read');
      }
    };
    create(opts);
  });
  add('null options native exception and getter exception identity stop evaluation', () => {
    assert.throws(() => create(null), TypeError);
    const sentinel = {},
      reads = [];
    assert.throws(
      () =>
        create({
          get sourceFile() {
            reads.push('source');
            throw sentinel;
          },
          get storageRootDir() {
            reads.push('root');
            return undefined;
          }
        }),
      e => e === sentinel
    );
    assert.deepEqual(reads, ['source']);
  });
  add('primitive options boxing and inherited option properties are unchanged', () => {
    assert.equal(create('primitive').report.sourceFile, null);
    const options = Object.create({
      sourceFile: 'inherited-source',
      storageRootDir: 'inherited-root',
      generatedAt: false
    });
    assert.equal(create(options).report.sourceFile, 'inherited-source');
    assert.equal(create(options).report.generatedAt, false);
  });
  add('reports and all mutable child containers are fresh and unfrozen', () => {
    const a = create().report,
      b = create().report;
    assert.notEqual(a, b);
    for (const key of ['counts', 'repairs', 'warnings', 'errors', 'attachmentFiles']) {
      assert.notEqual(a[key], b[key]);
      assert.equal(Object.isFrozen(a[key]), false);
    }
    assert.equal(Object.isFrozen(a), false);
  });
  add('count is raw assignment without validation or normalization', () => {
    const t = create();
    const value = { marker: 'raw' };
    assert.equal(t.count('notes', value), undefined);
    assert.equal(t.report.counts.notes, value);
    t.count('notes', undefined);
    assert.equal(Object.hasOwn(t.report.counts, 'notes'), true);
    assert.equal(t.report.counts.notes, undefined);
    t.count(-1, NaN);
    assert.equal(Number.isNaN(t.report.counts['-1']), true);
    const symbol = Symbol('s');
    t.count(symbol, 1n);
    assert.equal(t.report.counts[symbol], 1n);
  });
  add('count retains ordinary-object inherited and __proto__ semantics', () => {
    const t = create(),
      proto = { marker: 'prototype' };
    t.count('__proto__', proto);
    assert.equal(Object.getPrototypeOf(t.report.counts), proto);
    assert.equal(Object.hasOwn(t.report.counts, '__proto__'), false);
    t.count('constructor', false);
    assert.equal(t.report.counts.constructor, false);
    t.count('toString', 'text');
    assert.equal(t.report.counts.toString, 'text');
  });
  add('count preserves inherited setter receiver and thrown identity', () => {
    const t = create(),
      sentinel = {},
      value = {};
    const receiver = {};
    Object.setPrototypeOf(t.report.counts, {
      set entry(v) {
        receiver.value = this;
        assert.equal(v, value);
        throw sentinel;
      }
    });
    assert.throws(
      () => t.count('entry', value),
      e => e === sentinel
    );
    assert.equal(receiver.value, t.report.counts);
  });
  add('count reads current counts before ToPropertyKey and does not stringify values', () => {
    const t = create(),
      events = [],
      target = {};
    Object.defineProperty(t.report, 'counts', {
      get() {
        events.push('counts');
        return target;
      }
    });
    const key = {
        [Symbol.toPrimitive](hint) {
          events.push(`key:${hint}`);
          return 'key';
        }
      },
      value = {
        toString() {
          throw Error('no conversion');
        }
      };
    t.count(key, value);
    assert.deepEqual(events, ['counts', 'key:string']);
    assert.equal(target.key, value);
  });
  add('detached methods close over original report, not this or replacement tools.report', () => {
    const t = create(),
      original = t.report,
      replacement = create().report;
    const { count, repair, warn, error, finish } = t;
    t.report = replacement;
    count('x', 1);
    repair('r', 'm');
    warn('w', 'm');
    error('e', 'm');
    assert.equal(original.counts.x, 1);
    assert.equal(original.repairs.length, 1);
    assert.equal(original.warnings.length, 1);
    assert.equal(original.errors.length, 1);
    assert.equal(finish(), original);
    assert.equal(replacement.status, 'ready');
    assert.equal(replacement.errors.length, 0);
  });
  add('replaced nested containers are used on each invocation', () => {
    const t = create(),
      counts = {},
      repairs = [],
      warnings = [],
      errors = [];
    Object.assign(t.report, { counts, repairs, warnings, errors });
    t.count('x', 1);
    t.repair('r', 'm');
    t.warn('w', 'm');
    t.error('e', 'm');
    assert.equal(counts.x, 1);
    assert.equal(repairs[0].code, 'r');
    assert.equal(warnings[0].code, 'w');
    assert.equal(errors[0].code, 'e');
  });
  add('each entry is fresh; details override code/message and nested values retain identity', () => {
    const t = create(),
      nested = {},
      code = { marker: 'code' },
      message = Symbol('message');
    const details = { code, message, nested };
    t.repair('original-code', 'original-message', details);
    t.repair('original-code', 'original-message', details);
    const [a, b] = t.report.repairs;
    assert.notEqual(a, b);
    assert.notEqual(a, details);
    assert.equal(a.code, code);
    assert.equal(a.message, message);
    assert.equal(a.nested, nested);
    t.warn('old', 'old', { code: undefined, message: null });
    assert.deepEqual(t.report.warnings[0], { code: undefined, message: null });
  });
  add('details spread enumerability, symbols, insertion order and data descriptors', () => {
    const t = create(),
      symbol = Symbol('detail'),
      events = [];
    const details = Object.create({ inherited: 'ignored' });
    Object.defineProperty(details, 'hidden', { value: 'ignored' });
    Object.defineProperty(details, 'extra', {
      enumerable: true,
      get() {
        events.push('extra');
        return 4;
      }
    });
    details[symbol] = 5;
    t.repair('c', 'm', details);
    const entry = t.report.repairs[0];
    assert.deepEqual(events, ['extra']);
    assert.deepEqual(Reflect.ownKeys(entry), ['code', 'message', 'extra', symbol]);
    assert.deepEqual(Object.getOwnPropertyDescriptor(entry, 'extra'), {
      value: 4,
      writable: true,
      enumerable: true,
      configurable: true
    });
    assert.equal(Object.hasOwn(entry, 'inherited'), false);
  });
  add('details __proto__ is copied as own data property without changing entry prototype', () => {
    const t = create(),
      details = JSON.parse('{"__proto__":{"marker":"data"}}');
    t.repair('c', 'm', details);
    const entry = t.report.repairs[0];
    assert.equal(Object.getPrototypeOf(entry), Object.prototype);
    assert.equal(Object.hasOwn(entry, '__proto__'), true);
    assert.equal(entry.__proto__, details.__proto__);
  });
  add('JS-only primitive details retain object-spread semantics, including null/undefined', () => {
    const t = create();
    for (const details of [undefined, null, false, 42, 2n, Symbol('x')]) t.warn('c', 'm', details);
    for (const entry of t.report.warnings) assert.deepEqual(entry, { code: 'c', message: 'm' });
    t.warn('c', 'm', 'ab');
    assert.deepEqual(t.report.warnings.at(-1), { 0: 'a', 1: 'b', code: 'c', message: 'm' });
    const fn = () => 0;
    fn.extra = 1;
    t.warn('c', 'm', fn);
    assert.equal(t.report.warnings.at(-1).extra, 1);
  });
  add('push method lookup happens before details spread and preserves original receiver', () => {
    const t = create(),
      events = [],
      array = [];
    Object.defineProperty(t.report, 'repairs', {
      get() {
        events.push('repairs');
        return array;
      }
    });
    Object.defineProperty(array, 'push', {
      get() {
        events.push('push get');
        return function (entry) {
          events.push('push call');
          assert.equal(this, array);
          assert.equal(entry.extra, 1);
        };
      }
    });
    const details = {
      get extra() {
        events.push('details');
        return 1;
      }
    };
    assert.equal(t.repair('c', 'm', details), undefined);
    assert.deepEqual(events, ['repairs', 'push get', 'details', 'push call']);
    assert.equal(array.length, 0);
  });
  add('details getter error is unchanged and occurs before error status transition', () => {
    const t = create(),
      sentinel = {};
    assert.throws(
      () =>
        t.error('c', 'm', {
          get extra() {
            throw sentinel;
          }
        }),
      e => e === sentinel
    );
    assert.equal(t.report.errors.length, 0);
    assert.equal(t.report.status, 'ready');
  });
  add('push failure preserves thrown identity and leaves status unchanged', () => {
    const t = create(),
      sentinel = {};
    t.report.errors.push = () => {
      throw sentinel;
    };
    assert.throws(
      () => t.error('c', 'm'),
      e => e === sentinel
    );
    assert.equal(t.report.status, 'ready');
  });
  add('error pushes before blocked status; setter failure does not roll back', () => {
    const t = create(),
      events = [],
      sentinel = {};
    Object.defineProperty(t.report, 'status', {
      get() {
        return 'external';
      },
      set(v) {
        events.push(v);
        assert.equal(t.report.errors.length, 1);
        throw sentinel;
      }
    });
    assert.throws(
      () => t.error('c', 'm'),
      e => e === sentinel
    );
    assert.deepEqual(events, ['blocked']);
    assert.equal(t.report.errors[0].code, 'c');
  });
  add('repair and warn never set status; error sets blocked even after custom push skips append', () => {
    const t = create();
    t.report.status = 'custom';
    assert.equal(t.repair('c', 'm'), undefined);
    assert.equal(t.warn('c', 'm'), undefined);
    assert.equal(t.report.status, 'custom');
    t.report.errors.push = () => {
      t.report.status = 'inside-push';
      return 42;
    };
    assert.equal(t.error('c', 'm'), undefined);
    assert.equal(t.report.errors.length, 0);
    assert.equal(t.report.status, 'blocked');
  });
  add('finish defaults derive from current errors length and reset after errors cleared', () => {
    const t = create();
    assert.equal(t.finish(), t.report);
    assert.equal(t.report.status, 'ready');
    t.error('c', 'm');
    t.finish();
    assert.equal(t.report.status, 'blocked');
    t.report.errors.length = 0;
    t.finish(undefined);
    assert.equal(t.report.status, 'ready');
  });
  add('finish explicit raw status bypasses errors getter and retains value identity', () => {
    const t = create();
    Object.defineProperty(t.report, 'errors', {
      get() {
        throw Error('must not read');
      }
    });
    for (const value of [null, false, 0, '', {}, Symbol('state'), 2n]) {
      assert.equal(t.finish(value), t.report);
      assert.equal(t.report.status, value);
    }
  });
  add('finish default reads errors and length once, then writes status and returns same object', () => {
    const t = create(),
      events = [];
    Object.defineProperty(t.report, 'errors', {
      get() {
        events.push('errors');
        return {
          get length() {
            events.push('length');
            return '0';
          }
        };
      }
    });
    Object.defineProperty(t.report, 'status', {
      set(v) {
        events.push(`status:${v}`);
      }
    });
    assert.equal(t.finish(), t.report);
    assert.deepEqual(events, ['errors', 'length', 'status:blocked']);
  });
  add('finish errors length throw identity prevents status write', () => {
    const t = create(),
      sentinel = {};
    Object.defineProperty(t.report, 'errors', {
      get() {
        return {
          get length() {
            throw sentinel;
          }
        };
      }
    });
    assert.throws(
      () => t.finish(),
      e => e === sentinel
    );
    assert.equal(t.report.status, 'ready');
  });
  add('finish frozen report assignment throws even if value is unchanged', () => {
    const t = create();
    Object.freeze(t.report);
    assert.throws(() => t.finish(), TypeError);
  });
  add('external checksum, attachment entries and custom metadata stay mutable and unfiltered', () => {
    const t = create(),
      attachment = { exists: true },
      checksum = { raw: true };
    t.report.attachmentFiles.push(attachment);
    t.report.checksum = checksum;
    t.report.appliedAt = 'later';
    t.report.sourceBackupFile = 'backup';
    const result = t.finish('applied');
    assert.equal(result.attachmentFiles[0], attachment);
    assert.equal(result.checksum, checksum);
    assert.equal(result.appliedAt, 'later');
    assert.equal(result.sourceBackupFile, 'backup');
  });
  add('cyclic/raw values are not cloned or serialized by report construction and mutations', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    const t = create({ sourceFile: cyclic });
    t.count('cycles', cyclic);
    t.error(cyclic, cyclic, { nested: cyclic });
    t.finish(cyclic);
    assert.equal(t.report.errors[0].code, cyclic);
    assert.throws(() => JSON.stringify(t.report), TypeError);
  });

  add('default Date is fresh for each construction and absent for all explicit values', () => {
    const OriginalDate = globalThis.Date;
    let ticks = 0;
    globalThis.Date = class {
      constructor() {
        this.tick = ++ticks;
      }
      toISOString() {
        return `stamp:${this.tick}`;
      }
    };
    try {
      assert.equal(create().report.generatedAt, 'stamp:1');
      assert.equal(create({ generatedAt: undefined }).report.generatedAt, 'stamp:2');
      for (const value of [null, false, 0, '', NaN, {}, Symbol('time'), 3n])
        assert.equal(create({ generatedAt: value }).report.generatedAt, value);
      assert.equal(ticks, 2);
    } finally {
      globalThis.Date = OriginalDate;
    }
  });
  for (const at of ['constructor', 'toISOString'])
    add(`default Date ${at} exception preserves identity and read order`, () => {
      const OriginalDate = globalThis.Date,
        sentinel = {},
        events = [];
      globalThis.Date = class {
        constructor() {
          events.push('constructor');
          if (at === 'constructor') throw sentinel;
        }
        toISOString() {
          events.push('toISOString');
          throw sentinel;
        }
      };
      try {
        assert.throws(
          () =>
            create(
              new Proxy(
                {},
                {
                  get(target, key) {
                    events.push(key);
                  }
                }
              )
            ),
          error => error === sentinel
        );
        assert.deepEqual(events, [
          'sourceFile',
          'storageRootDir',
          'generatedAt',
          'constructor',
          ...(at === 'toISOString' ? ['toISOString'] : [])
        ]);
      } finally {
        globalThis.Date = OriginalDate;
      }
    });
  for (const field of ['sourceFile', 'storageRootDir', 'generatedAt'])
    add(`options ${field} getter failure stops subsequent reads`, () => {
      const sentinel = {},
        events = [];
      const fields = ['sourceFile', 'storageRootDir', 'generatedAt'];
      const options = new Proxy(
        {},
        {
          get(target, key) {
            events.push(key);
            if (key === field) throw sentinel;
            return 'x';
          }
        }
      );
      assert.throws(
        () => create(options),
        error => error === sentinel
      );
      assert.deepEqual(events, fields.slice(0, fields.indexOf(field) + 1));
    });
  add('all exposed methods are synchronous own writable methods and disregard this', () => {
    const tools = create({ generatedAt: 't' });
    for (const name of ['count', 'repair', 'warn', 'error', 'finish']) {
      assert.equal(tools[name].constructor.name, 'Function');
      assert.deepEqual(Object.getOwnPropertyDescriptor(tools, name), {
        value: tools[name],
        writable: true,
        enumerable: true,
        configurable: true
      });
      const result = tools[name].call(
        new Proxy(
          {},
          {
            get() {
              throw Error('this must not be used');
            }
          }
        ),
        'x',
        'y'
      );
      assert.equal(result, name === 'finish' ? tools.report : undefined);
    }
    for (const name of keys)
      assert.deepEqual(Object.getOwnPropertyDescriptor(tools.report, name), {
        value: tools.report[name],
        writable: true,
        enumerable: true,
        configurable: true
      });
  });
  add('count coercion failure preserves identity after current container lookup', () => {
    const tools = create(),
      sentinel = {},
      events = [];
    Object.defineProperty(tools.report, 'counts', {
      get() {
        events.push('counts');
        return {};
      }
    });
    assert.throws(
      () =>
        tools.count(
          {
            [Symbol.toPrimitive](hint) {
              events.push(hint);
              throw sentinel;
            }
          },
          7
        ),
      error => error === sentinel
    );
    assert.deepEqual(events, ['counts', 'string']);
  });
  add('count getter, proxy setter and frozen assignment fail without wrapping', () => {
    const tools = create(),
      sentinel = {},
      events = [];
    Object.defineProperty(tools.report, 'counts', {
      configurable: true,
      get() {
        throw sentinel;
      }
    });
    assert.throws(
      () => tools.count('x', 1),
      error => error === sentinel
    );
    Object.defineProperty(tools.report, 'counts', {
      configurable: true,
      writable: true,
      value: new Proxy(
        {},
        {
          set(target, key, value, receiver) {
            events.push([key, value, receiver === tools.report.counts]);
            throw sentinel;
          }
        }
      )
    });
    assert.throws(
      () => tools.count('x', 9),
      error => error === sentinel
    );
    assert.deepEqual(events, [['x', 9, true]]);
    tools.report.counts = Object.freeze({});
    assert.throws(() => tools.count('x', 1), TypeError);
    tools.report.counts = null;
    assert.throws(() => tools.count('x', 1), TypeError);
  });
  for (const [method, field] of [
    ['repair', 'repairs'],
    ['warn', 'warnings'],
    ['error', 'errors']
  ]) {
    add(`${method} raw absent code/message, array/function details and explicit overrides`, () => {
      const tools = create();
      tools[method]();
      assert.deepEqual(Reflect.ownKeys(tools.report[field][0]), ['code', 'message']);
      assert.deepEqual(tools.report[field][0], { code: undefined, message: undefined });
      const raw = {},
        sym = Symbol('message');
      tools[method](raw, sym, [raw]);
      const entry = tools.report[field][1];
      assert.equal(entry.code, raw);
      assert.equal(entry.message, sym);
      assert.equal(entry[0], raw);
      const fn = () => 0;
      fn.code = null;
      fn.message = undefined;
      tools[method]('old', 'old', fn);
      assert.deepEqual(tools.report[field][2], { code: null, message: undefined });
    });
    add(`${method} preserves full proxy spread order and dynamic push receiver`, () => {
      const tools = create(),
        events = [],
        symbol = Symbol('s'),
        target = {},
        list = [];
      for (const key of ['first', 'code', 'message', 'last', symbol])
        Object.defineProperty(target, key, { enumerable: true, value: key });
      Object.defineProperty(target, 'hidden', { value: 'ignored' });
      const details = new Proxy(target, {
        ownKeys(value) {
          events.push('ownKeys');
          return Reflect.ownKeys(value);
        },
        getOwnPropertyDescriptor(value, key) {
          events.push(`descriptor:${String(key)}`);
          return Reflect.getOwnPropertyDescriptor(value, key);
        },
        get(value, key) {
          events.push(`get:${String(key)}`);
          return Reflect.get(value, key);
        }
      });
      Object.defineProperty(tools.report, field, {
        get() {
          events.push(field);
          return list;
        }
      });
      Object.defineProperty(list, 'push', {
        get() {
          events.push('push:get');
          return function (entry) {
            events.push('push:call');
            assert.equal(this, list);
            assert.equal(entry[symbol], symbol);
            assert.equal(entry.code, 'code');
          };
        }
      });
      assert.equal(tools[method]('original', 'original', details), undefined);
      assert.deepEqual(events, [
        field,
        'push:get',
        'ownKeys',
        'descriptor:first',
        'get:first',
        'descriptor:code',
        'get:code',
        'descriptor:message',
        'get:message',
        'descriptor:last',
        'get:last',
        'descriptor:hidden',
        'descriptor:Symbol(s)',
        'get:Symbol(s)',
        'push:call'
      ]);
      assert.equal(tools.report.status, method === 'error' ? 'blocked' : 'ready');
    });
    for (const trap of ['ownKeys', 'getOwnPropertyDescriptor', 'get'])
      add(`${method} details proxy ${trap} exception preserves identity without append or status write`, () => {
        const tools = create(),
          sentinel = {};
        const details = new Proxy(
          { extra: 1 },
          {
            [trap]() {
              throw sentinel;
            }
          }
        );
        assert.throws(
          () => tools[method]('c', 'm', details),
          error => error === sentinel
        );
        assert.equal(tools.report[field].length, 0);
        assert.equal(tools.report.status, 'ready');
      });
    for (const at of ['container', 'push lookup', 'push call'])
      add(`${method} ${at} exception precedes later effects`, () => {
        const tools = create(),
          sentinel = {},
          events = [],
          list = [];
        Object.defineProperty(tools.report, field, {
          get() {
            events.push('container');
            if (at === 'container') throw sentinel;
            return list;
          }
        });
        Object.defineProperty(list, 'push', {
          get() {
            events.push('push lookup');
            if (at === 'push lookup') throw sentinel;
            return function () {
              events.push('push call');
              throw sentinel;
            };
          }
        });
        assert.throws(
          () =>
            tools[method]('c', 'm', {
              get extra() {
                events.push('details');
                return 1;
              }
            }),
          error => error === sentinel
        );
        assert.deepEqual(
          events,
          at === 'container'
            ? ['container']
            : at === 'push lookup'
              ? ['container', 'push lookup']
              : ['container', 'push lookup', 'details', 'push call']
        );
        assert.equal(tools.report.status, 'ready');
      });
    add(`${method} non-callable push still evaluates details before native TypeError`, () => {
      const tools = create(),
        events = [];
      tools.report[field].push = null;
      assert.throws(
        () =>
          tools[method]('c', 'm', {
            get value() {
              events.push('details');
              return 1;
            }
          }),
        TypeError
      );
      assert.deepEqual(events, ['details']);
      assert.equal(tools.report.status, 'ready');
    });
    add(`${method} frozen current container throws and does not set status`, () => {
      const tools = create();
      Object.freeze(tools.report[field]);
      assert.throws(() => tools[method]('c', 'm'), TypeError);
      assert.equal(tools.report.status, 'ready');
    });
  }
  add('finish uses uncoerced length truthiness including exotic primitive values', () => {
    for (const length of [undefined, null, false, 0, -0, '', NaN, 0n, '0', -1, 1, {}, [], Symbol('length'), 1n]) {
      const tools = create();
      tools.report.errors = { length };
      assert.equal(tools.finish(), tools.report);
      assert.equal(tools.report.status, length ? 'blocked' : 'ready');
    }
  });
  add('finish errors getter and status setter exceptions preserve exact identity', () => {
    const tools = create(),
      sentinel = {};
    Object.defineProperty(tools.report, 'errors', {
      configurable: true,
      get() {
        throw sentinel;
      }
    });
    assert.throws(
      () => tools.finish(),
      error => error === sentinel
    );
    tools.finish(null);
    assert.equal(tools.report.status, null);
    Object.defineProperty(tools.report, 'errors', { value: [] });
    Object.defineProperty(tools.report, 'status', {
      set() {
        throw sentinel;
      }
    });
    assert.throws(
      () => tools.finish('external'),
      error => error === sentinel
    );
  });
  add('finish observes push-time replacement of the original errors container', () => {
    const tools = create();
    tools.report.errors.push = () => {
      tools.report.errors = [];
    };
    tools.error('c', 'm');
    assert.equal(tools.report.status, 'blocked');
    assert.equal(tools.finish().status, 'ready');
  });

  return cases;
}
