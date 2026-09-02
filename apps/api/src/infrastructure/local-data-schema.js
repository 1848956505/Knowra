import { createAppError } from '../errors/app-error.js';
import {
  normalizeLegacyNoteReferences,
  validateLocalDataRelations
} from './local-data-relations.js';
import { isAttachmentStatus } from './attachment-status.js';

export const LOCAL_DATA_SCHEMA_VERSION = 4;
export const LOCAL_SNAPSHOT_VERSION = 'v1-local-json';

export const LOCAL_DATA_COLLECTIONS = Object.freeze([
  'spaces',
  'folders',
  'tags',
  'tagGroups',
  'notes',
  'noteVersions',
  'knowledgeItems',
  'knowledgeEvidence',
  'learningObjectives',
  'examProfiles',
  'examFocuses',
  'questions',
  'questionObjectives',
  'questionSources',
  'attachments',
  'contentAnnotations'
]);

const REQUIRED_COLLECTIONS = Object.freeze([
  'spaces',
  'folders',
  'tags',
  'notes'
]);

export function createEmptyLocalState() {
  return Object.fromEntries(
    LOCAL_DATA_COLLECTIONS.map((collectionName) => [collectionName, []])
  );
}

export function validatePersistedLocalState(input) {
  const document = assertRecord(input, 'Local data file');
  assertSchemaVersion(document.schemaVersion);
  const state = validateCollections(document, {
    allowMissingOptionalCollections: true
  });
  normalizeLegacyNoteReferences(state, {
    repairBrokenReferences: document.schemaVersion === undefined
  });
  return validateLocalDataRelations(state);
}

export function validateLocalSnapshot(snapshot) {
  const document = assertRecord(snapshot, 'Import payload');
  assertSnapshotVersion(document.version);
  assertSchemaVersion(document.schemaVersion);

  const data = Object.hasOwn(document, 'data')
    ? assertRecord(document.data, 'Import payload data')
    : document;

  const state = validateCollections(data, {
    allowMissingOptionalCollections: true
  });
  normalizeLegacyNoteReferences(state, {
    repairBrokenReferences: document.schemaVersion === undefined
  });
  validateLocalDataRelations(state);

  return {
    schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
    data: state
  };
}

export function createPersistedLocalDocument(state) {
  return {
    schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
    ...cloneLocalState(state)
  };
}

export function cloneLocalState(state) {
  return Object.fromEntries(
    LOCAL_DATA_COLLECTIONS.map((collectionName) => [
      collectionName,
      structuredClone(state[collectionName])
    ])
  );
}

function validateCollections(input, { allowMissingOptionalCollections }) {
  for (const collectionName of REQUIRED_COLLECTIONS) {
    if (!Array.isArray(input[collectionName])) {
      invalidSnapshot(`${collectionName} must be an array`);
    }
  }

  const state = createEmptyLocalState();
  for (const collectionName of LOCAL_DATA_COLLECTIONS) {
    const value = input[collectionName];
    if (value === undefined && allowMissingOptionalCollections) {
      continue;
    }
    if (!Array.isArray(value)) {
      invalidSnapshot(`${collectionName} must be an array`);
    }
    assertUniqueIds(value, collectionName);
    value.forEach((item, index) => {
      validateEntity(collectionName, item, index);
    });
    state[collectionName] = structuredClone(value);
  }

  return state;
}

function validateEntity(collectionName, item, index) {
  const location = `${collectionName}[${index}]`;
  assertRecord(item, location);
  assertNonEmptyString(item.id, `${location}.id`);

  if (collectionName === 'spaces') {
    assertNonEmptyString(item.userId, `${location}.userId`);
    assertNonEmptyString(item.name, `${location}.name`);
  } else if (collectionName === 'folders') {
    assertNonEmptyString(item.spaceId, `${location}.spaceId`);
    assertNonEmptyString(item.name, `${location}.name`);
  } else if (collectionName === 'tags') {
    assertNonEmptyString(item.spaceId, `${location}.spaceId`);
    assertNonEmptyString(item.name, `${location}.name`);
  } else if (collectionName === 'tagGroups') {
    assertNonEmptyString(item.spaceId, `${location}.spaceId`);
    assertNonEmptyString(item.name, `${location}.name`);
  } else if (collectionName === 'notes') {
    assertNonEmptyString(item.title, `${location}.title`);
    if (typeof item.rawMarkdown !== 'string') {
      invalidSnapshot(`${location}.rawMarkdown must be a string`);
    }
    if (item.tagIds !== undefined && !Array.isArray(item.tagIds)) {
      invalidSnapshot(`${location}.tagIds must be an array`);
    }
    (item.tagIds ?? []).forEach((tagId, tagIndex) => {
      assertNonEmptyString(tagId, `${location}.tagIds[${tagIndex}]`);
    });
    if (
      item.internalLinks !== undefined
      && !Array.isArray(item.internalLinks)
    ) {
      invalidSnapshot(`${location}.internalLinks must be an array`);
    }
    (item.internalLinks ?? []).forEach((noteId, linkIndex) => {
      assertNonEmptyString(noteId, `${location}.internalLinks[${linkIndex}]`);
    });
  } else if (collectionName === 'noteVersions') {
    assertNonEmptyString(item.noteId, `${location}.noteId`);
    if (typeof item.content !== 'string') {
      invalidSnapshot(`${location}.content must be a string`);
    }
    assertSha256(item.contentHash, `${location}.contentHash`);
    assertNonEmptyString(item.createdBy, `${location}.createdBy`);
  } else if (collectionName === 'knowledgeItems') {
    if (item.title !== undefined && typeof item.title !== 'string') {
      invalidSnapshot(`${location}.title must be a string`);
    }
    if (item.canonicalStatement !== undefined && typeof item.canonicalStatement !== 'string') {
      invalidSnapshot(`${location}.canonicalStatement must be a string`);
    }
    assertAllowedValue(
      item.reviewStatus ?? 'candidate',
      ['candidate', 'confirmed', 'needsRevision', 'archived'],
      `${location}.reviewStatus`
    );
    assertAllowedValue(
      item.sourceMode ?? 'manual',
      ['manual', 'annotation', 'selection', 'ai'],
      `${location}.sourceMode`
    );
  } else if (collectionName === 'knowledgeEvidence') {
    assertNonEmptyString(item.knowledgeItemId, `${location}.knowledgeItemId`);
    assertAllowedValue(
      item.sourceType ?? 'manual',
      ['noteVersion', 'annotation', 'manual'],
      `${location}.sourceType`
    );
    assertAllowedValue(
      item.status ?? 'valid',
      ['valid', 'stale', 'invalid', 'insufficient'],
      `${location}.status`
    );
    assertAllowedValue(
      item.relationType ?? 'supports',
      ['supports'],
      `${location}.relationType`
    );
  } else if (collectionName === 'learningObjectives') {
    assertNonEmptyString(item.knowledgeItemId, `${location}.knowledgeItemId`);
    if (typeof item.objective !== 'string' || typeof item.actionVerb !== 'string' || typeof item.cognitiveLevel !== 'string') invalidSnapshot(`${location} text fields are invalid`);
    assertAllowedValue(item.actionVerb ?? '', ['', 'identify', 'explain', 'apply', 'compare', 'analyze', 'calculate', 'design', 'evaluate'], `${location}.actionVerb`);
    assertAllowedValue(item.cognitiveLevel ?? '', ['', 'remember', 'understand', 'apply', 'analyze'], `${location}.cognitiveLevel`);
    assertAllowedValue(item.difficultyHint ?? '', ['', 'easy', 'medium', 'hard'], `${location}.difficultyHint`);
    assertAllowedValue(item.reviewStatus ?? 'candidate', ['candidate', 'confirmed', 'archived'], `${location}.reviewStatus`);
    if (!Number.isInteger(Number(item.order ?? 0)) || Number(item.order ?? 0) < 0) invalidSnapshot(`${location}.order is invalid`);
  } else if (collectionName === 'examProfiles') {
    assertNonEmptyString(item.name, `${location}.name`);
    if (!Array.isArray(item.scope ?? []) || !Array.isArray(item.commonQuestionTypes ?? []) || !item.difficultyProfile || typeof item.difficultyProfile !== 'object' || Array.isArray(item.difficultyProfile)) invalidSnapshot(`${location} structured fields are invalid`);
  } else if (collectionName === 'examFocuses') {
    assertNonEmptyString(item.examProfileId, `${location}.examProfileId`);
    assertNonEmptyString(item.learningObjectiveId, `${location}.learningObjectiveId`);
    assertAllowedValue(item.sourceType ?? 'manual', ['manual', 'ai', 'pastPaper', 'syllabus'], `${location}.sourceType`);
    assertAllowedValue(item.reviewStatus ?? 'candidate', ['candidate', 'confirmed', 'archived'], `${location}.reviewStatus`);
    if (!Number.isInteger(Number(item.priority ?? 1)) || Number(item.priority ?? 1) < 1) invalidSnapshot(`${location}.priority is invalid`);
    if (!Array.isArray(item.questionTypeSuggestions ?? [])) invalidSnapshot(`${location}.questionTypeSuggestions must be an array`);
  } else if (collectionName === 'questions') {
    assertAllowedValue(item.questionType ?? 'shortAnswer', ['singleChoice', 'multipleChoice', 'trueFalse', 'shortAnswer'], `${location}.questionType`);
    assertAllowedValue(item.reviewStatus ?? 'draft', ['draft', 'validating', 'candidate', 'confirmed', 'archived'], `${location}.reviewStatus`);
    assertAllowedValue(item.sourceMode ?? 'manual', ['manual', 'ai', 'import'], `${location}.sourceMode`);
    if (item.options !== undefined && item.options !== null && !Array.isArray(item.options)) invalidSnapshot(`${location}.options must be an array or null`);
    if (!Number.isInteger(Number(item.version ?? 1)) || Number(item.version ?? 1) < 1) invalidSnapshot(`${location}.version is invalid`);
  } else if (collectionName === 'questionObjectives') {
    assertNonEmptyString(item.questionId, `${location}.questionId`);
    assertNonEmptyString(item.learningObjectiveId, `${location}.learningObjectiveId`);
    if (!Number.isInteger(Number(item.order ?? 0)) || Number(item.order ?? 0) < 0) invalidSnapshot(`${location}.order is invalid`);
  } else if (collectionName === 'questionSources') {
    assertNonEmptyString(item.questionId, `${location}.questionId`);
    assertAllowedValue(item.sourceType ?? 'manual', ['knowledgeItem', 'learningObjective', 'noteVersion', 'knowledgeEvidence', 'manual', 'pastPaper', 'ai'], `${location}.sourceType`);
    assertAllowedValue(item.status ?? 'active', ['active', 'stale', 'reanchored'], `${location}.status`);
    if (item.locator !== undefined && item.locator !== null && (typeof item.locator !== 'object' || Array.isArray(item.locator))) invalidSnapshot(`${location}.locator is invalid`);
  } else if (collectionName === 'attachments') {
    assertNonEmptyString(item.noteId, `${location}.noteId`);
    assertNonEmptyString(item.fileName, `${location}.fileName`);
    if (item.status !== undefined && !isAttachmentStatus(item.status)) {
      invalidSnapshot(`${location}.status is invalid`);
    }
    if (
      item.sha256 !== undefined
      && (typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(item.sha256))
    ) {
      invalidSnapshot(`${location}.sha256 is invalid`);
    }
  } else if (collectionName === 'contentAnnotations') {
    assertNonEmptyString(item.spaceId, `${location}.spaceId`);
    assertNonEmptyString(item.noteId, `${location}.noteId`);
    assertNonEmptyString(item.quoteText, `${location}.quoteText`);
  }
}

function assertUniqueIds(items, collectionName) {
  const ids = new Set();
  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (id && ids.has(id)) {
      invalidSnapshot(`${collectionName} contains duplicate id: ${id}`);
    }
    ids.add(id);
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    invalidSnapshot(`${label} must be a SHA-256 hash`);
  }
}

function assertAllowedValue(value, allowedValues, label) {
  if (!allowedValues.includes(value)) {
    invalidSnapshot(`${label} is invalid`);
  }
}

function assertSnapshotVersion(version) {
  if (
    version === undefined
    || version === LOCAL_SNAPSHOT_VERSION
    || version === 'v2-local-json'
  ) {
    return;
  }
  throw createAppError(
    'STORAGE_SNAPSHOT_VERSION_UNSUPPORTED',
    `Unsupported storage snapshot version: ${version}`,
    422
  );
}

function assertSchemaVersion(schemaVersion) {
  if (
    schemaVersion === undefined
    || schemaVersion === 1
    || schemaVersion === 2
    || schemaVersion === 3
    || schemaVersion === LOCAL_DATA_SCHEMA_VERSION
  ) {
    return;
  }
  throw createAppError(
    'STORAGE_SCHEMA_VERSION_UNSUPPORTED',
    `Unsupported local data schema version: ${schemaVersion}`,
    422
  );
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidSnapshot(`${label} must be an object`);
  }
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    invalidSnapshot(`${label} must be a non-empty string`);
  }
}

function invalidSnapshot(message) {
  throw createAppError(
    'STORAGE_SNAPSHOT_INVALID',
    message,
    422
  );
}
