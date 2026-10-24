import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { parse } from '@babel/parser';
import {
  tagGroupParent,
  tagGroupFrozenSource,
  tagGroupContractCases,
  tagGroupConsumerCases,
  tagGroupBoundaryCases,
  observeTagGroup,
  hash
} from './async-tag-group-service.contract-support.js';

const baseline = process.env.KNOWRA_ASYNC_TAG_GROUP_BASELINE === '1';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/modules/knowledge/application/postgres-async/tag-group-service.js';
const sourceUrl = new URL(helper, root);
const sourceHash = 'c6b2601b14dc662301620cad14dbfa6db525953a069a716df9a8eb29c63a9c6d';
let loadCount = 0;
const boundaryKey = Symbol.for('knowra-batch54-tag-group-boundary');
async function loadSource(source, label, instrument = false) {
  let rewritten = source;
  for (const dependency of ['../../domain/tag-group.js', '../dto/tag-group.dto.js', '../knowledge-errors.js']) {
    const specifier = "'" + dependency + "'";
    assert.equal(rewritten.split(specifier).length, 2, 'Exact existing dependency: ' + dependency);
    const boundarySources = {
      '../../domain/tag-group.js':
        "export class TagGroup { constructor(value) { return globalThis[Symbol.for('knowra-batch54-tag-group-boundary')].model(value); } }",
      '../dto/tag-group.dto.js':
        "export const buildCreateTagGroupDto = value => globalThis[Symbol.for('knowra-batch54-tag-group-boundary')].createDto(value); export const buildUpdateTagGroupDto = value => globalThis[Symbol.for('knowra-batch54-tag-group-boundary')].updateDto(value);"
    };
    const url =
      instrument && boundarySources[dependency]
        ? 'data:text/javascript;base64,' + Buffer.from(boundarySources[dependency]).toString('base64')
        : new URL(dependency, sourceUrl).href;
    rewritten = rewritten.replace(specifier, JSON.stringify(url));
  }
  return import(
    'data:text/javascript;base64,' + Buffer.from(rewritten + `\n// ${label} ${++loadCount}`).toString('base64')
  );
}
// 普通模式零 Git；显式模式只允许准确实际父对象，缺失即失败，禁止回退。
const historical = baseline
  ? execFileSync('git', ['show', `${tagGroupParent}:${helper}`], { cwd: root, encoding: 'utf8' })
  : null;
const api = baseline ? await loadSource(historical, 'exact-parent') : await import(sourceUrl);
const frozen = await loadSource(tagGroupFrozenSource, 'frozen-parent');
const executable = baseline
  ? historical
  : stripTypeScriptTypes(readFileSync(new URL(helper.replace(/\.js$/, '.ts'), root), 'utf8'));
for (const entry of tagGroupContractCases(api)) test(entry.name, entry.run);
async function withBoundary(boundary, operation) {
  const before = globalThis[boundaryKey];
  globalThis[boundaryKey] = boundary;
  try {
    return await operation();
  } finally {
    if (before === undefined) delete globalThis[boundaryKey];
    else globalThis[boundaryKey] = before;
  }
}
const boundaryApi = await loadSource(executable, 'candidate-boundary', true);
for (const entry of tagGroupBoundaryCases(boundaryApi, withBoundary)) test(entry.name, entry.run);

test('frozen source matches independently recorded exact-parent SHA256', () => {
  assert.equal(hash(tagGroupFrozenSource), sourceHash);
  assert.equal(tagGroupFrozenSource.split('\n').length - 1, 14);
  if (baseline) assert.equal(historical, tagGroupFrozenSource);
});
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
test(
  'Node official TS erasure preserves complete ordered executable AST without import rewrites',
  { skip: baseline },
  () => {
    assert.deepEqual(executableAst(executable), executableAst(tagGroupFrozenSource));
  }
);
test('JS bridge is the sole exact same-identity TS factory re-export', { skip: baseline }, async () => {
  const typed = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(api), ['createAsyncTagGroupService']);
  assert.deepEqual(Object.keys(typed), ['createAsyncTagGroupService']);
  assert.equal(api.createAsyncTagGroupService, typed.createAsyncTagGroupService);
  const program = parse(readFileSync(sourceUrl, 'utf8'), { sourceType: 'module' }).program;
  assert.deepEqual(program.directives, []);
  assert.equal(program.body.length, 1);
  const statement = program.body[0];
  assert.equal(statement.type, 'ExportNamedDeclaration');
  assert.equal(statement.declaration, null);
  assert.equal(statement.source.value, './tag-group-service.ts');
  assert.equal(statement.specifiers.length, 1);
  assert.equal(statement.specifiers[0].type, 'ExportSpecifier');
  assert.equal(statement.specifiers[0].local.name, 'createAsyncTagGroupService');
  assert.equal(statement.specifiers[0].exported.name, 'createAsyncTagGroupService');
});

test('3072 fresh ordered old/new cases preserve calls, getters, thenables, native errors and write inputs', async () => {
  const outcomes = new Map(),
    operations = new Map();
  for (let seed = 0; seed < 3072; seed++) {
    const expected = await observeTagGroup(frozen, seed);
    assert.deepEqual(await observeTagGroup(api, seed), expected, 'Differential seed ' + seed);
    const kind = expected.outcome.identity ?? expected.outcome.name ?? expected.outcome.kind;
    outcomes.set(kind, (outcomes.get(kind) ?? 0) + 1);
    operations.set(expected.operation, (operations.get(expected.operation) ?? 0) + 1);
  }
  for (const operation of ['createTagGroup', 'updateTagGroup', 'deleteTagGroup', 'listTagGroups'])
    assert.equal(operations.get(operation), 768);
  for (const kind of ['created', 'saved', 'current', 'marker', 'TypeError', 'AppError', 'list'])
    assert.ok(outcomes.get(kind) > 5, 'Missing differential outcome: ' + kind);
});

const mutations = [
  ['list made async', '    listTagGroups(options = {})', '    async listTagGroups(options = {})'],
  ['list clones options', 'return repository.list(options);', 'return repository.list({ ...options });'],
  ['list wraps result', 'return repository.list(options);', 'return Promise.resolve(repository.list(options));'],
  [
    'list default object shared',
    'export function createAsyncTagGroupService(',
    'const sharedOptions = {};\nexport function createAsyncTagGroupService(',
    'shared-options'
  ],
  ['create find await removed', 'if (await repository.findById(dto.id))', 'if (repository.findById(dto.id))'],
  [
    'require find await removed',
    'const group = await repository.findById(id);',
    'const group = repository.findById(id);'
  ],
  ['validator await removed', 'await validateSpaceReference?.(dto.spaceId);', 'validateSpaceReference?.(dto.spaceId);'],
  ['validator omitted', 'await validateSpaceReference?.(dto.spaceId);', ''],
  [
    'validator rebound to repository',
    'await validateSpaceReference?.(dto.spaceId);',
    'await validateSpaceReference?.call(repository, dto.spaceId);'
  ],
  [
    'null validator made mandatory',
    'await validateSpaceReference?.(dto.spaceId);',
    'await validateSpaceReference(dto.spaceId);'
  ],
  [
    'name check moved before validator',
    'await validateSpaceReference?.(dto.spaceId); await assertName(dto.spaceId, dto.name);',
    'await assertName(dto.spaceId, dto.name); await validateSpaceReference?.(dto.spaceId);'
  ],
  [
    'create returns constructed model not arbitrary result',
    'return repository.create(new TagGroup(dto));',
    'const model = new TagGroup(dto); await repository.create(model); return model;'
  ],
  [
    'update returns constructed model not arbitrary result',
    'return repository.save(new TagGroup({ ...current, ...dto, id: current.id, spaceId: current.spaceId }));',
    'const model = new TagGroup({ ...current, ...dto, id: current.id, spaceId: current.spaceId }); await repository.save(model); return model;'
  ],
  ['delete await removed', 'await repository.delete(id);', 'repository.delete(id);'],
  ['delete returns repository result', 'await repository.delete(id); return current;', 'return repository.delete(id);'],
  [
    'delete returns copied current',
    'await repository.delete(id); return current;',
    'await repository.delete(id); return { ...current };'
  ],
  [
    'update refreshes updatedAt',
    '...dto, id: current.id, spaceId: current.spaceId',
    '...dto, updatedAt: new Date().toISOString(), id: current.id, spaceId: current.spaceId'
  ],
  [
    'update DTO precedes existence check',
    'const current = await requireGroup(id); const dto = buildUpdateTagGroupDto(updates);',
    'const dto = buildUpdateTagGroupDto(updates); const current = await requireGroup(id);'
  ],
  [
    'update excludes record ID not requested ID',
    'await assertName(current.spaceId, dto.name, id)',
    'await assertName(current.spaceId, dto.name, current.id)'
  ],
  ['default excluded ID changed to undefined', 'currentId = null', 'currentId = undefined'],
  ['name IDs loosely compared', 'group.id !== currentId', 'group.id != currentId'],
  ['tag IDs loosely compared', 'tag.groupId === id', 'tag.groupId == id'],
  ['required record checks only null', 'if (!group)', 'if (group === null)'],
  ['system guard requires literal true', 'if (current.isSystem)', 'if (current.isSystem === true)'],
  [
    'system guard omitted',
    "if (current.isSystem) throw conflictError('SYSTEM_TAG_GROUP_PROTECTED', 'System tag groups cannot be deleted');",
    ''
  ],
  ['name comparison trim removed', 'group.name.trim().toLocaleLowerCase()', 'group.name.toLocaleLowerCase()'],
  ['name comparison locale lowercase removed', 'group.name.trim().toLocaleLowerCase()', 'group.name.trim()'],
  [
    'name some result requires literal true',
    'if ((await repository.list({ spaceId })).some((group) => group.id !== currentId && group.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()))',
    'if ((await repository.list({ spaceId })).some((group) => group.id !== currentId && group.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()) === true)'
  ],
  ['name guard changed from truthy to present', 'if (dto.name)', 'if (dto.name !== undefined)'],
  [
    'selection guard changed from truthy to present',
    'if (dto.selectionMode &&',
    'if (dto.selectionMode !== undefined &&'
  ],
  ['unchanged selection no longer short circuits', 'dto.selectionMode !== current.selectionMode && ', ''],
  [
    'update spread order reversed',
    '{ ...current, ...dto, id: current.id, spaceId: current.spaceId }',
    '{ ...dto, ...current, id: current.id, spaceId: current.spaceId }'
  ],
  [
    'update explicit identity overrides omitted',
    '{ ...current, ...dto, id: current.id, spaceId: current.spaceId }',
    '{ ...current, ...dto }'
  ],
  ['delete coerces request ID', 'await repository.delete(id);', 'await repository.delete(String(id));'],
  [
    'repository methods cached at factory',
    '  async function requireGroup',
    '  const cachedList = repository.list;\n  async function requireGroup',
    'cache-list'
  ],
  [
    'create DTO cached space getter',
    'const dto = buildCreateTagGroupDto(input);',
    'const dto = buildCreateTagGroupDto(input); const spaceId = dto.spaceId;',
    'cache-space'
  ],
  [
    'update caches current ID and space before spread',
    'const current = await requireGroup(id); const dto',
    'const current = await requireGroup(id); const currentId = current.id, currentSpace = current.spaceId; const dto',
    'cache-record'
  ],
  [
    'missing group code changed',
    "notFoundError('TAG_GROUP_NOT_FOUND', 'Tag group not found')",
    "notFoundError('OTHER', 'Tag group not found')"
  ],
  ['duplicate ID message changed', "'A tag group with the same id already exists'", "'Duplicate'"],
  ['save member receiver detached', 'return repository.save(new TagGroup', 'return (0, repository.save)(new TagGroup']
];
for (const [label, from, to, special] of mutations)
  test('fixed assertions kill valid executable mutant: ' + label, async t => {
    const expectedAnchors = label === 'tag IDs loosely compared' ? 2 : 1;
    assert.equal(tagGroupFrozenSource.split(from).length - 1, expectedAnchors, 'Exact mutation anchor: ' + label);
    let changed = tagGroupFrozenSource.replaceAll(from, to);
    if (special === 'shared-options')
      changed = changed.replace('listTagGroups(options = {})', 'listTagGroups(options = sharedOptions)');
    if (special === 'cache-list') changed = changed.replaceAll('repository.list(', 'cachedList.call(repository, ');
    if (special === 'cache-space')
      changed = changed.replace(
        'validateSpaceReference?.(dto.spaceId); await assertName(dto.spaceId, dto.name)',
        'validateSpaceReference?.(spaceId); await assertName(spaceId, dto.name)'
      );
    if (special === 'cache-record')
      changed = changed.replace('id: current.id, spaceId: current.spaceId', 'id: currentId, spaceId: currentSpace');
    // 先独立解析并真正动态导入。语法/导入失败发生在捕获之外，不能冒充检出行为变异。
    executableAst(changed);
    const mutant = await loadSource(changed, label),
      boundaryMutant = await loadSource(changed, label + '-boundary', true);
    assert.equal(typeof mutant.createAsyncTagGroupService, 'function');
    const cases = [...tagGroupContractCases(mutant), ...tagGroupBoundaryCases(boundaryMutant, withBoundary)];
    let killedBy;
    for (const entry of cases) {
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

// 当前完整真实消费者仅在普通模式执行，不冒充准确父的完整历史依赖图。
if (!baseline) for (const entry of tagGroupConsumerCases(api)) test(entry.name, entry.run);
