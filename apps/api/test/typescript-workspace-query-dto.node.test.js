import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const baseline = process.env.KNOWRA_WORKSPACE_DTO_BASELINE === '1';
const commit = '5312915a5337d6956349cf99ab7bb78e6a193ab8';
const root = new URL('../src/modules/knowledge/application/', import.meta.url);
const source = baseline
  ? execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/application/workspace-query-dto.js`], {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8'
    }).replace("'./workspace-query-utils.js'", JSON.stringify(new URL('workspace-query-utils.js', root).href))
  : null;
const dto = await import(
  source
    ? `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
    : new URL('workspace-query-dto.js', root)
);
const {
  toKnowledgeItemWorkspaceDto: knowledge,
  toLearningObjectiveWorkspaceDto: objective,
  toQuestionWorkspaceDto: question,
  toExamProfileWorkspaceDto: profile,
  toExamFocusSummary: focus
} = dto;
const knowledgeFields = [
  'id',
  'title',
  'canonicalStatement',
  'userExplanation',
  'knowledgeType',
  'importance',
  'reviewStatus',
  'sourceMode',
  'createdAt',
  'updatedAt'
];
const objectiveFields = [
  'id',
  'knowledgeItemId',
  'objective',
  'actionVerb',
  'cognitiveLevel',
  'difficultyHint',
  'reviewStatus',
  'reviewNote',
  'order',
  'createdAt',
  'updatedAt'
];
const questionFields = [
  'id',
  'questionType',
  'stem',
  'options',
  'referenceAnswer',
  'rubric',
  'explanation',
  'difficulty',
  'reviewStatus',
  'sourceMode',
  'version',
  'createdAt',
  'updatedAt'
];
const profileFields = [
  'id',
  'name',
  'description',
  'scope',
  'language',
  'commonQuestionTypes',
  'difficultyProfile',
  'archivedAt',
  'createdAt',
  'updatedAt'
];
const focusFields = [
  'id',
  'examProfileId',
  'learningObjectiveId',
  'description',
  'priority',
  'difficultyHint',
  'questionTypeSuggestions',
  'sourceType',
  'reviewStatus',
  'createdAt',
  'updatedAt'
];
const evidenceFields = [
  'id',
  'sourceType',
  'sourceId',
  'noteId',
  'noteTitle',
  'noteVersionId',
  'annotationId',
  'quoteText',
  'headingPath',
  'status'
];
const sourceFields = [
  'id',
  'sourceType',
  'sourceId',
  'quote',
  'quoteText',
  'locator',
  'contentHash',
  'status',
  'label'
];
const unset = keys => Object.fromEntries(keys.map(key => [key, undefined]));
const errorIs = expected => actual => actual === expected;
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
function tracedRecord(fields, events, prefix) {
  return Object.defineProperties(
    {},
    Object.fromEntries(
      fields.map(key => [
        key,
        {
          enumerable: true,
          get() {
            events.push(`${prefix}.${key}`);
            return key;
          }
        }
      ])
    )
  );
}

test('workspace DTO bridge preserves all five export identities', { skip: baseline }, async () => {
  const ts = await import(new URL('workspace-query-dto.ts', root));
  assert.deepEqual(Object.keys(dto), Object.keys(ts));
  assert.equal(Object.keys(dto).length, 5);
  for (const name of Object.keys(dto)) assert.equal(dto[name], ts[name]);
});

test('knowledge projection has exact keys and empty defaults without normalizing absent fields', () => {
  assert.deepEqual(knowledge({}), {
    ...unset(knowledgeFields),
    evidenceStatus: 'insufficient',
    sourceHealth: 'insufficient',
    evidenceCount: 0,
    evidenceSummary: [],
    objectiveCount: 0,
    confirmedObjectiveCount: 0,
    questionCount: 0,
    noteIds: []
  });
  assert.deepEqual(Object.keys(knowledge({})), [
    ...knowledgeFields,
    'evidenceStatus',
    'sourceHealth',
    'evidenceCount',
    'evidenceSummary',
    'objectiveCount',
    'confirmedObjectiveCount',
    'questionCount',
    'noteIds'
  ]);
});

test('learning objective projection has exact keys, null summary, and empty question IDs', () => {
  assert.deepEqual(objective({}), {
    ...unset(objectiveFields),
    knowledgeItem: null,
    questionCount: 0,
    questionIds: []
  });
  assert.deepEqual(Object.keys(objective({})), [...objectiveFields, 'knowledgeItem', 'questionCount', 'questionIds']);
});

test('question projection has exact keys, insufficient status, and null primary objective', () => {
  assert.deepEqual(question({}), {
    ...unset(questionFields),
    sourceStatus: 'insufficient',
    sourceHealth: 'insufficient',
    learningObjectiveIds: [],
    objectives: [],
    primaryObjective: null,
    sources: []
  });
  assert.deepEqual(Object.keys(question({})), [
    ...questionFields,
    'sourceStatus',
    'sourceHealth',
    'learningObjectiveIds',
    'objectives',
    'primaryObjective',
    'sources'
  ]);
});

test('exam profile projection has exact keys and empty focus defaults', () => {
  assert.deepEqual(profile({}), { ...unset(profileFields), focusCount: 0, confirmedFocusCount: 0, focuses: [] });
  assert.deepEqual(Object.keys(profile({})), [...profileFields, 'focusCount', 'confirmedFocusCount', 'focuses']);
});

test('exam focus projection has exact keys and a null learning objective default', () => {
  assert.deepEqual(focus({}), { ...unset(focusFields), learningObjective: null });
  assert.deepEqual(Object.keys(focus({})), [...focusFields, 'learningObjective']);
  assert.deepEqual(focus({}, undefined), focus({}, null));
});

test('all five projections preserve arbitrary field identities and omit unlisted fields', () => {
  const values = [undefined, null, false, 0, '', 2n, Symbol('field'), { nested: true }, ['array'], () => {}, NaN];
  for (const [project, fields] of [
    [knowledge, knowledgeFields],
    [objective, objectiveFields],
    [question, questionFields],
    [profile, profileFields],
    [focus, focusFields]
  ]) {
    for (const value of values) {
      const input = Object.fromEntries(fields.map(key => [key, value]));
      input.unlisted = 'not part of the DTO';
      const output = project(input);
      for (const key of fields) assert.equal(output[key], value);
      assert.equal(Object.hasOwn(output, 'unlisted'), false);
      assert.notEqual(output, input);
    }
  }
});

test('options default only on undefined and explicit null collections retain native failures', () => {
  for (const project of [knowledge, objective, question, profile]) {
    assert.deepEqual(project({}, undefined), project({}));
    assert.throws(() => project({}, null), TypeError);
  }
  for (const [project, key] of [
    [knowledge, 'evidence'],
    [knowledge, 'objectives'],
    [knowledge, 'questions'],
    [objective, 'questions'],
    [question, 'objectives'],
    [question, 'sources'],
    [profile, 'focuses']
  ]) {
    assert.deepEqual(project({}, { [key]: undefined }), project({}));
    assert.throws(() => project({}, { [key]: null }), TypeError);
  }
  assert.throws(() => knowledge({}, { evidence: [{ noteId: 'n' }], noteById: null }), TypeError);
  assert.throws(() => question({}, { sources: [{}], sourceLabels: null }), TypeError);
  assert.throws(() => profile({}, { focuses: [{}], objectiveById: null }), TypeError);
});

test('null and undefined primary records retain native TypeErrors for all five projections', () => {
  for (const project of [knowledge, objective, question, profile, focus]) {
    assert.throws(() => project(null), TypeError);
    assert.throws(() => project(undefined), TypeError);
  }
});

test('knowledge evidence summaries retain exact keys, references, and note title lookup', () => {
  const quote = { text: 'quoted' };
  const heading = ['chapter'];
  const record = {
    id: 'e',
    sourceType: 'note',
    sourceId: 'n',
    noteId: 'n',
    noteVersionId: null,
    annotationId: undefined,
    quoteText: quote,
    headingPath: heading,
    status: 'valid',
    ignored: true
  };
  const output = knowledge({}, { evidence: [record], noteById: new Map([['n', { title: 'Note' }]]) });
  assert.deepEqual(output.evidenceSummary, [
    {
      id: 'e',
      sourceType: 'note',
      sourceId: 'n',
      noteId: 'n',
      noteTitle: 'Note',
      noteVersionId: null,
      annotationId: undefined,
      quoteText: quote,
      headingPath: heading,
      status: 'valid'
    }
  ]);
  assert.deepEqual(Object.keys(output.evidenceSummary[0]), evidenceFields);
  assert.equal(output.evidenceSummary[0].quoteText, quote);
  assert.equal(output.evidenceSummary[0].headingPath, heading);
  assert.notEqual(output.evidenceSummary[0], record);
});

test('knowledge evidence status precedence and aliases remain original', () => {
  for (const [statuses, expected] of [
    [[], 'insufficient'],
    [[undefined], 'valid'],
    [['active'], 'valid'],
    [['valid', 'insufficient'], 'insufficient'],
    [['insufficient', 'stale'], 'stale'],
    [['stale', 'invalid'], 'invalid']
  ]) {
    const output = knowledge({}, { evidence: statuses.map(status => ({ status })) });
    assert.equal(output.evidenceStatus, expected);
    assert.equal(output.sourceHealth, expected);
    assert.equal(output.evidenceCount, statuses.length);
  }
});

test('knowledge note IDs retain filter truthiness, insertion order, and reference deduplication', () => {
  const ref = {};
  const symbol = Symbol('note');
  const ids = [undefined, null, '', false, 0, -0, NaN, 0n, 'b', 'a', 'b', ref, ref, symbol, symbol, 2n];
  const output = knowledge({}, { evidence: ids.map(noteId => ({ noteId })) });
  assert.deepEqual(output.noteIds, ['b', 'a', ref, symbol, 2n]);
  assert.equal(output.noteIds[2], ref);
  assert.equal(output.evidenceCount, ids.length);
});

test('sparse evidence preserves summary holes while note IDs use the filtered collection', () => {
  const evidence = new Array(4);
  evidence[2] = { noteId: 'n' };
  const output = knowledge({}, { evidence });
  assert.equal(output.evidenceCount, 4);
  assert.equal(output.evidenceStatus, 'valid');
  assert.equal(output.evidenceSummary.length, 4);
  assert.deepEqual(Object.keys(output.evidenceSummary), ['2']);
  assert.equal(output.evidenceSummary[2].noteId, 'n');
  assert.deepEqual(output.noteIds, ['n']);
});

test('custom evidence map runs three distinct callbacks with original receiver and arbitrary results', () => {
  const events = [];
  const callbacks = [];
  const summaries = { custom: 'summary result' };
  const mappedIds = {
    filter(predicate) {
      assert.equal(this, mappedIds);
      assert.equal(predicate, Boolean);
      events.push('filter');
      return new Set(['custom', 'custom']);
    }
  };
  const evidence = {
    length: 'legacy-count',
    map(callback) {
      assert.equal(this, evidence);
      assert.equal(arguments.length, 1);
      callbacks.push(callback);
      events.push(`map${callbacks.length}`);
      if (callbacks.length === 1) {
        assert.equal(callback.call({ status: 'wrong' }, { status: 'stale' }), 'stale');
        return ['stale'];
      }
      if (callbacks.length === 2) {
        assert.deepEqual(callback({}), { ...unset(evidenceFields), noteTitle: '' });
        return summaries;
      }
      assert.equal(callback({ noteId: 'probe' }), 'probe');
      return mappedIds;
    }
  };
  const output = knowledge({}, { evidence });
  assert.equal(output.evidenceCount, 'legacy-count');
  assert.equal(output.evidenceStatus, 'stale');
  assert.equal(output.evidenceSummary, summaries);
  assert.deepEqual(output.noteIds, ['custom']);
  assert.equal(new Set(callbacks).size, 3);
  assert.deepEqual(events, ['map1', 'map2', 'map3', 'filter']);
});

test('custom objective filter keeps strict confirmed predicate and arbitrary length values', () => {
  const events = [];
  const token = { count: true };
  const objectives = {
    get length() {
      events.push('length');
      return token;
    },
    filter(predicate) {
      assert.equal(this, objectives);
      assert.equal(arguments.length, 1);
      events.push('filter');
      assert.equal(predicate({ reviewStatus: 'confirmed' }), true);
      for (const reviewStatus of [true, 'Confirmed', new String('confirmed'), undefined]) {
        assert.equal(predicate({ reviewStatus }), false);
      }
      return {
        get length() {
          events.push('filtered.length');
          return 'confirmed-count';
        }
      };
    }
  };
  const output = knowledge({}, { objectives, questions: { length: null } });
  assert.equal(output.objectiveCount, token);
  assert.equal(output.confirmedObjectiveCount, 'confirmed-count');
  assert.equal(output.questionCount, null);
  assert.deepEqual(events, ['length', 'filter', 'filtered.length']);
});

test('knowledge option getters, status map, and projected field reads keep their evaluation order', () => {
  const events = [];
  let maps = 0;
  const evidence = {
    get length() {
      events.push('evidence.length');
      return 0;
    },
    map() {
      events.push(`evidence.map${++maps}`);
      return [];
    }
  };
  const options = {
    get evidence() {
      events.push('option.evidence');
      return evidence;
    },
    get objectives() {
      events.push('option.objectives');
      return [];
    },
    get questions() {
      events.push('option.questions');
      return [];
    },
    get noteById() {
      events.push('option.noteById');
      return new Map();
    }
  };
  knowledge(tracedRecord(knowledgeFields, events, 'item'), options);
  assert.deepEqual(events, [
    'option.evidence',
    'option.objectives',
    'option.questions',
    'option.noteById',
    'evidence.map1',
    ...knowledgeFields.map(key => `item.${key}`),
    'evidence.length',
    'evidence.map2',
    'evidence.map3'
  ]);
});

test('changing evidence note ID getters are reread for lookup, summary, and note IDs', () => {
  let reads = 0;
  const events = [];
  const record = {
    get noteId() {
      events.push(`noteId${++reads}`);
      return ['truthy', 'lookup', 'summary', 'listed'][reads - 1];
    }
  };
  const noteById = {
    get(key) {
      assert.equal(this, noteById);
      events.push(`get:${key}`);
      return { title: 'Title' };
    }
  };
  const output = knowledge({}, { evidence: [record], noteById });
  assert.equal(output.evidenceSummary[0].noteId, 'summary');
  assert.equal(output.evidenceSummary[0].noteTitle, 'Title');
  assert.deepEqual(output.noteIds, ['listed']);
  assert.deepEqual(events, ['noteId1', 'noteId2', 'get:lookup', 'noteId3', 'noteId4']);
});

test('note lookup preserves dynamic Map results and nullish rather than falsy title fallback', () => {
  const titles = [undefined, null, '', false, 0, 0n, { title: true }];
  class ChangingNotes extends Map {
    get(key) {
      assert.equal(this, notes);
      assert.equal(key, 'n');
      return { title: titles[calls++] };
    }
  }
  let calls = 0;
  const notes = new ChangingNotes();
  const output = knowledge({}, { evidence: titles.map(() => ({ noteId: 'n' })), noteById: notes });
  assert.deepEqual(
    output.evidenceSummary.map(row => row.noteTitle),
    ['', '', '', false, 0, 0n, titles[6]]
  );
  assert.equal(calls, titles.length);
  const untouched = {
    get() {
      throw new Error('falsy note ID must not look up');
    }
  };
  assert.equal(knowledge({}, { evidence: [{ noteId: 0 }], noteById: untouched }).evidenceSummary[0].noteTitle, '');
});

test('knowledge forwards custom map, get, filter, and note-ID iterator throws by identity', () => {
  const thrown = { exact: true };
  assert.throws(
    () =>
      knowledge(
        {},
        {
          evidence: {
            map() {
              throw thrown;
            }
          }
        }
      ),
    errorIs(thrown)
  );
  assert.throws(
    () =>
      knowledge(
        {},
        {
          evidence: [{ noteId: 'n' }],
          noteById: {
            get() {
              throw thrown;
            }
          }
        }
      ),
    errorIs(thrown)
  );
  assert.throws(
    () =>
      knowledge(
        {},
        {
          objectives: {
            filter() {
              throw thrown;
            }
          }
        }
      ),
    errorIs(thrown)
  );
  let maps = 0;
  assert.throws(
    () =>
      knowledge(
        {},
        {
          evidence: {
            map() {
              if (++maps < 3) return [];
              return {
                filter() {
                  return {
                    [Symbol.iterator]() {
                      throw thrown;
                    }
                  };
                }
              };
            }
          }
        }
      ),
    errorIs(thrown)
  );
});

test('learning objective summaries project only four keys with original truthiness', () => {
  for (const value of [undefined, null, false, 0, '', NaN, 0n])
    assert.equal(objective({}, { knowledgeItem: value }).knowledgeItem, null);
  for (const value of [true, 1, 'text', Symbol('item'), 1n]) {
    assert.deepEqual(objective({}, { knowledgeItem: value }).knowledgeItem, {
      id: undefined,
      title: undefined,
      reviewStatus: undefined,
      evidenceStatus: undefined
    });
  }
  const evidenceStatus = { arbitrary: true };
  const input = { id: null, title: '', reviewStatus: false, evidenceStatus, ignored: true };
  const summary = objective({}, { knowledgeItem: input }).knowledgeItem;
  assert.deepEqual(summary, { id: null, title: '', reviewStatus: false, evidenceStatus });
  assert.equal(summary.evidenceStatus, evidenceStatus);
  assert.notEqual(summary, input);
});

test('learning objective question mapping preserves sparse holes and ID identities', () => {
  const id = {};
  const questions = new Array(4);
  questions[1] = { id };
  questions[3] = { id: null };
  const output = objective({}, { questions });
  assert.equal(output.questionCount, 4);
  assert.equal(output.questionIds.length, 4);
  assert.deepEqual(Object.keys(output.questionIds), ['1', '3']);
  assert.equal(output.questionIds[1], id);
  assert.equal(output.questionIds[3], null);
});

test('learning objective custom question map retains receiver, callback result, and length-before-map order', () => {
  const events = [];
  const result = Symbol('mapped');
  const questions = {
    get length() {
      events.push('length');
      return false;
    },
    map(callback) {
      assert.equal(this, questions);
      assert.equal(arguments.length, 1);
      events.push('map');
      assert.equal(callback.call({ id: 'wrong' }, { id: result }), result);
      return result;
    }
  };
  const output = objective({}, { questions });
  assert.equal(output.questionCount, false);
  assert.equal(output.questionIds, result);
  assert.deepEqual(events, ['length', 'map']);
});

test('learning objective reads source fields then knowledge summary then question collection', () => {
  const events = [];
  const knowledgeItem = tracedRecord(['id', 'title', 'reviewStatus', 'evidenceStatus'], events, 'item');
  const questions = {
    get length() {
      events.push('questions.length');
      return 0;
    },
    map() {
      events.push('questions.map');
      return [];
    }
  };
  objective(tracedRecord(objectiveFields, events, 'objective'), { knowledgeItem, questions });
  assert.deepEqual(events, [
    ...objectiveFields.map(key => `objective.${key}`),
    'item.id',
    'item.title',
    'item.reviewStatus',
    'item.evidenceStatus',
    'questions.length',
    'questions.map'
  ]);
});

test('question source status precedence and exact source summary keys preserve arbitrary fields', () => {
  for (const [statuses, expected] of [
    [[], 'insufficient'],
    [[undefined], 'insufficient'],
    [['invalid'], 'insufficient'],
    [['active'], 'valid'],
    [['reanchored'], 'valid'],
    [['active', 'stale'], 'stale']
  ]) {
    const output = question({}, { sources: statuses.map(status => ({ status })) });
    assert.equal(output.sourceStatus, expected);
    assert.equal(output.sourceHealth, expected);
  }
  const quote = {};
  const locator = ['path'];
  const input = {
    id: 's',
    sourceType: 'note',
    sourceId: null,
    quote,
    locator,
    contentHash: false,
    status: 'active',
    ignored: 1
  };
  const summary = question({}, { sources: [input] }).sources[0];
  assert.deepEqual(Object.keys(summary), sourceFields);
  assert.deepEqual(summary, {
    id: 's',
    sourceType: 'note',
    sourceId: null,
    quote,
    quoteText: quote,
    locator,
    contentHash: false,
    status: 'active',
    label: 'note'
  });
  assert.equal(summary.quote, quote);
  assert.equal(summary.quoteText, quote);
  assert.equal(summary.locator, locator);
});

test('question sorts copied links stably but chooses primary in original input order', () => {
  const links = [
    { learningObjectiveId: 'fallback', order: 9 },
    { learningObjectiveId: 'primary-first', order: 2, isPrimary: 'yes' },
    { learningObjectiveId: 'primary-later', order: 1, isPrimary: true },
    { learningObjectiveId: 'tie', order: 2 }
  ];
  const before = [...links];
  const output = question({}, { objectives: links });
  assert.deepEqual(output.learningObjectiveIds, ['primary-later', 'primary-first', 'tie', 'fallback']);
  assert.equal(output.primaryObjective.id, 'primary-first');
  assert.deepEqual(
    output.objectives.map(link => link.isPrimary),
    [true, true, false, false]
  );
  assert.deepEqual(links, before);
  assert.equal(question({}, { objectives: [links[0], links[3]] }).primaryObjective.id, 'fallback');
});

test('question link summaries use nullish fallbacks but preserve false, zero, and arbitrary values', () => {
  const fields = ['objective', 'actionVerb', 'cognitiveLevel', 'reviewStatus', 'knowledgeItemId', 'knowledgeItemTitle'];
  const fallback = {
    objective: '',
    actionVerb: '',
    cognitiveLevel: '',
    reviewStatus: null,
    knowledgeItemId: null,
    knowledgeItemTitle: ''
  };
  for (const value of [undefined, null, '', false, 0, 0n, Symbol('link'), {}]) {
    const link = {
      learningObjectiveId: null,
      order: value,
      isPrimary: value,
      ...Object.fromEntries(fields.map(key => [key, value]))
    };
    const output = question({}, { objectives: [link] });
    assert.deepEqual(Object.keys(output.objectives[0]), ['id', 'isPrimary', 'order', ...fields]);
    assert.equal(output.objectives[0].id, null);
    assert.equal(output.objectives[0].order, value);
    assert.equal(output.objectives[0].isPrimary, Boolean(value));
    for (const key of fields) assert.equal(output.objectives[0][key], value ?? fallback[key]);
    assert.deepEqual(Object.keys(output.primaryObjective), [
      'id',
      'objective',
      'knowledgeItemId',
      'knowledgeItemTitle'
    ]);
    assert.equal(output.primaryObjective.objective, value ?? '');
    assert.equal(output.primaryObjective.knowledgeItemId, value ?? null);
  }
});

test('custom find non-nullish falsy results suppress index fallback while nullish results read index zero', () => {
  for (const result of [false, 0, '', NaN, null, undefined]) {
    let indexed = 0;
    const links = {
      find() {
        return result;
      },
      get 0() {
        indexed++;
        return { learningObjectiveId: 'index' };
      },
      *[Symbol.iterator]() {}
    };
    const output = question({}, { objectives: links });
    assert.equal(indexed, result == null ? 1 : 0);
    assert.deepEqual(
      output.primaryObjective,
      result == null ? { id: 'index', objective: '', knowledgeItemId: null, knowledgeItemTitle: '' } : null
    );
  }
});

test('custom find keeps receiver and predicate raw truthiness instead of converting its return', () => {
  const marker = { primary: true };
  const chosen = { learningObjectiveId: 'chosen' };
  const links = {
    find(predicate) {
      assert.equal(this, links);
      assert.equal(arguments.length, 1);
      assert.equal(predicate.call({ isPrimary: 'wrong' }, { isPrimary: marker }), marker);
      assert.equal(predicate({}), undefined);
      return chosen;
    },
    *[Symbol.iterator]() {
      yield { learningObjectiveId: 'listed', order: 0 };
    }
  };
  const output = question({}, { objectives: links });
  assert.equal(output.primaryObjective.id, 'chosen');
  assert.deepEqual(output.learningObjectiveIds, ['listed']);
});

test('question iterator is called after find and can yield records unrelated to the indexed fallback', () => {
  const events = [];
  const first = { learningObjectiveId: 'first', order: 1 };
  const second = { learningObjectiveId: 'second', order: 0 };
  const links = {
    find() {
      events.push('find');
      return null;
    },
    get 0() {
      events.push('index');
      return { learningObjectiveId: 'fallback' };
    },
    get [Symbol.iterator]() {
      events.push('iterator.get');
      return function () {
        assert.equal(this, links);
        events.push('iterator.call');
        let index = 0;
        return {
          next() {
            events.push(`next${index}`);
            return index < 2 ? { value: [first, second][index++], done: false } : { done: true };
          }
        };
      };
    }
  };
  const output = question({}, { objectives: links });
  assert.deepEqual(events, ['find', 'index', 'iterator.get', 'iterator.call', 'next0', 'next1', 'next2']);
  assert.deepEqual(output.learningObjectiveIds, ['second', 'first']);
  assert.equal(output.primaryObjective.id, 'fallback');
});

test('native map species is preserved for question IDs, evidence, sources, and focus summaries', () => {
  class Results extends Array {}
  class Records extends Array {
    static get [Symbol.species]() {
      return Results;
    }
  }
  const questions = new Records({ id: 'q' });
  assert.equal(objective({}, { questions }).questionIds instanceof Results, true);
  const evidence = new Records({ noteId: 'n' });
  const knowledgeOutput = knowledge({}, { evidence });
  assert.equal(knowledgeOutput.evidenceSummary instanceof Results, true);
  assert.equal(Object.getPrototypeOf(knowledgeOutput.noteIds), Array.prototype);
  const sources = new Records({ status: 'active' });
  assert.equal(question({}, { sources }).sources instanceof Results, true);
  const focuses = new Records({ learningObjectiveId: 'o' });
  assert.equal(profile({}, { focuses }).focuses instanceof Results, true);
  const links = new Records({ learningObjectiveId: 'o' });
  const output = question({}, { objectives: links });
  assert.equal(Object.getPrototypeOf(output.objectives), Array.prototype);
  assert.equal(Object.getPrototypeOf(output.learningObjectiveIds), Array.prototype);
});

test('question uses native sort return value and calls its dynamic map methods without normalization', () => {
  const link = { learningObjectiveId: 'id', order: 1 };
  const links = [link];
  const firstResult = Symbol('IDs');
  const secondResult = { summaries: true };
  const callbacks = [];
  const sortedReceivers = [];
  let mapReads = 0;
  const ordered = {
    get map() {
      const call = ++mapReads;
      return function (callback) {
        assert.equal(this, ordered);
        assert.equal(arguments.length, 1);
        callbacks.push(callback);
        if (call === 1) assert.equal(callback(link), 'id');
        else
          assert.deepEqual(callback(link), {
            id: 'id',
            isPrimary: false,
            order: 1,
            objective: '',
            actionVerb: '',
            cognitiveLevel: '',
            reviewStatus: null,
            knowledgeItemId: null,
            knowledgeItemTitle: ''
          });
        return call === 1 ? firstResult : secondResult;
      };
    }
  };
  const output = replace(
    Array.prototype,
    'sort',
    function (compare) {
      sortedReceivers.push(this);
      assert.equal(arguments.length, 1);
      assert.equal(compare({ order: 7 }, { order: 2 }), 5);
      return ordered;
    },
    () => question({}, { objectives: links })
  );
  assert.equal(sortedReceivers.length, 1);
  assert.notEqual(sortedReceivers[0], links);
  assert.deepEqual(sortedReceivers[0], links);
  assert.equal(output.learningObjectiveIds, firstResult);
  assert.equal(output.objectives, secondResult);
  assert.equal(mapReads, 2);
  assert.notEqual(callbacks[0], callbacks[1]);
});

test('order subtraction reads both getters before numeric coercion and retains number hints', () => {
  const events = [];
  const make = (name, value) => ({
    learningObjectiveId: name,
    get order() {
      events.push(`${name}.order`);
      return {
        [Symbol.toPrimitive](hint) {
          events.push(`${name}:${hint}`);
          return value;
        }
      };
    }
  });
  const left = make('left', 2);
  const right = make('right', 1);
  const output = question({}, { objectives: [left, right] });
  assert.deepEqual(events.slice(0, 4), ['right.order', 'left.order', 'right:number', 'left:number']);
  assert.deepEqual(events.slice(4), ['right.order', 'left.order']);
  assert.deepEqual(output.learningObjectiveIds, ['right', 'left']);
});

test('sort retains native BigInt, mixed numeric, and Symbol comparison failures', () => {
  for (const orders of [
    [1n, 2n],
    [1n, 2],
    [1, 2n],
    [Symbol('a'), 2],
    [1, Symbol('b')]
  ]) {
    assert.throws(
      () => question({}, { objectives: orders.map((order, index) => ({ order, learningObjectiveId: index })) }),
      TypeError
    );
  }
  const single = question({}, { objectives: [{ order: 1n, learningObjectiveId: 'single' }] });
  assert.equal(single.objectives[0].order, 1n);
  const output = question(
    {},
    {
      objectives: [
        { order: '10', learningObjectiveId: 'ten' },
        { order: '2', learningObjectiveId: 'two' }
      ]
    }
  );
  assert.deepEqual(output.learningObjectiveIds, ['two', 'ten']);
});

test('order getter and coercion exceptions retain identity and precede question field reads', () => {
  const thrown = {};
  let questionReads = 0;
  const record = {
    get id() {
      questionReads++;
      return 'q';
    }
  };
  assert.throws(
    () =>
      question(record, {
        objectives: [
          { order: 1 },
          {
            get order() {
              throw thrown;
            }
          }
        ]
      }),
    errorIs(thrown)
  );
  assert.throws(
    () =>
      question(record, {
        objectives: [
          { order: 1 },
          {
            order: {
              valueOf() {
                throw thrown;
              }
            }
          }
        ]
      }),
    errorIs(thrown)
  );
  assert.equal(questionReads, 0);
});

test('sparse objective arrays retain native find and post-spread projection failures', () => {
  const links = new Array(2);
  links[1] = { learningObjectiveId: 'one', order: 1 };
  assert.throws(() => question({}, { objectives: links }), TypeError);
  links.find = () => links[1];
  assert.throws(() => question({}, { objectives: links }), TypeError);
  const sources = new Array(3);
  sources[1] = { status: 'active' };
  const output = question({}, { sources });
  assert.equal(output.sourceStatus, 'valid');
  assert.equal(output.sources.length, 3);
  assert.deepEqual(Object.keys(output.sources), ['1']);
});

test('source labels preserve nullish fallback, falsy labels, dynamic Map results, and key construction', () => {
  const labels = [undefined, null, false, 0, '', 0n, { label: true }];
  const keys = [];
  let calls = 0;
  class Labels extends Map {
    get(key) {
      assert.equal(this, lookup);
      keys.push(key);
      return labels[calls++];
    }
  }
  const lookup = new Labels();
  const output = question(
    {},
    { sources: labels.map(() => ({ sourceType: 'note', sourceId: null })), sourceLabels: lookup }
  );
  assert.deepEqual(
    output.sources.map(item => item.label),
    ['note', 'note', false, 0, '', 0n, labels[6]]
  );
  assert.deepEqual(
    keys,
    labels.map(() => 'note:')
  );
  const ids = [undefined, null, false, 0, '', 2n];
  const seen = [];
  question(
    {},
    {
      sources: ids.map(sourceId => ({ sourceType: 's', sourceId })),
      sourceLabels: {
        get(key) {
          seen.push(key);
        }
      }
    }
  );
  assert.deepEqual(seen, ['s:', 's:', 's:false', 's:0', 's:', 's:2']);
});

test('source getter changes and dynamic lookup getters are observed on every label operation', () => {
  const events = [];
  let typeReads = 0;
  let idReads = 0;
  const source = {
    get sourceType() {
      events.push(`type${++typeReads}`);
      return `type${typeReads}`;
    },
    get sourceId() {
      events.push(`id${++idReads}`);
      return `id${idReads}`;
    }
  };
  const labels = {
    get get() {
      events.push('get method');
      return function (key) {
        assert.equal(this, labels);
        events.push(key);
        return null;
      };
    }
  };
  const summary = question({}, { sources: [source], sourceLabels: labels }).sources[0];
  assert.equal(summary.sourceType, 'type1');
  assert.equal(summary.sourceId, 'id1');
  assert.equal(summary.label, 'type3');
  assert.deepEqual(events, ['type1', 'id1', 'get method', 'type2', 'id2', 'type2:id2', 'type3']);
});

test('source label template keys retain string coercion order, Symbol errors, and thrown identity', () => {
  const events = [];
  const sourceType = {
    [Symbol.toPrimitive](hint) {
      events.push(`type:${hint}`);
      return 'type';
    }
  };
  const sourceId = {
    [Symbol.toPrimitive](hint) {
      events.push(`id:${hint}`);
      return 'id';
    }
  };
  const labels = {
    get(key) {
      events.push(key);
      return 'label';
    }
  };
  const summary = question({}, { sources: [{ sourceType, sourceId }], sourceLabels: labels }).sources[0];
  assert.equal(summary.sourceType, sourceType);
  assert.equal(summary.sourceId, sourceId);
  assert.equal(summary.label, 'label');
  assert.deepEqual(events, ['type:string', 'id:string', 'type:id']);
  assert.throws(() => question({}, { sources: [{ sourceType: Symbol('type') }] }), TypeError);
  assert.throws(() => question({}, { sources: [{ sourceId: Symbol('id') }] }), TypeError);
  const thrown = {};
  assert.throws(
    () =>
      question(
        {},
        {
          sources: [
            {
              sourceType: {
                toString() {
                  throw thrown;
                }
              }
            }
          ]
        }
      ),
    errorIs(thrown)
  );
});

test('custom sources map preserves two callbacks, receiver identity, and an arbitrary projection result', () => {
  const result = { custom: true };
  const callbacks = [];
  const sources = {
    map(callback) {
      assert.equal(this, sources);
      assert.equal(arguments.length, 1);
      callbacks.push(callback);
      if (callbacks.length === 1) {
        assert.equal(callback({ status: 'active' }), 'active');
        return ['active'];
      }
      assert.deepEqual(callback({}), { ...unset(sourceFields), label: undefined });
      return result;
    }
  };
  const output = question({}, { sources });
  assert.equal(output.sourceStatus, 'valid');
  assert.equal(output.sources, result);
  assert.equal(callbacks.length, 2);
  assert.notEqual(callbacks[0], callbacks[1]);
});

test('question preprocessing precedes record getters and source quote is read separately for its alias', () => {
  const events = [];
  let maps = 0;
  let quotes = 0;
  const sources = {
    map(callback) {
      events.push(`map${++maps}`);
      return maps === 1
        ? []
        : [
            callback({
              get quote() {
                events.push('quote');
                return ++quotes;
              }
            })
          ];
    }
  };
  const links = {
    find() {
      events.push('find');
      return undefined;
    },
    get 0() {
      events.push('index');
      return undefined;
    },
    [Symbol.iterator]() {
      events.push('iterate');
      return [][Symbol.iterator]();
    }
  };
  const output = question(tracedRecord(questionFields, events, 'question'), { sources, objectives: links });
  assert.deepEqual(events, [
    'map1',
    'find',
    'index',
    'iterate',
    ...questionFields.map(key => `question.${key}`),
    'map2',
    'quote',
    'quote'
  ]);
  assert.equal(output.sources[0].quote, 1);
  assert.equal(output.sources[0].quoteText, 2);
});

test('exam profile projects exact focus summaries and counts strictly confirmed records', () => {
  const value = {};
  const focuses = [
    { id: 'f', learningObjectiveId: 'o', reviewStatus: 'confirmed', description: value },
    { reviewStatus: true },
    { reviewStatus: 'draft' }
  ];
  const related = { id: 'o', objective: value, reviewStatus: null, knowledgeItemId: false, ignored: 1 };
  const output = profile({}, { focuses, objectiveById: new Map([['o', related]]) });
  assert.equal(output.focusCount, 3);
  assert.equal(output.confirmedFocusCount, 1);
  assert.deepEqual(output.focuses[0], {
    ...unset(focusFields),
    id: 'f',
    learningObjectiveId: 'o',
    reviewStatus: 'confirmed',
    description: value,
    learningObjective: { id: 'o', objective: value, reviewStatus: null, knowledgeItemId: false }
  });
  assert.equal(output.focuses[0].description, value);
  assert.equal(output.focuses[0].learningObjective.objective, value);
  assert.equal(output.focuses[1].learningObjective, null);
});

test('custom focus filter, map, and get preserve receiver identity, ordering, and arbitrary results', () => {
  const events = [];
  const result = { mapped: true };
  const key = Symbol('objective');
  const objectiveById = {
    get(value) {
      assert.equal(this, objectiveById);
      assert.equal(value, key);
      events.push('get');
      return { id: 'related' };
    }
  };
  const focuses = {
    get length() {
      events.push('length');
      return 'total';
    },
    filter(predicate) {
      assert.equal(this, focuses);
      assert.equal(arguments.length, 1);
      events.push('filter');
      assert.equal(predicate({ reviewStatus: 'confirmed' }), true);
      assert.equal(predicate({ reviewStatus: new String('confirmed') }), false);
      return {
        get length() {
          events.push('filtered.length');
          return null;
        }
      };
    },
    map(callback) {
      assert.equal(this, focuses);
      assert.equal(arguments.length, 1);
      events.push('map');
      const summary = callback({ learningObjectiveId: key });
      assert.equal(summary.learningObjectiveId, key);
      assert.equal(summary.learningObjective.id, 'related');
      return result;
    }
  };
  const output = profile({}, { focuses, objectiveById });
  assert.equal(output.focusCount, 'total');
  assert.equal(output.confirmedFocusCount, null);
  assert.equal(output.focuses, result);
  assert.deepEqual(events, ['length', 'filter', 'filtered.length', 'map', 'get']);
});

test('sparse focuses retain map holes and filter only populated records', () => {
  const focuses = new Array(4);
  focuses[2] = { reviewStatus: 'confirmed' };
  let lookups = 0;
  const output = profile(
    {},
    {
      focuses,
      objectiveById: {
        get(key) {
          lookups++;
          assert.equal(key, undefined);
          return null;
        }
      }
    }
  );
  assert.equal(output.focusCount, 4);
  assert.equal(output.confirmedFocusCount, 1);
  assert.equal(output.focuses.length, 4);
  assert.deepEqual(Object.keys(output.focuses), ['2']);
  assert.equal(output.focuses[2].learningObjective, null);
  assert.equal(lookups, 1);
});

test('focus objective IDs are reread after lookup and dynamic get methods retain receiver', () => {
  const events = [];
  let idReads = 0;
  const record = {
    get learningObjectiveId() {
      events.push(`id${++idReads}`);
      return idReads;
    }
  };
  const lookup = {
    get get() {
      events.push('get method');
      return function (key) {
        assert.equal(this, lookup);
        events.push(`lookup:${key}`);
        return { id: key };
      };
    }
  };
  const output = profile({}, { focuses: [record], objectiveById: lookup });
  assert.equal(output.focuses[0].learningObjectiveId, 2);
  assert.equal(output.focuses[0].learningObjective.id, 1);
  assert.deepEqual(events, ['get method', 'id1', 'lookup:1', 'id2']);
});

test('focus learning objective summaries retain original truthiness and field read order', () => {
  for (const value of [undefined, null, false, 0, '', NaN, 0n]) assert.equal(focus({}, value).learningObjective, null);
  for (const value of [true, 1, 'text', Symbol('objective'), 1n]) {
    assert.deepEqual(focus({}, value).learningObjective, {
      id: undefined,
      objective: undefined,
      reviewStatus: undefined,
      knowledgeItemId: undefined
    });
  }
  const events = [];
  const output = focus(
    tracedRecord(focusFields, events, 'focus'),
    tracedRecord(['id', 'objective', 'reviewStatus', 'knowledgeItemId'], events, 'objective')
  );
  assert.deepEqual(events, [
    ...focusFields.map(key => `focus.${key}`),
    'objective.id',
    'objective.objective',
    'objective.reviewStatus',
    'objective.knowledgeItemId'
  ]);
  assert.deepEqual(output.learningObjective, {
    id: 'id',
    objective: 'objective',
    reviewStatus: 'reviewStatus',
    knowledgeItemId: 'knowledgeItemId'
  });
});

test('collection, lookup, iterator, and field exceptions escape all projections unchanged', () => {
  const thrown = { unchanged: true };
  assert.throws(
    () =>
      objective(
        {},
        {
          questions: {
            map() {
              throw thrown;
            }
          }
        }
      ),
    errorIs(thrown)
  );
  assert.throws(
    () =>
      objective(
        {},
        {
          knowledgeItem: {
            get id() {
              throw thrown;
            }
          }
        }
      ),
    errorIs(thrown)
  );
  assert.throws(
    () =>
      question(
        {},
        {
          objectives: {
            find() {
              throw thrown;
            }
          }
        }
      ),
    errorIs(thrown)
  );
  assert.throws(
    () =>
      question(
        {},
        {
          objectives: {
            find() {
              return null;
            },
            [Symbol.iterator]() {
              throw thrown;
            }
          }
        }
      ),
    errorIs(thrown)
  );
  assert.throws(
    () =>
      question(
        {},
        {
          sources: [{}],
          sourceLabels: {
            get() {
              throw thrown;
            }
          }
        }
      ),
    errorIs(thrown)
  );
  assert.throws(
    () =>
      profile(
        {},
        {
          focuses: {
            filter() {
              throw thrown;
            }
          }
        }
      ),
    errorIs(thrown)
  );
  assert.throws(
    () =>
      profile(
        {},
        {
          focuses: [{}],
          objectiveById: {
            get() {
              throw thrown;
            }
          }
        }
      ),
    errorIs(thrown)
  );
  assert.throws(
    () =>
      focus(
        {},
        {
          get objective() {
            throw thrown;
          }
        }
      ),
    errorIs(thrown)
  );
  for (const project of [knowledge, objective, question, profile, focus]) {
    assert.throws(
      () =>
        project({
          get id() {
            throw thrown;
          }
        }),
      errorIs(thrown)
    );
  }
});

test('species constructors and overridden array iterators remain observable and preserve thrown identity', () => {
  const thrown = {};
  class ThrowingRecords extends Array {
    static get [Symbol.species]() {
      throw thrown;
    }
  }
  const records = new ThrowingRecords({});
  assert.throws(() => objective({}, { questions: records }), errorIs(thrown));
  assert.throws(() => knowledge({}, { evidence: records }), errorIs(thrown));
  assert.throws(() => question({}, { sources: records }), errorIs(thrown));
  assert.throws(() => profile({}, { focuses: records }), errorIs(thrown));
  const links = [{ learningObjectiveId: 'indexed' }];
  links[Symbol.iterator] = function* () {
    assert.equal(this, links);
    yield { learningObjectiveId: 'iterated' };
  };
  const output = question({}, { objectives: links });
  assert.equal(output.primaryObjective.id, 'indexed');
  assert.deepEqual(output.learningObjectiveIds, ['iterated']);
});
