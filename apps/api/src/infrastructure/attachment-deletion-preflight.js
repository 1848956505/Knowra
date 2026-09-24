import { LOCAL_DATA_COLLECTIONS } from './local-data-schema.js';

// Only persisted business records are scanned here. Offline copies, backups and
// in-flight work need their own lifecycle protocol before general purge is opened.
const REFERENCE_COLLECTIONS = LOCAL_DATA_COLLECTIONS.filter(
  (collection) => collection !== 'attachments'
);

const POSTGRES_MODELS = Object.freeze({
  spaces: 'knowledgeSpace',
  folders: 'folder',
  tags: 'tag',
  tagGroups: 'tagGroup',
  notes: 'note',
  noteVersions: 'noteVersion',
  knowledgeItems: 'knowledgeItem',
  knowledgeEvidence: 'knowledgeEvidence',
  learningObjectives: 'learningObjective',
  examProfiles: 'examProfile',
  examFocuses: 'examFocus',
  questions: 'question',
  questionObjectives: 'questionObjective',
  questionSources: 'questionSource',
  contentAnnotations: 'contentAnnotation',
  annotationExclusions: 'annotationExclusion',
  annotationRevisions: 'annotationRevision',
  analysisScopeSnapshots: 'analysisScopeSnapshot'
});

function referenceCategory(collection) {
  if (collection === 'noteVersions' || collection === 'analysisScopeSnapshots'
    || collection === 'annotationRevisions') return 'history';
  if (collection === 'notes') return 'shared';
  if (collection === 'knowledgeEvidence' || collection === 'questionSources') return 'independent';
  return 'exclusive';
}

function containsAttachmentReference(value, attachmentId, seen = new Set()) {
  if (typeof value === 'string') {
    const path = `/api/storage/attachments/${encodeURIComponent(attachmentId)}/content`;
    return value.includes(path) || value.includes(
      `/api/storage/attachments/${attachmentId}/content`
    );
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (value.attachmentId === attachmentId
    || (value.sourceType === 'attachment' && value.sourceId === attachmentId)) return true;
  return Object.values(value).some((child) => containsAttachmentReference(child, attachmentId, seen));
}

export function inspectAttachmentDeletion(attachmentId, state) {
  const references = [];
  for (const collection of REFERENCE_COLLECTIONS) {
    for (const record of state[collection] ?? []) {
      if (!containsAttachmentReference(record, attachmentId)) continue;
      references.push({
        category: referenceCategory(collection),
        collection,
        id: record.id,
        ...(record.noteId ? { noteId: record.noteId } : {}),
        ...(collection === 'notes' && (record.deleted || record.deletedAt)
          ? { retention: 'recycle-bin' } : {}),
        reasonCode: 'ATTACHMENT_REFERENCED'
      });
    }
  }
  return {
    asset: { type: 'attachment', id: attachmentId },
    operation: 'delete-unreferenced-file',
    decision: references.length ? 'requires-dependency-action' : 'can-purge-no-history',
    references,
    reasonCodes: references.length ? ['ATTACHMENT_REFERENCED'] : [],
    coverage: {
      persistedCurrentAndHistory: true,
      offlineDevices: 'unverified',
      backups: 'unverified',
      runningTasks: 'unverified'
    }
  };
}

export async function loadPostgresAttachmentReferenceState(db) {
  const entries = await Promise.all(
    REFERENCE_COLLECTIONS.map(async (collection) => {
      const model = POSTGRES_MODELS[collection];
      if (!db[model]?.findMany) {
        throw new TypeError(`Attachment reference scan requires ${model}.findMany`);
      }
      return [collection, await db[model].findMany()];
    })
  );
  return Object.fromEntries(entries);
}
