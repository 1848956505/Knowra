import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';

const directory = new URL('../src/modules/knowledge/application/dto/', import.meta.url);
const baseline = process.env.KNOWRA_DTO_FOUNDATION_BASELINE === '1';
const baselineCommit = 'd06d11127ee697a094ca2cb63fddbbc7f4f7a049';
const original = name =>
  execFileSync('git', ['show', `${baselineCommit}:apps/api/src/modules/knowledge/application/dto/${name}.js`], {
    cwd: new URL('../../../', import.meta.url),
    encoding: 'utf8'
  });
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const sharedUrl = baseline
  ? dataUrl(original('_shared').replace('../knowledge-errors.js', new URL('../knowledge-errors.js', directory).href))
  : new URL('_shared.js', directory).href;
const spaceUrl = baseline
  ? dataUrl(original('knowledge-space.dto').replace('./_shared.js', sharedUrl))
  : new URL('knowledge-space.dto.js', directory).href;
const shared = await import(sharedUrl);
const { trimIfString, createSlug, createPrefixedId, requireText, normalizeOptionalId, normalizeIdList } = shared;
const { buildDefaultKnowledgeSpaceDto: build } = await import(spaceUrl);
const domainError = error =>
  error instanceof AppError && error.code === 'INVALID' && error.message === 'invalid' && error.statusCode === 422;
const invalid = fn => assert.throws(fn, domainError);

test('DTO foundation JS bridges preserve exact TS exports', { skip: baseline }, async () => {
  for (const name of ['_shared', 'knowledge-space.dto']) {
    const js = await import(new URL(`${name}.js`, directory));
    const ts = await import(new URL(`${name}.ts`, directory));
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
});

test('trimIfString trims only strings and preserves non-string identities', () => {
  assert.equal(trimIfString(' \t hello \n'), 'hello');
  for (const value of [undefined, null, false, 0, NaN, 1n, Symbol('x'), {}, [], new String(' x ')]) {
    assert.equal(trimIfString(value), value);
  }
  const value = {
    toString() {
      throw new Error('must not coerce');
    }
  };
  assert.equal(trimIfString(value), value);
});

test('slug preserves nullish fallback, String coercion, ASCII filtering and truncation order', () => {
  for (const [value, expected] of [
    [undefined, ''],
    [null, ''],
    [false, 'false'],
    [12n, '12'],
    [Symbol('A B'), 'symbol-a-b'],
    [' HéLLo__世界 X ', 'h-llo-x'],
    ['a'.repeat(47) + ' b', 'a'.repeat(47) + '-']
  ]) {
    assert.equal(createSlug(value), expected);
  }
  const events = [];
  assert.equal(
    createSlug({
      [Symbol.toPrimitive](hint) {
        events.push(hint);
        return ' A B ';
      }
    }),
    'a-b'
  );
  assert.deepEqual(events, ['string']);
  const error = {};
  assert.throws(
    () =>
      createSlug({
        toString() {
          throw error;
        }
      }),
    thrown => thrown === error
  );
});

test('prefixed IDs preserve seed/prefix/UUID evaluation order and defaults', t => {
  const events = [];
  t.mock.method(crypto, 'randomUUID', () => {
    events.push('uuid');
    return 'synthetic-uuid';
  });
  syncBuiltinESMExports();
  try {
    assert.equal(
      createPrefixedId(
        {
          toString() {
            events.push('prefix');
            return ' p ';
          }
        },
        {
          toString() {
            events.push('seed');
            return ' S E ';
          }
        }
      ),
      ' p -s-e-synthetic-uuid'
    );
    assert.deepEqual(events, ['seed', 'prefix', 'uuid']);
    assert.equal(createPrefixedId(undefined), 'undefined-synthetic-uuid');
    assert.equal(createPrefixedId(null, null), 'null-synthetic-uuid');
    assert.equal(createPrefixedId('x', '世界'), 'x-synthetic-uuid');
    events.length = 0;
    assert.throws(() => createPrefixedId(Symbol('x'), 'seed'), TypeError);
    assert.deepEqual(events, []);
    const failure = {};
    assert.throws(
      () =>
        createPrefixedId('x', {
          toString() {
            throw failure;
          }
        }),
      e => e === failure
    );
    assert.deepEqual(events, []);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test('requireText preserves exact validation and refuses coercible non-strings', () => {
  assert.equal(requireText(' x ', 'INVALID', 'invalid'), 'x');
  for (const value of [undefined, null, false, 0, 1n, Symbol('x'), {}, [], new String('x'), '', ' \t\n']) {
    invalid(() => requireText(value, 'INVALID', 'invalid'));
  }
  invalid(() =>
    requireText(
      {
        toString() {
          throw new Error('must not coerce');
        }
      },
      'INVALID',
      'invalid'
    )
  );
});

test('optional IDs preserve nullish handling without weakening text validation', () => {
  assert.equal(normalizeOptionalId(null, 'INVALID', 'invalid'), null);
  assert.equal(normalizeOptionalId(undefined, 'INVALID', 'invalid'), null);
  assert.equal(normalizeOptionalId(' x ', 'INVALID', 'invalid'), 'x');
  for (const value of ['', false, 0, {}, []]) invalid(() => normalizeOptionalId(value, 'INVALID', 'invalid'));
});

test('ID lists preserve stable deduplication, sparse holes and explicit undefined rejection', () => {
  assert.deepEqual(normalizeIdList([' b ', 'a', 'b'], 'INVALID', 'invalid'), ['b', 'a']);
  assert.deepEqual(normalizeIdList(new Array(3), 'INVALID', 'invalid'), [undefined]);
  const sparse = new Array(4);
  sparse[1] = ' x ';
  sparse[3] = 'x';
  assert.deepEqual(normalizeIdList(sparse, 'INVALID', 'invalid'), [undefined, 'x']);
  invalid(() => normalizeIdList([undefined], 'INVALID', 'invalid'));
  for (const value of [undefined, null, {}, 'x', new Set(['x'])])
    invalid(() => normalizeIdList(value, 'INVALID', 'invalid'));
});

test('ID lists preserve map getter, this, species, iteration and thrown identity', () => {
  const marker = {};
  const events = [];
  const input = [];
  Object.defineProperty(input, 'map', {
    get() {
      events.push('map');
      return function (callback) {
        assert.equal(this, input);
        assert.equal(callback(' x '), 'x');
        events.push('call');
        return {
          *[Symbol.iterator]() {
            events.push('iterate');
            yield marker;
            yield marker;
            yield 7;
          }
        };
      };
    }
  });
  assert.deepEqual(normalizeIdList(input, 'INVALID', 'invalid'), [marker, 7]);
  assert.deepEqual(events, ['map', 'call', 'iterate']);
  const failure = {};
  const broken = [];
  Object.defineProperty(broken, 'map', {
    get() {
      throw failure;
    }
  });
  assert.throws(
    () => normalizeIdList(broken, 'INVALID', 'invalid'),
    e => e === failure
  );
  class CustomArray extends Array {
    static get [Symbol.species]() {
      events.push('species');
      return Array;
    }
  }
  events.length = 0;
  assert.deepEqual(normalizeIdList(new CustomArray(' x '), 'INVALID', 'invalid'), ['x']);
  assert.deepEqual(events, ['species']);
});

test('ID list element reads stop at first error and preserve inherited sparse elements', () => {
  const events = [];
  const input = ['x', '', 'y'];
  Object.defineProperty(input, 0, {
    get() {
      events.push(0);
      return ' x ';
    }
  });
  Object.defineProperty(input, 2, {
    get() {
      events.push(2);
      return 'y';
    }
  });
  invalid(() => normalizeIdList(input, 'INVALID', 'invalid'));
  assert.deepEqual(events, [0]);
  const proto = Object.create(Array.prototype);
  proto[0] = ' inherited ';
  const inherited = new Array(2);
  Object.setPrototypeOf(inherited, proto);
  assert.deepEqual(normalizeIdList(inherited, 'INVALID', 'invalid'), ['inherited', undefined]);
});

test('space DTO preserves output, exact userId trimming and validation failures', () => {
  assert.deepEqual(build({ userId: ' alice ', name: 'ignored', id: 'ignored' }), {
    id: 'space-alice',
    userId: 'alice',
    name: 'Default Space',
    description: 'Primary knowledge space'
  });
  for (const value of [undefined, {}, false, 0, 'alice', Symbol('x'), { userId: '' }, { userId: 123 }]) {
    assert.throws(
      () => build(value),
      error => error instanceof AppError && error.code === 'KNOWLEDGE_SPACE_USER_REQUIRED' && error.statusCode === 422
    );
  }
  assert.throws(() => build(null), TypeError);
});

test('space DTO preserves exactly one inherited getter read and native thrown identity', () => {
  let reads = 0;
  const input = Object.create({
    get userId() {
      reads += 1;
      return ' x ';
    }
  });
  assert.equal(build(input).userId, 'x');
  assert.equal(reads, 1);
  const failure = {};
  assert.throws(
    () =>
      build({
        get userId() {
          throw failure;
        }
      }),
    error => error === failure
  );
  const events = [];
  assert.equal(
    build(
      new Proxy(
        { userId: ' x ' },
        {
          get(target, key) {
            events.push(key);
            return target[key];
          }
        }
      )
    ).id,
    'space-x'
  );
  assert.deepEqual(events, ['userId']);
});

test('Note consumers retain unknown ID-list values without normalization or new validation', async () => {
  const { Note } = await import('../src/modules/knowledge/domain/note.js');
  const marker = {};
  for (const tagIds of [[], [' x ', 'x', ' x '], new Array(2), [undefined, null, 42, marker, marker]]) {
    const note = new Note({ id: 'n', title: 'title', rawMarkdown: 'body', tagIds });
    assert.deepEqual(note.tagIds, [...new Set(tagIds)]);
    if (tagIds.includes(marker)) assert.equal(note.tagIds.at(-1), marker);
  }
  const ids = [];
  ids.map = () => [marker, 42, marker];
  const normalized = normalizeIdList(ids, 'INVALID', 'invalid');
  const note = new Note({ id: 'n', title: 'title', rawMarkdown: 'body', tagIds: normalized });
  assert.deepEqual(note.tagIds, [marker, 42]);
  assert.equal(note.tagIds[0], marker);
});

test('ID lists preserve iterator failure and map result nullish behavior', () => {
  const failure = {};
  const input = [];
  input.map = () => ({
    [Symbol.iterator]() {
      throw failure;
    }
  });
  assert.throws(
    () => normalizeIdList(input, 'INVALID', 'invalid'),
    e => e === failure
  );
  input.map = () => null;
  assert.deepEqual(normalizeIdList(input, 'INVALID', 'invalid'), []);
  input.map = () => undefined;
  assert.deepEqual(normalizeIdList(input, 'INVALID', 'invalid'), []);
  input.map = () => 42;
  assert.throws(() => normalizeIdList(input, 'INVALID', 'invalid'), TypeError);
});
