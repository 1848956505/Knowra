import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { parse } from '@babel/parser';
import {
  lifecycleParent,
  lifecycleFrozenSource,
  lifecycleContractCases,
  lifecycleConsumerCases,
  observeLifecycle,
  hash
} from './async-note-dependency-lifecycle.contract-support.js';

const baseline = process.env.KNOWRA_ASYNC_NOTE_LIFECYCLE_BASELINE === '1';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/modules/knowledge/application/postgres-async/note-dependency-lifecycle.js';
const sourceUrl = new URL(helper, root);
const sourceHash = '2ea3fda594527f1c0f4b621db4691ccdf410476bbf81aeeb0915c33960afa7a9';
let loadCount = 0;
async function loadSource(source, label) {
  const dependency = "'../knowledge-errors.js'";
  assert.equal(source.split(dependency).length, 2, 'Exact original dependency');
  const rewritten = source.replace(dependency, JSON.stringify(new URL('../knowledge-errors.js', sourceUrl).href));
  return import(
    'data:text/javascript;base64,' + Buffer.from(rewritten + `\n// ${label} ${++loadCount}`).toString('base64')
  );
}
// 普通入口零 Git；显式入口只读取准确实际父对象，缺少历史必须失败，不可回退当前源。
const historical = baseline
  ? execFileSync('git', ['show', `${lifecycleParent}:${helper}`], { cwd: root, encoding: 'utf8' })
  : null;
const api = baseline ? await loadSource(historical, 'exact-parent') : await import(sourceUrl);
const frozen = await loadSource(lifecycleFrozenSource, 'frozen-parent');
const executable = baseline
  ? historical
  : stripTypeScriptTypes(readFileSync(new URL(helper.replace(/\.js$/, '.ts'), root), 'utf8'));
for (const entry of lifecycleContractCases(api)) test(entry.name, entry.run);
function executableAst(source) {
  const normalize = value =>
    Array.isArray(value)
      ? value.map(normalize)
      : value === null || typeof value !== 'object'
        ? value
        : Object.fromEntries(
            Object.entries(value)
              .filter(
                ([key]) =>
                  ![
                    'start',
                    'end',
                    'loc',
                    'extra',
                    'comments',
                    'leadingComments',
                    'trailingComments',
                    'innerComments'
                  ].includes(key)
              )
              .map(([key, nested]) => [key, normalize(nested)])
          );
  return normalize(parse(source, { sourceType: 'module' }).program);
}
test('frozen exact actual-parent source has independently recorded SHA256', () => {
  assert.equal(lifecycleParent, '31b449f26c7c009187e0eb910ce4cb627d4174fb');
  assert.equal(hash(lifecycleFrozenSource), sourceHash);
  if (baseline) assert.equal(historical, lifecycleFrozenSource);
});
test('Node official erasure preserves full ordered runtime AST and every original import', { skip: baseline }, () => {
  assert.deepEqual(executableAst(executable), executableAst(lifecycleFrozenSource));
});
test('JS bridge exports only the identical TS policy factory', { skip: baseline }, async () => {
  const typed = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(api), ['createAsyncNoteDependencyLifecycle']);
  assert.deepEqual(Object.keys(typed), ['createAsyncNoteDependencyLifecycle']);
  assert.equal(api.createAsyncNoteDependencyLifecycle, typed.createAsyncNoteDependencyLifecycle);
  const program = parse(readFileSync(sourceUrl, 'utf8'), { sourceType: 'module' }).program;
  assert.deepEqual(program.directives, []);
  assert.equal(program.body.length, 1);
  const statement = program.body[0];
  assert.equal(statement.type, 'ExportNamedDeclaration');
  assert.equal(statement.declaration, null);
  assert.equal(statement.source.value, './note-dependency-lifecycle.ts');
  assert.equal(statement.specifiers.length, 1);
  assert.equal(statement.specifiers[0].type, 'ExportSpecifier');
  assert.equal(statement.specifiers[0].local.name, 'createAsyncNoteDependencyLifecycle');
  assert.equal(statement.specifiers[0].exported.name, 'createAsyncNoteDependencyLifecycle');
});
test('3072 fresh ordered exact-old/new cases preserve reads, receivers, awaits, iterable and Set identities and failures', async () => {
  const outcomes = new Map(),
    operations = new Map();
  for (let seed = 0; seed < 3072; seed++) {
    const old = await observeLifecycle(frozen, seed);
    assert.deepEqual(await observeLifecycle(api, seed), old, 'Differential seed ' + seed);
    outcomes.set(old.outcome.kind, (outcomes.get(old.outcome.kind) ?? 0) + 1);
    operations.set(old.operation, (operations.get(old.operation) ?? 0) + 1);
  }
  for (const operation of ['content', 'deleted', 'before']) assert.equal(operations.get(operation), 1024);
  for (const outcome of ['fulfilled', 'marker', 'AppError', 'TypeError'])
    assert.ok(outcomes.get(outcome) > 5, 'Missing differential outcome ' + outcome);
});
const mutations = [
  ['annotation factory eagerly created', '  return {', '  createAnnotationService();\n  return {'],
  [
    'synchronous annotation factory incorrectly awaited',
    'const transactionAnnotationService = createAnnotationService();',
    'const transactionAnnotationService = await createAnnotationService();'
  ],
  [
    'reconcile await omitted',
    'const reconciliation = await transactionAnnotationService',
    'const reconciliation = transactionAnnotationService'
  ],
  [
    'annotation lookup await omitted',
    'const annotation = await contentAnnotationRepository',
    'const annotation = contentAnnotationRepository'
  ],
  [
    'annotation evidence await omitted',
    'changed.push(...await knowledgeItemService',
    'changed.push(...knowledgeItemService'
  ],
  [
    'version IDs await omitted',
    '(await noteVersionRepository.listIds({ noteId: note.id }))',
    '(noteVersionRepository.listIds({ noteId: note.id }))'
  ],
  [
    'direct evidence await omitted',
    'const directEvidence = await knowledgeItemService',
    'const directEvidence = knowledgeItemService'
  ],
  [
    'deleted evidence await omitted',
    'const changed = await knowledgeItemService',
    'const changed = knowledgeItemService'
  ],
  [
    'version records await omitted',
    'const versions = await noteVersionRepository',
    'const versions = noteVersionRepository',
    2
  ],
  [
    'formal evidence await omitted',
    '(await knowledgeEvidenceRepository.list({ noteId }))',
    '(knowledgeEvidenceRepository.list({ noteId }))'
  ],
  [
    'question source await omitted',
    'const sources = await questionSourceRepository',
    'const sources = questionSourceRepository'
  ],
  [
    'analysis scopes await omitted',
    'const snapshots = await analysisScopeRepository',
    'const snapshots = analysisScopeRepository'
  ],
  [
    'all question notifications lose await',
    'await questionService.markSourcesStale',
    'questionService.markSourcesStale',
    5
  ],
  [
    'final question notification loses await',
    "await questionService.markSourcesStale('noteVersion', oldVersionIds);",
    "questionService.markSourcesStale('noteVersion', oldVersionIds);"
  ],
  [
    'annotation loop parallelized',
    '      for (const annotationId of reconciliation.contentChangedAnnotationIds) {',
    '      await Promise.all(Array.from(reconciliation.contentChangedAnnotationIds, async (annotationId) => {',
    1,
    'parallel'
  ],
  [
    'annotation IDs deduplicated',
    'of reconciliation.contentChangedAnnotationIds)',
    'of new Set(reconciliation.contentChangedAnnotationIds))'
  ],
  [
    'annotation iterator eagerly materialized',
    'of reconciliation.contentChangedAnnotationIds)',
    'of Array.from(reconciliation.contentChangedAnnotationIds))'
  ],
  [
    'annotation iterator restricted to arrays',
    'of reconciliation.contentChangedAnnotationIds)',
    'of (Array.isArray(reconciliation.contentChangedAnnotationIds) ? reconciliation.contentChangedAnnotationIds : []))'
  ],
  [
    'sparse annotation IDs filtered',
    'of reconciliation.contentChangedAnnotationIds)',
    'of reconciliation.contentChangedAnnotationIds.filter(Boolean))'
  ],
  [
    'spread replaced by flatMap-like accumulation',
    'changed.push(...await knowledgeItemService.markEvidenceByAnnotationId(annotationId,',
    'changed.push(...[].concat(await knowledgeItemService.markEvidenceByAnnotationId(annotationId,',
    1,
    'flatmap'
  ],
  [
    'spread evidence replaced by array flatMap',
    'changed.push(...await knowledgeItemService.markEvidenceByAnnotationId(annotationId,',
    'changed.push(...(await knowledgeItemService.markEvidenceByAnnotationId(annotationId,',
    1,
    'actual-flatmap'
  ],
  [
    'sparse spread evidence filtered',
    'changed.push(...await knowledgeItemService.markEvidenceByAnnotationId(annotationId,',
    'changed.push(...(await knowledgeItemService.markEvidenceByAnnotationId(annotationId,',
    1,
    'filter-evidence'
  ],
  [
    'annotation missing status widened to all truthy values',
    "annotation?.anchorStatus === 'missing'",
    'annotation?.anchorStatus'
  ],
  ['annotation missing status narrowed incorrectly', "? 'insufficient' : 'stale'", "? 'stale' : 'stale'"],
  [
    'old-version IDs deduplicated',
    'const directEvidence = await knowledgeItemService.markEvidenceByNoteVersionIds(oldVersionIds,',
    'const directEvidence = await knowledgeItemService.markEvidenceByNoteVersionIds([...new Set(oldVersionIds)],'
  ],
  ['old-version ID inequality changed to loose equality', 'id !== version.id', 'id != version.id'],
  ['old-version ID comparison changed to SameValueZero', 'id !== version.id', '!new Set([version.id]).has(id)'],
  [
    'note IDs cached before reconcile',
    '      const transactionAnnotationService =',
    '      const noteId = note.id;\n      const transactionAnnotationService =',
    1,
    'cache-note'
  ],
  [
    'version ID cached before filter',
    '      const oldVersionIds =',
    '      const versionId = version.id;\n      const oldVersionIds =',
    1,
    'cache-version'
  ],
  [
    'old-version array cloned before service can mutate it',
    'markEvidenceByNoteVersionIds(oldVersionIds,',
    'markEvidenceByNoteVersionIds([...oldVersionIds],'
  ],
  [
    'final question IDs cloned',
    "markSourcesStale('noteVersion', oldVersionIds)",
    "markSourcesStale('noteVersion', [...oldVersionIds])"
  ],
  [
    'old-version direct evidence cascade omitted',
    "const directEvidence = await knowledgeItemService.markEvidenceByNoteVersionIds(oldVersionIds, 'stale', 'noteVersion');",
    'const directEvidence = [];'
  ],
  [
    'empty evidence notification skipped',
    "await questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));",
    "if (changed.length) await questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));",
    2
  ],
  ['source type made coercive', "source.sourceType === 'noteVersion'", "source.sourceType == 'noteVersion'"],
  [
    'source type gate removed',
    "source.sourceType === 'noteVersion'\n        && versionIds.has(source.sourceId)",
    'versionIds.has(source.sourceId)'
  ],
  [
    'Set membership uses indexOf instead of SameValueZero',
    'versionIds.has(source.sourceId)',
    '[...versionIds].indexOf(source.sourceId) !== -1'
  ],
  [
    'version Set keys stringified',
    'new Set(versions.map((version) => version.id))',
    'new Set(versions.map((version) => String(version.id)))',
    1,
    'string-set'
  ],
  ['permanent evidence length condition changed to truthy', '.length > 0)', '.length)'],
  [
    'permanent source some result forced to literal true',
    'if (sources.some((source) => (',
    'if (true === sources.some((source) => ('
  ],
  [
    'custom filter result replaced with Array conversion',
    '(await noteVersionRepository.listIds({ noteId: note.id })).filter',
    'Array.from(await noteVersionRepository.listIds({ noteId: note.id })).filter'
  ],
  [
    'custom map view replaced with Array conversion',
    'directEvidence.map((record) => record.id)',
    'Array.from(directEvidence).map((record) => record.id)'
  ],
  [
    'custom source some view replaced with Array conversion',
    'sources.some((source)',
    'Array.from(sources).some((source)'
  ],
  ['scope nullish optional list no longer optional', 'snapshot.noteVersions?.some', 'snapshot.noteVersions.some'],
  ['scope noteId comparison changed to loose equality', 'version.noteId === noteId', 'version.noteId == noteId'],
  [
    'scope condition order reverses getter short circuit',
    'version.noteId === noteId || versionIds.has(version.noteVersionId)',
    'versionIds.has(version.noteVersionId) || version.noteId === noteId'
  ],
  [
    'captured question method detached from receiver',
    'questionService.markSourcesStale(',
    '(0, questionService.markSourcesStale)(',
    5
  ],
  [
    'question method cached at construction',
    '  return {',
    '  const notify = questionService.markSourcesStale;\n  return {',
    1,
    'cache-method'
  ],
  ['factory rebound to an object receiver', 'createAnnotationService();', 'createAnnotationService.call({});'],
  ['deleted status changed', "markEvidenceByNoteId(noteId, 'invalid')", "markEvidenceByNoteId(noteId, 'stale')"],
  ['conflict code altered', "'NOTE_HAS_QUESTION_SOURCE'", "'NOTE_HAS_OTHER_SOURCE'"],
  [
    'conflict message altered',
    "'Note has formal knowledge evidence and cannot be permanently deleted'",
    "'Evidence exists'"
  ],
  [
    'question guard moved before evidence guard',
    '      if ((await knowledgeEvidenceRepository.list({ noteId })).length > 0) {',
    '      if ((await knowledgeEvidenceRepository.list({ noteId })).length > 0) {',
    1,
    'priority'
  ],
  [
    'callback incorrectly returns final collaborator entity',
    "await questionService.markSourcesStale('noteVersion', oldVersionIds);",
    "return await questionService.markSourcesStale('noteVersion', oldVersionIds);"
  ],
  [
    'annotation evidence IDs processed backwards',
    'changed.map((evidence) => evidence.id)',
    'changed.slice().reverse().map((evidence) => evidence.id)',
    2
  ]
];
for (const [label, from, to, expected = 1, special] of mutations)
  test('fixed assertions kill parsed executable mutant: ' + label, async t => {
    assert.equal(lifecycleFrozenSource.split(from).length - 1, expected, 'Exact mutation anchor: ' + label);
    let changed = lifecycleFrozenSource.replaceAll(from, to);
    if (special === 'parallel')
      changed = changed.replace('      }\n      await questionService', '      }));\n      await questionService');
    if (special === 'flatmap')
      changed = changed.replace("? 'insufficient' : 'stale'));", "? 'insufficient' : 'stale')));");
    if (special === 'actual-flatmap')
      changed = changed.replace(
        "? 'insufficient' : 'stale'));",
        "? 'insufficient' : 'stale')).flatMap(record => record));"
      );
    if (special === 'filter-evidence')
      changed = changed.replace("? 'insufficient' : 'stale'));", "? 'insufficient' : 'stale')).filter(Boolean));");
    if (special === 'cache-note')
      changed = changed.replaceAll('note.id', 'noteId').replace('const noteId = noteId;', 'const noteId = note.id;');
    if (special === 'cache-version') changed = changed.replace('id !== version.id', 'id !== versionId');
    if (special === 'cache-method')
      changed = changed.replaceAll('questionService.markSourcesStale(', 'notify.call(questionService, ');
    if (special === 'string-set')
      changed = changed.replace('versionIds.has(source.sourceId)', 'versionIds.has(String(source.sourceId))');
    if (special === 'priority') {
      const start = changed.indexOf('      if ((await knowledgeEvidenceRepository');
      const end = changed.indexOf('      const versions =', start);
      const evidence = changed.slice(start, end);
      changed = changed.slice(0, start) + changed.slice(end);
      changed = changed.replace('      const snapshots =', evidence + '      const snapshots =');
    }
    // 必须先成功解析并实际导入。语法错误/导入失败不能充当行为变异检出。
    executableAst(changed);
    const mutant = await loadSource(changed, label);
    assert.equal(typeof mutant.createAsyncNoteDependencyLifecycle, 'function');
    let killedBy;
    for (const entry of lifecycleContractCases(mutant)) {
      try {
        await assert.doesNotReject(async () => entry.run());
      } catch (error) {
        assert.equal(error.name, 'AssertionError');
        killedBy = entry.name;
        break;
      }
    }
    assert.ok(killedBy, 'Live mutation: ' + label);
    t.diagnostic('Behavior assertion: ' + killedBy);
  });
if (!baseline) {
  for (const entry of lifecycleConsumerCases(api)) test(entry.name, entry.run);
  const { noteDependencyLifecycleTests } = await import('./note-dependency-lifecycle.test.js');
  for (const entry of noteDependencyLifecycleTests) test('existing targeted .run: ' + entry.name, entry.run);
}
