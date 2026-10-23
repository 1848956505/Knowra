import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';

const baseline = process.env.KNOWRA_NAVIGATION_VERSION_POLICY_BASELINE === '1';
const commit = '1adde35f593e9a890ff18a163f6fefe060ba057e';
const root = new URL('../src/modules/knowledge/application/', import.meta.url);
async function load(name) {
  if (!baseline) return import(new URL(`${name}.js`, root));
  const source = stripTypeScriptTypes(
    execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/application/${name}.js`], {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8'
    })
  ).replace("'./knowledge-errors.js'", JSON.stringify(new URL('knowledge-errors.js', root).href));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { createNavigationReferencePolicy: navigation } = await load('navigation-reference-policy');
const { selectCoalescibleVersion: select, NOTE_VERSION_COALESCE_WINDOW_MS: windowMs } =
  await load('note-version-coalescing');
const errorIs = expected => error => error === expected;
function replace(object, key, value, run) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { configurable: true, writable: true, value });
  try {
    return run();
  } finally {
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else delete object[key];
  }
}
function fixture(enforceReferences = true) {
  const calls = [];
  const records = {
    knowledgeSpace: [{ id: 's' }],
    folder: [
      { id: 'f', spaceId: 's' },
      { id: 'foreign', spaceId: 'other' }
    ],
    tag: [
      { id: 'a', spaceId: 's', groupId: 'one' },
      { id: 'b', spaceId: 's', groupId: 'one' },
      { id: 'c', spaceId: 's' },
      { id: 'foreign', spaceId: 'other' }
    ],
    tagGroup: [
      { id: 'one', spaceId: 's', selectionMode: 'single' },
      { id: 'foreign', spaceId: 'other' }
    ]
  };
  const repos = Object.fromEntries(
    Object.entries(records).map(([name, rows]) => [
      `${name}Repository`,
      {
        findById(id) {
          assert.equal(this, repos[`${name}Repository`]);
          calls.push([name, id]);
          return rows.find(row => row.id === id);
        }
      }
    ])
  );
  return { policy: navigation({ ...repos, enforceReferences }), calls, repos, records };
}
const invalid = (run, code, message) =>
  assert.throws(run, error => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, 422);
    if (message) assert.equal(error.message, message);
    return true;
  });
const row = (id, minute, extra = {}) => ({
  id,
  noteId: 'n',
  createdBy: 'user',
  contentHash: id,
  createdAt: new Date(1800000000000 + minute * 60000).toISOString(),
  ...extra
});
const history = () => ({ checkpoint: row('z', 0), previous: row('p', 1), current: row('c', 2) });
function choose({ checkpoint, previous, current }, options = {}) {
  return select({ versions: [current, checkpoint, previous], current, ...options });
}

test('navigation and version JS bridges retain export identities', { skip: baseline }, async () => {
  for (const name of ['navigation-reference-policy', 'note-version-coalescing']) {
    const js = await import(new URL(`${name}.js`, root));
    const ts = await import(new URL(`${name}.ts`, root));
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
});

test('navigation falsey enforcement skips reads but argument destructuring still executes', () => {
  for (const enforce of [undefined, null, false, 0, '', NaN]) {
    const { calls, repos } = fixture();
    const policy = navigation({ ...repos, enforceReferences: enforce });
    policy.assertSpaceReference(Symbol('s'), Symbol('entity'));
    const reads = [];
    policy.assertNoteReferences(Object.fromEntries(['spaceId', 'folderId', 'tagIds'].map(key => [key, undefined])));
    const input = {};
    for (const key of ['spaceId', 'folderId', 'tagIds'])
      Object.defineProperty(input, key, {
        get() {
          reads.push(key);
          return undefined;
        }
      });
    policy.assertNoteReferences(input);
    assert.deepEqual(reads, ['spaceId', 'folderId', 'tagIds']);
    assert.deepEqual(calls, []);
    assert.throws(() => policy.assertNoteReferences(null), TypeError);
  }
});

test('navigation captures options once while repository methods stay dynamic', () => {
  const { repos } = fixture();
  const reads = [];
  const options = {};
  for (const key of [...Object.keys(repos), 'enforceReferences'])
    Object.defineProperty(options, key, {
      get() {
        reads.push(key);
        return key === 'enforceReferences' ? true : repos[key];
      }
    });
  const policy = navigation(options);
  const token = {};
  repos.knowledgeSpaceRepository.findById = function (id) {
    assert.equal(this, repos.knowledgeSpaceRepository);
    assert.equal(id, token);
    return true;
  };
  policy.assertSpaceReference(token, 'NOTE');
  assert.deepEqual(reads, [...Object.keys(repos), 'enforceReferences']);
});

test('navigation validates space truthiness before lookup or error interpolation', () => {
  const { policy, calls } = fixture({});
  for (const id of [undefined, null, false, 0, ''])
    invalid(
      () => policy.assertSpaceReference(id, 'NOTE'),
      'NOTE_SPACE_NOT_FOUND',
      'The referenced knowledge space does not exist'
    );
  assert.deepEqual(calls, []);
  assert.throws(() => policy.assertSpaceReference(null, Symbol('name')), TypeError);
  policy.assertSpaceReference('s', Symbol('unused'));
});

test('navigation failure priority stops before subsequent repositories', () => {
  for (const [input, code, names] of [
    [{ spaceId: 'missing', folderId: 'missing', tagIds: ['missing'] }, 'NOTE_SPACE_NOT_FOUND', ['knowledgeSpace']],
    [{ spaceId: 's', folderId: 'missing', tagIds: ['missing'] }, 'NOTE_FOLDER_NOT_FOUND', ['knowledgeSpace', 'folder']],
    [
      { spaceId: 's', folderId: 'foreign', tagIds: ['missing'] },
      'NOTE_FOLDER_SPACE_MISMATCH',
      ['knowledgeSpace', 'folder']
    ],
    [{ spaceId: 's', tagIds: ['missing', 'foreign'] }, 'NOTE_TAG_NOT_FOUND', ['knowledgeSpace', 'tag']],
    [{ spaceId: 's', tagIds: ['foreign', 'missing'] }, 'NOTE_TAG_SPACE_MISMATCH', ['knowledgeSpace', 'tag']]
  ]) {
    const { policy, calls } = fixture();
    invalid(() => policy.assertNoteReferences(input), code);
    assert.deepEqual(
      calls.map(call => call[0]),
      names
    );
  }
});

test('navigation keeps duplicate tag callbacks, two passes and group single-selection failure', () => {
  const { policy, calls } = fixture();
  invalid(
    () => policy.assertNoteReferences({ spaceId: 's', folderId: 'f', tagIds: ['a', 'a'] }),
    'TAG_GROUP_SINGLE_SELECTION',
    'Only one tag may be selected from this group'
  );
  assert.deepEqual(calls, [
    ['knowledgeSpace', 's'],
    ['folder', 'f'],
    ['tag', 'a'],
    ['tag', 'a'],
    ['tag', 'a'],
    ['tag', 'a'],
    ['tagGroup', 'one']
  ]);
});

test('navigation preserves sparse forEach and custom callback receiver', () => {
  const { policy, calls } = fixture();
  const ids = Array(2);
  ids[1] = 'c';
  policy.assertNoteReferences({ spaceId: 's', tagIds: ids });
  assert.deepEqual(calls, [
    ['knowledgeSpace', 's'],
    ['tag', 'c'],
    ['tag', 'c']
  ]);
  let count = 0;
  const custom = {
    forEach(callback) {
      assert.equal(this, custom);
      count++;
      callback('c');
    }
  };
  policy.assertNoteReferences({ spaceId: 's', tagIds: custom });
  assert.equal(count, 2);
  assert.throws(() => policy.assertNoteReferences({ spaceId: 's' }), TypeError);
});

test('navigation grouping preserves repeated group getter reads and identity keys', () => {
  const { policy, repos } = fixture();
  const events = [];
  const first = {};
  const second = {};
  const third = {};
  let lookups = 0;
  let groupReads = 0;
  repos.tagRepository.findById = () =>
    ++lookups === 1
      ? { spaceId: 's' }
      : {
          get groupId() {
            events.push(++groupReads);
            return [first, second, third][groupReads - 1];
          }
        };
  repos.tagGroupRepository.findById = key => {
    assert.equal(key, third);
    return { selectionMode: 'single' };
  };
  policy.assertNoteReferences({ spaceId: 's', tagIds: ['a'] });
  assert.deepEqual(events, [1, 2, 3]);
});

test('navigation normalization deduplicates before last-single-group-wins and Boolean filtering', () => {
  const { policy, calls } = fixture(false);
  const token = {};
  const symbol = Symbol('tag');
  const input = Object.freeze(['a', 'c', 'b', 'a', undefined, null, false, 0, '', NaN, token, symbol]);
  const output = policy.normalizeTagIds(input);
  assert.deepEqual(output, ['c', 'b', token, symbol]);
  assert.equal(output[2], token);
  assert.deepEqual(calls.slice(0, 5), [
    ['tag', 'a'],
    ['tagGroup', 'one'],
    ['tag', 'c'],
    ['tag', 'b'],
    ['tagGroup', 'one']
  ]);
  assert.deepEqual(policy.normalizeTagIds(undefined), []);
  assert.deepEqual(policy.normalizeTagIds(null), []);
});

test('navigation grouping uses repository group.id rather than tag.groupId', () => {
  const { policy, repos } = fixture();
  repos.tagRepository.findById = id => ({ groupId: id });
  repos.tagGroupRepository.findById = () => ({ selectionMode: 'single' });
  assert.deepEqual(policy.normalizeTagIds(['a', 'b']), ['b']);
});

test('navigation retains arbitrary iterable elements and iterator exceptions', () => {
  const { policy } = fixture();
  const token = {};
  const failure = {};
  assert.equal(
    policy.normalizeTagIds({
      *[Symbol.iterator]() {
        yield token;
        yield token;
      }
    })[0],
    token
  );
  assert.throws(
    () =>
      policy.normalizeTagIds({
        *[Symbol.iterator]() {
          yield token;
          throw failure;
        }
      }),
    errorIs(failure)
  );
  assert.deepEqual(policy.normalizeTagIds('abac'), ['b', 'c']);
});

test('navigation normalization repeats tag.groupId reads and retains dynamic getter failures', () => {
  const { policy, repos } = fixture();
  const key = {};
  let reads = 0;
  repos.tagRepository.findById = () => ({
    get groupId() {
      return ++reads === 1 ? true : key;
    }
  });
  repos.tagGroupRepository.findById = value => {
    assert.equal(value, key);
    return null;
  };
  assert.deepEqual(policy.normalizeTagIds(['a']), ['a']);
  assert.equal(reads, 2);
  const failure = {};
  repos.tagGroupRepository.findById = () => {
    throw failure;
  };
  assert.throws(() => policy.normalizeTagIds(['a']), errorIs(failure));
});

test('navigation tag-group guard always runs independently of enforcement', () => {
  const { policy, calls } = fixture(false);
  for (const id of [undefined, null, false, 0, '']) policy.assertTagGroupReference(id, 's');
  assert.deepEqual(calls, []);
  invalid(
    () => policy.assertTagGroupReference('missing', 's'),
    'TAG_GROUP_NOT_FOUND',
    'The referenced tag group does not exist'
  );
  invalid(
    () => policy.assertTagGroupReference('foreign', 's'),
    'TAG_GROUP_SPACE_MISMATCH',
    'The referenced tag group belongs to another knowledge space'
  );
  policy.assertTagGroupReference('one', 's');
});

test('navigation repository and callback thrown values retain identity', () => {
  const { policy, repos } = fixture();
  const failure = {};
  repos.tagRepository.findById = () => {
    throw failure;
  };
  assert.throws(() => policy.assertNoteReferences({ spaceId: 's', tagIds: ['a'] }), errorIs(failure));
  assert.throws(() => policy.normalizeTagIds(['a']), errorIs(failure));
  assert.throws(
    () =>
      policy.assertNoteReferences({
        spaceId: 's',
        tagIds: {
          forEach() {
            throw failure;
          }
        }
      }),
    errorIs(failure)
  );
});

test('coalescing keeps default ten-minute window and original candidate identity without sorting input', () => {
  assert.equal(windowMs, 600000);
  const h = history();
  const versions = Object.freeze([h.current, h.checkpoint, h.previous]);
  for (const record of versions) Object.freeze(record);
  assert.equal(select({ versions, current: h.current }), h.previous);
  assert.deepEqual(versions, [h.current, h.checkpoint, h.previous]);
});

test('coalescing filters other notes and same IDs before chronology sorting', () => {
  const h = history();
  const excluded = {
    noteId: 'other',
    get id() {
      throw new Error('must not read');
    }
  };
  const same = {
    id: h.current.id,
    noteId: 'n',
    get createdAt() {
      throw new Error('must not sort');
    }
  };
  assert.equal(select({ versions: [excluded, same, h.previous, h.checkpoint], current: h.current }), h.previous);
  assert.equal(select({ versions: [h.previous, same], current: h.current }), null);
});

test('coalescing requires checkpoint, user pair, increasing time and distinct hashes in order', () => {
  const h = history();
  assert.equal(select({ versions: [], current: h.current }), null);
  assert.equal(select({ versions: [h.previous], current: h.current }), null);
  for (const [target, field, value] of [
    ['previous', 'createdBy', 'ai'],
    ['current', 'createdBy', 'ai'],
    ['current', 'createdAt', h.previous.createdAt],
    ['current', 'contentHash', h.previous.contentHash]
  ]) {
    const changed = history();
    changed[target][field] = value;
    assert.equal(choose(changed), null);
  }
  h.checkpoint.createdBy = 'ai';
  assert.equal(choose(h), h.previous);
});

test('coalescing window boundary is exclusive and uses checkpoint rather than previous', () => {
  const h = history();
  h.current.createdAt = row('c', 10).createdAt;
  assert.equal(choose(h), null);
  assert.equal(choose(h, { windowMs: 600001 }), h.previous);
  for (const value of [null, false, 0, -1, NaN, 'invalid', 120000])
    assert.equal(choose(history(), { windowMs: value }), null);
  for (const value of [Infinity, '120001', 120001n, { valueOf: () => 120001 }]) {
    const c = history();
    assert.equal(choose(c, { windowMs: value }), c.previous);
  }
  assert.throws(() => choose(history(), { windowMs: Symbol('window') }), TypeError);
});

test('coalescing invalid dates and tie localeCompare preserve existing fallbacks', () => {
  const h = history();
  h.previous.createdAt = 'invalid';
  assert.equal(choose(h), null);
  h.previous.createdAt = h.checkpoint.createdAt;
  h.previous.id = 'zz';
  assert.equal(choose(h), h.previous);
  h.checkpoint.createdAt = 'invalid';
  h.previous.createdAt = row('p', 1).createdAt;
  assert.equal(choose(h), null);
});

test('coalescing tie invokes localeCompare on right ID with original left ID and receiver', () => {
  const h = history();
  const left = {};
  const calls = [];
  const right = {
    localeCompare(value) {
      calls.push([this, value]);
      return 1;
    }
  };
  h.checkpoint.id = right;
  h.previous.id = left;
  h.previous.createdAt = h.checkpoint.createdAt;
  assert.equal(choose(h), h.checkpoint);
  assert.deepEqual(calls, [[right, left]]);
  const failure = {};
  right.localeCompare = () => {
    throw failure;
  };
  assert.throws(() => choose(h), errorIs(failure));
});

test('coalescing native Date.parse coercion keeps Symbol failures and date-object compatibility', () => {
  const h = history();
  h.current.createdAt = new Date(h.current.createdAt);
  assert.equal(choose(h), h.previous);
  h.current.createdAt = {
    [Symbol.toPrimitive](hint) {
      assert.equal(hint, 'string');
      return row('c', 2).createdAt;
    }
  };
  assert.equal(choose(h), h.previous);
  h.current.createdAt = Symbol('date');
  assert.throws(() => choose(h), TypeError);
});

test('coalescing dynamic Date.parse retains receiver, argument identity and throws', () => {
  const native = Date.parse;
  const h = history();
  const token = {};
  const calls = [];
  h.current.createdAt = token;
  replace(
    Date,
    'parse',
    function (value) {
      assert.equal(this, Date);
      calls.push(value);
      return native(value === token ? row('c', 2).createdAt : value);
    },
    () => assert.equal(choose(h), h.previous)
  );
  assert.equal(calls.filter(value => value === token).length, 2);
  const failure = {};
  replace(
    Date,
    'parse',
    () => {
      throw failure;
    },
    () => assert.throws(() => choose(h), errorIs(failure))
  );
});

test('coalescing preserves current getter rereads and conditional hash/window evaluation', () => {
  const h = history();
  const events = [];
  let reads = 0;
  Object.defineProperty(h.current, 'createdAt', {
    get() {
      events.push('time');
      return ++reads === 1 ? row('c', 2).createdAt : row('c', 11).createdAt;
    }
  });
  Object.defineProperty(h.current, 'contentHash', {
    get() {
      events.push('hash');
      return 'c';
    }
  });
  assert.equal(choose(h), null);
  assert.deepEqual(events, ['time', 'hash', 'time']);
  const failure = {};
  h.previous.createdBy = 'ai';
  Object.defineProperty(h.current, 'createdBy', {
    get() {
      throw failure;
    }
  });
  assert.equal(choose(h), null);
});

test('coalescing stable equal comparisons keep original duplicate-ID order', () => {
  const h = history();
  const first = row('same', 1, { marker: 'first' });
  const second = row('same', 1, { marker: 'second' });
  assert.equal(select({ versions: [first, second, h.checkpoint], current: h.current }), first);
  assert.equal(select({ versions: [second, first, h.checkpoint], current: h.current }), second);
});

test('coalescing sparse versions skip holes and preserve original thrown getter object', () => {
  const h = history();
  const sparse = Array(4);
  sparse[1] = h.previous;
  sparse[3] = h.checkpoint;
  assert.equal(select({ versions: sparse, current: h.current }), h.previous);
  const failure = {};
  Object.defineProperty(h.previous, 'noteId', {
    get() {
      throw failure;
    }
  });
  assert.throws(() => choose(h), errorIs(failure));
});
