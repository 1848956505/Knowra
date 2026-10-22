import assert from 'node:assert/strict';
import test from 'node:test';
import { Note } from '../src/modules/knowledge/domain/note.ts';
import { updateStructure, createNoteLinkUrl } from '@study-accelerator/content-anchor';

const timestamp = '2026-10-22T00:00:00.000Z';
const input = { id: ' note ', title: ' 标题 ', rawMarkdown: ' 正文 ', createdAt: timestamp };

test('Note: JS bridge exposes precisely the same TS identity', async () => {
  const legacy = await import('../src/modules/knowledge/domain/note.js');
  const migrated = await import('../src/modules/knowledge/domain/note.ts');
  assert.deepEqual(Object.keys(legacy), ['Note']);
  assert.deepEqual(Object.keys(migrated), ['Note']);
  assert.equal(legacy.Note, migrated.Note);
});

test('Note preserves defaults, own field order, untrimmed identity/body and mutable records', () => {
  const note = new Note(input);
  assert.deepEqual(Object.keys(note), [
    'id',
    'spaceId',
    'folderId',
    'title',
    'rawMarkdown',
    'plainText',
    'internalLinks',
    'contentHash',
    'annotationStructure',
    'status',
    'sourceType',
    'favorite',
    'aiVisibility',
    'deleted',
    'tagIds',
    'createdAt',
    'updatedAt',
    'folderDeletionPackageId',
    'deletionPackage'
  ]);
  assert.deepEqual(
    { ...note },
    {
      id: ' note ',
      spaceId: null,
      folderId: null,
      title: '标题',
      rawMarkdown: ' 正文 ',
      plainText: '正文',
      internalLinks: [],
      contentHash: null,
      annotationStructure: updateStructure('', input.rawMarkdown),
      status: 'draft',
      sourceType: 'manual',
      favorite: false,
      aiVisibility: 'normal',
      deleted: false,
      tagIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      folderDeletionPackageId: null,
      deletionPackage: null
    }
  );
  assert.equal(Object.isFrozen(note), false);
  note.title = 'changed';
  assert.equal(note.title, 'changed');
  note.tagIds.push('new');
  assert.deepEqual(note.tagIds, ['new']);
  assert.deepEqual(new Note(JSON.parse(JSON.stringify(note))), note);
});

test('Note timestamps default only for undefined and preserve explicit nulls and empty strings', () => {
  const before = Date.now();
  const automatic = new Note({ ...input, createdAt: undefined });
  assert.equal(new Date(automatic.createdAt).toISOString(), automatic.createdAt);
  assert.ok(Date.parse(automatic.createdAt) >= before && Date.parse(automatic.createdAt) <= Date.now());
  assert.equal(automatic.updatedAt, automatic.createdAt);
  for (const createdAt of [null, '', timestamp]) {
    assert.equal(new Note({ ...input, createdAt }).createdAt, createdAt);
    assert.equal(new Note({ ...input, createdAt }).updatedAt, createdAt);
    for (const updatedAt of [null, '', 'later']) {
      const note = new Note({ ...input, createdAt, updatedAt });
      assert.equal(note.createdAt, createdAt);
      assert.equal(note.updatedAt, updatedAt);
    }
  }
});

test('Note preserves references and explicit fields while deduplicating arrays in first-seen order', () => {
  const annotationStructure = updateStructure('', 'other body');
  const deletionPackage = {
    id: 'package',
    deletedAt: timestamp,
    annotationStates: [{ id: 'annotation', lifecycleStatus: 'active', revision: 2 }]
  };
  const tagIds = ['z', 'a', 'z', 'b', 'a'];
  const internalLinks = ['second', 'first', 'second'];
  const options = {
    ...input,
    annotationStructure,
    deletionPackage,
    tagIds,
    internalLinks,
    spaceId: 'space',
    folderId: 'folder',
    plainText: '',
    contentHash: 'not-a-calculated-hash',
    status: 'custom',
    sourceType: 'import',
    favorite: true,
    aiVisibility: 'hidden',
    deleted: true,
    folderDeletionPackageId: 'folder-package'
  };
  const note = new Note(options);
  assert.equal(note.annotationStructure, annotationStructure);
  assert.equal(note.deletionPackage, deletionPackage);
  assert.deepEqual(note.tagIds, ['z', 'a', 'b']);
  assert.deepEqual(note.internalLinks, ['second', 'first']);
  assert.notEqual(note.tagIds, tagIds);
  assert.notEqual(note.internalLinks, internalLinks);
  assert.deepEqual(tagIds, ['z', 'a', 'z', 'b', 'a']);
  assert.deepEqual(internalLinks, ['second', 'first', 'second']);
  for (const key of [
    'spaceId',
    'folderId',
    'plainText',
    'contentHash',
    'status',
    'sourceType',
    'favorite',
    'aiVisibility',
    'deleted',
    'folderDeletionPackageId'
  ])
    assert.equal(note[key], options[key]);
  for (const contentHash of [null, '']) assert.equal(new Note({ ...input, contentHash }).contentHash, contentHash);
});

test('Note derives markdown text, links and annotation structure only when overrides require it', () => {
  const rawMarkdown =
    '# 标题\n\n<mark data-k="mark1">重点</mark> **粗体** `代码` [[旧链]] ![图片](image.png) [网页](https://example.test)\n\n```js\n隐藏内容\n```';
  const note = new Note({ ...input, rawMarkdown });
  assert.equal(note.plainText, '标题 重点 粗体 代码 旧链 图片 网页');
  const linksMarkdown = `[乙](${createNoteLinkUrl('second', 'occ-second')}) [甲](${createNoteLinkUrl('first', 'occ-first')}) [乙重复](${createNoteLinkUrl('second', 'occ-third')})`;
  for (const internalLinks of [undefined, null, false, 'override', {}]) {
    const derived = new Note({ ...input, rawMarkdown: linksMarkdown, internalLinks });
    assert.deepEqual(derived.internalLinks, ['second', 'first']);
  }
  assert.deepEqual(new Note({ ...input, rawMarkdown: linksMarkdown, internalLinks: [] }).internalLinks, []);
  for (const plainText of [undefined, null, false, 0, {}, []]) {
    assert.equal(new Note({ ...input, rawMarkdown, plainText }).plainText, note.plainText);
  }
  for (const plainText of ['', '  custom text  ']) assert.equal(new Note({ ...input, plainText }).plainText, plainText);
  for (const annotationStructure of [undefined, null]) {
    assert.deepEqual(
      new Note({ ...input, annotationStructure }).annotationStructure,
      updateStructure('', input.rawMarkdown)
    );
  }
  assert.equal(new Note({ ...input, rawMarkdown: '' }).plainText, '');
});

test('Note retains validation order and native invalid-input failures without added validation', () => {
  for (const value of [undefined, null]) assert.throws(() => new Note(value), TypeError);
  assert.throws(() => new Note({ id: '', title: '', rawMarkdown: null }), /Note id is required/);
  assert.throws(() => new Note({ ...input, title: '', rawMarkdown: null }), /Note title is required/);
  for (const field of ['id', 'title']) {
    for (const value of [undefined, null, '', '  ']) {
      assert.throws(() => new Note({ ...input, [field]: value }), new RegExp(`Note ${field} is required`));
    }
    for (const value of [1, false, {}]) assert.throws(() => new Note({ ...input, [field]: value }), TypeError);
  }
  for (const rawMarkdown of [undefined, null, 0, false, {}, []]) {
    assert.throws(() => new Note({ ...input, rawMarkdown }), /Note rawMarkdown is required/);
  }
  assert.throws(() => new Note({ ...input, tagIds: {} }), TypeError);
  assert.deepEqual(new Note({ ...input, tagIds: null }).tagIds, []);
  assert.deepEqual(new Note({ ...input, tagIds: 'aba' }).tagIds, ['a', 'b']);
  const annotationStructure = false;
  const deletionPackage = false;
  const note = new Note({ ...input, annotationStructure, deletionPackage, favorite: 'yes', status: null });
  assert.equal(note.annotationStructure, false);
  assert.equal(note.deletionPackage, false);
  assert.equal(note.favorite, 'yes');
  assert.equal(note.status, null);
});
