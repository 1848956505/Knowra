import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { AppError } from '../src/errors/app-error.js';
import { createKnowledgeHttpHandlers } from '../src/modules/knowledge/http/knowledge-handlers.js';
import { createPostgresKnowledgeHttpHandlers } from '../src/modules/knowledge/http/postgres-async-handlers.js';

const baseline = process.env.KNOWRA_READONLY_ROUTES_BASELINE === '1';
const commit = '0b2b5cf5f417d7c90d21038afdc0742b61dba6a2';
const root = new URL('../src/modules/knowledge/http/', import.meta.url);
const names = ['workspace-routes', 'note-version-routes'];
const exports = ['handleWorkspaceRoute', 'handleNoteVersionRoute'];
let modules;
let dispatcher;
if (baseline) {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-readonly-routes-'));
  try {
    for (const name of [...names, 'knowledge-routes']) {
      const source = execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/http/${name}.js`], {
        cwd: new URL('../../../', import.meta.url),
        encoding: 'utf8'
      }).replace(/(['"])(\.\.?\/[^'"]+)\1/g, (_, quote, dependency) =>
        JSON.stringify(
          names.some(target => dependency === `./${target}.js`)
            ? pathToFileURL(join(directory, dependency.replace('.js', '.mjs'))).href
            : new URL(dependency, root).href
        )
      );
      writeFileSync(join(directory, `${name}.mjs`), source);
    }
    modules = await Promise.all(names.map(name => import(pathToFileURL(join(directory, `${name}.mjs`)))));
    dispatcher = (await import(pathToFileURL(join(directory, 'knowledge-routes.mjs')))).handleKnowledgeRoute;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} else {
  modules = await Promise.all(names.map(name => import(new URL(`${name}.js`, root))));
  dispatcher = (await import(new URL('knowledge-routes.js', root))).handleKnowledgeRoute;
}
const [workspace, versions] = modules.map((module, index) => module[exports[index]]);
const specifications = [
  [workspace, '/api/knowledge/overview', 'getKnowledgeOverview', []],
  [workspace, '/api/knowledge/training-overview', 'getTrainingOverview', []],
  [workspace, '/api/knowledge/review-queue', 'listReviewQueue', [{}]],
  [versions, '/api/knowledge/notes/n/versions/prune-preview', 'previewNoteVersionPrune', [{ id: 'n' }]],
  [versions, '/api/knowledge/notes/n/versions', 'listNoteVersions', [{ id: 'n' }, {}]],
  [versions, '/api/knowledge/notes/n/versions/v', 'getNoteVersion', [{ id: 'n', versionId: 'v' }]]
];
const identical = expected => actual => Object.is(actual, expected);
function responseFixture(events = []) {
  return {
    writeHead(...args) {
      events.push(['head', ...args]);
      return this;
    },
    end(...args) {
      events.push(['end', ...args]);
      return this;
    }
  };
}
function fixture(path, method = 'GET', value) {
  if (arguments.length < 3) value = { ok: true };
  const events = [];
  const calls = [];
  const knowledge = Object.fromEntries(
    specifications.map(([, , name]) => [
      name,
      function (...args) {
        calls.push({ name, args, receiver: this });
        events.push(['service', name]);
        return value;
      }
    ])
  );
  return {
    events,
    calls,
    knowledge,
    request: { method },
    url: new URL(path, 'http://localhost'),
    response: responseFixture(events)
  };
}
function body(fixture) {
  return JSON.parse(fixture.events.find(event => event[0] === 'end')[1]);
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function getter(object, key, read) {
  Object.defineProperty(object, key, { configurable: true, get: read });
}

test('both JS bridges preserve sole exports and exact TS identity', { skip: baseline }, async () => {
  for (const [index, name] of names.entries()) {
    const implementation = await import(new URL(`${name}.ts`, root));
    assert.deepEqual(Object.keys(modules[index]), [exports[index]]);
    assert.deepEqual(Object.keys(implementation), [exports[index]]);
    assert.equal(modules[index][exports[index]], implementation[exports[index]]);
  }
});

test('all six endpoints preserve service receiver, exact arguments, 200 header and data envelope', async () => {
  for (const [route, path, name, args] of specifications) {
    const context = fixture(path);
    assert.equal(await route(context), true);
    assert.equal(context.calls.length, 1);
    assert.equal(context.calls[0].name, name);
    assert.equal(context.calls[0].receiver, context.knowledge);
    assert.deepEqual(context.calls[0].args, args);
    assert.deepEqual(context.events, [
      ['service', name],
      ['head', 200, { 'Content-Type': 'application/json; charset=utf-8' }],
      ['end', '{"data":{"ok":true}}']
    ]);
  }
});

test('destructuring and context failures reject asynchronously without inventing defaults', async () => {
  for (const route of [workspace, versions]) {
    for (const context of [undefined, null, {}, { request: null }, { request: {}, url: null }]) {
      let pending;
      assert.doesNotThrow(() => {
        pending = route(context);
      });
      assert.ok(pending instanceof Promise);
      if (route === workspace && context && context.request && context.request.method !== 'GET') {
        assert.equal(await pending, false);
      } else await assert.rejects(pending, TypeError);
    }
    const events = [];
    const context = {};
    for (const name of ['request', 'response', 'url', 'knowledge'])
      getter(context, name, () => {
        events.push(name);
        return {};
      });
    const promise = route(context);
    assert.deepEqual(events, ['request', 'response', 'url', 'knowledge']);
    if (route === workspace) assert.equal(await promise, false);
    else await assert.rejects(promise, TypeError);
  }
});

test('workspace rejects non-GET before touching URL, knowledge or response', async () => {
  const poison = new Proxy(
    {},
    {
      get() {
        throw new Error('unexpected read');
      }
    }
  );
  for (const method of [undefined, null, false, 0, '', 'get', 'HEAD', 'POST', new String('GET'), Symbol('GET')]) {
    assert.equal(await workspace({ request: { method }, url: poison, knowledge: poison, response: poison }), false);
  }
  const failure = {};
  await assert.rejects(
    workspace({
      request: {
        get method() {
          throw failure;
        }
      },
      url: poison
    }),
    identical(failure)
  );
});

test('workspace rereads pathname in ordered branches and short circuits at the match', async () => {
  for (const [path, count, name] of [
    ['/api/knowledge/overview', 1, 'getKnowledgeOverview'],
    ['/api/knowledge/training-overview', 2, 'getTrainingOverview'],
    ['/api/knowledge/review-queue', 3, 'listReviewQueue'],
    ['/unknown', 3, undefined]
  ]) {
    const context = fixture(path);
    const events = [];
    getter(context.request, 'method', () => {
      events.push('method');
      return 'GET';
    });
    context.url = {
      get pathname() {
        events.push('pathname');
        return path;
      },
      searchParams: new URLSearchParams()
    };
    assert.equal(await workspace(context), name !== undefined);
    assert.deepEqual(events, ['method', ...Array(count).fill('pathname')]);
  }
  const context = fixture('/unknown');
  let reads = 0;
  context.url = {
    get pathname() {
      return ['no', '/api/knowledge/training-overview', '/api/knowledge/review-queue'][reads++];
    }
  };
  assert.equal(await workspace(context), true);
  assert.equal(context.calls[0].name, 'getTrainingOverview');
  assert.equal(reads, 2);
});

test('workspace exact paths do not normalize suffixes, case, escapes or boxed strings', async () => {
  for (const pathname of [
    '/api/knowledge/overview/',
    '/API/knowledge/overview',
    '/api/knowledge/%6fverview',
    '/api/knowledge/overview\n',
    new String('/api/knowledge/overview'),
    {
      toString() {
        throw new Error('must not coerce');
      }
    }
  ]) {
    const context = fixture('/unused');
    context.url = { pathname };
    assert.equal(await workspace(context), false);
    assert.deepEqual(context.events, []);
  }
});

test('version matches occur before each method read, including non-GET and unmatched paths', async () => {
  for (const method of ['GET', 'POST', 'HEAD', undefined, new String('GET')]) {
    const events = [];
    const url = {
      get pathname() {
        events.push('pathname');
        return {
          match(regex) {
            events.push(regex.source);
            return null;
          }
        };
      }
    };
    const request = {
      get method() {
        events.push('method');
        return method;
      }
    };
    assert.equal(await versions({ request, url }), false);
    assert.equal(events.length, 9);
    for (let index = 0; index < 3; index++) {
      assert.equal(events[index * 3], 'pathname');
      assert.equal(events[index * 3 + 2], 'method');
    }
    assert.deepEqual(
      events.filter(event => event.startsWith('^')),
      [
        '^\\/api\\/knowledge\\/notes\\/([^/]+)\\/versions\\/prune-preview$',
        '^\\/api\\/knowledge\\/notes\\/([^/]+)\\/versions$',
        '^\\/api\\/knowledge\\/notes\\/([^/]+)\\/versions\\/([^/]+)$'
      ]
    );
  }
});

test('version method and pathname remain live and are not cached between branches', async () => {
  const context = fixture('/unused');
  let paths = 0;
  let methods = 0;
  context.url = {
    get pathname() {
      return [
        '/api/knowledge/notes/n/versions/prune-preview',
        '/api/knowledge/notes/n/versions',
        '/api/knowledge/notes/n/versions/v'
      ][paths++];
    },
    searchParams: new URLSearchParams()
  };
  context.request = {
    get method() {
      return ['POST', 'GET'][methods++];
    }
  };
  assert.equal(await versions(context), true);
  assert.equal(paths, 2);
  assert.equal(methods, 2);
  assert.equal(context.calls[0].name, 'listNoteVersions');
});

test('version regex priority and percent decoding retain encoded slash, unicode and literal plus', async () => {
  for (const [pathname, name, args] of [
    ['/api/knowledge/notes/n/versions/prune-preview', 'previewNoteVersionPrune', [{ id: 'n' }]],
    ['/api/knowledge/notes/n/versions/prune%2Dpreview', 'getNoteVersion', [{ id: 'n', versionId: 'prune-preview' }]],
    ['/api/knowledge/notes/a%2Fb/versions/v%2F2', 'getNoteVersion', [{ id: 'a/b', versionId: 'v/2' }]],
    [
      '/api/knowledge/notes/%E7%AC%94%E8%AE%B0/versions/%F0%9F%98%80',
      'getNoteVersion',
      [{ id: '笔记', versionId: '😀' }]
    ],
    ['/api/knowledge/notes/a+b/versions/%252F', 'getNoteVersion', [{ id: 'a+b', versionId: '%2F' }]],
    ['/api/knowledge/notes/%00/versions', 'listNoteVersions', [{ id: '\0' }, {}]]
  ]) {
    const context = fixture(pathname);
    assert.equal(await versions(context), true);
    assert.equal(context.calls[0].name, name);
    assert.deepEqual(context.calls[0].args, args);
  }
});

test('version paths stay anchored and slash-sensitive without an added canonicalization step', async () => {
  for (const pathname of [
    '/api/knowledge/notes//versions',
    '/api/knowledge/notes/n/versions/',
    '/api/knowledge/notes/a/b/versions',
    '/api/knowledge/notes/n/versions/v/extra',
    'prefix/api/knowledge/notes/n/versions',
    '/API/knowledge/notes/n/versions'
  ]) {
    const context = fixture('/unused');
    context.url = { pathname };
    assert.equal(await versions(context), false);
    assert.deepEqual(context.events, []);
  }
});

test('invalid percent escapes reject with the same AppError before querying or calling the service', async () => {
  for (const suffix of ['%', '%GG', '%C0%AF', '%ED%A0%80', '%E0%A4%A']) {
    for (const pathname of [
      `/api/knowledge/notes/${suffix}/versions`,
      `/api/knowledge/notes/${suffix}/versions/prune-preview`,
      `/api/knowledge/notes/n/versions/${suffix}`
    ]) {
      const context = fixture(pathname);
      await assert.rejects(
        versions(context),
        error =>
          error instanceof AppError &&
          error.code === 'ROUTE_PARAMETER_INVALID' &&
          error.message === 'Route parameter is invalid' &&
          error.statusCode === 400
      );
      assert.deepEqual(context.events, []);
      context.request.method = 'POST';
      assert.equal(await versions(context), false);
    }
  }
});

test('custom pathname match objects retain receiver, truthy results and capture coercion', async () => {
  for (const matchValue of [
    true,
    17,
    'x',
    {},
    { 1: null },
    { 1: false },
    {
      1: {
        toString() {
          return 'a%2Fb';
        }
      }
    }
  ]) {
    const context = fixture('/unused');
    const pathname = {
      match(regex) {
        assert.equal(this, pathname);
        assert.ok(regex instanceof RegExp);
        return matchValue;
      }
    };
    context.url = { pathname };
    assert.equal(await versions(context), true);
    assert.equal(context.calls[0].name, 'previewNoteVersionPrune');
    assert.deepEqual(context.calls[0].args, [{ id: decodeURIComponent(matchValue[1]) }]);
  }
  const context = fixture('/unused');
  let matches = 0;
  context.url = {
    pathname: {
      match() {
        return ++matches < 3 ? null : { 1: 'n', 2: 'v' };
      }
    }
  };
  assert.equal(await versions(context), true);
  assert.deepEqual(context.calls[0].args, [{ id: 'n', versionId: 'v' }]);
});

test('custom capture getters throw unchanged but coercion errors are wrapped by decode', async () => {
  const failure = {};
  for (const capture of [
    {
      get 1() {
        throw failure;
      }
    },
    {
      1: {
        toString() {
          throw failure;
        }
      }
    },
    { 1: Symbol('bad') }
  ]) {
    const context = fixture('/unused');
    context.url = {
      pathname: {
        match() {
          return capture;
        }
      }
    };
    if (Object.getOwnPropertyDescriptor(capture, '1').get) await assert.rejects(versions(context), identical(failure));
    else
      await assert.rejects(
        versions(context),
        error => error instanceof AppError && error.code === 'ROUTE_PARAMETER_INVALID'
      );
    assert.deepEqual(context.events, []);
  }
});

test('native URLSearchParams preserves last duplicate, empty, plus, unicode and own prototype keys', async () => {
  for (const [route, path, name] of [specifications[2], specifications[4]]) {
    const context = fixture(
      `${path}?limit=1&limit=7&blank=&plus=a+b&encoded=%2B&unicode=%E7%AC%94&__proto__=safe&constructor=x`
    );
    assert.equal(await route(context), true);
    const query = context.calls[0].args.at(-1);
    assert.deepEqual(query, {
      limit: '7',
      blank: '',
      plus: 'a b',
      encoded: '+',
      unicode: '笔',
      ['__proto__']: 'safe',
      constructor: 'x'
    });
    assert.equal(Object.getPrototypeOf(query), Object.prototype);
    assert.equal(Object.hasOwn(query, '__proto__'), true);
    assert.equal(context.calls[0].name, name);
  }
});

test('query-only branches observe service getter before query iteration and preserve opaque entries', async () => {
  for (const [route, path, name] of [specifications[2], specifications[4]]) {
    const context = fixture(path);
    const events = [];
    const symbol = Symbol('query');
    const opaque = {};
    const searchParams = {
      entries() {
        assert.equal(this, searchParams);
        events.push('entries');
        return [
          ['same', 1],
          ['same', opaque],
          [symbol, opaque]
        ];
      }
    };
    context.url = {
      pathname: path,
      get searchParams() {
        events.push('searchParams');
        return searchParams;
      }
    };
    getter(context.knowledge, name, () => {
      events.push('service getter');
      return function (...args) {
        events.push('call');
        assert.equal(this, context.knowledge);
        assert.equal(args.at(-1).same, opaque);
        assert.equal(args.at(-1)[symbol], opaque);
        return null;
      };
    });
    assert.equal(await route(context), true);
    assert.deepEqual(events, ['service getter', 'searchParams', 'entries', 'call']);
  }
});

test('overview, detail and prune branches never read searchParams', async () => {
  for (const [route, path] of specifications.filter((_, index) => ![2, 4].includes(index))) {
    const context = fixture(path);
    context.url = {
      pathname: path,
      get searchParams() {
        throw new Error('unexpected query');
      }
    };
    assert.equal(await route(context), true);
  }
});

test('version detail reads service then id then versionId; invalid id prevents later capture read', async () => {
  for (const invalid of [false, true]) {
    const events = [];
    const context = fixture('/unused');
    let attempts = 0;
    context.url = {
      pathname: {
        match() {
          return ++attempts < 3
            ? null
            : {
                get 1() {
                  events.push('id');
                  return invalid ? '%' : 'n';
                },
                get 2() {
                  events.push('versionId');
                  return 'v';
                }
              };
        }
      }
    };
    getter(context.knowledge, 'getNoteVersion', () => {
      events.push('service getter');
      return () => null;
    });
    if (invalid) await assert.rejects(versions(context), error => error.code === 'ROUTE_PARAMETER_INVALID');
    else assert.equal(await versions(context), true);
    assert.deepEqual(events, invalid ? ['service getter', 'id'] : ['service getter', 'id', 'versionId']);
  }
});

test('query getter, entries, iteration, malformed entries and service property failures propagate', async () => {
  for (const [route, path, name] of [specifications[2], specifications[4]]) {
    for (const stage of ['query', 'entries', 'iterator', 'entry', 'service']) {
      const failure = { stage };
      const context = fixture(path);
      const searchParams = {
        entries() {
          if (stage === 'entries') throw failure;
          return {
            [Symbol.iterator]() {
              if (stage === 'iterator') throw failure;
              return {
                next() {
                  if (stage === 'entry') throw failure;
                  return { done: true };
                }
              };
            }
          };
        }
      };
      context.url = {
        pathname: path,
        get searchParams() {
          if (stage === 'query') throw failure;
          return searchParams;
        }
      };
      if (stage === 'service')
        getter(context.knowledge, name, () => {
          throw failure;
        });
      await assert.rejects(route(context), identical(failure));
      assert.deepEqual(context.events, []);
    }
    const context = fixture(path);
    context.url = {
      pathname: path,
      searchParams: {
        entries() {
          return [1];
        }
      }
    };
    await assert.rejects(route(context), TypeError);
  }
});

test('every route crosses await before headers even for synchronous values', async () => {
  for (const [route, path, name] of specifications) {
    const context = fixture(path);
    const pending = route(context);
    assert.deepEqual(context.events, [['service', name]]);
    assert.equal(await pending, true);
    assert.equal(context.events[1][0], 'head');
  }
});

test('pending service promise leaves response untouched and resumes with the resolved data', async () => {
  for (const [route, path, name] of specifications) {
    const gate = deferred();
    const context = fixture(path, 'GET', gate.promise);
    const pending = route(context);
    await setImmediate();
    assert.deepEqual(context.events, [['service', name]]);
    gate.resolve({ deferred: name });
    assert.equal(await pending, true);
    assert.deepEqual(body(context), { data: { deferred: name } });
  }
});

test('all route methods accept promise and thenable results with normal await assimilation', async () => {
  for (const [route, path] of specifications) {
    for (const mode of ['promise', 'thenable', 'double resolve', 'resolve then throw', 'noncallable then']) {
      const events = [];
      const payload = { mode };
      const value =
        mode === 'promise'
          ? Promise.resolve(payload)
          : mode === 'noncallable then'
            ? { then: false }
            : {
                get then() {
                  events.push('then getter');
                  return function (resolve) {
                    assert.equal(this, value);
                    events.push('then call');
                    resolve(payload);
                    if (mode === 'double resolve') resolve({ ignored: true });
                    if (mode === 'resolve then throw') throw new Error('ignored');
                  };
                }
              };
      const context = fixture(path, 'GET', value);
      const pending = route(context);
      assert.deepEqual(events, mode === 'promise' || mode === 'noncallable then' ? [] : ['then getter']);
      assert.equal(await pending, true);
      assert.deepEqual(body(context), { data: mode === 'noncallable then' ? { then: false } : payload });
    }
  }
});

test('service throws, rejections and thenable failures retain arbitrary rejection identity', async () => {
  for (const [route, path, name] of specifications) {
    for (const reason of [undefined, null, false, 0, '', NaN, 1n, Symbol('failure'), {}]) {
      for (const mode of ['throw', 'reject', 'then getter', 'then call']) {
        const context = fixture(path);
        context.knowledge[name] = () => {
          if (mode === 'throw') throw reason;
          if (mode === 'reject') return Promise.reject(reason);
          return {
            get then() {
              if (mode === 'then getter') throw reason;
              return () => {
                throw reason;
              };
            }
          };
        };
        await assert.rejects(route(context), identical(reason));
        assert.deepEqual(context.events, []);
      }
    }
  }
});

test('opaque resolved JSON values retain JSON.stringify omission and null behavior', async () => {
  for (const [route, path] of specifications) {
    for (const value of [
      undefined,
      null,
      false,
      0,
      -0,
      '',
      NaN,
      Infinity,
      Symbol('data'),
      () => {},
      [],
      { nested: undefined }
    ]) {
      const context = fixture(path, 'GET', value);
      assert.equal(await route(context), true);
      assert.equal(context.events.at(-1)[1], JSON.stringify({ data: value }));
    }
  }
});

test('sendJson writes head before serialization and keeps toJSON receiver and key', async () => {
  for (const [route, path] of specifications) {
    const context = fixture(path);
    const payload = {
      toJSON(key) {
        assert.equal(this, payload);
        assert.equal(key, 'data');
        context.events.push(['serialize']);
        return { converted: true };
      }
    };
    context.knowledge[specifications.find(item => item[1] === path)[2]] = () => payload;
    assert.equal(await route(context), true);
    assert.deepEqual(
      context.events.map(event => event[0]),
      ['head', 'serialize', 'end']
    );
    assert.deepEqual(body(context), { data: { converted: true } });
  }
});

test('serialization errors occur after head but before end and reject the route', async () => {
  const circular = {};
  circular.self = circular;
  for (const [route, path] of specifications) {
    for (const value of [1n, circular]) {
      const context = fixture(path, 'GET', value);
      await assert.rejects(route(context), TypeError);
      assert.deepEqual(
        context.events.map(event => event[0]),
        ['service', 'head']
      );
    }
    const failure = {};
    const context = fixture(path, 'GET', {
      toJSON() {
        throw failure;
      }
    });
    await assert.rejects(route(context), identical(failure));
    assert.deepEqual(
      context.events.map(event => event[0]),
      ['service', 'head']
    );
  }
});

test('writeHead/end getters and calls retain timing, receiver and arbitrary throw identity', async () => {
  for (const [route, path] of specifications) {
    for (const stage of ['head getter', 'head call', 'end getter', 'end call']) {
      const failure = { stage };
      const context = fixture(path);
      const events = [];
      context.response = {
        get writeHead() {
          events.push('head getter');
          if (stage === 'head getter') throw failure;
          return function () {
            assert.equal(this, context.response);
            events.push('head call');
            if (stage === 'head call') throw failure;
          };
        },
        get end() {
          events.push('end getter');
          if (stage === 'end getter') throw failure;
          return function () {
            assert.equal(this, context.response);
            events.push('end call');
            throw failure;
          };
        }
      };
      const pending = route(context);
      assert.deepEqual(events, []);
      await assert.rejects(pending, identical(failure));
      assert.deepEqual(
        events,
        ['head getter', 'head call', 'end getter', 'end call'].slice(
          0,
          ['head getter', 'head call', 'end getter', 'end call'].indexOf(stage) + 1
        )
      );
    }
  }
});

test('response end getter is evaluated before stringify, and response return values are ignored', async () => {
  const context = fixture('/api/knowledge/overview');
  const events = [];
  context.knowledge.getKnowledgeOverview = () => ({
    toJSON() {
      events.push('serialize');
      return 17;
    }
  });
  context.response = {
    writeHead() {
      events.push('head');
      return { ignored: true };
    },
    get end() {
      events.push('end getter');
      return () => {
        events.push('end');
        return { ignored: true };
      };
    }
  };
  assert.equal(await workspace(context), true);
  assert.deepEqual(events, ['head', 'end getter', 'serialize', 'end']);
});

function consumerFixture(factory, asyncServices) {
  const events = [];
  const note = { id: 'n/1', currentVersionId: 'v' };
  const returned = value => (asyncServices ? Promise.resolve(value) : value);
  const module = {
    noteService: {
      getNote(id) {
        events.push(['note', id]);
        return returned(note);
      }
    },
    noteVersionService: {
      listVersions(query) {
        events.push(['list', query]);
        return returned(['versions']);
      },
      listVersionPage(noteValue, query) {
        assert.equal(noteValue, note);
        events.push(['page', query]);
        return returned({ items: ['page'] });
      },
      getVersion(versionId, noteId) {
        events.push(['detail', versionId, noteId]);
        return returned({ versionId, noteId });
      }
    },
    previewNoteVersionPrune(id) {
      events.push(['prune', id]);
      return returned({ id });
    },
    workspaceQueryService: {
      getKnowledgeOverview() {
        events.push(['overview']);
        return returned({ total: 1 });
      },
      getTrainingOverview() {
        events.push(['training']);
        return returned({ total: 2 });
      },
      listReviewQueue(query) {
        events.push(['review', query]);
        return returned({ items: [] });
      }
    }
  };
  return { module, events, knowledge: factory({ knowledgeModule: module }) };
}

for (const [label, factory, asyncServices] of [
  ['local', createKnowledgeHttpHandlers, false],
  ['postgres', createPostgresKnowledgeHttpHandlers, true]
]) {
  test(`real ${label} handlers compose all six routes without repositories or a database`, async () => {
    for (const [route, path, expected] of [
      [workspace, '/api/knowledge/overview', [['overview']]],
      [workspace, '/api/knowledge/training-overview', [['training']]],
      [workspace, '/api/knowledge/review-queue?limit=1&limit=2', [['review', { limit: '2' }]]],
      [
        versions,
        '/api/knowledge/notes/n%2F1/versions',
        [
          ['note', 'n/1'],
          ['list', { noteId: 'n/1' }]
        ]
      ],
      [
        versions,
        '/api/knowledge/notes/n%2F1/versions?limit=2&limit=3',
        [
          ['note', 'n/1'],
          ['page', { limit: '3' }]
        ]
      ],
      [
        versions,
        '/api/knowledge/notes/n%2F1/versions?cursor=',
        [
          ['note', 'n/1'],
          ['page', { cursor: '' }]
        ]
      ],
      [
        versions,
        '/api/knowledge/notes/n%2F1/versions/v%2F2',
        [
          ['note', 'n/1'],
          ['detail', 'v/2', 'n/1']
        ]
      ],
      [versions, '/api/knowledge/notes/n%2F1/versions/prune-preview', [['prune', 'n/1']]]
    ]) {
      const consumer = consumerFixture(factory, asyncServices);
      const context = { ...fixture(path), knowledge: consumer.knowledge };
      assert.equal(await route(context), true);
      assert.deepEqual(consumer.events, expected);
      assert.equal(context.events[0][0], 'head');
    }
  });

  test(`real ${label} handlers reject missing-note failures before version reads`, async () => {
    for (const path of [
      '/api/knowledge/notes/n/versions',
      '/api/knowledge/notes/n/versions?limit=1',
      '/api/knowledge/notes/n/versions/v'
    ]) {
      const consumer = consumerFixture(factory, asyncServices);
      const failure = { code: 'NOTE_NOT_FOUND' };
      consumer.module.noteService.getNote = () => {
        if (asyncServices) return Promise.reject(failure);
        throw failure;
      };
      const context = { ...fixture(path), knowledge: consumer.knowledge };
      await assert.rejects(versions(context), identical(failure));
      assert.deepEqual(consumer.events, []);
      assert.deepEqual(context.events, []);
    }
  });
}

test('real PostgreSQL consumer waits for note access before invoking version service', async () => {
  const consumer = consumerFixture(createPostgresKnowledgeHttpHandlers, true);
  const gate = deferred();
  consumer.module.noteService.getNote = () => gate.promise;
  const context = { ...fixture('/api/knowledge/notes/n/versions/v'), knowledge: consumer.knowledge };
  const pending = versions(context);
  await setImmediate();
  assert.deepEqual(consumer.events, []);
  assert.deepEqual(context.events, []);
  gate.resolve({ id: 'n' });
  assert.equal(await pending, true);
  assert.deepEqual(consumer.events, [['detail', 'v', 'n']]);
});

test('real knowledge dispatcher consumes all six bridges and returns false for unknown GET', async () => {
  for (const [, path, name] of specifications) {
    const context = fixture(path);
    assert.equal(await dispatcher(context), true);
    assert.equal(context.calls[0].name, name);
    assert.equal(context.calls.length, 1);
  }
  const context = fixture('/api/knowledge/not-a-route');
  assert.equal(await dispatcher(context), false);
  assert.deepEqual(context.events, []);
});

test('real Node HTTP request/response preserve status, headers, bytes, query duplicates and encoded identifiers', async () => {
  const calls = [];
  const server = createServer(async (request, response) => {
    const context = fixture('/unused');
    try {
      const handled = await dispatcher({
        request,
        response,
        url: new URL(request.url, 'http://localhost'),
        knowledge: context.knowledge
      });
      calls.push(...context.calls.map(({ name, args }) => ({ name, args })));
      if (!handled) {
        response.writeHead(404);
        response.end('not found');
      }
    } catch (error) {
      response.writeHead(error.statusCode ?? 500);
      response.end(JSON.stringify({ error: { code: error.code, message: error.message } }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  async function get(path, method = 'GET') {
    return new Promise((resolve, reject) => {
      const request = httpRequest({ hostname: '127.0.0.1', port, path, method, agent: false }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            text: Buffer.concat(chunks).toString('utf8')
          })
        );
      });
      request.on('error', reject);
      request.end();
    });
  }
  try {
    for (const [, path] of specifications) {
      const result = await get(path);
      assert.equal(result.status, 200);
      assert.equal(result.headers['content-type'], 'application/json; charset=utf-8');
      assert.equal(result.text, '{"data":{"ok":true}}');
    }
    await get('/api/knowledge/notes/a%2Fb/versions/v%2F2');
    assert.deepEqual(calls.at(-1), { name: 'getNoteVersion', args: [{ id: 'a/b', versionId: 'v/2' }] });
    await get('/api/knowledge/review-queue?limit=1&limit=9');
    assert.deepEqual(calls.at(-1), { name: 'listReviewQueue', args: [{ limit: '9' }] });
    const invalid = await get('/api/knowledge/notes/%/versions');
    assert.equal(invalid.status, 400);
    assert.deepEqual(JSON.parse(invalid.text), {
      error: { code: 'ROUTE_PARAMETER_INVALID', message: 'Route parameter is invalid' }
    });
    assert.equal((await get('/api/knowledge/overview', 'HEAD')).status, 404);
    assert.equal((await get('/api/knowledge/notes/n/versions', 'POST')).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
});

test('version regex retains native final-line-terminator behavior instead of URL normalization', async () => {
  const unmatched = fixture('/unused');
  unmatched.url = { pathname: '/api/knowledge/notes/n/versions\n' };
  assert.equal(await versions(unmatched), false);
  assert.deepEqual(unmatched.events, []);
  for (const [pathname, name, expected] of [
    ['/api/knowledge/notes/n/versions/prune-preview\n', 'getNoteVersion', [{ id: 'n', versionId: 'prune-preview\n' }]],
    ['/api/knowledge/notes/n/versions/v\n', 'getNoteVersion', [{ id: 'n', versionId: 'v\n' }]],
    ['/api/knowledge/notes/n\nx/versions', 'listNoteVersions', [{ id: 'n\nx' }, {}]]
  ]) {
    const context = fixture('/unused');
    context.url = { pathname, searchParams: new URLSearchParams() };
    assert.equal(await versions(context), true);
    assert.equal(context.calls[0].name, name);
    assert.deepEqual(context.calls[0].args, expected);
  }
});

test('version pathname and match failures happen even on POST and before reading method', async () => {
  const failure = {};
  for (const pathname of [
    undefined,
    null,
    17,
    { match: true },
    {
      get match() {
        throw failure;
      }
    },
    {
      match() {
        throw failure;
      }
    }
  ]) {
    let methodReads = 0;
    const context = {
      url: { pathname },
      request: {
        get method() {
          methodReads++;
          return 'POST';
        }
      }
    };
    await assert.rejects(versions(context), error => error === failure || error instanceof TypeError);
    assert.equal(methodReads, 0);
  }
});

test('noncallable and missing service methods reject asynchronously without writing response', async () => {
  for (const [route, path, name] of specifications) {
    for (const value of [undefined, null, false, 17, {}, 'service']) {
      const context = fixture(path);
      context.knowledge[name] = value;
      let pending;
      assert.doesNotThrow(() => {
        pending = route(context);
      });
      await assert.rejects(pending, TypeError);
      assert.deepEqual(context.events, []);
    }
  }
});

test('await keeps captured response reference but observes its live writers without rechecking method or path', async () => {
  for (const [route, path] of specifications) {
    const gate = deferred();
    const context = fixture(path, 'GET', gate.promise);
    const captured = context.response;
    const pending = route(context);
    context.response = new Proxy(
      {},
      {
        get() {
          throw new Error('new response must not be used');
        }
      }
    );
    getter(context.request, 'method', () => {
      throw new Error('method must not be read after await');
    });
    context.url = new Proxy(
      {},
      {
        get() {
          throw new Error('URL must not be reread after await');
        }
      }
    );
    captured.end = function (content) {
      assert.equal(this, captured);
      context.events.push(['late end', content]);
    };
    gate.resolve({ late: true });
    assert.equal(await pending, true);
    assert.deepEqual(context.events.at(-1), ['late end', '{"data":{"late":true}}']);
  }
});

test('toQueryObject closes the entries iterator when an entry or key coercion is invalid', async () => {
  for (const [route, path] of [specifications[2], specifications[4]]) {
    for (const mode of ['entry', 'key']) {
      const failure = {};
      const events = [];
      const context = fixture(path);
      context.url = {
        pathname: path,
        searchParams: {
          entries() {
            return {
              [Symbol.iterator]() {
                return {
                  next() {
                    return {
                      done: false,
                      value:
                        mode === 'entry'
                          ? 17
                          : [
                              {
                                [Symbol.toPrimitive]() {
                                  throw failure;
                                }
                              },
                              'value'
                            ]
                    };
                  },
                  return() {
                    events.push('closed');
                    return { done: true };
                  }
                };
              }
            };
          }
        }
      };
      await assert.rejects(route(context), mode === 'entry' ? TypeError : identical(failure));
      assert.deepEqual(events, ['closed']);
      assert.deepEqual(context.events, []);
    }
  }
});
