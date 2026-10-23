import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';

const baseline = process.env.KNOWRA_NOTE_CONTENT_POLICY_BASELINE === '1';
const commit = 'd2317b0b9a7cff4f592df533f46d330dfeb80f80';
const root = new URL('../src/modules/knowledge/application/', import.meta.url);
const policyUrl = baseline
  ? `data:text/javascript;base64,${Buffer.from(
      stripTypeScriptTypes(
        execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/application/note-content-policy.js`], {
          cwd: new URL('../../../', import.meta.url),
          encoding: 'utf8'
        })
      ).replace("'../../../errors/app-error.js'", JSON.stringify(new URL('../../../errors/app-error.js', root).href))
    ).toString('base64')}`
  : new URL('note-content-policy.js', root).href;
const { findInsecureImageUrls: find, assertNoInsecureImageUrls: reject } = await import(policyUrl);
const invalid = (fn, code) =>
  assert.throws(fn, error => error instanceof AppError && error.code === code && error.statusCode === 422);
function replace(object, key, value, fn) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { configurable: true, writable: true, value });
  try {
    return fn();
  } finally {
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else delete object[key];
  }
}

test('note content policy JS bridge preserves exact export identity', { skip: baseline }, async () => {
  const js = await import(new URL('note-content-policy.js', root));
  const ts = await import(new URL('note-content-policy.ts', root));
  assert.deepEqual(Object.keys(js), Object.keys(ts));
  for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
});

test('insecure image extraction retains source-type guard, ordering, dedup and original URL case', () => {
  for (const value of [undefined, null, 0, false, {}, [], Symbol('markdown'), new String('![x](http://bad)')]) {
    assert.deepEqual(find(value), []);
    assert.equal(reject(value), undefined);
  }
  const markdown = `<img src='http://html'>\n![a](HTTP://Inline/a)\n![dup](http://html)\n![ref][ A   B ]\n[a b]: <http://reference> "title"\n![x](https://safe)\n[unused]: http://unused`;
  assert.deepEqual(find(markdown), ['HTTP://Inline/a', 'http://html', 'http://reference']);
  invalid(() => reject(markdown), 'INSECURE_IMAGE_URL');
  for (let i = 0; i < 3; i++) assert.deepEqual(find(markdown), ['HTTP://Inline/a', 'http://html', 'http://reference']);
});

test('image syntax variants preserve existing regex limitations and ignored links', () => {
  for (const markdown of [
    '![x](<http://a>)',
    '![x](http://a "title")',
    "![x](http://a 'title')",
    '![x](http://a (title))',
    '<IMG SRC=http://a>',
    '<img src="http://a">',
    "<img src='http://a'>"
  ])
    assert.deepEqual(find(markdown), ['http://a']);
  for (const markdown of [
    '[x](http://a)',
    'http://a',
    '![x](//a)',
    '![x](https://a)',
    '![x][]\n[x]: http://a',
    '![x]\n[x]: http://a',
    '![x][missing]\n[other]: http://a'
  ])
    assert.deepEqual(find(markdown), []);
  // 原正则的尾部 \s+.* 会吸收紧随的第二行；本批不修复历史解析限制。
  assert.deepEqual(find('![x][a]\n[a]: http://first\n[A]: http://second'), ['http://first']);
});

test('regex exec stays dynamic, resets each pattern lastIndex, and preserves receiver and exceptions', () => {
  const native = RegExp.prototype.exec;
  const events = [];
  replace(
    RegExp.prototype,
    'exec',
    function (source) {
      events.push([this, this.lastIndex, source]);
      return native.call(this, source);
    },
    () => {
      find('![x](http://a)');
      find('clean');
    }
  );
  const patterns = [...new Set(events.map(event => event[0]))];
  assert.equal(patterns.length, 4);
  for (const pattern of patterns) {
    const firstCalls = events.filter(event => event[0] === pattern && (event[2] === 'clean' || event[1] === 0));
    assert.equal(firstCalls.length, 2);
    assert.equal(pattern.lastIndex, 0);
  }
  const failure = {};
  replace(
    RegExp.prototype,
    'exec',
    () => {
      throw failure;
    },
    () =>
      assert.throws(
        () => find('body'),
        error => error === failure
      )
  );
});

test('collection keeps optional add, nullish push fallback, repeated normalize and native failures', () => {
  const add = Set.prototype.add;
  const nativeTrim = String.prototype.trim;
  const events = [];
  replace(
    Set.prototype,
    'add',
    function (value) {
      if (value === 'ref') {
        events.push(['add', value, this]);
        return null;
      }
      return add.call(this, value);
    },
    () =>
      replace(
        Set.prototype,
        'push',
        function (value) {
          events.push(['push', value, this]);
          add.call(this, value);
          return 1;
        },
        () =>
          replace(
            String.prototype,
            'trim',
            function () {
              if (String(this) === ' REF ') events.push(['trim']);
              return nativeTrim.call(this);
            },
            () => {
              assert.deepEqual(find('![x][ REF ]\n[ref]: http://a'), ['http://a']);
            }
          )
      )
  );
  assert.deepEqual(
    events.map(event => event[0]),
    ['trim', 'add', 'trim', 'push']
  );
  assert.equal(events[1][2], events[3][2]);
  replace(
    Set.prototype,
    'add',
    function (value) {
      if (value === 'ref') return undefined;
      return add.call(this, value);
    },
    () => assert.throws(() => find('![x][ref]'), TypeError)
  );
  replace(
    Array.prototype,
    'add',
    function (value) {
      return value;
    },
    () => assert.deepEqual(find('![x](http://a)'), [])
  );
});

test('non-string input is never coerced while AppError identity, text and status stay exact', () => {
  const failure = {};
  const input = {
    toString() {
      throw failure;
    },
    [Symbol.toPrimitive]() {
      throw failure;
    }
  };
  assert.deepEqual(find(input), []);
  assert.equal(reject(input), undefined);
  assert.throws(
    () => reject('![x](http://a)'),
    error => {
      assert.ok(error instanceof AppError);
      assert.equal(error.name, 'AppError');
      assert.equal(error.code, 'INSECURE_IMAGE_URL');
      assert.equal(error.statusCode, 422);
      assert.equal(
        error.message,
        '检测到不安全的 HTTP 图片地址。请先下载图片，再通过粘贴或上传保存为 Knowra 本地附件。'
      );
      return true;
    }
  );
});

test('reference IDs retain whitespace folding, lowercase and inherited native conversion failures', () => {
  assert.deepEqual(find('![x][ A\t B ]\n[a b]: http://a'), ['http://a']);
  assert.deepEqual(find('![x][REF]\n[ref]: http://a'), ['http://a']);
  const native = String.prototype.trim;
  const failure = {};
  replace(
    String.prototype,
    'trim',
    function () {
      if (String(this) === ' BAD ') throw failure;
      return native.call(this);
    },
    () =>
      assert.throws(
        () => find('![x][ BAD ]'),
        error => error === failure
      )
  );
});

test('reference membership keeps dynamic has receiver, truthiness and thrown identity', () => {
  const native = Set.prototype.has;
  const receivers = [];
  let result;
  replace(
    Set.prototype,
    'has',
    function (value) {
      if (value === 'missing') {
        receivers.push(this);
        return {};
      }
      return native.call(this, value);
    },
    () => {
      result = find('[missing]: http://a');
    }
  );
  assert.deepEqual(result, ['http://a']);
  assert.equal(receivers.length, 1);
  assert.equal(receivers[0].size, 0);
  const failure = {};
  replace(
    Set.prototype,
    'has',
    function (value) {
      if (value === 'ref') throw failure;
      return native.call(this, value);
    },
    () =>
      assert.throws(
        () => find('![x][ref]\n[ref]: http://a'),
        error => error === failure
      )
  );
});

test('optional add still throws for a non-callable property and skips absent call arguments', () => {
  replace(Array.prototype, 'add', 3, () => assert.throws(() => find('![x](http://a)'), TypeError));
  const nativeTrim = String.prototype.trim;
  let trims = 0;
  replace(Set.prototype, 'add', undefined, () =>
    replace(
      Set.prototype,
      'push',
      function () {
        return 1;
      },
      () =>
        replace(
          String.prototype,
          'trim',
          function () {
            if (String(this) === ' ref ') trims++;
            return nativeTrim.call(this);
          },
          () => {
            // 末尾 new Set(urls) 仍保留缺失 add 的原生异常，但此前只执行 push 分支的一次规范化。
            assert.throws(() => find('![x][ ref ]'), TypeError);
          }
        )
    )
  );
  assert.equal(trims, 1);
});

test('dynamic exec preserves capture identity without coercing or repairing malformed native results', () => {
  const native = RegExp.prototype.exec;
  const token = {};
  let calls = 0;
  let result;
  replace(
    RegExp.prototype,
    'exec',
    function (source) {
      if (this.source.startsWith('!\\[') && this.source.includes('http:')) {
        if (++calls === 1) return ['match', token];
        return null;
      }
      return native.call(this, source);
    },
    () => {
      result = find('body');
    }
  );
  assert.equal(result.length, 1);
  assert.equal(result[0], token);
  assert.equal(calls, 2);
});

test('custom collection and iterator methods preserve unknown element identities', () => {
  const token = {};
  const push = Array.prototype.push;
  let result;
  replace(
    Array.prototype,
    'add',
    function () {
      return push.call(this, token);
    },
    () => {
      result = find('![x](http://a)');
    }
  );
  assert.equal(result[0], token);
  const arrayIterator = Array.prototype[Symbol.iterator];
  replace(
    Array.prototype,
    Symbol.iterator,
    function* () {
      if (this.length === 1 && this[0] === 'http://a') yield token;
      else yield* arrayIterator.call(this);
    },
    () => {
      result = find('![x](http://a)');
    }
  );
  assert.equal(result[0], token);
  const setIterator = Set.prototype[Symbol.iterator];
  replace(
    Set.prototype,
    Symbol.iterator,
    function* () {
      if (this.has('http://a')) yield token;
      else yield* setIterator.call(this);
    },
    () => {
      result = find('![x](http://a)');
    }
  );
  assert.equal(result[0], token);
});
