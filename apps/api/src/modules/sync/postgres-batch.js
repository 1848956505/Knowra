import * as dbMaps from '../../infrastructure/migration/db-mappers.js';

const tables = [
  ['spaces', 'knowledgeSpace', 'dbSpace'], ['tagGroups', 'tagGroup', 'dbTagGroup'],
  ['folders', 'folder', 'dbFolder'], ['tags', 'tag', 'dbTag'], ['notes', 'note', 'dbNote'],
  ['noteVersions', 'noteVersion', 'dbNoteVersion'], ['attachments', 'attachment', 'dbAttachment'],
  ['contentAnnotations', 'contentAnnotation', 'dbAnnotation'], ['annotationExclusions', 'annotationExclusion', 'dbAnnotationExclusion'],
  ['annotationRevisions', 'annotationRevision', 'dbAnnotationRevision'],
  ['knowledgeItems', 'knowledgeItem', 'dbKnowledgeItem'], ['knowledgeEvidence', 'knowledgeEvidence', 'dbKnowledgeEvidence'],
  ['learningObjectives', 'learningObjective', 'dbLearningObjective'], ['questions', 'question', 'dbQuestion'],
  ['questionSources', 'questionSource', 'dbQuestionSource']
];

export async function applyPostgresState(db, before, after) {
  const oldNotes = new Map(before.notes.map(note => [note.id, note]));
  const nextNotes = new Set(after.notes.map(note => note.id));
  const changedNotes = after.notes.filter(note => JSON.stringify(note) !== JSON.stringify(oldNotes.get(note.id)));
  const removedNotes = before.notes.filter(note => !nextNotes.has(note.id));
  for (const note of [...changedNotes, ...removedNotes]) await db.noteTag.deleteMany({ where: { noteId: note.id } });
  for (const [collection, model, mapper] of tables) {
    const previous = new Map(before[collection].map(item => [item.id, item]));
    let items = after[collection].filter(item => JSON.stringify(item) !== JSON.stringify(previous.get(item.id)));
    if (collection === 'folders') {
      const depth = item => { let n = 0; for (let p = item.parentId; p; n++) p = after.folders.find(folder => folder.id === p)?.parentId; return n; };
      items = items.sort((a, b) => depth(a) - depth(b));
    }
    for (const item of items) {
      const normalized = collection === 'notes' ? { ...item, deletedAt: item.deleted ? item.updatedAt : null } : item;
      const data = dbMaps[mapper](normalized);
      await db[model].upsert({ where: { id: item.id }, create: data, update: data });
    }
  }
  for (const note of changedNotes) if (note.tagIds.length) await db.noteTag.createMany({ data: note.tagIds.map(tagId => ({ noteId: note.id, tagId })) });
  for (const [collection, model] of [...tables].reverse()) {
    const present = new Set(after[collection].map(item => item.id));
    const removed = before[collection].filter(item => !present.has(item.id));
    // 自引用目录一起删除，数据库在语句结束时检查外键。
    if (removed.length) await db[model].deleteMany({ where: { id: { in: removed.map(item => item.id) } } });
  }
}
