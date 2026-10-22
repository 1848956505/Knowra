import assert from 'node:assert/strict';
import test from 'node:test';

const timestamp = '2026-10-22T00:00:00.000Z';
const models = [
  ['knowledge-item', 'KnowledgeItem', { id: 'k' }],
  ['knowledge-evidence', 'KnowledgeEvidence', { id: 'e', knowledgeItemId: 'k' }],
  ['learning-objective', 'LearningObjective', { id: 'o', knowledgeItemId: 'k' }],
  ['exam-profile', 'ExamProfile', { id: 'p', name: ' profile ' }],
  ['exam-focus', 'ExamFocus', { id: 'f', examProfileId: 'p', learningObjectiveId: 'o' }],
  ['question', 'Question', { id: 'q' }],
  ['question-source', 'QuestionSource', { id: 's', questionId: 'q' }]
];

for (const [file, name, input] of models) {
  test(`${name}: TS/JS identity, defaults, own fields and serialized round-trip remain stable`, async () => {
    const legacy = await import(`../src/modules/knowledge/domain/${file}.js`);
    const migrated = await import(`../src/modules/knowledge/domain/${file}.ts`);
    assert.deepEqual(Object.keys(legacy), Object.keys(migrated));
    for (const key of Object.keys(legacy)) {
      assert.equal(legacy[key], migrated[key]);
      if (Array.isArray(legacy[key])) assert.ok(Object.isFrozen(legacy[key]));
    }
    const Model = migrated[name];
    const value = new Model({ ...input, createdAt: timestamp });
    assert.ok(value instanceof legacy[name]);
    assert.equal(value.createdAt, timestamp);
    assert.equal(value.updatedAt, timestamp);
    assert.equal(value.id, input.id);
    assert.equal(Object.keys(value)[0], 'id');
    assert.deepEqual(new Model(JSON.parse(JSON.stringify(value))), value);
    assert.equal(new Model({ ...input, createdAt: null }).updatedAt, null);
    assert.equal(new Model({ ...input, createdAt: timestamp, updatedAt: null }).updatedAt, null);
    assert.throws(() => new Model({ ...input, id: '' }), /required/);
  });
}

test('knowledge model normalization preserves coercion and evidence source restrictions', async () => {
  const { KnowledgeItem } = await import('../src/modules/knowledge/domain/knowledge-item.ts');
  const { KnowledgeEvidence } = await import('../src/modules/knowledge/domain/knowledge-evidence.ts');
  const value = new KnowledgeItem({
    id: ' k ',
    title: ' title ',
    canonicalStatement: ' text ',
    importance: '2',
    userExplanation: { trim: () => 'custom' },
    knowledgeType: 'custom',
    createdAt: timestamp
  });
  assert.deepEqual(Object.keys(value), [
    'id',
    'title',
    'canonicalStatement',
    'userExplanation',
    'knowledgeType',
    'importance',
    'reviewStatus',
    'sourceMode',
    'createdAt',
    'updatedAt',
    'deletedAt'
  ]);
  assert.equal(value.id, ' k ');
  assert.equal(value.title, 'title');
  assert.equal(value.canonicalStatement, 'text');
  assert.equal(value.userExplanation, 'custom');
  assert.equal(value.knowledgeType, 'custom');
  assert.equal(value.importance, 2);
  for (const input of [null, undefined])
    assert.equal(new KnowledgeItem({ id: 'k', importance: input }).importance, null);
  assert.equal(new KnowledgeItem({ id: 'k', importance: true }).importance, 1);
  assert.throws(() => new KnowledgeItem({ id: 'k', importance: 'bad' }), /importance is invalid/);
  assert.throws(() => new KnowledgeItem({ id: 'k', reviewStatus: 'bad' }), /status or sourceMode/);
  const evidence = new KnowledgeEvidence({
    id: 'e',
    knowledgeItemId: 'k',
    status: 'invalid',
    quoteText: 12,
    headingPath: [' a ', '', 2],
    sourceId: 'manual-source'
  });
  assert.equal(evidence.applicabilityStatus, 'needsReview');
  assert.equal(evidence.quoteText, '12');
  assert.deepEqual(evidence.headingPath, ['a', '2']);
  assert.equal(evidence.sourceId, 'manual-source');
  assert.throws(
    () => new KnowledgeEvidence({ id: 'e', knowledgeItemId: 'k', sourceType: 'noteVersion' }),
    /requires noteVersionId/
  );
  assert.throws(
    () => new KnowledgeEvidence({ id: 'e', knowledgeItemId: 'k', sourceType: 'annotation' }),
    /requires annotationId/
  );
  assert.throws(
    () => new KnowledgeEvidence({ id: 'e', knowledgeItemId: 'k', annotationId: 'a' }),
    /Manual evidence cannot/
  );
});

test('learning and exam models retain numeric conversion, falsy distinctions and deep clones', async () => {
  const { LearningObjective } = await import('../src/modules/knowledge/domain/learning-objective.ts');
  const { ExamFocus } = await import('../src/modules/knowledge/domain/exam-focus.ts');
  const { ExamProfile } = await import('../src/modules/knowledge/domain/exam-profile.ts');
  const objective = new LearningObjective({
    id: 'o',
    knowledgeItemId: 'k',
    order: '2',
    objective: ' text ',
    reviewNote: { trim: () => 'review' },
    difficultyHint: ''
  });
  assert.equal(objective.order, 2);
  assert.equal(objective.objective, 'text');
  assert.equal(objective.reviewNote, 'review');
  assert.equal(objective.difficultyHint, null);
  assert.throws(
    () => new LearningObjective({ id: 'o', knowledgeItemId: 'k', difficultyHint: false }),
    /difficultyHint is invalid/
  );
  assert.throws(() => new LearningObjective({ id: 'o', knowledgeItemId: 'k', order: -1 }), /order is invalid/);
  const suggestions = [{ nested: ['one'] }];
  const focus = new ExamFocus({
    id: 'f',
    examProfileId: 'p',
    learningObjectiveId: 'o',
    priority: true,
    difficultyHint: false,
    questionTypeSuggestions: suggestions
  });
  assert.equal(focus.priority, 1);
  assert.equal(focus.difficultyHint, null);
  suggestions[0].nested.push('two');
  assert.deepEqual(focus.questionTypeSuggestions, [{ nested: ['one'] }]);
  const scope = [{ subject: 'original' }];
  const difficultyProfile = new Map([['easy', 2]]);
  const profile = new ExamProfile({
    id: 'p',
    name: ' name ',
    language: ' ',
    scope,
    commonQuestionTypes: [1, { custom: true }],
    difficultyProfile
  });
  assert.equal(profile.name, 'name');
  assert.equal(profile.language, 'zh-CN');
  scope[0].subject = 'changed';
  difficultyProfile.set('easy', 3);
  assert.deepEqual(profile.scope, [{ subject: 'original' }]);
  assert.deepEqual(profile.commonQuestionTypes, [1, { custom: true }]);
  assert.deepEqual(profile.difficultyProfile, new Map([['easy', 2]]));
});

test('question models preserve open structured values and source normalization', async () => {
  const { Question } = await import('../src/modules/knowledge/domain/question.ts');
  const { QuestionSource } = await import('../src/modules/knowledge/domain/question-source.ts');
  const options = [{ id: 'a', values: [1] }];
  const referenceAnswer = new Date(timestamp);
  const rubric = new Map([['score', 1]]);
  const question = new Question({
    id: 'q',
    stem: ' stem ',
    options,
    referenceAnswer,
    rubric,
    version: '2',
    difficulty: false
  });
  options[0].values.push(2);
  rubric.set('score', 3);
  assert.deepEqual(question.options, [{ id: 'a', values: [1] }]);
  assert.deepEqual(question.referenceAnswer, new Date(timestamp));
  assert.notEqual(question.referenceAnswer, referenceAnswer);
  assert.deepEqual(question.rubric, new Map([['score', 1]]));
  assert.equal(question.version, 2);
  assert.equal(question.stem, 'stem');
  assert.equal(question.difficulty, null);
  assert.throws(() => new Question({ id: 'q', options: {} }), /options must be an array/);
  assert.throws(() => new Question({ id: 'q', questionType: 'bad' }), /questionType is invalid/);
  assert.throws(() => new Question({ id: 'q', version: 0 }), /version is invalid/);
  const locator = { nested: ['original'] };
  const source = new QuestionSource({
    id: 's',
    questionId: 'q',
    sourceId: '',
    contentHash: '',
    quote: ' quote ',
    locator
  });
  locator.nested.push('changed');
  assert.deepEqual(source.locator, { nested: ['original'] });
  assert.equal(source.sourceId, null);
  assert.equal(source.contentHash, null);
  assert.equal(source.quote, 'quote');
  assert.throws(() => new QuestionSource({ id: 's', questionId: 'q', locator: [] }), /locator is invalid/);
});
