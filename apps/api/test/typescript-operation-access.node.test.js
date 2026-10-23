import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createAppContext } from '../src/app.factory.js';
import { createPostgresKnowledgeHttpHandlers } from '../src/modules/knowledge/http/postgres-async-handlers.js';
import * as bridge from '../src/infrastructure/knowledge-operation-access.js';
import * as implementation from '../src/infrastructure/knowledge-operation-access.ts';

// 固定原 JS 基线也执行相同行为断言；只跳过新 TS 桥身份。
const baseline = process.env.KNOWRA_OPERATION_ACCESS_BASELINE === '1';
const commit = '263a092cc129fcf637e1afa4f2646b8cebc0e5eb';
const root = new URL('../src/', import.meta.url);
const original = execFileSync('git', ['show', `${commit}:apps/api/src/infrastructure/knowledge-operation-access.js`], {
  cwd: new URL('../../../', import.meta.url),
  encoding: 'utf8'
});
const helperUrl = baseline
  ? `data:text/javascript;base64,${Buffer.from(original).toString('base64')}`
  : new URL('infrastructure/knowledge-operation-access.js', root).href;
const { getKnowledgeOperationAccess: classify } = await import(helperUrl);
const wrappers = [];
for (const [file, name, read, mutation] of [
  ['maintenance-gate', 'wrapHandlersWithMaintenanceGate', 'runOperation', 'runMutation'],
  ['postgres-advisory-lock', 'wrapHandlersWithPostgresAdvisoryLock', 'runShared', 'runExclusive']
]) {
  const location = new URL(`infrastructure/${file}.js`, root);
  let module;
  if (baseline) {
    const source = execFileSync('git', ['show', `${commit}:apps/api/src/infrastructure/${file}.js`], {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8'
    }).replace(/(['"])(\.\.?\/[^'"]+)\1/g, (_, quote, dependency) =>
      JSON.stringify(dependency === './knowledge-operation-access.js' ? helperUrl : new URL(dependency, location).href)
    );
    module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  } else module = await import(location);
  wrappers.push({ wrap: module[name], read, mutation });
}
const MUTATION_OPERATIONS = [
  'createNote',
  'importMarkdown',
  'importMarkdownBatch',
  'updateNote',
  'deleteNote',
  'deleteNotes',
  'restoreNote',
  'permanentlyDeleteNote',
  'emptyRecycleBin',
  'setFavorite',
  'removeTagFromNote',
  'assignTagToNote',
  'assignTagToNotes',
  'setNoteTags',
  'updateTagsForNotes',
  'createFolder',
  'updateFolder',
  'deleteFolder',
  'createTag',
  'restoreFolder',
  'updateTag',
  'deleteTag',
  'reorderTags',
  'mergeTags',
  'createTagGroup',
  'updateTagGroup',
  'deleteTagGroup',
  'createAnnotation',
  'updateAnnotation',
  'deleteAnnotation',
  'restoreAnnotation',
  'updateAnnotationAnchor',
  'confirmAnnotationRange',
  'createKnowledgeItem',
  'createAnnotationExclusion',
  'deleteAnnotationExclusion',
  'createAnalysisScope',
  'trashAnalysisScope',
  'restoreDeletedAnalysisScope',
  'updateKnowledgeItem',
  'confirmKnowledgeItem',
  'markKnowledgeItemNeedsRevision',
  'archiveKnowledgeItem',
  'restoreKnowledgeItem',
  'trashKnowledgeItem',
  'restoreDeletedKnowledgeItem',
  'permanentlyDeleteKnowledgeItem',
  'createKnowledgeEvidence',
  'retireKnowledgeEvidence',
  'readoptKnowledgeEvidence',
  'createLearningObjective',
  'updateLearningObjective',
  'confirmLearningObjective',
  'requestLearningObjectiveRevision',
  'archiveLearningObjective',
  'restoreLearningObjective',
  'createExamProfile',
  'updateExamProfile',
  'archiveExamProfile',
  'restoreExamProfile',
  'createExamFocus',
  'updateExamFocus',
  'confirmExamFocus',
  'archiveExamFocus',
  'restoreExamFocus',
  'createQuestion',
  'updateQuestion',
  'validateQuestion',
  'submitQuestionForReview',
  'confirmQuestion',
  'archiveQuestion',
  'restoreQuestion',
  'createDefaultKnowledgeSpace',
  'createKnowledgeSpace',
  'trashTrainingAsset',
  'restoreDeletedTrainingAsset',
  'permanentlyDeleteTrainingAsset',
  'deleteEmptySpace',
  'migrateSpaceAssets'
];
const READ_OPERATIONS = [
  'getNote',
  'getLinkedNotes',
  'getNoteLinkRelations',
  'listNotes',
  'listFolders',
  'listFolderTree',
  'listTags',
  'listTagGroups',
  'listAnnotations',
  'getAnnotation',
  'listNoteVersions',
  'getNoteVersion',
  'previewNoteVersionPrune',
  'previewAnnotation',
  'getAnnotationKnowledgeLinks',
  'previewAnalysisScope',
  'getAnalysisScope',
  'listAnalysisScopes',
  'listKnowledgeItems',
  'getKnowledgeItem',
  'getKnowledgeProvenance',
  'listKnowledgeEvidence',
  'inspectKnowledgePurge',
  'listLearningObjectives',
  'getLearningObjective',
  'listExamProfiles',
  'getExamProfile',
  'listExamFocuses',
  'getExamFocus',
  'listQuestions',
  'getQuestion',
  'inspectTrainingAssetPurge',
  'getKnowledgeOverview',
  'getTrainingOverview',
  'listWorkspaceKnowledgeItems',
  'listWorkspaceLearningObjectives',
  'listWorkspaceQuestions',
  'listWorkspaceExamProfiles',
  'listReviewQueue',
  'listKnowledgeSpaces',
  'inspectEmptySpaceDeletion',
  'previewSpaceMigration',
  'searchNotes'
];
const sameThrown = (operation, reason) => assert.throws(operation, actual => Object.is(actual, reason));
const missing = value => `Knowledge handler "${value}" is missing explicit operation access metadata.`;

test('JS bridge exports the identical TS function and no extra runtime names', { skip: baseline }, () => {
  assert.deepEqual(Object.keys(bridge), ['getKnowledgeOperationAccess']);
  assert.deepEqual(Object.keys(implementation), ['getKnowledgeOperationAccess']);
  assert.equal(bridge.getKnowledgeOperationAccess, implementation.getKnowledgeOperationAccess);
});

test('all frozen operation names keep their exact classifications', () => {
  assert.equal(MUTATION_OPERATIONS.length, 79);
  assert.equal(READ_OPERATIONS.length, 43);
  assert.equal(new Set([...MUTATION_OPERATIONS, ...READ_OPERATIONS]).size, 122);
  for (const name of MUTATION_OPERATIONS) assert.equal(classify(name), 'mutation');
  for (const name of READ_OPERATIONS) assert.equal(classify(name), 'read');
});

test('unknown and omitted primitive inputs preserve the exact missing-metadata error', () => {
  for (const value of [
    undefined,
    null,
    false,
    true,
    0,
    -0,
    NaN,
    Infinity,
    -Infinity,
    1n,
    '',
    'unknown',
    'CreateNote',
    'createNote ',
    ' createNote',
    'toString',
    '__proto__',
    'constructor'
  ]) {
    assert.throws(
      () => classify(value),
      error => error.constructor === Error && error.message === missing(value)
    );
  }
  assert.throws(
    () => classify(),
    error => error.constructor === Error && error.message === missing(undefined)
  );
});

test('primitive Symbols retain original interpolation TypeError instead of metadata Error', () => {
  for (const value of [Symbol(), Symbol('createNote'), Symbol.for('listNotes')])
    assert.throws(() => classify(value), TypeError);
});

test('boxed names, arrays and custom coercible inputs never become recognized operations', () => {
  for (const value of [
    new String('createNote'),
    new String('listNotes'),
    ['createNote'],
    ['listNotes'],
    new Number(3),
    new Boolean(false),
    {},
    [],
    { toString: () => 'createNote' }
  ])
    assert.throws(
      () => classify(value),
      error => error.constructor === Error && error.message === missing(value)
    );
});

test('custom Symbol.toPrimitive receives string hint once, only after both Set lookups', () => {
  const events = [];
  const value = {
    [Symbol.toPrimitive](hint) {
      assert.equal(this, value);
      events.push(hint);
      return 'createNote';
    }
  };
  assert.throws(
    () => classify(value),
    error =>
      error.constructor === Error &&
      error.message === 'Knowledge handler "createNote" is missing explicit operation access metadata.'
  );
  assert.deepEqual(events, ['string']);
});

test('ordinary string coercion preserves getter and method order with original receivers', () => {
  const events = [];
  const value = {
    get [Symbol.toPrimitive]() {
      events.push('primitive:get');
      return undefined;
    },
    get toString() {
      events.push('toString:get');
      return function () {
        assert.equal(this, value);
        events.push('toString:call');
        return {};
      };
    },
    get valueOf() {
      events.push('valueOf:get');
      return function () {
        assert.equal(this, value);
        events.push('valueOf:call');
        return 7;
      };
    }
  };
  assert.throws(
    () => classify(value),
    error => error.message === missing(7)
  );
  assert.deepEqual(events, ['primitive:get', 'toString:get', 'toString:call', 'valueOf:get', 'valueOf:call']);
});

test('changing coercion getters are not cached or duplicated across calls', () => {
  let gets = 0;
  const value = {
    get [Symbol.toPrimitive]() {
      const count = ++gets;
      return () => `value-${count}`;
    }
  };
  for (let count = 1; count <= 3; count++)
    assert.throws(
      () => classify(value),
      error => error.message === missing(`value-${count}`)
    );
  assert.equal(gets, 3);
});

test('throwing coercion getters and methods preserve every thrown identity', () => {
  for (const reason of [new Error('sentinel'), {}, undefined, null, false, 0, '', Symbol('throw')]) {
    for (const value of [
      {
        get [Symbol.toPrimitive]() {
          throw reason;
        }
      },
      {
        [Symbol.toPrimitive]() {
          throw reason;
        }
      },
      {
        get toString() {
          throw reason;
        }
      },
      {
        toString() {
          throw reason;
        }
      },
      {
        toString() {
          return {};
        },
        get valueOf() {
          throw reason;
        }
      },
      {
        toString() {
          return {};
        },
        valueOf() {
          throw reason;
        }
      }
    ])
      sameThrown(() => classify(value), reason);
  }
});

test('invalid coercion results preserve TypeError, null-prototype and revoked-proxy failures', () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const value of [
    Object.create(null),
    revoked.proxy,
    Object(Symbol('boxed')),
    { [Symbol.toPrimitive]: 1 },
    { [Symbol.toPrimitive]: () => ({}) },
    { [Symbol.toPrimitive]: () => Symbol('result') },
    { toString: () => ({}), valueOf: () => ({}) }
  ])
    assert.throws(() => classify(value), TypeError);
});

test('Set.has observes original identity and mutation-before-read short circuit', () => {
  const originalHas = Set.prototype.has;
  const events = [];
  const marker = {
    toString() {
      events.push('coerce');
      return 'marker';
    }
  };
  let result;
  try {
    Set.prototype.has = function (value) {
      events.push([this.size, value]);
      return originalHas.call(this, value);
    };
    try {
      classify(marker);
    } catch (error) {
      result = error;
    }
    classify('createNote');
    classify('listNotes');
  } finally {
    Set.prototype.has = originalHas;
  }
  assert.equal(result.message, missing('marker'));
  assert.deepEqual(events, [
    [79, marker],
    [43, marker],
    'coerce',
    [79, 'createNote'],
    [79, 'listNotes'],
    [43, 'listNotes']
  ]);
});

test('Set.has failures propagate unchanged before any coercion', () => {
  const originalHas = Set.prototype.has;
  const reason = {};
  const value = {
    toString() {
      assert.fail('coercion must not run');
    }
  };
  try {
    Set.prototype.has = function () {
      throw reason;
    };
    sameThrown(() => classify(value), reason);
  } finally {
    Set.prototype.has = originalHas;
  }
});

test('overridden membership truthiness and read short circuit keep existing semantics', () => {
  const originalHas = Set.prototype.has;
  const cases = [
    [true, false, 'mutation', 1],
    [{}, false, 'mutation', 1],
    [false, true, 'read', 2],
    [0, [], 'read', 2]
  ];
  for (const [first, second, expected, count] of cases) {
    let calls = 0;
    let actual;
    try {
      Set.prototype.has = function () {
        return ++calls === 1 ? first : second;
      };
      actual = classify(Symbol('never coerced'));
    } finally {
      Set.prototype.has = originalHas;
    }
    assert.equal(actual, expected);
    assert.equal(calls, count);
  }
});

test('real wrapper defaults classify every existing name and preserve PostgreSQL bypasses', () => {
  for (const { wrap, read, mutation } of wrappers) {
    for (const options of [undefined, {}, { getAccess: undefined }]) {
      const events = [];
      const handlers = Object.fromEntries([...MUTATION_OPERATIONS, ...READ_OPERATIONS].map(name => [name, () => name]));
      const control = {
        [read](operation) {
          events.push(read);
          return operation();
        },
        [mutation](operation) {
          events.push(mutation);
          return operation();
        }
      };
      const wrapped = wrap(handlers, control, options);
      assert.deepEqual(events, []);
      for (const name of [...MUTATION_OPERATIONS, ...READ_OPERATIONS]) {
        const before = events.length;
        assert.equal(wrapped[name](), name);
        if (read === 'runShared' && ['permanentlyDeleteNote', 'emptyRecycleBin'].includes(name)) {
          assert.equal(wrapped[name], handlers[name]);
          assert.equal(events.length, before);
        } else assert.equal(events.at(-1), MUTATION_OPERATIONS.includes(name) ? mutation : read);
      }
      assert.throws(
        () => wrap({ futureOperation() {} }, control, options),
        error => error.message === missing('futureOperation')
      );
    }
  }
});

test('actual local and PostgreSQL handler names all have explicit metadata without real storage', async () => {
  const context = createAppContext({ ownerId: 'operation-access-test' });
  const pg = createPostgresKnowledgeHttpHandlers({
    knowledgeModule: context.modules.knowledge,
    ownerId: 'operation-access-test'
  });
  for (const handlers of [context.http.knowledge, pg]) {
    const functions = Object.entries(handlers).filter(([, handler]) => typeof handler === 'function');
    assert.ok(functions.length > 100);
    for (const [name] of functions)
      assert.equal(classify(name), MUTATION_OPERATIONS.includes(name) ? 'mutation' : 'read');
    for (const { wrap, read, mutation } of wrappers) {
      const events = [];
      const control = {
        [read](operation) {
          events.push(read);
          return operation();
        },
        [mutation](operation) {
          events.push(mutation);
          return operation();
        }
      };
      const wrapped = wrap(handlers, control);
      assert.deepEqual(await wrapped.listNotes(), []);
      assert.deepEqual(events, [read]);
    }
  }
});
