import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { parse } from '@babel/parser';
import {
  referenceParent,
  referenceFrozenSource,
  referenceContractCases,
  referenceConsumerCases,
  observeReference,
  hash
} from './async-navigation-reference-policy.contract-support.js';

const baseline = process.env.KNOWRA_ASYNC_REFERENCE_BASELINE === '1';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/modules/knowledge/application/postgres-async/navigation-reference-policy.js';
const sourceUrl = new URL(helper, root);
const sourceHash = '52d1051688f5b7cb839da02dae11071c6c786ad80cbd7a3eeb3a5bb50f045868';
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
  ? execFileSync('git', ['show', `${referenceParent}:${helper}`], { cwd: root, encoding: 'utf8' })
  : null;
const api = baseline ? await loadSource(historical, 'exact-parent') : await import(sourceUrl);
const frozen = await loadSource(referenceFrozenSource, 'frozen-parent');
const executable = baseline
  ? historical
  : stripTypeScriptTypes(readFileSync(new URL(helper.replace(/\.js$/, '.ts'), root), 'utf8'));
for (const entry of referenceContractCases(api)) test(entry.name, entry.run);
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
  assert.equal(referenceParent, '4e24fd58e7aef9000efe0b1a6467df7f07afae94');
  assert.equal(hash(referenceFrozenSource), sourceHash);
  if (baseline) assert.equal(historical, referenceFrozenSource);
});
test('Node official erasure preserves full ordered runtime AST and every original import', { skip: baseline }, () => {
  assert.deepEqual(executableAst(executable), executableAst(referenceFrozenSource));
});
test('JS bridge exports only the identical TS policy factory', { skip: baseline }, async () => {
  const typed = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(api), ['createAsyncNavigationReferencePolicy']);
  assert.deepEqual(Object.keys(typed), ['createAsyncNavigationReferencePolicy']);
  assert.equal(api.createAsyncNavigationReferencePolicy, typed.createAsyncNavigationReferencePolicy);
  const program = parse(readFileSync(sourceUrl, 'utf8'), { sourceType: 'module' }).program;
  assert.deepEqual(program.directives, []);
  assert.equal(program.body.length, 1);
  const statement = program.body[0];
  assert.equal(statement.type, 'ExportNamedDeclaration');
  assert.equal(statement.declaration, null);
  assert.equal(statement.source.value, './navigation-reference-policy.ts');
  assert.equal(statement.specifiers.length, 1);
  assert.equal(statement.specifiers[0].type, 'ExportSpecifier');
  assert.equal(statement.specifiers[0].local.name, 'createAsyncNavigationReferencePolicy');
  assert.equal(statement.specifiers[0].exported.name, 'createAsyncNavigationReferencePolicy');
});
test('2048 fresh ordered exact-old/new cases preserve reads, receivers, awaits, Map identities and failures', async () => {
  const outcomes = new Map(),
    operations = new Map();
  for (let seed = 0; seed < 2048; seed++) {
    const old = await observeReference(frozen, seed);
    assert.deepEqual(await observeReference(api, seed), old, 'Differential seed ' + seed);
    outcomes.set(old.outcome.kind, (outcomes.get(old.outcome.kind) ?? 0) + 1);
    operations.set(old.operation, (operations.get(old.operation) ?? 0) + 1);
  }
  for (const operation of ['space', 'note', 'group', 'normalize']) assert.equal(operations.get(operation), 512);
  for (const outcome of ['fulfilled', 'marker', 'AppError', 'TypeError'])
    assert.ok(outcomes.get(outcome) > 5, 'Missing differential outcome ' + outcome);
});
const mutations = [
  [
    'assert input Array.from materialization',
    'tagRepository.findByIds(tagIds ?? [])',
    'tagRepository.findByIds(Array.from(tagIds ?? []))'
  ],
  [
    'assert input eagerly deduplicated',
    'tagRepository.findByIds(tagIds ?? [])',
    'tagRepository.findByIds([...new Set(tagIds ?? [])])'
  ],
  [
    'assert replays one-shot input',
    "    await assertSpaceReference(spaceId, 'NOTE');",
    "    tagIds = [...(tagIds ?? [])];\n    await assertSpaceReference(spaceId, 'NOTE');"
  ],
  ['normalization forgets Set deduplication', '[...new Set(tagIds)]', '[...(tagIds ?? [])]'],
  [
    'space await removed',
    '!(await knowledgeSpaceRepository.findById(spaceId))',
    '!knowledgeSpaceRepository.findById(spaceId)'
  ],
  [
    'folder await removed',
    'const folder = await folderRepository.findById(folderId);',
    'const folder = folderRepository.findById(folderId);'
  ],
  [
    'assert batch await removed',
    'const tags = await tagRepository.findByIds(tagIds ?? []);',
    'const tags = tagRepository.findByIds(tagIds ?? []);'
  ],
  [
    'normalize batch await removed',
    'const tags = await tagRepository.findByIds(uniqueIds);',
    'const tags = tagRepository.findByIds(uniqueIds);'
  ],
  [
    'normalization group await removed',
    'tag?.groupId ? await tagGroupRepository.findById(tag.groupId) : null',
    'tag?.groupId ? tagGroupRepository.findById(tag.groupId) : null'
  ],
  [
    'tag-group reference await removed',
    'const group = await tagGroupRepository.findById(groupId);',
    'const group = tagGroupRepository.findById(groupId);'
  ],
  [
    'groups looked up eagerly in parallel',
    '    for (const tagId of uniqueIds) {',
    '    const prefetched = new Map(await Promise.all(uniqueIds.map(async id => [id, byId.get(id)?.groupId ? await tagGroupRepository.findById(byId.get(id).groupId) : null])));\n    for (const tagId of uniqueIds) {',
    'parallel'
  ],
  [
    'tag groupId getter cached',
    '      const group = tag?.groupId ? await tagGroupRepository.findById(tag.groupId) : null;',
    '      const groupId = tag?.groupId;\n      const group = groupId ? await tagGroupRepository.findById(groupId) : null;'
  ],
  [
    'resolved group id getter cached',
    '        const previous = singleIndexes.get(group.id);',
    '        const groupId = group.id;\n        const previous = singleIndexes.get(groupId);',
    'cache-group'
  ],
  [
    'single group first entry retained',
    'if (previous !== undefined) normalized[previous] = null;',
    'if (previous !== undefined) continue;'
  ],
  ['single group zero index ignored', 'if (previous !== undefined)', 'if (previous)'],
  [
    'single group keyed by request ID instead of returned ID',
    'singleIndexes.get(group.id)',
    'singleIndexes.get(tag.groupId)',
    'request-group'
  ],
  [
    'async assert incorrectly validates single group conflict',
    '    for (const tagId of tagIds ?? []) {',
    "    if ((tagIds ?? []).length > 1) throw validationError('TAG_GROUP_SINGLE_SELECTION', 'Only one tag may be selected from this group');\n    for (const tagId of tagIds ?? []) {"
  ],
  ['Map tag IDs stringified', '[tag.id, tag]', '[String(tag.id), tag]', 'string-map'],
  [
    'Map duplicate returned rows first-win',
    'tags.map((tag) => [tag.id, tag])',
    'tags.slice().reverse().map((tag) => [tag.id, tag])'
  ],
  [
    'Boolean filter changed to strings',
    'normalized.filter(Boolean)',
    "normalized.filter(value => typeof value === 'string' && value)"
  ],
  ['Boolean filter removed', 'normalized.filter(Boolean)', 'normalized'],
  [
    'group query result cached across tags',
    '    const singleIndexes = new Map();',
    '    const singleIndexes = new Map();\n    const groupCache = new Map();',
    'cache-result'
  ],
  [
    'space repository rejection swallowed',
    'await knowledgeSpaceRepository.findById(spaceId)',
    'await Promise.resolve(knowledgeSpaceRepository.findById(spaceId)).catch(() => null)'
  ],
  ['space guard converted to null-only', 'if (!spaceId ||', 'if (spaceId == null ||'],
  ['folder guard converted to null-only', 'if (folderId)', 'if (folderId != null)'],
  ['tag-group guard converted to null-only', 'if (!groupId) return;', 'if (groupId == null) return;'],
  ['folder spaces loosely compared', 'folder.spaceId !== spaceId', 'folder.spaceId != spaceId'],
  ['tag spaces loosely compared', 'tag.spaceId !== spaceId', 'tag.spaceId != spaceId'],
  ['group spaces loosely compared', 'group.spaceId !== spaceId', 'group.spaceId != spaceId'],
  ['group selection truthy instead of exact single', "group?.selectionMode === 'single'", 'group?.selectionMode'],
  [
    'note input processed in reverse order',
    'for (const tagId of tagIds ?? [])',
    'for (const tagId of [...(tagIds ?? [])].reverse())'
  ],
  [
    'missing tag validation omitted',
    "      if (!tag) throw validationError('NOTE_TAG_NOT_FOUND', 'A referenced tag does not exist');",
    '      if (!tag) continue;'
  ],
  ['space validation moved after tags', "    await assertSpaceReference(spaceId, 'NOTE');", '', 'late-space'],
  [
    'batch method detached from receiver',
    'tagRepository.findByIds(tagIds ?? [])',
    '(0, tagRepository.findByIds)(tagIds ?? [])'
  ],
  [
    'group method cached at construction',
    '  async function assertSpaceReference',
    '  const findGroup = tagGroupRepository.findById;\n  async function assertSpaceReference',
    'cache-method'
  ],
  ['tag-group missing error code changed', "validationError('TAG_GROUP_NOT_FOUND'", "validationError('OTHER'"],
  ['space error message changed', "'The referenced knowledge space does not exist'", "'Missing space'"],
  ['normalize unknown IDs dropped', '      normalized.push(tagId);', '      if (tag) normalized.push(tagId);']
];
for (const [label, from, to, special] of mutations)
  test('fixed assertions kill parsed executable mutant: ' + label, async t => {
    const expected = from === '[tag.id, tag]' || from === 'tags.map((tag) => [tag.id, tag])' ? 2 : 1;
    assert.equal(referenceFrozenSource.split(from).length - 1, expected, 'Exact mutation anchor: ' + label);
    let changed = referenceFrozenSource.replaceAll(from, to);
    if (special === 'parallel')
      changed = changed.replace(
        'tag?.groupId ? await tagGroupRepository.findById(tag.groupId) : null',
        'prefetched.get(tagId)'
      );
    if (special === 'cache-group')
      changed = changed.replace(
        'singleIndexes.set(group.id, normalized.length)',
        'singleIndexes.set(groupId, normalized.length)'
      );
    if (special === 'request-group')
      changed = changed.replace(
        'singleIndexes.set(group.id, normalized.length)',
        'singleIndexes.set(tag.groupId, normalized.length)'
      );
    if (special === 'string-map') changed = changed.replaceAll('.get(tagId)', '.get(String(tagId))');
    if (special === 'cache-result')
      changed = changed.replace(
        'await tagGroupRepository.findById(tag.groupId)',
        '(groupCache.has(tag.groupId) ? groupCache.get(tag.groupId) : (groupCache.set(tag.groupId, await tagGroupRepository.findById(tag.groupId)), groupCache.get(tag.groupId)))'
      );
    if (special === 'late-space')
      changed = changed.replace(
        '    const tagMap =',
        "    await assertSpaceReference(spaceId, 'NOTE');\n    const tagMap ="
      );
    if (special === 'cache-method')
      changed = changed.replaceAll('tagGroupRepository.findById(', 'findGroup.call(tagGroupRepository, ');
    // 解析和导入在捕获以外，语法或依赖加载失败不能冒充行为变异检出。
    executableAst(changed);
    const mutant = await loadSource(changed, label);
    assert.equal(typeof mutant.createAsyncNavigationReferencePolicy, 'function');
    let killedBy;
    for (const entry of referenceContractCases(mutant)) {
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
// 真实现行消费者仅在普通模式执行，不将其冒充准确父完整依赖树。
if (!baseline) {
  for (const entry of referenceConsumerCases(api)) test(entry.name, entry.run);
  for (const [path, key] of [
    ['./navigation-reference-policy.test.js', 'navigationReferencePolicyTests'],
    ['./tag-system.test.js', 'tagSystemTests'],
    ['./tag-repository.test.js', 'tagRepositoryTests']
  ]) {
    const suite = await import(path);
    for (const entry of suite[key]) test('existing targeted .run: ' + entry.name, entry.run);
  }
}
