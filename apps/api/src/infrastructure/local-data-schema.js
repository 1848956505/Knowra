import { createAppError } from '../errors/app-error.js';
import {
  normalizeLegacyNoteReferences,
  validateLocalDataRelations
} from './local-data-relations.js';

export const LOCAL_DATA_SCHEMA_VERSION = 1;
export const LOCAL_SNAPSHOT_VERSION = 'v1-local-json';

export const LOCAL_DATA_COLLECTIONS = Object.freeze([
  'spaces',
  'folders',
  'tags',
  'notes',
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
  } else if (collectionName === 'attachments') {
    assertNonEmptyString(item.noteId, `${location}.noteId`);
    assertNonEmptyString(item.fileName, `${location}.fileName`);
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

function assertSnapshotVersion(version) {
  if (version === undefined || version === LOCAL_SNAPSHOT_VERSION) {
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
