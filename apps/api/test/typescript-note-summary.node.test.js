import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createInMemoryNoteRepository } from '../src/modules/knowledge/infrastructure/note-repository.js';
import { createPostgresNoteRepository } from '../src/modules/knowledge/infrastructure/postgres/note-repository.js';

const baseline = process.env.KNOWRA_NOTE_SUMMARY_BASELINE === '1';
const commit = 'a9e8c8178d29caf8018fe66c444f9684163cab00';
const moduleUrl = new URL('../src/modules/knowledge/application/note-summary.js', import.meta.url);
const source = baseline
  ? execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/application/note-summary.js`], {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8'
    }).replace(
      /(from\s+)(['"])([^'"]+)\2/g,
      (_, prefix, _quote, path) =>
        `${prefix}${JSON.stringify(path.startsWith('.') ? new URL(path, moduleUrl).href : import.meta.resolve(path))}`
    )
  : null;
const summaryUrl = baseline ? `data:text/javascript;base64,${Buffer.from(source).toString('base64')}` : moduleUrl.href;
const { createNoteSummary: create } = await import(summaryUrl);
const loadConsumer = async relative => {
  const location = new URL(`../src/modules/knowledge/application/${relative}`, import.meta.url);
  if (!baseline) return import(location.href);
  const original = execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/application/${relative}`], {
    cwd: new URL('../../../', import.meta.url),
    encoding: 'utf8'
  });
  const rewritten = original.replace(/(from\s+)(['"])([^'"]+)\2/g, (_, prefix, _quote, path) => {
    const target = path.startsWith('.') ? new URL(path, location).href : import.meta.resolve(path);
    return `${prefix}${JSON.stringify(target === moduleUrl.href ? summaryUrl : target)}`;
  });
  return import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);
};
const { createNoteService } = await loadConsumer('note-service.js');
const { createAsyncNoteService } = await loadConsumer('postgres-async/note-service.js');
const asyncSearchModule = await loadConsumer('postgres-async/search-service.js');
const directFields = [
  'id',
  'spaceId',
  'folderId',
  'title',
  'status',
  'sourceType',
  'favorite',
  'deleted',
  'createdAt',
  'updatedAt'
];
const resultKeys = [
  'id',
  'spaceId',
  'folderId',
  'title',
  'summary',
  'characterCount',
  'readingMinutes',
  'outline',
  'internalLinks',
  'status',
  'sourceType',
  'favorite',
  'aiVisibility',
  'deleted',
  'tagIds',
  'createdAt',
  'updatedAt',
  'contentLoaded'
];
const inputReads = [
  'plainText',
  'id',
  'spaceId',
  'folderId',
  'title',
  'rawMarkdown',
  'internalLinks',
  'status',
  'sourceType',
  'favorite',
  'aiVisibility',
  'deleted',
  'tagIds',
  'createdAt',
  'updatedAt'
];
const traced = (input, events) =>
  new Proxy(input, {
    get(target, key, receiver) {
      events.push(String(key));
      return Reflect.get(target, key, receiver);
    }
  });
const changing = (key, values, events = []) => {
  let index = 0;
  return Object.defineProperty({}, key, {
    get() {
      events.push(`${key}:${index}`);
      return values[index++];
    }
  });
};

// 旧 JS 取自冻结父提交，不以修改后的 bridge 作为基线。
test('note summary JS bridge preserves exact TS export identity', { skip: baseline }, async () => {
  const js = await import(moduleUrl);
  const ts = await import(new URL('../src/modules/knowledge/application/note-summary.ts', import.meta.url));
  assert.deepEqual(Object.keys(js), ['createNoteSummary']);
  assert.deepEqual(Object.keys(js), Object.keys(ts));
  assert.equal(js.createNoteSummary, ts.createNoteSummary);
});

test('note summary empty projection has exact fields, defaults and key order', () => {
  const result = create({});
  assert.deepEqual(result, {
    id: undefined,
    spaceId: undefined,
    folderId: undefined,
    title: undefined,
    summary: '',
    characterCount: 0,
    readingMinutes: 1,
    outline: [],
    internalLinks: [],
    status: undefined,
    sourceType: undefined,
    favorite: undefined,
    aiVisibility: 'normal',
    deleted: undefined,
    tagIds: [],
    createdAt: undefined,
    updatedAt: undefined,
    contentLoaded: false
  });
  assert.deepEqual(Object.keys(result), resultKeys);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.notEqual(result.outline, result.internalLinks);
  assert.notEqual(result.internalLinks, result.tagIds);
  assert.notEqual(result.outline, create({}).outline);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(result))) {
    assert.equal(descriptor.enumerable, true);
    assert.equal(descriptor.writable, true);
    assert.equal(descriptor.configurable, true);
  }
});

test('note summary direct projection retains every field reference without validation or coercion', () => {
  const input = Object.fromEntries(directFields.map(key => [key, { key }]));
  input.aiVisibility = { policy: 'custom' };
  input.contentLoaded = true;
  const result = create(input);
  for (const key of directFields) assert.equal(result[key], input[key]);
  assert.equal(result.aiVisibility, input.aiVisibility);
  assert.equal(result.contentLoaded, false);
  assert.deepEqual(Object.keys(result), resultKeys);
});

test('note summary accepts inherited fields and does not enumerate or read unrelated fields', () => {
  const marker = Symbol('inherited');
  const input = Object.create({ id: marker, title: 'inherited', plainText: 'text', aiVisibility: false });
  for (const key of ['contentLoaded', 'body', 'content', 'summary', 'outline', 'characterCount', 'readingMinutes']) {
    Object.defineProperty(input, key, {
      get() {
        throw new Error(`must not read ${key}`);
      }
    });
  }
  const events = [];
  const result = create(
    new Proxy(input, {
      get: (target, key, receiver) => {
        events.push(String(key));
        return Reflect.get(target, key, receiver);
      },
      ownKeys() {
        throw new Error('must not enumerate');
      },
      getOwnPropertyDescriptor() {
        throw new Error('must not inspect descriptors');
      }
    })
  );
  assert.equal(result.id, marker);
  assert.equal(result.title, 'inherited');
  assert.equal(result.aiVisibility, false);
  assert.deepEqual(events, inputReads);
});

test('note summary reads fields in original order and repeats only accepted array fields', () => {
  const events = [];
  create(traced({ internalLinks: [], tagIds: [] }, events));
  assert.deepEqual(events, [
    'plainText',
    'id',
    'spaceId',
    'folderId',
    'title',
    'rawMarkdown',
    'internalLinks',
    'internalLinks',
    'status',
    'sourceType',
    'favorite',
    'aiVisibility',
    'deleted',
    'tagIds',
    'tagIds',
    'createdAt',
    'updatedAt'
  ]);
});

test('note summary nullish notes still fail at direct id access after optional plainText access', () => {
  for (const input of [null, undefined]) {
    assert.throws(() => create(input), {
      name: 'TypeError',
      message: `Cannot read properties of ${input} (reading 'id')`
    });
  }
});

test('note summary non-null primitive notes retain normal property boxing behavior', () => {
  for (const input of [false, true, 0, 1, NaN, 9n, Symbol('note'), 'note']) {
    assert.deepEqual(create(input), create({}));
  }
});

test('note summary plainText uses nullish fallback and String rather than truthiness', () => {
  for (const [input, expected] of [
    [undefined, ''],
    [null, ''],
    [false, 'false'],
    [true, 'true'],
    [0, '0'],
    [-0, '0'],
    [NaN, 'NaN'],
    [Infinity, 'Infinity'],
    [42n, '42'],
    [Symbol('text'), 'Symbol(text)'],
    [['a', 'b'], 'a,b'],
    [{}, '[object Object]']
  ]) {
    const result = create({ plainText: input });
    assert.equal(result.summary, expected);
    assert.equal(result.characterCount, expected.replace(/\s/g, '').length);
  }
});

test('note summary plainText coercion precedes all projected fields and happens once', () => {
  const events = [];
  const plainText = {
    [Symbol.toPrimitive](hint) {
      events.push(`plain:${hint}`);
      return ' a b ';
    }
  };
  const result = create(traced({ plainText }, events));
  assert.equal(result.summary, ' a b ');
  assert.equal(result.characterCount, 2);
  assert.deepEqual(events, ['plainText', 'plain:string', ...inputReads.slice(1)]);
});

test('note summary String coercion uses toString before valueOf and preserves thrown sentinels', () => {
  for (const key of ['plainText', 'rawMarkdown']) {
    const events = [];
    const input = {
      [key]: {
        toString() {
          events.push('toString');
          return {};
        },
        valueOf() {
          events.push('valueOf');
          return '# fallback';
        }
      }
    };
    const result = create(input);
    assert.deepEqual(events, ['toString', 'valueOf']);
    assert.equal(
      key === 'plainText' ? result.summary : result.outline[0].title,
      key === 'plainText' ? '# fallback' : 'fallback'
    );
    for (const sentinel of [new Error('coercion failure'), Symbol('failure'), null, 0]) {
      const bomb = {
        [Symbol.toPrimitive]() {
          throw sentinel;
        }
      };
      assert.throws(
        () => create({ [key]: bomb }),
        error => error === sentinel
      );
    }
    assert.throws(
      () =>
        create({
          [key]: {
            [Symbol.toPrimitive]() {
              return {};
            }
          }
        }),
      {
        name: 'TypeError',
        message: 'Cannot convert object to primitive value'
      }
    );
  }
});

test('note summary truncates only the summary to 240 UTF-16 code units without trimming', () => {
  const input = `  ${'x'.repeat(237)}😀 tail`;
  const result = create({ plainText: input });
  assert.equal(result.summary, `  ${'x'.repeat(237)}\ud83d`);
  assert.equal(result.summary.length, 240);
  assert.equal(result.characterCount, 243);
  assert.equal(create({ plainText: '😀'.repeat(121) }).characterCount, 242);
  assert.equal(create({ plainText: '😀'.repeat(121) }).summary, '😀'.repeat(120));
  assert.equal(create({ plainText: 'x'.repeat(239) }).summary.length, 239);
  assert.equal(create({ plainText: 'x'.repeat(240) }).summary.length, 240);
  assert.equal(create({ plainText: 'x'.repeat(241) }).summary.length, 240);
});

test('note summary character count removes JS whitespace but preserves zero-width and NEL characters', () => {
  const whitespace =
    '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
  assert.equal(create({ plainText: whitespace }).characterCount, 0);
  assert.equal(create({ plainText: `a${whitespace}😀\u200b\u0085` }).characterCount, 5);
  assert.equal(create({ plainText: whitespace }).summary, whitespace);
});

test('note summary reading minutes has a one-minute floor and exact 360-code-unit ceiling', () => {
  for (const [count, minutes] of [
    [0, 1],
    [1, 1],
    [359, 1],
    [360, 1],
    [361, 2],
    [719, 2],
    [720, 2],
    [721, 3],
    [3600, 10]
  ]) {
    const result = create({ plainText: `${'x '.repeat(count)}\n` });
    assert.equal(result.characterCount, count);
    assert.equal(result.readingMinutes, minutes);
  }
});

test('note summary outline reads rawMarkdown independently of plainText', () => {
  const result = create({ plainText: '# ignored summary heading', rawMarkdown: '# Actual heading' });
  assert.equal(result.summary, '# ignored summary heading');
  assert.deepEqual(result.outline, [{ level: 1, title: 'Actual heading' }]);
  assert.deepEqual(create({ plainText: '# ignored' }).outline, []);
});

test('note summary outline trims lines and recognizes only h1-h3 with required whitespace and text', () => {
  const rawMarkdown = [
    ' # One ',
    '\t##\tTwo\t',
    '    ###   Three ###   ',
    '#### Four',
    '##### Five',
    '###### Six',
    '#No space',
    '##',
    '### ',
    '#\t',
    '# a # b',
    '> # quote',
    '- ## list',
    '## 0',
    '# \u200b',
    '# A\r'
  ].join('\n');
  assert.deepEqual(create({ rawMarkdown }).outline, [
    { level: 1, title: 'One' },
    { level: 2, title: 'Two' },
    { level: 3, title: 'Three ###' },
    { level: 1, title: 'a # b' },
    { level: 2, title: '0' },
    { level: 1, title: '\u200b' },
    { level: 1, title: 'A' }
  ]);
});

test('note summary outline is newline splitting plus regex, not a Markdown heading parser', () => {
  assert.deepEqual(create({ rawMarkdown: '```md\n# inside fence\n```\nTitle\n====\n# one\r\n## two' }).outline, [
    { level: 1, title: 'inside fence' },
    { level: 1, title: 'one' },
    { level: 2, title: 'two' }
  ]);
  for (const separator of ['\r', '\u2028', '\u2029']) {
    assert.deepEqual(create({ rawMarkdown: `# first${separator}## second` }).outline, []);
  }
});

test('note summary outline strips valid shared Knowra marks but preserves ordinary and protected markup', () => {
  const rawMarkdown = [
    '# <mark data-k="a">Marked</mark> <!--k b s=section-->',
    '## Excluded <!--k- x-->',
    '### <mark>ordinary</mark>',
    '# `literal <mark data-k="c">code</mark>`',
    '```md',
    '# <mark data-k="d">fenced</mark>',
    '```'
  ].join('\n');
  assert.deepEqual(create({ rawMarkdown }).outline, [
    { level: 1, title: 'Marked' },
    { level: 2, title: 'Excluded' },
    { level: 3, title: '<mark>ordinary</mark>' },
    { level: 1, title: '`literal <mark data-k="c">code</mark>`' },
    { level: 1, title: '<mark data-k="d">fenced</mark>' }
  ]);
});

test('note summary rawMarkdown coerces with String and its string hint after title but before arrays', () => {
  const events = [];
  const rawMarkdown = {
    [Symbol.toPrimitive](hint) {
      events.push(`markdown:${hint}`);
      return '# Coerced';
    }
  };
  assert.deepEqual(create(traced({ rawMarkdown }, events)).outline, [{ level: 1, title: 'Coerced' }]);
  assert.deepEqual(events, [...inputReads.slice(0, 6), 'markdown:string', ...inputReads.slice(6)]);
  for (const input of [undefined, null, false, 0, 23n, Symbol('markdown')]) {
    assert.deepEqual(create({ rawMarkdown: input }).outline, []);
  }
});

for (const key of ['internalLinks', 'tagIds']) {
  test(`note summary ${key} copies arrays shallowly, preserves element identities and densifies holes`, () => {
    const object = { id: key };
    const symbol = Symbol(key);
    const input = [object, undefined, undefined, symbol, null, false, 0];
    delete input[1];
    const result = create({ [key]: input })[key];
    assert.deepEqual(result, [object, undefined, undefined, symbol, null, false, 0]);
    assert.notEqual(result, input);
    assert.equal(result[0], object);
    assert.equal(1 in result, true);
    assert.equal(1 in input, false);
    result.push('new');
    assert.equal(input.length, 7);
  });

  test(`note summary ${key} returns fresh empty arrays for non-arrays without consulting iterators`, () => {
    for (const value of [
      undefined,
      null,
      false,
      0,
      '',
      'abc',
      new Set(['x']),
      new Uint8Array([1]),
      { 0: 'x', length: 1 }
    ]) {
      assert.deepEqual(create({ [key]: value })[key], []);
    }
    const nonArray = {
      get [Symbol.iterator]() {
        throw new Error('must not read non-array iterator');
      }
    };
    const events = [];
    const input = changing(key, [nonArray, ['should not read']], events);
    const result = create(input)[key];
    assert.deepEqual(result, []);
    assert.deepEqual(events, [`${key}:0`]);
    assert.notEqual(result, create({ [key]: nonArray })[key]);
  });

  test(`note summary ${key} uses array subclass iterator but not species and returns ordinary arrays`, () => {
    const object = { id: 'yielded' };
    const events = [];
    class CustomArray extends Array {
      static get [Symbol.species]() {
        throw new Error('must not read species');
      }
      *[Symbol.iterator]() {
        events.push('iterate');
        yield object;
        yield 'custom';
      }
    }
    const input = new CustomArray('stored');
    const result = create({ [key]: input })[key];
    assert.equal(Object.getPrototypeOf(result), Array.prototype);
    assert.deepEqual(result, [object, 'custom']);
    assert.equal(result[0], object);
    assert.deepEqual(events, ['iterate']);
  });

  test(`note summary ${key} rereads accepted array and spreads replacement string or arbitrary iterable`, () => {
    const object = { id: 'identity' };
    for (const [replacement, expected] of [
      ['a😀b', ['a', '😀', 'b']],
      [new Set([object, 'set']), [object, 'set']],
      [
        {
          *[Symbol.iterator]() {
            yield object;
            yield 0;
          }
        },
        [object, 0]
      ]
    ]) {
      const events = [];
      const input = changing(key, [[], replacement], events);
      const result = create(input)[key];
      assert.deepEqual(result, expected);
      if (expected[0] === object) assert.equal(result[0], object);
      assert.deepEqual(events, [`${key}:0`, `${key}:1`]);
    }
  });

  test(`note summary ${key} throws when second array read becomes noniterable and stops later reads`, () => {
    for (const replacement of [undefined, null, false, 0, 1n, Symbol('not iterable'), {}]) {
      const events = [];
      const input = traced(changing(key, [[], replacement]), events);
      assert.throws(() => create(input), { name: 'TypeError', message: `note.${key} is not iterable` });
      const index = inputReads.indexOf(key);
      assert.deepEqual(events, [...inputReads.slice(0, index + 1), key]);
    }
  });

  test(`note summary ${key} reads array proxy iterator, repeated length and elements in native spread order`, () => {
    const events = [];
    const array = new Proxy(['a', 'b'], {
      get(target, property, receiver) {
        events.push(String(property));
        return Reflect.get(target, property, receiver);
      }
    });
    assert.deepEqual(create({ [key]: array })[key], ['a', 'b']);
    assert.deepEqual(events, ['Symbol(Symbol.iterator)', 'length', '0', 'length', '1', 'length']);
  });

  test(`note summary ${key} forwards iterator getter, next, done and value failures without replacement`, () => {
    const sentinel = new Error(`${key} iterator failed`);
    const stages = [
      array =>
        Object.defineProperty(array, Symbol.iterator, {
          get() {
            throw sentinel;
          }
        }),
      array =>
        Object.defineProperty(array, Symbol.iterator, {
          value() {
            throw sentinel;
          }
        }),
      array =>
        Object.defineProperty(array, Symbol.iterator, {
          value() {
            return {
              next() {
                throw sentinel;
              }
            };
          }
        }),
      array =>
        Object.defineProperty(array, Symbol.iterator, {
          value() {
            return {
              next() {
                return {
                  get done() {
                    throw sentinel;
                  }
                };
              }
            };
          }
        }),
      array =>
        Object.defineProperty(array, Symbol.iterator, {
          value() {
            return {
              next() {
                return {
                  done: false,
                  get value() {
                    throw sentinel;
                  }
                };
              }
            };
          }
        })
    ];
    for (const stage of stages)
      assert.throws(
        () => create({ [key]: stage([]) }),
        error => error === sentinel
      );
  });

  test(`note summary ${key} preserves failures from revoked array proxies and noncallable iterators`, () => {
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    assert.throws(() => create({ [key]: proxy }), {
      name: 'TypeError',
      message: "Cannot perform 'IsArray' on a proxy that has been revoked"
    });
    for (const value of [undefined, null, false, 0, {}]) {
      const array = [];
      array[Symbol.iterator] = value;
      assert.throws(() => create({ [key]: array }), { name: 'TypeError', message: `note.${key} is not iterable` });
    }
  });
}

test('note summary aiVisibility defaults only for nullish values and retains all falsy/reference values', () => {
  for (const value of [undefined, null]) assert.equal(create({ aiVisibility: value }).aiVisibility, 'normal');
  for (const value of [false, 0, -0, '', NaN, 0n, Symbol('visibility'), {}, [], 'private']) {
    assert.ok(Object.is(create({ aiVisibility: value }).aiVisibility, value));
  }
});

test('note summary getter failures are forwarded unchanged at every field and prevent subsequent reads', () => {
  for (const key of inputReads) {
    const sentinel = new Error(`read ${key}`);
    const events = [];
    const input = traced(
      Object.defineProperty({}, key, {
        get() {
          throw sentinel;
        }
      }),
      events
    );
    assert.throws(
      () => create(input),
      error => error === sentinel
    );
    assert.deepEqual(events, inputReads.slice(0, inputReads.indexOf(key) + 1));
  }
});

test('note summary reads mutable fields at their original time instead of snapshotting or caching', () => {
  const input = {
    id: 'before',
    title: 'before',
    status: 'before',
    tagIds: ['before'],
    plainText: {
      toString() {
        input.id = 'after plain';
        return 'text';
      }
    },
    rawMarkdown: {
      toString() {
        input.title = 'after markdown';
        input.status = 'after markdown';
        return '# Heading';
      }
    },
    internalLinks: Object.assign([], {
      *[Symbol.iterator]() {
        input.tagIds = ['after iterator'];
        yield 'link';
      }
    })
  };
  const result = create(input);
  assert.equal(result.id, 'after plain');
  assert.equal(result.title, 'before');
  assert.equal(result.status, 'after markdown');
  assert.deepEqual(result.tagIds, ['after iterator']);
  assert.deepEqual(result.internalLinks, ['link']);
});

test('note summary synchronous service uses real local repository ordering, filters and summaryOnly switches', () => {
  const common = {
    spaceId: 'space',
    folderId: 'folder',
    plainText: ' a b ',
    rawMarkdown: '# Local',
    internalLinks: ['linked'],
    tagIds: ['tag'],
    status: 'draft',
    sourceType: 'manual',
    favorite: false,
    deleted: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z'
  };
  const a = { ...common, id: 'a', title: 'Alpha' };
  const b = { ...common, id: 'b', title: 'Beta', favorite: true };
  const records = [
    a,
    b,
    { ...common, id: 'deleted', title: 'Deleted', deleted: true },
    { ...common, id: 'other', title: 'Other', spaceId: 'other' }
  ];
  const repository = createInMemoryNoteRepository({ records });
  const service = createNoteService({ repository });
  const options = { spaceId: 'space', folderId: 'folder', tagId: 'tag', sortBy: 'title', order: 'asc' };
  for (const summaryOnly of [true, 'true']) {
    const results = service.listNotes({ ...options, summaryOnly });
    assert.deepEqual(results, [create(b), create(a)]);
    assert.deepEqual(
      results.map(note => note.id),
      ['b', 'a']
    );
    assert.deepEqual(results[0].outline, [{ level: 1, title: 'Local' }]);
    assert.equal(results[0].characterCount, 2);
    assert.equal(results[0].contentLoaded, false);
    assert.equal('rawMarkdown' in results[0], false);
    assert.equal('plainText' in results[0], false);
    assert.notEqual(results[0].internalLinks, b.internalLinks);
    assert.notEqual(results[0].tagIds, b.tagIds);
  }
  for (const summaryOnly of [undefined, false, 0, 1, 'false', 'TRUE', {}]) {
    const results = service.listNotes({ ...options, summaryOnly });
    assert.equal(results[0], b);
    assert.equal(results[1], a);
    assert.equal(results[0].plainText, ' a b ');
    assert.equal('contentLoaded' in results[0], false);
  }
  assert.deepEqual(service.listNotes({ ...options, summaryOnly: true, offset: 1, limit: 1 }), [create(a)]);
  assert.equal(repository.findById('a'), a);
  assert.equal(records.length, 4);
});

test('note summary synchronous service propagates projection failure without modifying the local record', () => {
  const sentinel = new Error('local projection failure');
  const record = {
    id: 'a',
    title: 'A',
    rawMarkdown: '# A',
    plainText: {
      toString() {
        throw sentinel;
      }
    }
  };
  const repository = createInMemoryNoteRepository({ records: [record] });
  const service = createNoteService({ repository });
  assert.equal(service.listNotes()[0], record);
  assert.throws(
    () => service.listNotes({ summaryOnly: true }),
    error => error === sentinel
  );
  assert.equal(repository.findById('a'), record);
});

test('note summary asynchronous service integrates actual PostgreSQL repository and mapper with summaryOnly switches', async () => {
  const queries = [];
  const row = {
    id: 'pg-note',
    spaceId: 'space',
    folderId: null,
    title: 'PostgreSQL',
    rawMarkdown: '# <mark data-k="a">Mapped</mark>',
    plainText: 'x'.repeat(361),
    internalLinks: ['linked'],
    noteTags: [{ tagId: 'tag' }],
    status: 'draft',
    sourceType: 'manual',
    favorite: true,
    aiVisibility: false,
    deletedAt: null,
    contentHash: 'hash',
    annotationStructure: { version: 1 },
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-02T00:00:00.000Z')
  };
  const db = {
    note: {
      async findMany(query) {
        queries.push(query);
        await Promise.resolve();
        return [row];
      }
    }
  };
  const repository = createPostgresNoteRepository({ db });
  const service = createAsyncNoteService({ repository });
  const options = {
    spaceId: 'space',
    folderId: 'folder',
    tagIds: ['tag'],
    tagMatch: 'any',
    favoriteOnly: true,
    sortBy: 'title',
    order: 'asc',
    offset: 2,
    limit: 3
  };
  const query = {
    where: {
      deletedAt: null,
      spaceId: 'space',
      folderId: 'folder',
      favorite: true,
      noteTags: { some: { tagId: { in: ['tag'] } } }
    },
    orderBy: [{ favorite: 'desc' }, { title: 'asc' }],
    skip: 2,
    include: { noteTags: true },
    take: 3
  };
  for (const summaryOnly of [true, 'true']) {
    const pending = service.listNotes({ ...options, summaryOnly });
    assert.ok(pending instanceof Promise);
    const [result] = await pending;
    assert.deepEqual(result, {
      id: 'pg-note',
      spaceId: 'space',
      folderId: null,
      title: 'PostgreSQL',
      summary: 'x'.repeat(240),
      characterCount: 361,
      readingMinutes: 2,
      outline: [{ level: 1, title: 'Mapped' }],
      internalLinks: ['linked'],
      status: 'draft',
      sourceType: 'manual',
      favorite: true,
      aiVisibility: false,
      deleted: false,
      tagIds: ['tag'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
      contentLoaded: false
    });
    assert.deepEqual(queries.at(-1), query);
    assert.deepEqual(Object.keys(result), resultKeys);
    assert.notEqual(result.internalLinks, row.internalLinks);
  }
  for (const summaryOnly of [undefined, false, 0, 1, 'false', 'TRUE', {}]) {
    const [result] = await service.listNotes({ ...options, summaryOnly });
    assert.equal(result.rawMarkdown, row.rawMarkdown);
    assert.equal(result.plainText, row.plainText);
    assert.equal(result.annotationStructure, row.annotationStructure);
    assert.equal('contentLoaded' in result, false);
    assert.deepEqual(queries.at(-1), query);
  }
  assert.equal(queries.length, 9);
});

test('note summary asynchronous service preserves projection error identity after PostgreSQL mapping', async () => {
  const sentinel = new Error('async projection failure');
  const plainText = {
    toString() {
      throw sentinel;
    }
  };
  const row = { id: 'a', title: 'A', rawMarkdown: '# A', plainText, createdAt: '2025-01-01', updatedAt: '2025-01-01' };
  const repository = createPostgresNoteRepository({
    db: {
      note: {
        async findMany() {
          return [row];
        }
      }
    }
  });
  const service = createAsyncNoteService({ repository });
  assert.equal((await service.listNotes())[0].plainText, plainText);
  await assert.rejects(service.listNotes({ summaryOnly: true }), error => error === sentinel);
});

test('note summary asynchronous search service re-export retains the same projection function identity', () => {
  assert.equal(asyncSearchModule.createNoteSummary, create);
});
