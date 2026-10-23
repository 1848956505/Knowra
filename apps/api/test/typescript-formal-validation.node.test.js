import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after } from 'node:test';
import { AppError } from '../src/errors/app-error.js';

const names = ['knowledge-errors', 'question-validation', 'formal-asset-validation'];
const application = new URL('../src/modules/knowledge/application/', import.meta.url);
// Run the identical behavioral assertions against the three original JS modules:
// KNOWRA_FORMAL_VALIDATION_BASELINE=1 node --test apps/api/test/typescript-formal-validation.node.test.js
const baseline = process.env.KNOWRA_FORMAL_VALIDATION_BASELINE === '1';
let moduleRoot = application;
if (baseline) {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-formal-validation-baseline-'));
  after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
  for (const name of names) {
    const original = execFileSync(
      'git',
      ['show', `b4f8dc6c1a299be1db24ff2b68b9d462895a4800:apps/api/src/modules/knowledge/application/${name}.js`],
      {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        encoding: 'utf8'
      }
    );
    // These dependencies are outside the migration and retain their real runtime identities.
    const source = original
      .replace('../../../errors/app-error.js', new URL('../src/errors/app-error.js', import.meta.url).href)
      .replace(
        '../domain/evidence-applicability.js',
        new URL('../src/modules/knowledge/domain/evidence-applicability.js', import.meta.url).href
      );
    writeFileSync(join(directory, `${name}.js`), source);
  }
  moduleRoot = pathToFileURL(`${directory}/`);
}
const [errors, questions, formal] = await Promise.all(names.map(name => import(new URL(`${name}.js`, moduleRoot))));
const choice = (overrides = {}) => ({
  stem: ' Question ',
  questionType: 'singleChoice',
  options: [
    { id: 'a', text: ' A ' },
    { id: 'b', text: ' B ' }
  ],
  referenceAnswer: 'a',
  ...overrides
});
const confirmed = { reviewStatus: 'confirmed' };
const objective = (overrides = {}) => ({
  objective: 'Explain the result',
  actionVerb: 'explain',
  cognitiveLevel: 'understand',
  ...overrides
});
const reject = (run, code, message) =>
  assert.throws(run, error => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, 422);
    if (message !== undefined) assert.equal(error.message, message);
    return true;
  });
const invalid = (question, codes) => {
  reject(
    () => questions.validateQuestionStructure(question),
    'QUESTION_INVALID_STRUCTURE',
    `Question structure is invalid: ${codes.join(', ')}`
  );
  assert.equal(questions.isQuestionStructureComplete(question), false);
};
const valid = question => {
  assert.equal(questions.validateQuestionStructure(question), true);
  assert.equal(questions.isQuestionStructureComplete(question), true);
};

test('formal validation JS/TS bridges preserve all export identities', { skip: baseline }, async () => {
  for (const name of names) {
    const js = await import(new URL(`${name}.js`, application));
    const ts = await import(new URL(`${name}.ts`, application));
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
});

test('knowledge error factories preserve exports, class, status, and messages', () => {
  assert.deepEqual(Object.keys(errors), ['conflictError', 'notFoundError', 'validationError']);
  for (const [name, status] of [
    ['validationError', 422],
    ['notFoundError', 404],
    ['conflictError', 409]
  ]) {
    const error = errors[name]('EXACT_CODE', 'Exact message');
    assert.ok(error instanceof AppError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'AppError');
    assert.equal(error.code, 'EXACT_CODE');
    assert.equal(error.message, 'Exact message');
    assert.equal(error.statusCode, status);
    assert.notEqual(errors[name]('EXACT_CODE', 'Exact message'), error);
  }
});

test('every question kind and unknown kinds retain their accepted shapes', () => {
  valid(choice());
  valid(choice({ questionType: 'multipleChoice', referenceAnswer: ['a', 'b'] }));
  for (const referenceAnswer of [true, false]) valid({ stem: 'TF', questionType: 'trueFalse', referenceAnswer });
  for (const referenceAnswer of ['answer', {}, [], 1])
    valid({ stem: 'Short', questionType: 'shortAnswer', referenceAnswer });
  for (const questionType of ['futureKind', undefined, null, 'toString'])
    valid({ stem: 'Unknown', questionType, referenceAnswer: 'answer' });
});

test('question error accumulation preserves ordering and repeated short-answer errors', () => {
  invalid(choice({ stem: ' ', options: [null], referenceAnswer: [] }), [
    'QUESTION_STEM_REQUIRED',
    'QUESTION_OPTIONS_REQUIRED',
    'QUESTION_OPTIONS_INVALID',
    'QUESTION_REFERENCE_ANSWER_INVALID',
    'QUESTION_SINGLE_ANSWER_REQUIRED'
  ]);
  invalid({ questionType: 'shortAnswer' }, [
    'QUESTION_STEM_REQUIRED',
    'QUESTION_REFERENCE_OR_RUBRIC_REQUIRED',
    'QUESTION_REFERENCE_OR_RUBRIC_REQUIRED'
  ]);
  invalid({ stem: 'Q', questionType: 'futureKind' }, ['QUESTION_REFERENCE_OR_RUBRIC_REQUIRED']);
  invalid({ stem: 'Q', questionType: 'trueFalse', referenceAnswer: 0 }, ['QUESTION_TRUE_FALSE_ANSWER_REQUIRED']);
});

test('choice missing, malformed and sparse options keep native array semantics', () => {
  for (const options of [undefined, null, {}, 'ab', []])
    invalid(choice({ options }), ['QUESTION_OPTIONS_REQUIRED', 'QUESTION_REFERENCE_ANSWER_INVALID']);
  for (const option of [null, false, 1, 'a', {}, { id: 'a', text: ' ' }])
    invalid(choice({ options: [option, { id: 'b', text: 'B' }], referenceAnswer: 'b' }), ['QUESTION_OPTIONS_INVALID']);
  const sparse = new Array(2);
  invalid(choice({ options: sparse }), ['QUESTION_OPTION_IDS_DUPLICATE', 'QUESTION_REFERENCE_ANSWER_INVALID']);
  const partlySparse = new Array(2);
  partlySparse[1] = { id: 'a', text: 'A' };
  valid(choice({ options: partlySparse }));
  valid(
    choice({
      options: [
        { id: 0, text: false },
        { id: false, text: 0 }
      ],
      referenceAnswer: '0'
    })
  );
});

test('choice ID normalization, duplicates and answer multiplicity are unchanged', () => {
  invalid(
    choice({
      options: [
        { id: ' a ', text: 'A' },
        { id: 'a', text: 'B' }
      ]
    }),
    ['QUESTION_OPTION_IDS_DUPLICATE']
  );
  valid(choice({ referenceAnswer: [' a '] }));
  valid(choice({ questionType: 'multipleChoice', referenceAnswer: ['a', 'a'] }));
  invalid(choice({ referenceAnswer: ['a', 'b'] }), ['QUESTION_SINGLE_ANSWER_REQUIRED']);
  invalid(choice({ referenceAnswer: [] }), ['QUESTION_REFERENCE_ANSWER_INVALID', 'QUESTION_SINGLE_ANSWER_REQUIRED']);
  invalid(choice({ referenceAnswer: 'missing' }), ['QUESTION_REFERENCE_ANSWER_INVALID']);
  valid(choice({ referenceAnswer: new Array(1) }));
  valid(choice({ questionType: 'multipleChoice', referenceAnswer: new Array(2) }));
});

test('false, zero, empty answers and rubrics retain truthiness rules', () => {
  for (const referenceAnswer of [false, 0])
    invalid({ stem: 'Q', questionType: 'shortAnswer', referenceAnswer }, ['QUESTION_REFERENCE_OR_RUBRIC_REQUIRED']);
  for (const referenceAnswer of ['', null, undefined])
    invalid({ stem: 'Q', questionType: 'shortAnswer', referenceAnswer }, [
      'QUESTION_REFERENCE_OR_RUBRIC_REQUIRED',
      'QUESTION_REFERENCE_OR_RUBRIC_REQUIRED'
    ]);
  invalid({ stem: 'Q', questionType: 'shortAnswer', referenceAnswer: '   ' }, [
    'QUESTION_REFERENCE_OR_RUBRIC_REQUIRED'
  ]);
  for (const rubric of [' ', {}, []]) valid({ stem: 'Q', questionType: 'shortAnswer', referenceAnswer: false, rubric });
  for (const rubric of ['', 0, false])
    invalid({ stem: 'Q', questionType: 'shortAnswer', rubric }, [
      'QUESTION_REFERENCE_OR_RUBRIC_REQUIRED',
      'QUESTION_REFERENCE_OR_RUBRIC_REQUIRED'
    ]);
});

test('question trim and accessor failures remain native and completeness catches them', () => {
  for (const question of [null, undefined, choice({ stem: 1 }), choice({ stem: { trim: false } })]) {
    assert.throws(() => questions.validateQuestionStructure(question), TypeError);
    assert.equal(questions.isQuestionStructureComplete(question), false);
  }
  const events = [];
  valid(
    choice({
      stem: {
        get trim() {
          events.push('get');
          return function () {
            events.push(this);
            return true;
          };
        }
      }
    })
  );
  assert.equal(events[0], 'get');
  assert.equal(events[2], 'get');
  assert.equal(events[1], events[3]);
  const failure = new Error('getter failure');
  const question = {
    get stem() {
      throw failure;
    }
  };
  assert.throws(
    () => questions.validateQuestionStructure(question),
    error => error === failure
  );
  assert.equal(questions.isQuestionStructureComplete(question), false);
});

test('knowledge confirmation validates content before source and accepts callable trim objects', () => {
  for (const item of [
    undefined,
    null,
    {},
    { title: ' ', canonicalStatement: 'S', sourceMode: 'manual' },
    { title: 1, canonicalStatement: 'S' }
  ])
    reject(() => formal.assertKnowledgeItemConfirmable(item), 'KNOWLEDGE_ITEM_CONTENT_REQUIRED');
  const item = { title: 'T', canonicalStatement: 'S' };
  reject(() => formal.assertKnowledgeItemConfirmable(item), 'KNOWLEDGE_ITEM_SOURCE_REQUIRED');
  assert.equal(formal.assertKnowledgeItemConfirmable({ ...item, sourceMode: 'manual' }), true);
  assert.equal(
    formal.assertKnowledgeItemConfirmable({
      title: { trim: () => 1 },
      canonicalStatement: { trim: () => [] },
      sourceMode: 'manual'
    }),
    true
  );
  assert.throws(() => formal.assertKnowledgeItemConfirmable({ title: { trim: 1 } }), TypeError);
  assert.throws(() => formal.assertKnowledgeItemConfirmable({ ...item, sourceMode: 'manual' }, null), TypeError);
});

test('knowledge evidence applicability and legacy status govern nonmanual confirmation', () => {
  const item = { title: 'T', canonicalStatement: 'S', sourceMode: 'ai' };
  for (const evidence of [
    { status: 'valid' },
    { status: 'valid', applicabilityStatus: null },
    { status: 'valid', applicabilityStatus: 'active' }
  ])
    assert.equal(formal.assertKnowledgeItemConfirmable(item, [evidence]), true);
  for (const evidence of [
    null,
    {},
    { status: 'invalid' },
    { status: 'valid', applicabilityStatus: 'withdrawn' },
    { status: 'valid', applicabilityStatus: 'needsReview' },
    { status: 'valid', applicabilityStatus: '' }
  ])
    reject(() => formal.assertKnowledgeItemConfirmable(item, [evidence]), 'KNOWLEDGE_ITEM_SOURCE_REQUIRED');
});

test('learning objective upstream and content failures retain validation priority', () => {
  for (const item of [null, undefined, {}, { reviewStatus: 'draft' }, { ...confirmed, deletedAt: 'now' }])
    reject(() => formal.assertLearningObjectiveConfirmable({}, item), 'KNOWLEDGE_ITEM_NOT_CONFIRMED');
  for (const value of [
    null,
    {},
    objective({ objective: ' ' }),
    objective({ actionVerb: '' }),
    objective({ cognitiveLevel: '' })
  ])
    reject(() => formal.assertLearningObjectiveConfirmable(value, confirmed), 'LEARNING_OBJECTIVE_CONTENT_REQUIRED');
  assert.equal(formal.assertLearningObjectiveConfirmable(objective(), { ...confirmed, deletedAt: '' }), true);
});

test('learning objective action-verb matrix and vague prefixes retain exact matching', () => {
  for (const [actionVerb, cognitiveLevel] of [
    ['identify', 'remember'],
    ['explain', 'understand'],
    ['apply', 'apply'],
    ['calculate', 'apply'],
    ['compare', 'analyze'],
    ['analyze', 'analyze'],
    ['design', 'analyze'],
    ['evaluate', 'analyze']
  ]) {
    assert.equal(formal.assertLearningObjectiveConfirmable(objective({ actionVerb, cognitiveLevel }), confirmed), true);
    reject(
      () => formal.assertLearningObjectiveConfirmable(objective({ actionVerb, cognitiveLevel: 'wrong' }), confirmed),
      'LEARNING_OBJECTIVE_COGNITIVE_LEVEL_MISMATCH'
    );
  }
  for (const text of ['了解概念', '能够 熟悉概念', '能掌握概念', '可以 了解概念', '  熟悉概念'])
    reject(
      () => formal.assertLearningObjectiveConfirmable(objective({ objective: text }), confirmed),
      'LEARNING_OBJECTIVE_VAGUE_VERB'
    );
  assert.equal(
    formal.assertLearningObjectiveConfirmable(objective({ objective: '解释如何了解概念' }), confirmed),
    true
  );
  for (const actionVerb of ['Explain', ' explain ', 'unknown'])
    reject(
      () => formal.assertLearningObjectiveConfirmable(objective({ actionVerb }), confirmed),
      'LEARNING_OBJECTIVE_COGNITIVE_LEVEL_MISMATCH'
    );
});

test('prototype action verbs and objective getters retain native behavior', () => {
  for (const actionVerb of ['toString', 'constructor', '__proto__', 'hasOwnProperty'])
    assert.throws(() => formal.assertLearningObjectiveConfirmable(objective({ actionVerb }), confirmed), TypeError);
  let calls = 0;
  const text = {
    trim() {
      calls += 1;
      return 'Explain';
    }
  };
  assert.equal(formal.assertLearningObjectiveConfirmable(objective({ objective: text }), confirmed), true);
  assert.equal(calls, 2);
  const failure = new Error('objective getter');
  assert.throws(
    () =>
      formal.assertLearningObjectiveConfirmable(
        {
          get objective() {
            throw failure;
          }
        },
        confirmed
      ),
    error => error === failure
  );
});

test('manual source declarations distinguish strings, objects, arrays and inherited keys', () => {
  for (const extra of [
    { sourceId: ' id ' },
    { quote: ' quote ' },
    { locator: { start: 0 } },
    { locator: { value: undefined } }
  ])
    assert.equal(formal.deriveQuestionSourceStatus({ sourceType: 'manual', ...extra }), 'active');
  for (const extra of [
    {},
    { sourceId: 1 },
    { sourceId: ' ', quote: ' ' },
    { locator: [] },
    { locator: ['x'] },
    { locator: {} },
    { locator: Object.create({ start: 0 }) },
    { locator: { [Symbol('key')]: 1 } }
  ])
    assert.equal(formal.deriveQuestionSourceStatus({ sourceType: 'manual', ...extra }), 'stale');
});

test('knowledge and objective source references require nondeleted confirmation', () => {
  for (const sourceType of ['knowledgeItem', 'learningObjective']) {
    assert.equal(formal.deriveQuestionSourceStatus({ sourceType }, confirmed), 'active');
    for (const reference of [null, {}, { reviewStatus: 'draft' }, { ...confirmed, deletedAt: 'now' }])
      assert.equal(formal.deriveQuestionSourceStatus({ sourceType }, reference), 'stale');
  }
  for (const source of [undefined, null, {}, { sourceType: 'unknown' }, { sourceType: 'toString' }])
    assert.equal(formal.deriveQuestionSourceStatus(source, confirmed), 'stale');
});

test('note-version source currency and hash use strict false and truthiness semantics', () => {
  const source = { sourceType: 'noteVersion' };
  assert.equal(formal.deriveQuestionSourceStatus(source), 'stale');
  for (const isCurrent of [undefined, null, 0, '', true])
    assert.equal(formal.deriveQuestionSourceStatus(source, { isCurrent }), 'active');
  assert.equal(formal.deriveQuestionSourceStatus(source, { isCurrent: false }), 'stale');
  assert.equal(
    formal.deriveQuestionSourceStatus({ ...source, contentHash: 'hash' }, { contentHash: 'hash' }),
    'active'
  );
  assert.equal(formal.deriveQuestionSourceStatus({ ...source, contentHash: 'hash' }, {}), 'stale');
  assert.equal(formal.deriveQuestionSourceStatus({ ...source, contentHash: '' }, {}), 'active');
});

test('knowledge-evidence source status preserves explicit and legacy applicability', () => {
  for (const [reference, expected] of [
    [{ status: 'valid' }, 'active'],
    [{ status: 'valid', applicabilityStatus: 'active' }, 'active'],
    [{ status: 'valid', applicabilityStatus: null }, 'active'],
    [{ status: 'valid', applicabilityStatus: 'withdrawn' }, 'stale'],
    [{ status: 'valid', applicabilityStatus: 'needsReview' }, 'stale'],
    [{ status: 'invalid', applicabilityStatus: 'active' }, 'stale'],
    [null, 'stale']
  ])
    assert.equal(formal.deriveQuestionSourceStatus({ sourceType: 'knowledgeEvidence' }, reference), expected);
});

test('question confirmation enforces structure, objectives, then source health', () => {
  reject(() => formal.assertQuestionConfirmable(choice({ stem: '' })), 'QUESTION_INVALID_STRUCTURE');
  reject(() => formal.assertQuestionConfirmable(choice()), 'QUESTION_OBJECTIVES_REQUIRED');
  for (const objective of [null, {}, { reviewStatus: 'draft' }, { ...confirmed, deletedAt: 'now' }])
    reject(
      () => formal.assertQuestionConfirmable(choice(), { objectives: [objective] }),
      'LEARNING_OBJECTIVE_NOT_CONFIRMED'
    );
  reject(() => formal.assertQuestionConfirmable(choice(), { objectives: [confirmed] }), 'QUESTION_SOURCE_REQUIRED');
  for (const source of [null, {}, { status: 'stale' }])
    reject(
      () => formal.assertQuestionConfirmable(choice(), { objectives: [confirmed], sources: [source] }),
      'QUESTION_SOURCE_INVALID'
    );
  assert.equal(
    formal.assertQuestionConfirmable(choice(), { objectives: [confirmed], sources: [{ status: 'active' }] }),
    true
  );
  assert.equal(formal.assertQuestionConfirmable(choice(), { objectives: new Array(1), sources: new Array(1) }), true);
  assert.throws(() => formal.assertQuestionConfirmable(choice(), null), TypeError);
  assert.throws(() => formal.assertQuestionConfirmable(choice(), { objectives: null }), TypeError);
});
