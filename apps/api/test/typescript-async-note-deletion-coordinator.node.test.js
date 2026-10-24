import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { parse } from '@babel/parser';
import {
  deletionParent,
  deletionFrozenSource,
  deletionContractCases,
  deletionConsumerCases,
  observeDeletion,
  hash,
  deletionSourceSha
} from './async-note-deletion-coordinator.contract-support.js';

const baseline = process.env.KNOWRA_ASYNC_NOTE_DELETION_BASELINE === '1';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/modules/knowledge/application/postgres-async/note-deletion-coordinator.js';
const sourceUrl = new URL(helper, root);
let loadCount = 0;
async function loadSource(source, label) {
  source = source.replace(
    "'../../../../errors/app-error.js'",
    JSON.stringify(new URL('apps/api/src/errors/app-error.js', root).href)
  );
  return import(
    'data:text/javascript;base64,' + Buffer.from(source + `\n// ${label} ${++loadCount}`).toString('base64')
  );
}
// 普通入口零 Git；显式基线只读取准确实际父，缺失时失败，不回退候选或冻结文本。
const historical = baseline
  ? execFileSync('git', ['show', `${deletionParent}:${helper}`], { cwd: root, encoding: 'utf8' })
  : null;
const api = baseline ? await loadSource(historical, 'exact-parent') : await import(sourceUrl);
const frozen = await loadSource(deletionFrozenSource, 'frozen-parent');
const executable = baseline
  ? historical
  : stripTypeScriptTypes(readFileSync(new URL(helper.replace(/\.js$/, '.ts'), root), 'utf8'));
for (const entry of deletionContractCases(api)) test(entry.name, entry.run);
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
test('frozen exact actual-parent source matches independent SHA256', () => {
  assert.equal(deletionParent, 'dab7eea29d86cbcbf848e01c9324d82bc8242581');
  assert.equal(hash(deletionFrozenSource), deletionSourceSha);
  if (baseline) assert.equal(historical, deletionFrozenSource);
});
test('Node official erasure preserves complete ordered runtime AST', { skip: baseline }, () => {
  assert.deepEqual(executableAst(executable), executableAst(deletionFrozenSource));
});
test('JS bridge exports only the identical TS deletion factory', { skip: baseline }, async () => {
  const typed = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(api), ['createAsyncNoteDeletionCoordinator']);
  assert.deepEqual(Object.keys(typed), ['createAsyncNoteDeletionCoordinator']);
  assert.equal(api.createAsyncNoteDeletionCoordinator, typed.createAsyncNoteDeletionCoordinator);
  const program = parse(readFileSync(sourceUrl, 'utf8'), { sourceType: 'module' }).program;
  assert.deepEqual(program.directives, []);
  assert.equal(program.body.length, 1);
  const statement = program.body[0];
  assert.equal(statement.type, 'ExportNamedDeclaration');
  assert.equal(statement.declaration, null);
  assert.equal(statement.source.value, './note-deletion-coordinator.ts');
  assert.equal(statement.specifiers.length, 1);
  assert.equal(statement.specifiers[0].type, 'ExportSpecifier');
  assert.equal(statement.specifiers[0].local.name, 'createAsyncNoteDeletionCoordinator');
  assert.equal(statement.specifiers[0].exported.name, 'createAsyncNoteDeletionCoordinator');
});
test('2048 fresh ordered async old/new cases preserve reads receivers aliases and errors', async () => {
  const counts = new Map(),
    operations = new Map();
  for (let seed = 0; seed < 2048; seed++) {
    const old = await observeDeletion(frozen, seed);
    assert.deepEqual(await observeDeletion(api, seed), old, 'Differential seed ' + seed);
    counts.set(old.outcome.kind, (counts.get(old.outcome.kind) ?? 0) + 1);
    operations.set(old.operation, (operations.get(old.operation) ?? 0) + 1);
  }
  for (const method of ['permanentlyDeleteNote', 'emptyRecycleBin']) assert.equal(operations.get(method), 1024);
  for (const kind of ['identity', 'spread', 'primitive', 'sentinel', 'domain']) assert.ok(counts.get(kind) > 10, kind);
  assert.equal(counts.has('unexpected'), false);
});

const mutations = [
  ['skip prepare', 'await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);', '', 2],
  [
    'prepare no longer awaited',
    'await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);',
    'attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);',
    2
  ],
  [
    'prepare moved into permanent transaction',
    '    await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);\n    let detachedAttachments = [];\n    const deletedNote = await runTransaction(async () => {',
    '    let detachedAttachments = [];\n    const deletedNote = await runTransaction(async () => {\n      await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);',
    1
  ],
  [
    'prepare moved into recycle transaction',
    '    await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);\n    let detachedAttachments = [];\n    const result = await runTransaction(async () => {',
    '    let detachedAttachments = [];\n    const result = await runTransaction(async () => {\n      await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);',
    1
  ],
  [
    'skip permanent second attachment snapshot',
    'detachedAttachments = await collectAttachments([noteId]);',
    'detachedAttachments = queuedAttachments;',
    1
  ],
  [
    'skip recycle second attachment snapshot',
    'detachedAttachments = await collectAttachments(noteIds);',
    'detachedAttachments = queuedAttachments;',
    1
  ],
  ['skip attachment stale check', '      assertSameAttachments(queuedAttachments, detachedAttachments);', '', 2],
  [
    'skip permanent references',
    '      await assertNoRetainedAttachmentReferences(detachedAttachments, [noteId]);',
    '',
    1
  ],
  ['skip recycle references', '      await assertNoRetainedAttachmentReferences(detachedAttachments, noteIds);', '', 1],
  ['skip cleanup', 'attachmentStore?.removeDetachedAttachmentFiles?.(attachments)', '[]', 1],
  [
    'cleanup before transaction',
    '    const deletedNote = await runTransaction(async () => {',
    '    await finishAttachmentCleanup(detachedAttachments);\n    const deletedNote = await runTransaction(async () => {',
    1
  ],
  [
    'cleanup inside transaction',
    '      return noteService.permanentlyDeleteNote(noteId);',
    '      await finishAttachmentCleanup(detachedAttachments);\n      return noteService.permanentlyDeleteNote(noteId);',
    1
  ],
  [
    'omit cleanup nullish fallback',
    'return await attachmentStore?.removeDetachedAttachmentFiles?.(attachments) ?? [];',
    'return await attachmentStore?.removeDetachedAttachmentFiles?.(attachments);',
    1
  ],
  [
    'cleanup fallback occurs before await',
    'return await attachmentStore?.removeDetachedAttachmentFiles?.(attachments) ?? [];',
    'return attachmentStore?.removeDetachedAttachmentFiles?.(attachments) ?? [];',
    1
  ],
  [
    'omit attachment nullish fallback',
    'await attachmentStore?.listAttachments?.() ?? []',
    'await attachmentStore?.listAttachments?.()',
    1
  ],
  [
    'only cleanup nonempty attachments',
    'attachmentStore?.removeDetachedAttachmentFiles?.(attachments)',
    'attachments.length ? attachmentStore?.removeDetachedAttachmentFiles?.(attachments) : []',
    1
  ],
  [
    'only prepare nonempty attachments',
    'await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);',
    'if (queuedAttachments.length) await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);',
    2
  ],
  [
    'attachment Map size replaced by array length',
    'current.length !== expected.size',
    'current.length !== queued.length',
    1
  ],
  [
    'current duplicates treated as unique',
    'current.some(item => expected.get(item.id)',
    '[...new Map(current.map(item => [item.id, item])).values()].length !== current.length || current.some(item => expected.get(item.id)',
    1
  ],
  [
    'NUL delimiter collision is fixed',
    '`${item.storagePath}\\u0000${item.fileName}`',
    'JSON.stringify([item.storagePath,item.fileName])',
    2
  ],
  [
    'stringify attachment key',
    '[item.id, `${item.storagePath}\\u0000${item.fileName}`]',
    '[String(item.id), `${item.storagePath}\\u0000${item.fileName}`]',
    1
  ],
  ['ignore attachment filename', '`${item.storagePath}\\u0000${item.fileName}`', '`${item.storagePath}`', 2],
  [
    'reverse queued and current comparison',
    'assertSameAttachments(queuedAttachments, detachedAttachments)',
    'assertSameAttachments(detachedAttachments, queuedAttachments)',
    2
  ],
  [
    'note membership uses strict equality',
    'noteIdSet.has(attachment.noteId)',
    '[...noteIdSet].some(id => id === attachment.noteId)',
    1
  ],
  ['reference noteId falls back on false', 'reference.noteId ?? reference.id', 'reference.noteId || reference.id', 1],
  ['reference uses only id', 'reference.noteId ?? reference.id', 'reference.id', 1],
  ['allowed references narrowed', "['notes', 'noteVersions', 'contentAnnotations']", "['notes']", 1],
  [
    'reference guard removed',
    "['notes', 'noteVersions', 'contentAnnotations'].includes(reference.collection)\n        && noteIdSet.has(reference.noteId ?? reference.id)",
    'noteIdSet.has(reference.noteId ?? reference.id)',
    1
  ],
  [
    'reference guard order reversed',
    "['notes', 'noteVersions', 'contentAnnotations'].includes(reference.collection)\n        && noteIdSet.has(reference.noteId ?? reference.id)",
    "noteIdSet.has(reference.noteId ?? reference.id) && ['notes', 'noteVersions', 'contentAnnotations'].includes(reference.collection)",
    1
  ],
  ['reference retained length numeric only', 'if (retained.length)', 'if (retained.length > 0)', 1],
  [
    'permanent return await changes assimilation',
    'return noteService.permanentlyDeleteNote(noteId);',
    'return await noteService.permanentlyDeleteNote(noteId);',
    1
  ],
  [
    'recycle return await changes assimilation',
    'return noteService.emptyRecycleBin(spaceId);',
    'return await noteService.emptyRecycleBin(spaceId);',
    1
  ],
  [
    'recycle second snapshot skipped',
    'const deletedNotes = await noteRepository.list({ includeDeleted: true, spaceId });',
    'const deletedNotes = queuedNotes;',
    1
  ],
  [
    'recycle stale check skipped',
    "      if (noteIds.length !== queuedNoteIds.length || noteIds.some(id => !queuedNoteIds.includes(id))) {\n        throw createAppError('NOTE_DELETE_PREVIEW_STALE', '回收站内容已变化，请重新预检。', 409);\n      }",
    '',
    1
  ],
  [
    'recycle duplicate membership fixed',
    'noteIds.length !== queuedNoteIds.length || noteIds.some(id => !queuedNoteIds.includes(id))',
    'noteIds.length !== queuedNoteIds.length || new Set(noteIds).size !== new Set(queuedNoteIds).size || noteIds.some(id => !queuedNoteIds.includes(id))',
    1
  ],
  ['space default removed', 'emptyRecycleBin(spaceId = null)', 'emptyRecycleBin(spaceId)', 1],
  [
    'space normalized with truthiness',
    '{ includeDeleted: true, spaceId }',
    '{ includeDeleted: true, spaceId: spaceId || null }',
    2
  ],
  ['cleanup numeric truthiness', 'cleanup.length ?', 'cleanup.length > 0 ?', 2],
  [
    'cleanup result overwritten by old value',
    '{ ...deletedNote, attachmentCleanup: cleanup }',
    '{ attachmentCleanup: cleanup, ...deletedNote }',
    1
  ],
  [
    'recycle cleanup result overwritten by old value',
    '{ ...result, attachmentCleanup: cleanup }',
    '{ attachmentCleanup: cleanup, ...result }',
    1
  ],
  [
    'spread mutates original result',
    '{ ...deletedNote, attachmentCleanup: cleanup }',
    'Object.assign(deletedNote, { attachmentCleanup: cleanup })',
    1
  ],
  [
    'spread loses enumerable symbol',
    '{ ...deletedNote, attachmentCleanup: cleanup }',
    '{ ...Object.fromEntries(Object.entries(deletedNote)), attachmentCleanup: cleanup }',
    1
  ],
  [
    'service bare call loses receiver',
    'return noteService.permanentlyDeleteNote(noteId);',
    'return (0, noteService.permanentlyDeleteNote)(noteId);',
    1
  ],
  [
    'inspection bare call loses receiver',
    'attachmentStore.inspectAttachmentDeletion(attachment.id)',
    '(0, attachmentStore.inspectAttachmentDeletion)(attachment.id)',
    1
  ],
  [
    'transaction acquires wrong receiver',
    'await runTransaction(async () => {',
    'await ({ runTransaction }).runTransaction(async () => {',
    2
  ],
  [
    'prepare gets clone',
    'prepareAttachmentCleanup?.(queuedAttachments)',
    'prepareAttachmentCleanup?.([...queuedAttachments])',
    2
  ],
  [
    'cleanup gets clone',
    'removeDetachedAttachmentFiles?.(attachments)',
    'removeDetachedAttachmentFiles?.([...attachments])',
    1
  ],
  [
    'list getter read twice per collection',
    'const attachments = await attachmentStore?.listAttachments?.() ?? [];',
    'const ignored = attachmentStore?.listAttachments;\n    const attachments = await attachmentStore?.listAttachments?.() ?? [];',
    1
  ],
  [
    'current some read before length short circuit',
    'current.length !== expected.size || current.some(item => expected.get(item.id) !== `${item.storagePath}\\u0000${item.fileName}`)',
    'current.some(item => expected.get(item.id) !== `${item.storagePath}\\u0000${item.fileName}`) || current.length !== expected.size',
    1
  ],
  [
    'sequential inspection replaced with Promise.all',
    "    for (const attachment of attachments) {\n      const preflight = await attachmentStore.inspectAttachmentDeletion(attachment.id);\n      const retained = preflight.references.filter((reference) => !(\n        ['notes', 'noteVersions', 'contentAnnotations'].includes(reference.collection)\n        && noteIdSet.has(reference.noteId ?? reference.id)\n      ));\n      if (retained.length) {\n        throw createAppError('ATTACHMENT_REFERENCED', '保留的资产仍引用此附件，不能删除。', 409);\n      }\n    }",
    "    await Promise.all([...attachments].map(async attachment => {\n      const preflight = await attachmentStore.inspectAttachmentDeletion(attachment.id);\n      const retained = preflight.references.filter((reference) => !(\n        ['notes', 'noteVersions', 'contentAnnotations'].includes(reference.collection)\n        && noteIdSet.has(reference.noteId ?? reference.id)\n      ));\n      if (retained.length) {\n        throw createAppError('ATTACHMENT_REFERENCED', '保留的资产仍引用此附件，不能删除。', 409);\n      }\n    }));",
    1
  ]
];
for (const [name, before, after, expectedCount] of mutations) {
  test('effective parsed/imported behavioral mutant: ' + name, async () => {
    assert.equal(deletionFrozenSource.split(before).length - 1, expectedCount, 'Mutation anchor count');
    const mutated = deletionFrozenSource.replaceAll(before, after);
    parse(mutated, { sourceType: 'module' });
    const mutant = await loadSource(mutated, name);
    assert.equal(typeof mutant.createAsyncNoteDeletionCoordinator, 'function');
    let caught;
    for (const entry of deletionContractCases(mutant)) {
      try {
        await assert.doesNotReject(async () => entry.run());
      } catch (error) {
        if (error.code !== 'ERR_ASSERTION') throw error;
        caught = entry.name;
        break;
      }
    }
    assert.ok(caught, 'No fixed behavioral oracle rejected ' + name);
  });
}
if (!baseline) for (const entry of deletionConsumerCases()) test(entry.name, entry.run);
