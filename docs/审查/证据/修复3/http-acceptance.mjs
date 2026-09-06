import assert from 'node:assert/strict';
import { fixture } from '../阶段4/fixture.mjs';

const f = await fixture();
const root = '/api/knowledge';

try {
  const request = async (path, method = 'GET', body, expectedStatus = 200) => {
    const response = await f.request(path, method, body);
    assert.equal(response.status, expectedStatus, JSON.stringify(response));
    return response.data ?? response.error;
  };
  const space = await request(`${root}/spaces/default`, 'POST', {}, 201);

  const initialGroups = await request(`${root}/tag-groups`);
  assert.deepEqual(initialGroups.map((group) => group.code), ['ordinary', 'mastery', 'importance', 'purpose']);

  await request(`${root}/tag-groups`, 'POST', {
    id: 'custom-group', spaceId: space.id, name: '自定义分组', selectionMode: 'multiple'
  }, 201);
  const duplicateGroup = await request(`${root}/tag-groups`, 'POST', {
    id: 'custom-group', spaceId: space.id, name: '覆盖名称', selectionMode: 'single'
  }, 409);
  assert.equal(duplicateGroup.code, 'TAG_GROUP_ID_CONFLICT');
  const preservedGroup = (await request(`${root}/tag-groups`)).find((group) => group.id === 'custom-group');
  assert.deepEqual({ name: preservedGroup.name, selectionMode: preservedGroup.selectionMode }, {
    name: '自定义分组', selectionMode: 'multiple'
  });

  const createNote = (id, title, tagIds = []) => request(`${root}/notes`, 'POST', {
    id, title, tagIds, spaceId: space.id, rawMarkdown: '共享检索正文'
  }, 201);
  await createNote('restore-old', '恢复重名');
  await request(`${root}/notes/restore-old`, 'DELETE');
  await createNote('restore-new', '恢复重名');
  const restoreConflict = await request(`${root}/notes/restore-old/restore`, 'POST', {}, 409);
  assert.equal(restoreConflict.code, 'SIBLING_NAME_CONFLICT');
  const deletedNotes = await request(`${root}/notes?spaceId=${space.id}&deletedOnly=true`);
  assert.deepEqual(deletedNotes.map((note) => note.id), ['restore-old']);

  await request(`${root}/tags`, 'POST', { id: 'tag-a', spaceId: space.id, name: '标签 A' }, 201);
  await request(`${root}/tags`, 'POST', { id: 'tag-b', spaceId: space.id, name: '标签 B' }, 201);
  await createNote('search-both', '检索 双标签', ['tag-a', 'tag-b']);
  await createNote('search-a', '检索 仅 A', ['tag-a']);
  await createNote('search-none', '检索 无标签');
  const all = await request(`${root}/search/notes?spaceId=${space.id}&query=${encodeURIComponent('共享检索')}&tagIds=tag-a,tag-b&match=all`);
  const any = await request(`${root}/search/notes?spaceId=${space.id}&query=${encodeURIComponent('共享检索')}&tagIds=tag-a,tag-b&match=any`);
  assert.deepEqual(all.map((note) => note.id), ['search-both']);
  assert.deepEqual(new Set(any.map((note) => note.id)), new Set(['search-both', 'search-a']));

  await f.restart();
  const groupsAfterRestart = await request(`${root}/tag-groups`);
  assert.equal(groupsAfterRestart.filter((group) => group.isSystem).length, 4);

  console.log(JSON.stringify({
    node: process.version,
    driver: 'local-json',
    transport: 'real node:http on loopback',
    outcome: 'pass',
    checks: {
      defaultGroupsOnFirstRequest: initialGroups.length,
      duplicateGroupConflict: duplicateGroup.code,
      duplicateGroupPreserved: true,
      restoreConflict: restoreConflict.code,
      deletedNoteUnchanged: true,
      searchAll: all.map((note) => note.id),
      searchAny: any.map((note) => note.id),
      systemGroupsAfterRestart: groupsAfterRestart.filter((group) => group.isSystem).length
    }
  }, null, 2));
} finally {
  await f.close();
}
