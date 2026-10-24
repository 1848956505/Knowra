import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createAsyncNoteDeletionCoordinator } from '../src/modules/knowledge/application/postgres-async/note-deletion-coordinator.js';
import { createAsyncNoteService } from '../src/modules/knowledge/application/postgres-async/note-service.js';
import { createPostgresNoteRepository } from '../src/modules/knowledge/infrastructure/postgres/note-repository.js';
import { createPostgresKnowledgeHttpHandlers } from '../src/modules/knowledge/http/postgres-async-handlers.js';
import { handleNoteRoute } from '../src/modules/knowledge/http/note-routes.js';
import { inspectAttachmentDeletion } from '../src/infrastructure/attachment-deletion-preflight.js';
import { assetLifecycleStage0Tests } from './asset-lifecycle-stage0.test.js';

// 准确实际父正文与固定独立预期；普通测试不依赖 Git，也不从候选生成预期。
export const deletionParent = 'dab7eea29d86cbcbf848e01c9324d82bc8242581';
export const deletionFrozenSource =
  "import { createAppError } from '../../../../errors/app-error.js';\n\nexport function createAsyncNoteDeletionCoordinator({\n  noteService,\n  noteRepository,\n  attachmentStore,\n  runTransaction = (operation) => operation()\n}) {\n  async function collectAttachments(noteIds) {\n    const noteIdSet = new Set(noteIds);\n    const attachments = await attachmentStore?.listAttachments?.() ?? [];\n    return attachments.filter((attachment) => noteIdSet.has(attachment.noteId));\n  }\n\n  async function assertNoRetainedAttachmentReferences(attachments, noteIds) {\n    const noteIdSet = new Set(noteIds);\n    for (const attachment of attachments) {\n      const preflight = await attachmentStore.inspectAttachmentDeletion(attachment.id);\n      const retained = preflight.references.filter((reference) => !(\n        ['notes', 'noteVersions', 'contentAnnotations'].includes(reference.collection)\n        && noteIdSet.has(reference.noteId ?? reference.id)\n      ));\n      if (retained.length) {\n        throw createAppError('ATTACHMENT_REFERENCED', '保留的资产仍引用此附件，不能删除。', 409);\n      }\n    }\n  }\n\n  async function finishAttachmentCleanup(attachments) {\n    return await attachmentStore?.removeDetachedAttachmentFiles?.(attachments) ?? [];\n  }\n\n  function assertSameAttachments(queued, current) {\n    const expected = new Map(queued.map(item => [item.id, `${item.storagePath}\\u0000${item.fileName}`]));\n    if (current.length !== expected.size || current.some(item => expected.get(item.id) !== `${item.storagePath}\\u0000${item.fileName}`)) {\n      throw createAppError('NOTE_DELETE_PREVIEW_STALE', '笔记附件已变化，请重新预检。', 409);\n    }\n  }\n\n  async function permanentlyDeleteNote(noteId) {\n    const queuedAttachments = await collectAttachments([noteId]);\n    await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);\n    let detachedAttachments = [];\n    const deletedNote = await runTransaction(async () => {\n      detachedAttachments = await collectAttachments([noteId]);\n      assertSameAttachments(queuedAttachments, detachedAttachments);\n      await assertNoRetainedAttachmentReferences(detachedAttachments, [noteId]);\n      return noteService.permanentlyDeleteNote(noteId);\n    });\n    const cleanup = await finishAttachmentCleanup(detachedAttachments);\n    return cleanup.length ? { ...deletedNote, attachmentCleanup: cleanup } : deletedNote;\n  }\n\n  async function emptyRecycleBin(spaceId = null) {\n    const queuedNotes = await noteRepository.list({ includeDeleted: true, spaceId });\n    const queuedNoteIds = queuedNotes.filter(note => note.deleted).map(note => note.id);\n    const queuedAttachments = await collectAttachments(queuedNoteIds);\n    await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);\n    let detachedAttachments = [];\n    const result = await runTransaction(async () => {\n      const deletedNotes = await noteRepository.list({ includeDeleted: true, spaceId });\n      const noteIds = deletedNotes.filter((note) => note.deleted).map((note) => note.id);\n      if (noteIds.length !== queuedNoteIds.length || noteIds.some(id => !queuedNoteIds.includes(id))) {\n        throw createAppError('NOTE_DELETE_PREVIEW_STALE', '回收站内容已变化，请重新预检。', 409);\n      }\n      detachedAttachments = await collectAttachments(noteIds);\n      assertSameAttachments(queuedAttachments, detachedAttachments);\n      await assertNoRetainedAttachmentReferences(detachedAttachments, noteIds);\n      return noteService.emptyRecycleBin(spaceId);\n    });\n    const cleanup = await finishAttachmentCleanup(detachedAttachments);\n    return cleanup.length ? { ...result, attachmentCleanup: cleanup } : result;\n  }\n\n  return { permanentlyDeleteNote, emptyRecycleBin };\n}\n";
export const deletionSourceSha = 'f944011dd25912f07f727c83cd9d7cff877178a2c9bdaa72c7b973c201ae8fad';
export const hash = value => createHash('sha256').update(value).digest('hex');
export function deletionContractCases(subject) {
  const create = subject.createAsyncNoteDeletionCoordinator;
  const tests = [];
  const test = (name, run) => tests.push({ name, run });
  function fixture({
    notes = [{ id: 'n', deleted: true }],
    attachments = [{ id: 'a', noteId: 'n', storagePath: 's', fileName: 'f' }],
    cleanup = [],
    references = []
  } = {}) {
    const events = [],
      result = { id: 'n' },
      recycle = { deletedCount: 1 };
    let lists = 0,
      noteLists = 0;
    const store = {
      listAttachments() {
        assert.equal(this, store);
        events.push('attachments:' + ++lists);
        return attachments;
      },
      prepareAttachmentCleanup(_a) {
        assert.equal(this, store);
        events.push('prepare');
      },
      inspectAttachmentDeletion(id) {
        assert.equal(this, store);
        events.push('inspect:' + String(id));
        return { references };
      },
      removeDetachedAttachmentFiles(_a) {
        assert.equal(this, store);
        events.push('cleanup');
        return cleanup;
      }
    };
    const repo = {
      list(_o) {
        assert.equal(this, repo);
        events.push('notes:' + ++noteLists);
        return notes;
      }
    };
    const service = {
      permanentlyDeleteNote(_id) {
        assert.equal(this, service);
        events.push('service');
        return result;
      },
      emptyRecycleBin(_id) {
        assert.equal(this, service);
        events.push('service');
        return recycle;
      }
    };
    const options = {
      noteService: service,
      noteRepository: repo,
      attachmentStore: store,
      runTransaction: async function (operation) {
        assert.equal(this, undefined);
        events.push('begin');
        const r = await operation();
        events.push('commit');
        return r;
      }
    };
    return { events, result, recycle, store, repo, service, options, notes, attachments };
  }
  const invoke = (c, kind, arg) => (kind === 'permanent' ? c.permanentlyDeleteNote(arg) : c.emptyRecycleBin(arg));
  test('factory shape and native async methods', async () => {
    const c = create(fixture().options);
    assert.equal(create.length, 1);
    assert.deepEqual(Object.keys(c), ['permanentlyDeleteNote', 'emptyRecycleBin']);
    assert.equal(c.permanentlyDeleteNote.length, 1);
    assert.equal(c.emptyRecycleBin.length, 0);
    assert.equal(c.permanentlyDeleteNote.constructor.name, 'AsyncFunction');
    assert.equal(c.emptyRecycleBin.constructor.name, 'AsyncFunction');
  });
  test('missing options throws synchronously', () => assert.throws(() => create(), TypeError));
  test('missing ports fail lazily via rejection', async () => {
    const c = create({});
    assert.ok(c);
    await assert.rejects(c.permanentlyDeleteNote('n'), TypeError);
    await assert.rejects(c.emptyRecycleBin(), TypeError);
  });
  test('option getters use original binder order', () => {
    const events = [];
    const o = {};
    for (const k of ['runTransaction', 'attachmentStore', 'noteRepository', 'noteService'])
      Object.defineProperty(o, k, {
        get() {
          events.push(k);
          return undefined;
        }
      });
    create(o);
    assert.deepEqual(events, ['noteService', 'noteRepository', 'attachmentStore', 'runTransaction']);
  });
  for (const kind of ['permanent', 'recycle']) {
    test(kind + ' exact phase order and identity', async () => {
      const f = fixture();
      const r = await invoke(create(f.options), kind, 'n');
      assert.equal(r, kind === 'permanent' ? f.result : f.recycle);
      assert.deepEqual(
        f.events,
        kind === 'permanent'
          ? ['attachments:1', 'prepare', 'begin', 'attachments:2', 'inspect:a', 'service', 'commit', 'cleanup']
          : [
              'notes:1',
              'attachments:1',
              'prepare',
              'begin',
              'notes:2',
              'attachments:2',
              'inspect:a',
              'service',
              'commit',
              'cleanup'
            ]
      );
    });
    test(kind + ' no store stays permissive at runtime', async () => {
      const f = fixture();
      delete f.options.attachmentStore;
      assert.equal(await invoke(create(f.options), kind, 'n'), kind === 'permanent' ? f.result : f.recycle);
      assert.ok(!f.events.includes('cleanup'));
    });
    test(kind + ' null store stays permissive at runtime', async () => {
      const f = fixture();
      f.options.attachmentStore = null;
      assert.equal(await invoke(create(f.options), kind, 'n'), kind === 'permanent' ? f.result : f.recycle);
    });
    test(kind + ' default runner preserves asynchronous service', async () => {
      const f = fixture();
      delete f.options.runTransaction;
      assert.equal(await invoke(create(f.options), kind, 'n'), kind === 'permanent' ? f.result : f.recycle);
      assert.ok(!f.events.includes('begin'));
    });
    test(kind + ' null runner rejects after preparation', async () => {
      const f = fixture();
      f.options.runTransaction = null;
      await assert.rejects(invoke(create(f.options), kind, 'n'), TypeError);
      assert.equal(f.events.at(-1), 'prepare');
    });
    test(kind + ' ignored prepare result is awaited', async () => {
      const f = fixture();
      const poison = {};
      f.store.prepareAttachmentCleanup = () => ({
        get then() {
          f.events.push('prepare-then');
          throw poison;
        }
      });
      await assert.rejects(invoke(create(f.options), kind, 'n'), e => e === poison);
      assert.ok(!f.events.includes('begin'));
    });
    test(kind + ' metadata stale stops before reference inspection', async () => {
      const f = fixture();
      let n = 0;
      f.store.listAttachments = () => (++n === 1 ? f.attachments : [{ ...f.attachments[0], fileName: 'changed' }]);
      await assert.rejects(invoke(create(f.options), kind, 'n'), {
        code: 'NOTE_DELETE_PREVIEW_STALE',
        statusCode: 409
      });
      assert.ok(!f.events.includes('inspect:a'));
      assert.ok(!f.events.includes('service'));
      assert.ok(!f.events.includes('cleanup'));
    });
    test(kind + ' allowed references use nullish noteId fallback', async () => {
      const f = fixture({
        references: [
          { collection: 'notes', id: 'n' },
          { collection: 'noteVersions', id: 'v', noteId: 'n' },
          { collection: 'contentAnnotations', id: 'c', noteId: 'n' }
        ]
      });
      await invoke(create(f.options), kind, 'n');
      assert.ok(f.events.includes('service'));
    });
    for (const ref of [
      { collection: 'notes', id: 'other' },
      { collection: 'knowledgeItems', id: 'n' },
      { collection: 'notes', id: 'n', noteId: '' }
    ])
      test(kind + ' retained reference ' + JSON.stringify(ref), async () => {
        const f = fixture({ references: [ref] });
        await assert.rejects(invoke(create(f.options), kind, 'n'), { code: 'ATTACHMENT_REFERENCED', statusCode: 409 });
        assert.ok(!f.events.includes('service'));
        assert.ok(!f.events.includes('cleanup'));
      });
    test(kind + ' prepare sees queued list identity and mutates later comparison', async () => {
      const f = fixture();
      let prepared, cleaned;
      f.store.listAttachments = () => f.attachments;
      f.store.prepareAttachmentCleanup = a => {
        prepared = a;
        a[0].fileName = 'changed';
      };
      f.store.inspectAttachmentDeletion = () => ({ references: [] });
      f.store.removeDetachedAttachmentFiles = a => {
        cleaned = a;
        return [];
      };
      await invoke(create(f.options), kind, 'n');
      assert.notEqual(prepared, cleaned);
      assert.equal(prepared[0], cleaned[0]);
      assert.equal(cleaned[0].fileName, 'changed');
    });
    test(kind + ' cleanup length truthiness and shallow spread', async () => {
      const symbol = Symbol('key');
      const f = fixture({ cleanup: { length: 'yes' } });
      const r = kind === 'permanent' ? f.result : f.recycle;
      const proto = { method() {} };
      Object.setPrototypeOf(r, proto);
      Object.defineProperty(r, 'hidden', { value: 1 });
      r[symbol] = 2;
      r.attachmentCleanup = 'old';
      const out = await invoke(create(f.options), kind, 'n');
      assert.notEqual(out, r);
      assert.equal(Object.getPrototypeOf(out), Object.prototype);
      assert.ok(!Object.hasOwn(out, 'hidden'));
      assert.equal(out[symbol], 2);
      assert.equal(out.attachmentCleanup.length, 'yes');
    });
    test(kind + ' list/prepare/inspect/cleanup thenables assimilate in sequence', async () => {
      const f = fixture();
      for (const k of [
        'listAttachments',
        'prepareAttachmentCleanup',
        'inspectAttachmentDeletion',
        'removeDetachedAttachmentFiles'
      ]) {
        const original = f.store[k];
        f.store[k] = function (...args) {
          const v = original.apply(this, args);
          return {
            get then() {
              f.events.push(k + ':then-get');
              return resolve => {
                f.events.push(k + ':then-call');
                resolve(v);
              };
            }
          };
        };
      }
      await invoke(create(f.options), kind, 'n');
      assert.equal(f.events.filter(x => x === 'listAttachments:then-get').length, 2);
      assert.ok(f.events.indexOf('prepareAttachmentCleanup:then-call') < f.events.indexOf('begin'));
      assert.ok(f.events.indexOf('removeDetachedAttachmentFiles:then-call') > f.events.indexOf('commit'));
    });
    test(kind + ' list getter reads once per collection call, never cached', async () => {
      const f = fixture();
      let reads = 0;
      Object.defineProperty(f.store, 'listAttachments', {
        get() {
          reads++;
          return () => f.attachments;
        }
      });
      await invoke(create(f.options), kind, 'n');
      assert.equal(reads, 2);
    });
    test(kind + ' service replacement after factory creation remains late-bound', async () => {
      const f = fixture(),
        c = create(f.options),
        out = { late: true };
      f.service[kind === 'permanent' ? 'permanentlyDeleteNote' : 'emptyRecycleBin'] = function () {
        assert.equal(this, f.service);
        return out;
      };
      assert.equal(await invoke(c, kind, 'n'), out);
    });
    test(kind + ' service Promise is unwrapped before cleanup', async () => {
      const f = fixture(),
        out = { late: true };
      f.service[kind === 'permanent' ? 'permanentlyDeleteNote' : 'emptyRecycleBin'] = () => Promise.resolve(out);
      assert.equal(await invoke(create(f.options), kind, 'n'), out);
    });
    test(kind + ' transaction zero calls still performs cleanup with fresh empty list', async () => {
      const f = fixture(),
        out = { skipped: true };
      let seen;
      f.options.runTransaction = () => out;
      f.store.removeDetachedAttachmentFiles = a => {
        seen = a;
        return [];
      };
      assert.equal(await invoke(create(f.options), kind, 'n'), out);
      assert.deepEqual(seen, []);
      assert.ok(!f.events.includes('service'));
    });
    test(kind + ' callback repeated uses last detached collection', async () => {
      const f = fixture();
      let lists = 0,
        cleaned;
      f.store.listAttachments = () => [{ id: 'a', noteId: 'n', storagePath: 's', fileName: 'f', pass: ++lists }];
      f.options.runTransaction = async op => {
        await op();
        return op();
      };
      f.store.removeDetachedAttachmentFiles = a => {
        cleaned = a;
        return [];
      };
      await invoke(create(f.options), kind, 'n');
      assert.equal(cleaned[0].pass, 3);
      assert.equal(f.events.filter(x => x === 'service').length, 2);
    });
    for (const stage of [
      'listAttachments',
      'prepareAttachmentCleanup',
      'inspectAttachmentDeletion',
      'service',
      'commit',
      'removeDetachedAttachmentFiles'
    ])
      test(kind + ' sentinel ' + stage, async () => {
        const f = fixture(),
          error = { stage };
        if (stage === 'service')
          f.service[kind === 'permanent' ? 'permanentlyDeleteNote' : 'emptyRecycleBin'] = () => {
            throw error;
          };
        else if (stage === 'commit')
          f.options.runTransaction = async op => {
            await op();
            throw error;
          };
        else
          f.store[stage] = () => {
            throw error;
          };
        await assert.rejects(invoke(create(f.options), kind, 'n'), e => e === error);
        if (stage !== 'removeDetachedAttachmentFiles') assert.ok(!f.events.includes('cleanup'));
      });
  }
  test('recycle only undefined defaults null, all other inputs forwarded', async () => {
    for (const value of [undefined, null, false, 0, '', Symbol('space'), {}]) {
      const f = fixture();
      const seen = [];
      f.repo.list = o => {
        seen.push(o.spaceId);
        return f.notes;
      };
      f.service.emptyRecycleBin = x => {
        seen.push(x);
        return f.recycle;
      };
      await create(f.options).emptyRecycleBin(value);
      assert.deepEqual(seen, [
        value === undefined ? null : value,
        value === undefined ? null : value,
        value === undefined ? null : value
      ]);
    }
  });
  test('recycle stale IDs rejected before second attachment list', async () => {
    const f = fixture();
    let n = 0;
    f.repo.list = () => (++n === 1 ? f.notes : [{ id: 'other', deleted: true }]);
    await assert.rejects(create(f.options).emptyRecycleBin(), { code: 'NOTE_DELETE_PREVIEW_STALE', statusCode: 409 });
    assert.equal(f.events.filter(x => x.startsWith('attachments:')).length, 1);
  });
  test('recycle duplicate membership is not multiset validation', async () => {
    const f = fixture({ attachments: [] });
    let n = 0;
    f.repo.list = () =>
      ++n === 1
        ? [
            { id: 'a', deleted: true },
            { id: 'b', deleted: true }
          ]
        : [
            { id: 'a', deleted: true },
            { id: 'a', deleted: true }
          ];
    await create(f.options).emptyRecycleBin();
    assert.ok(f.events.includes('service'));
  });
  test('duplicate queued attachment IDs fail even when unchanged', async () => {
    const f = fixture({
      attachments: [
        { id: 'a', noteId: 'n' },
        { id: 'a', noteId: 'n' }
      ]
    });
    await assert.rejects(create(f.options).permanentlyDeleteNote('n'), { code: 'NOTE_DELETE_PREVIEW_STALE' });
  });
  test('current duplicate attachment IDs can hide absent expected item', async () => {
    const f = fixture();
    let n = 0;
    f.store.listAttachments = () =>
      ++n === 1
        ? [
            { id: 'a', noteId: 'n' },
            { id: 'b', noteId: 'n' }
          ]
        : [
            { id: 'a', noteId: 'n' },
            { id: 'a', noteId: 'n' }
          ];
    await create(f.options).permanentlyDeleteNote('n');
    assert.ok(f.events.includes('service'));
  });
  test('NUL concatenation collision remains original behavior', async () => {
    const f = fixture();
    let n = 0;
    f.store.listAttachments = () => [
      { id: 'a', noteId: 'n', storagePath: ++n === 1 ? 'x\0y' : 'x', fileName: n === 1 ? 'z' : 'y\0z' }
    ];
    await create(f.options).permanentlyDeleteNote('n');
    assert.ok(f.events.includes('service'));
  });
  test('template interpolation Symbol throws before inspection', async () => {
    const f = fixture({ attachments: [{ id: 'a', noteId: 'n', storagePath: Symbol('bad') }] });
    await assert.rejects(create(f.options).permanentlyDeleteNote('n'), TypeError);
    assert.ok(!f.events.includes('inspect:a'));
  });
  test('queued getters repeat across separate comparisons after prepare', async () => {
    const f = fixture();
    const reads = [];
    const attachment = {
      noteId: 'n',
      get id() {
        reads.push('id');
        return 'a';
      },
      get storagePath() {
        reads.push('path');
        return 's';
      },
      get fileName() {
        reads.push('name');
        return 'f';
      }
    };
    f.store.listAttachments = () => [attachment];
    await create(f.options).permanentlyDeleteNote('n');
    assert.deepEqual(reads, ['id', 'path', 'name', 'id', 'path', 'name', 'id']);
  });
  test('reference collection before noteId, nullish fallback avoids id getter', async () => {
    const f = fixture();
    const reads = [];
    f.store.inspectAttachmentDeletion = () => ({
      references: [
        {
          get collection() {
            reads.push('collection');
            return 'notes';
          },
          get noteId() {
            reads.push('noteId');
            return 'n';
          },
          get id() {
            reads.push('id');
            throw Error();
          }
        }
      ]
    });
    await create(f.options).permanentlyDeleteNote('n');
    assert.deepEqual(reads, ['collection', 'noteId']);
  });
  test('unallowed collection short circuits noteId and id', async () => {
    const f = fixture();
    f.store.inspectAttachmentDeletion = () => ({
      references: [
        {
          collection: 'knowledgeItems',
          get noteId() {
            throw Error('bad');
          },
          get id() {
            throw Error('bad');
          }
        }
      ]
    });
    await assert.rejects(create(f.options).permanentlyDeleteNote('n'), { code: 'ATTACHMENT_REFERENCED' });
  });
  test('cleanup await null/undefined fallback but not false', async () => {
    for (const v of [null, undefined, false, 0, '']) {
      const f = fixture();
      f.store.removeDetachedAttachmentFiles = async () => v;
      assert.equal(await create(f.options).permanentlyDeleteNote('n'), f.result);
    }
  });
  test('cleanup poison then rejects after commit', async () => {
    const f = fixture(),
      error = { poison: true };
    f.store.removeDetachedAttachmentFiles = () => ({
      length: 1,
      get then() {
        throw error;
      }
    });
    await assert.rejects(create(f.options).permanentlyDeleteNote('n'), e => e === error);
    assert.ok(f.events.includes('commit'));
  });
  test('cleanup length before spread getter and original error after commit', async () => {
    const f = fixture(),
      order = [],
      error = { spread: true };
    f.store.removeDetachedAttachmentFiles = () => ({
      get length() {
        order.push('length');
        return 1;
      }
    });
    Object.defineProperty(f.result, 'x', {
      enumerable: true,
      get() {
        order.push('spread');
        throw error;
      }
    });
    await assert.rejects(create(f.options).permanentlyDeleteNote('n'), e => e === error);
    assert.deepEqual(order, ['length', 'spread']);
  });
  test('custom attachment filter map some iterator receivers preserved', async () => {
    const f = fixture();
    const calls = [],
      row = { id: 'a', noteId: 'n', storagePath: 's', fileName: 'f' };
    const view = {
      length: 1,
      map(cb) {
        assert.equal(this, view);
        calls.push('map');
        return [cb(row)];
      },
      some(cb) {
        assert.equal(this, view);
        calls.push('some');
        return cb(row);
      },
      *[Symbol.iterator]() {
        assert.equal(this, view);
        calls.push('iterator');
        yield row;
      }
    };
    const input = {
      filter(cb) {
        assert.equal(this, input);
        calls.push('filter');
        assert.equal(cb(row), true);
        return view;
      }
    };
    f.store.listAttachments = () => input;
    let passed;
    f.store.removeDetachedAttachmentFiles = a => {
      passed = a;
      return [];
    };
    await create(f.options).permanentlyDeleteNote('n');
    assert.equal(passed, view);
    assert.deepEqual(calls, ['filter', 'filter', 'map', 'some', 'iterator']);
  });
  test('attachment sparse filter removes holes as native filter does', async () => {
    const f = fixture();
    const a = new Array(3);
    a[1] = { id: 'a', noteId: 'n' };
    f.store.listAttachments = () => a;
    await create(f.options).permanentlyDeleteNote('n');
    assert.ok(f.events.includes('inspect:a'));
  });
  test('Set SameValueZero permits NaN note and attachment IDs', async () => {
    const f = fixture({
      notes: [{ id: NaN, deleted: 1 }],
      attachments: [{ id: NaN, noteId: NaN }],
      references: [{ collection: 'notes', id: NaN }]
    });
    await create(f.options).permanentlyDeleteNote(NaN);
    await create(f.options).emptyRecycleBin();
  });
  test('object identity and numeric/string distinction are not normalized', async () => {
    const id = {},
      f = fixture({
        attachments: [
          { id: 'a', noteId: id },
          { id: 'b', noteId: {} },
          { id: 'c', noteId: '1' }
        ]
      });
    let cleaned;
    f.store.removeDetachedAttachmentFiles = a => {
      cleaned = a;
      return [];
    };
    await create(f.options).permanentlyDeleteNote(id);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].id, 'a');
  });
  test('async return can assimilate spread-introduced then dynamically', async () => {
    const f = fixture({ cleanup: [1] });
    let reads = 0;
    Object.defineProperty(f.result, 'then', {
      enumerable: true,
      get() {
        reads++;
        return reads === 3 ? resolve => resolve('dynamic-spread-result') : undefined;
      }
    });
    const out = await create(f.options).permanentlyDeleteNote('n');
    assert.equal(out, 'dynamic-spread-result');
    assert.equal(reads, 3);
  });
  test('sync iterator closes on awaited preflight rejection without absorbing return then', async () => {
    const f = fixture(),
      error = { inspection: true },
      events = [];
    const row = { id: 'a', noteId: 'n' };
    const view = {
      length: 1,
      map: cb => [cb(row)],
      some: cb => cb(row),
      [Symbol.iterator]() {
        let once = false;
        return {
          next() {
            if (once) return { done: true };
            once = true;
            return { done: false, value: row };
          },
          return() {
            events.push('close');
            return {
              get then() {
                throw Error('must-not-absorb');
              }
            };
          }
        };
      }
    };
    f.store.listAttachments = () => ({ filter: () => view });
    f.store.inspectAttachmentDeletion = () => Promise.reject(error);
    await assert.rejects(create(f.options).permanentlyDeleteNote('n'), e => e === error);
    assert.deepEqual(events, ['close']);
  });
  test('attachment length mismatch short circuits current some and all reference work', async () => {
    const f = fixture();
    let n = 0;
    f.store.listAttachments = () =>
      ++n === 1
        ? f.attachments
        : {
            filter: () => ({
              length: 0,
              get some() {
                throw Error('must-not-read');
              }
            })
          };
    await assert.rejects(create(f.options).permanentlyDeleteNote('n'), { code: 'NOTE_DELETE_PREVIEW_STALE' });
    assert.ok(!f.events.includes('inspect:a'));
  });
  test('recycle custom filter map IDs protocol preserves receivers and repeated reads', async () => {
    const f = fixture({ attachments: [] }),
      calls = [];
    const ids = {
      length: 1,
      includes(id) {
        assert.equal(this, ids);
        calls.push('includes');
        return id === 'n';
      },
      some(cb) {
        assert.equal(this, ids);
        calls.push('some');
        return cb('n');
      },
      *[Symbol.iterator]() {
        assert.equal(this, ids);
        calls.push('iterator');
        yield 'n';
      }
    };
    const mapped = {
      map(cb) {
        assert.equal(this, mapped);
        calls.push('map');
        assert.equal(cb({ id: 'n' }), 'n');
        return ids;
      }
    };
    const list = {
      filter(cb) {
        assert.equal(this, list);
        calls.push('filter');
        assert.equal(cb({ deleted: 'yes' }), 'yes');
        return mapped;
      }
    };
    let reads = 0;
    Object.defineProperty(f.repo, 'list', {
      get() {
        reads++;
        return () => list;
      }
    });
    await create(f.options).emptyRecycleBin();
    assert.equal(reads, 2);
    assert.deepEqual(calls, ['filter', 'map', 'iterator', 'filter', 'map', 'some', 'includes', 'iterator', 'iterator']);
  });
  test('await completes before nullish attachment fallback', async () => {
    const f = fixture();
    f.store.listAttachments = () => ({
      then(resolve) {
        resolve(null);
      }
    });
    f.store.prepareAttachmentCleanup = a => assert.deepEqual(a, []);
    await create(f.options).permanentlyDeleteNote('n');
    assert.ok(!f.events.includes('inspect:a'));
  });
  for (const kind of ['permanent', 'recycle'])
    test(kind + ' primitive service results remain original runtime domain outside static support', async () => {
      for (const value of [null, undefined, 42, false, 'hi', Symbol('value')])
        for (const cleanup of [[], [1]]) {
          const f = fixture({ cleanup });
          f.service[kind === 'permanent' ? 'permanentlyDeleteNote' : 'emptyRecycleBin'] = () => value;
          const out = await invoke(create(f.options), kind, 'n');
          if (cleanup.length) assert.deepEqual(out, { ...value, attachmentCleanup: cleanup });
          else assert.equal(out, value);
        }
    });

  for (const kind of ['permanent', 'recycle']) {
    test(kind + ' sequential reference awaits stop before next inspection', async () => {
      const f = fixture({
        attachments: [
          { id: 'a', noteId: 'n' },
          { id: 'b', noteId: 'n' }
        ]
      });
      const calls = [];
      f.store.inspectAttachmentDeletion = id => ({
        then(resolve) {
          calls.push('await:' + id);
          resolve({ references: [] });
        }
      });
      f.store.prepareAttachmentCleanup = () => calls.push('prepare');
      const prior = f.store.removeDetachedAttachmentFiles;
      f.store.removeDetachedAttachmentFiles = function (a) {
        calls.push('cleanup');
        return prior.call(this, a);
      };
      await invoke(create(f.options), kind, 'n');
      assert.deepEqual(calls, ['prepare', 'await:a', 'await:b', 'cleanup']);
    });
    test(kind + ' failing first reference never starts second', async () => {
      const f = fixture({
          attachments: [
            { id: 'a', noteId: 'n' },
            { id: 'b', noteId: 'n' }
          ]
        }),
        seen = [],
        error = { stop: true };
      f.store.inspectAttachmentDeletion = id => {
        seen.push(id);
        return Promise.reject(error);
      };
      await assert.rejects(invoke(create(f.options), kind, 'n'), e => e === error);
      assert.deepEqual(seen, ['a']);
    });
    test(kind + ' reference length uses truthiness rather than arithmetic', async () => {
      const f = fixture();
      f.store.inspectAttachmentDeletion = () => ({
        references: {
          filter: cb => {
            assert.equal(cb({ collection: 'notes', id: 'n' }), false);
            return { length: 'retained' };
          }
        }
      });
      await assert.rejects(invoke(create(f.options), kind, 'n'), { code: 'ATTACHMENT_REFERENCED' });
    });
    test(kind + ' optional store methods remain late bound and receive store', async () => {
      const f = fixture(),
        c = create(f.options),
        reads = [];
      for (const key of ['prepareAttachmentCleanup', 'removeDetachedAttachmentFiles']) {
        const prior = f.store[key];
        Object.defineProperty(f.store, key, {
          get() {
            reads.push(key);
            return function (...args) {
              assert.equal(this, f.store);
              return prior.apply(this, args);
            };
          }
        });
      }
      await invoke(c, kind, 'n');
      assert.deepEqual(reads, ['prepareAttachmentCleanup', 'removeDetachedAttachmentFiles']);
    });
    test(kind + ' cleanup explicit undefined and empty callbacks are still called', async () => {
      for (const callback of [
        () => {},
        async () => {},
        () => undefined,
        async () => undefined,
        () => Promise.resolve(null)
      ]) {
        const f = fixture();
        let calls = 0;
        f.store.removeDetachedAttachmentFiles = a => {
          calls++;
          assert.ok(a.length);
          return callback();
        };
        assert.equal(await invoke(create(f.options), kind, 'n'), kind === 'permanent' ? f.result : f.recycle);
        assert.equal(calls, 1);
      }
    });
    test(kind + ' no cleanup property when cleanup length is falsy', async () => {
      for (const length of [0, false, '', null, undefined, NaN]) {
        const f = fixture({ cleanup: { length } });
        assert.equal(await invoke(create(f.options), kind, 'n'), kind === 'permanent' ? f.result : f.recycle);
      }
    });
    test(kind + ' cleanup truthy Symbol length and enumerable overwrite order', async () => {
      const symbol = Symbol('key'),
        f = fixture({ cleanup: { length: Symbol('yes') } });
      const result = kind === 'permanent' ? f.result : f.recycle;
      result.attachmentCleanup = 'old';
      result[symbol] = 1;
      const out = await invoke(create(f.options), kind, 'n');
      assert.deepEqual(Reflect.ownKeys(out), [
        kind === 'permanent' ? 'id' : 'deletedCount',
        'attachmentCleanup',
        symbol
      ]);
      assert.equal(out.attachmentCleanup.length.description, 'yes');
      assert.equal(result.attachmentCleanup, 'old');
    });
    test(kind + ' dynamic enumerable then spread can resolve primitive', async () => {
      const f = fixture({ cleanup: [1] }),
        result = kind === 'permanent' ? f.result : f.recycle;
      let reads = 0;
      Object.defineProperty(result, 'then', {
        enumerable: true,
        get() {
          reads++;
          return reads === 3 ? resolve => resolve('dynamic-spread-result') : undefined;
        }
      });
      assert.equal(await invoke(create(f.options), kind, 'n'), 'dynamic-spread-result');
      assert.equal(reads, 3);
    });
    test(kind + ' empty attachment notifications still run prepare and cleanup', async () => {
      const f = fixture({ attachments: [] });
      await invoke(create(f.options), kind, 'n');
      assert.equal(f.events.filter(x => x === 'prepare').length, 1);
      assert.equal(f.events.filter(x => x === 'cleanup').length, 1);
    });
  }
  test('recycle stale notes outrank poisonous second attachments', async () => {
    const f = fixture();
    let notes = 0,
      attachments = 0;
    f.repo.list = () => (++notes === 1 ? f.notes : []);
    f.store.listAttachments = () => {
      if (++attachments === 2) throw Error('wrong-priority');
      return f.attachments;
    };
    await assert.rejects(create(f.options).emptyRecycleBin(), {
      code: 'NOTE_DELETE_PREVIEW_STALE',
      message: '回收站内容已变化，请重新预检。'
    });
    assert.equal(attachments, 1);
  });
  test('queued Map creation still happens before current length read', async () => {
    const f = fixture(),
      events = [];
    let count = 0;
    const row = {
      id: 'a',
      noteId: 'n',
      get storagePath() {
        events.push('path');
        return 's';
      }
    };
    const queued = {
      filter: () => ({
        map(cb) {
          events.push('map');
          return [cb(row)];
        }
      })
    };
    const current = {
      filter: () => ({
        get length() {
          events.push('length');
          return 0;
        }
      })
    };
    f.store.listAttachments = () => (++count === 1 ? queued : current);
    await assert.rejects(create(f.options).permanentlyDeleteNote('n'), { code: 'NOTE_DELETE_PREVIEW_STALE' });
    assert.deepEqual(events, ['map', 'path', 'length']);
  });

  test('NaN attachment remains selected and inspected by SameValueZero', async () => {
    const f = fixture({ attachments: [{ id: 'a', noteId: NaN }], references: [{ collection: 'notes', id: NaN }] });
    let cleaned;
    f.store.removeDetachedAttachmentFiles = a => {
      cleaned = a;
      return [];
    };
    await create(f.options).permanentlyDeleteNote(NaN);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].id, 'a');
    assert.ok(f.events.includes('inspect:a'));
  });

  return tests;
}
export function deletionConsumerCases() {
  const tests = [];
  const test = (name, run) => tests.push({ name, run });
  function fixture({ active = false, shared = false, failCommit = false, beforeError = null } = {}) {
    let rows = [
      {
        id: 'n',
        spaceId: 's',
        title: '删除',
        rawMarkdown: '/api/storage/attachments/a/content',
        deletedAt: active ? null : new Date('2020-01-01'),
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01')
      },
      { id: 'other', spaceId: 'other', title: '保留', deletedAt: new Date('2020-01-01') },
      { id: 'active', spaceId: 's', title: '活动', deletedAt: null }
    ];
    const events = [];
    const db = {
      note: {
        async findUnique({ where }) {
          events.push('find:' + where.id);
          return rows.find(x => x.id === where.id) ?? null;
        },
        async findMany({ where }) {
          events.push('list');
          return rows.filter(
            x =>
              (where?.spaceId ? x.spaceId === where.spaceId : true) &&
              (where?.deletedAt === null ? !x.deletedAt : where?.deletedAt?.not === null ? Boolean(x.deletedAt) : true)
          );
        },
        async delete({ where }) {
          events.push('delete:' + where.id);
          const row = rows.find(x => x.id === where.id);
          rows = rows.filter(x => x !== row);
          return row;
        },
        async deleteMany({ where }) {
          events.push('deleteMany');
          const old = rows.length;
          rows = rows.filter(x => !where.id.in.includes(x.id));
          return { count: old - rows.length };
        }
      }
    };
    const repository = createPostgresNoteRepository({ db });
    const service = createAsyncNoteService({
      repository,
      onBeforePermanentDelete: async id => {
        events.push('before:' + id);
        if (beforeError) throw beforeError;
      },
      onNoteDeleted: async id => events.push('deleted-hook:' + id)
    });
    const store = {
      listAttachments: async () => [{ id: 'a', noteId: 'n', storagePath: 's', fileName: 'f' }],
      prepareAttachmentCleanup: async _a => events.push('prepare'),
      inspectAttachmentDeletion: async id => {
        events.push('inspect');
        return inspectAttachmentDeletion(id, {
          notes: [
            { id: 'n', rawMarkdown: '/api/storage/attachments/a/content' },
            ...(shared ? [{ id: 'shared', rawMarkdown: '/api/storage/attachments/a/content' }] : [])
          ]
        });
      },
      removeDetachedAttachmentFiles: async a => {
        events.push('cleanup');
        return a.map(x => ({ id: x.id, cleanup: 'synthetic-only' }));
      }
    };
    const coordinator = createAsyncNoteDeletionCoordinator({
      noteService: service,
      noteRepository: repository,
      attachmentStore: store,
      runTransaction: async operation => {
        events.push('begin');
        const result = await operation();
        if (failCommit) throw failCommit;
        events.push('commit');
        return result;
      }
    });
    const handler = createPostgresKnowledgeHttpHandlers({
      knowledgeModule: { noteService: service },
      noteDeletionCoordinator: coordinator
    });
    return {
      events,
      repository,
      service,
      store,
      coordinator,
      handler,
      get rows() {
        return rows;
      }
    };
  }
  function recorder() {
    return {
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      end(body) {
        this.body = JSON.parse(body);
      }
    };
  }
  test('real repository/service/handler permanent deletion before cleanup', async () => {
    const f = fixture();
    const out = await f.handler.permanentlyDeleteNote({ id: 'n' });
    assert.equal(out.id, 'n');
    assert.equal(out.attachmentCleanup[0].id, 'a');
    assert.ok(!f.rows.some(x => x.id === 'n'));
    assert.ok(f.events.indexOf('inspect') < f.events.indexOf('find:n'));
    assert.ok(f.events.indexOf('before:n') < f.events.indexOf('delete:n'));
    assert.ok(f.events.indexOf('commit') < f.events.indexOf('cleanup'));
  });
  test('actual permanent DELETE route retains 200 data envelope', async () => {
    const f = fixture(),
      response = recorder();
    assert.equal(
      await handleNoteRoute({
        request: { method: 'DELETE' },
        response,
        url: new URL('http://example.invalid/api/knowledge/notes/n/permanent'),
        knowledge: f.handler
      }),
      true
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, 'n');
  });
  test('actual recycle DELETE route applies space and preserves active/other', async () => {
    const f = fixture(),
      response = recorder();
    assert.equal(
      await handleNoteRoute({
        request: { method: 'DELETE' },
        response,
        url: new URL('http://example.invalid/api/knowledge/notes/recycle-bin?spaceId=s'),
        knowledge: f.handler
      }),
      true
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.data.deletedCount, 1);
    assert.deepEqual(response.body.data.noteIds, ['n']);
    assert.deepEqual(
      f.rows.map(x => x.id),
      ['other', 'active']
    );
    assert.ok(f.events.indexOf('commit') < f.events.indexOf('cleanup'));
  });
  test('actual service rejects active note without cleanup', async () => {
    const f = fixture({ active: true });
    await assert.rejects(f.handler.permanentlyDeleteNote({ id: 'n' }), { code: 'NOTE_NOT_IN_RECYCLE_BIN' });
    assert.ok(f.rows.some(x => x.id === 'n'));
    assert.ok(!f.events.includes('cleanup'));
  });
  test('actual service rejects missing note without cleanup', async () => {
    const f = fixture();
    await assert.rejects(f.handler.permanentlyDeleteNote({ id: 'missing' }), { code: 'NOTE_NOT_FOUND' });
    assert.ok(!f.events.includes('cleanup'));
  });
  test('actual attachment reference preflight blocks shared source first', async () => {
    const f = fixture({ shared: true });
    await assert.rejects(f.handler.permanentlyDeleteNote({ id: 'n' }), { code: 'ATTACHMENT_REFERENCED' });
    assert.ok(!f.events.includes('find:n'));
    assert.ok(!f.events.includes('cleanup'));
  });
  test('actual before-delete hook preserves sentinel and prevents delete', async () => {
    const error = { code: 'synthetic' },
      f = fixture({ beforeError: error });
    await assert.rejects(f.handler.permanentlyDeleteNote({ id: 'n' }), e => e === error);
    assert.ok(!f.events.includes('delete:n'));
    assert.ok(!f.events.includes('cleanup'));
  });
  test('synthetic commit failure suppresses cleanup but is not rollback proof', async () => {
    const error = { commit: 'failed' },
      f = fixture({ failCommit: error });
    await assert.rejects(f.handler.permanentlyDeleteNote({ id: 'n' }), e => e === error);
    assert.ok(!f.events.includes('cleanup'));
    assert.ok(!f.rows.some(x => x.id === 'n'));
  });
  test('existing PostgreSQL shared-attachment test actually executes run', async () => {
    const selected = assetLifecycleStage0Tests.filter(
      x => x.name === 'PostgreSQL 笔记清理在事务内阻止其他资产共用附件'
    );
    assert.equal(selected.length, 1);
    await selected[0].run();
  });

  return tests;
}

// 两侧每次重建 ID、集合、getter、thenable 与异常；日志保留顺序和对象身份。
export async function observeDeletion(subject, seed) {
  const events = [],
    labels = new Map();
  let sequence = 0;
  const label = (value, name) => {
    labels.set(value, name);
    return value;
  };
  const encode = value => {
    if (labels.has(value)) return labels.get(value);
    if (typeof value === 'symbol') return 'symbol:' + value.description;
    if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
    if (value === undefined) return 'undefined';
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
    const name = 'dynamic:' + ++sequence;
    labels.set(value, name);
    return name;
  };
  const record = (...values) => events.push(values.map(encode));
  const id =
    seed % 7 === 0
      ? NaN
      : seed % 7 === 1
        ? label({}, 'note-id')
        : seed % 7 === 2
          ? Symbol('note-id')
          : seed % 7 === 3
            ? 1
            : 'n';
  const other = label({}, 'other-id'),
    a = label({}, 'attachment-id'),
    error = label({ seed }, 'sentinel');
  const method = seed % 2 ? 'emptyRecycleBin' : 'permanentlyDeleteNote';
  const phase = Math.floor(seed / 2) % 18;
  const fail = stage => {
    record('phase', stage);
    if (phase === stage) throw error;
  };
  const row = (name, current = false) => {
    const value = label({}, name);
    for (const [key, raw] of [
      ['id', a],
      ['noteId', id],
      ['storagePath', current && phase === 15 ? 'changed' : 'path'],
      ['fileName', 'file']
    ])
      Object.defineProperty(value, key, {
        enumerable: true,
        get() {
          record('field', name, key, raw);
          return raw;
        }
      });
    return value;
  };
  const notes = pass => {
    const note = label({}, 'note:' + pass);
    Object.defineProperty(note, 'deleted', {
      get() {
        record('note.deleted', pass);
        return 'yes';
      }
    });
    Object.defineProperty(note, 'id', {
      get() {
        const value = pass === 2 && phase === 16 ? other : id;
        record('note.id', pass, value);
        return value;
      }
    });
    const ids = label([pass === 2 && phase === 16 ? other : id], 'ids:' + pass);
    const noteMap = {
      map(callback) {
        record('note.map', pass, this === noteMap, callback(note));
        return ids;
      }
    };
    const view = {
      filter(callback) {
        record('note.filter', pass, this === view, callback(note));
        return noteMap;
      }
    };
    for (const key of ['some', 'includes']) {
      const original = ids[key];
      Object.defineProperty(ids, key, {
        get() {
          record('ids.method', pass, key);
          return function (...args) {
            record('ids.call', pass, key, this === ids);
            return original.apply(this, args);
          };
        }
      });
    }
    return view;
  };
  const deferred = (name, value) => {
    if (seed % 3 !== 0) return value;
    const thenable = {
      get then() {
        record('then.get', name);
        return function (resolve) {
          record('then.call', name, this === thenable);
          resolve(value);
        };
      }
    };
    return thenable;
  };
  let lists = 0,
    noteLists = 0,
    prepared,
    detached;
  const result = label(Object.create({ prototype: true }), 'result');
  const symbol = Symbol('enumerable');
  Object.defineProperty(result, 'value', {
    enumerable: true,
    get() {
      record('result.value');
      fail(13);
      return seed;
    }
  });
  result.attachmentCleanup = 'old';
  result[symbol] = 'symbol-value';
  Object.defineProperty(result, 'hidden', { value: 1 });
  let thenReads = 0;
  Object.defineProperty(result, 'then', {
    enumerable: true,
    get() {
      record('result.then', ++thenReads);
      return phase === 17 && thenReads === 3
        ? resolve => {
            record('result.assimilate');
            resolve('primitive');
          }
        : undefined;
    }
  });
  const cleanup = label({}, 'cleanup');
  Object.defineProperty(cleanup, 'length', {
    get() {
      record('cleanup.length');
      fail(12);
      return seed % 4 ? 'yes' : 0;
    }
  });
  const store = label({}, 'store');
  const methods = {
    listAttachments() {
      record('list.call', this === store);
      const pass = ++lists;
      fail(pass === 1 ? 0 : 3);
      const member = row('attachment:' + pass, pass > 1);
      const selected = label([member], 'selected:' + pass);
      const nativeMap = selected.map,
        nativeSome = selected.some;
      Object.defineProperty(selected, 'map', {
        get() {
          record('selected.map.get', pass);
          return function (callback) {
            record('selected.map.call', pass, this === selected);
            return nativeMap.call(this, callback);
          };
        }
      });
      Object.defineProperty(selected, 'some', {
        get() {
          record('selected.some.get', pass);
          return function (callback) {
            record('selected.some.call', pass, this === selected);
            return nativeSome.call(this, callback);
          };
        }
      });
      const nativeIterator = selected[Symbol.iterator];
      Object.defineProperty(selected, Symbol.iterator, {
        value: function () {
          record('selected.iterator', pass, this === selected);
          return nativeIterator.call(this);
        }
      });
      const view = {
        filter(callback) {
          record('attachment.filter', pass, this === view, callback(member));
          detached = selected;
          return selected;
        }
      };
      return deferred('attachments:' + pass, view);
    },
    prepareAttachmentCleanup(value) {
      record('prepare.call', this === store, value);
      prepared = value;
      fail(1);
      return deferred('prepare', undefined);
    },
    inspectAttachmentDeletion(value) {
      record('inspect.call', this === store, value);
      fail(4);
      const ref = label({}, 'reference');
      for (const [key, raw] of [
        ['collection', phase === 14 ? 'knowledgeItems' : 'notes'],
        ['noteId', id],
        ['id', other]
      ])
        Object.defineProperty(ref, key, {
          get() {
            record('reference.field', key, raw);
            return raw;
          }
        });
      return deferred('inspect', { references: [ref] });
    },
    removeDetachedAttachmentFiles(value) {
      record('cleanup.call', this === store, value, value === prepared, value === detached);
      fail(11);
      return deferred('cleanup', cleanup);
    }
  };
  for (const [key, fn] of Object.entries(methods))
    Object.defineProperty(store, key, {
      get() {
        record('store.get', key);
        return fn;
      }
    });
  const repo = {
    get list() {
      record('repo.get');
      return function (options) {
        record('repo.list', this === repo, options.includeDeleted, options.spaceId);
        const pass = ++noteLists;
        fail(pass === 1 ? 7 : 8);
        return deferred('notes:' + pass, notes(pass));
      };
    }
  };
  const service = {};
  for (const key of ['permanentlyDeleteNote', 'emptyRecycleBin'])
    Object.defineProperty(service, key, {
      get() {
        record('service.get', key);
        return function (value) {
          record('service.call', key, this === service, value);
          fail(5);
          return result;
        };
      }
    });
  const options = {};
  const values = {
    noteService: service,
    noteRepository: repo,
    attachmentStore: store,
    runTransaction: async function (operation) {
      record('begin', this === undefined);
      fail(2);
      const value = await operation();
      record('transaction.value', value);
      fail(6);
      record('commit');
      return value;
    }
  };
  for (const key of ['runTransaction', 'attachmentStore', 'noteRepository', 'noteService'])
    Object.defineProperty(options, key, {
      get() {
        record('option', key);
        return values[key];
      }
    });
  let outcome;
  try {
    const coordinator = subject.createAsyncNoteDeletionCoordinator(options);
    const value = await coordinator[method](id);
    if (value === result) outcome = { kind: 'identity' };
    else if (value === 'primitive') outcome = { kind: 'primitive' };
    else
      outcome = {
        kind: 'spread',
        prototype: Object.getPrototypeOf(value) === Object.prototype,
        keys: Reflect.ownKeys(value).map(encode),
        values: Reflect.ownKeys(value).map(key => encode(value[key]))
      };
  } catch (caught) {
    outcome =
      caught === error
        ? { kind: 'sentinel' }
        : caught?.code
          ? { kind: 'domain', code: caught.code, message: caught.message, status: caught.statusCode }
          : { kind: 'unexpected', name: caught?.name, message: caught?.message };
  }
  return { operation: method, events, outcome };
}
