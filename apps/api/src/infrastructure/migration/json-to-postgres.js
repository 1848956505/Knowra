import fs from 'node:fs';
import path from 'node:path';
import { createAppError } from '../../errors/app-error.js';
import {
  LOCAL_DATA_SCHEMA_VERSION,
  validatePersistedLocalState
} from '../local-data-schema.js';
import { createMigrationReport } from './migration-report.js';
import {
  dbAnnotation,
  dbAttachment,
  dbFolder,
  dbNote,
  dbSpace,
  dbTag,
  dbUser
} from './db-mappers.js';
import {
  checksumPlan,
  transformAnnotation,
  transformAttachment,
  transformFolder,
  transformNote,
  transformSpace,
  transformTag,
  validateDatabaseConstraints
} from './json-transformers.js';

export function loadJsonMigrationSource(filePath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw createAppError('MIGRATION_SOURCE_INVALID', 'JSON migration source is invalid', 422, { cause: error });
  }
  return { absolutePath, raw, parsed };
}

export function buildJsonMigrationPlan({
  input,
  sourceFile = null,
  storageRootDir = process.cwd(),
  fallbackTimestamp = new Date().toISOString(),
  allowMissingAttachments = false
} = {}) {
  const reportTools = createMigrationReport({ sourceFile, storageRootDir });
  const { report } = reportTools;
  let state;
  try {
    state = validatePersistedLocalState(input?.data ?? input);
  } catch (error) {
    reportTools.error(error.code ?? 'MIGRATION_SOURCE_INVALID', error.message);
    return { plan: null, report: reportTools.finish(), canApply: false };
  }

  const original = input?.data ?? input ?? {};
  if (input?.schemaVersion === undefined && original.schemaVersion === undefined) {
    reportTools.repair('SCHEMA_VERSION_DEFAULTED', 'Source JSON has no schemaVersion; treated as local schema v1');
  }
  const plan = {
    users: [],
    spaces: state.spaces.map((space) => transformSpace(space, fallbackTimestamp)),
    folders: state.folders.map((folder) => transformFolder(folder, fallbackTimestamp)),
    tags: state.tags.map((tag) => transformTag(tag, fallbackTimestamp)),
    notes: state.notes.map((note) => transformNote(note, fallbackTimestamp, reportTools)),
    noteTags: [],
    annotations: state.contentAnnotations.map((annotation) => transformAnnotation(annotation, fallbackTimestamp, reportTools)),
    attachments: []
  };

  const users = new Map();
  for (const space of plan.spaces) {
    if (!users.has(space.userId)) {
      users.set(space.userId, {
        id: space.userId,
        email: null,
        passwordHash: null,
        nickname: null,
        status: 'active',
        createdAt: space.createdAt,
        updatedAt: space.updatedAt
      });
    }
  }
  plan.users = [...users.values()];
  plan.noteTags = plan.notes.flatMap((note) => note.tagIds.map((tagId) => ({ noteId: note.id, tagId })));

  const noteIds = new Set(plan.notes.map((note) => note.id));
  for (const attachment of state.attachments) {
    const transformed = transformAttachment(attachment, {
      storageRootDir,
      noteIds,
      allowMissingAttachments,
      reportTools
    });
    if (transformed) plan.attachments.push(transformed);
  }

  for (const collection of ['users', 'spaces', 'folders', 'tags', 'notes', 'noteTags', 'annotations', 'attachments']) {
    reportTools.count(collection, plan[collection].length);
  }
  report.checksum = checksumPlan(plan);
  validateDatabaseConstraints(plan, reportTools);
  return {
    plan,
    report: reportTools.finish(),
    canApply: report.errors.length === 0
  };
}

export async function applyJsonMigration({
  client,
  plan,
  report,
  requireEmptyTarget = true,
  replaceExisting = false
} = {}) {
  if (!client?.$transaction) throw new TypeError('JSON migration requires a Prisma client');
  if (!plan || report?.errors?.length) {
    throw createAppError('MIGRATION_PRECHECK_FAILED', 'JSON migration preflight did not pass', 422, { report });
  }

  if (requireEmptyTarget) await assertEmptyTarget(client);
  await client.$transaction(async (tx) => {
    if (replaceExisting) {
      await tx.contentAnnotation.deleteMany();
      await tx.attachment.deleteMany();
      await tx.noteTag.deleteMany();
      await tx.note.deleteMany();
      await tx.tag.deleteMany();
      await tx.folder.deleteMany();
      await tx.knowledgeSpace.deleteMany();
      await tx.user.deleteMany();
    }
    if (plan.users.length) await tx.user.createMany({ data: plan.users.map(dbUser) });
    if (plan.spaces.length) await tx.knowledgeSpace.createMany({ data: plan.spaces.map(dbSpace) });
    if (plan.folders.length) await tx.folder.createMany({ data: plan.folders.map(dbFolder) });
    if (plan.tags.length) await tx.tag.createMany({ data: plan.tags.map(dbTag) });
    if (plan.notes.length) await tx.note.createMany({ data: plan.notes.map(dbNote) });
    if (plan.noteTags.length) await tx.noteTag.createMany({ data: plan.noteTags });
    if (plan.annotations.length) await tx.contentAnnotation.createMany({ data: plan.annotations.map(dbAnnotation) });
    if (plan.attachments.length) {
      await tx.attachment.createMany({ data: plan.attachments.map(dbAttachment) });
    }
  });
  report.status = 'applied';
  report.appliedAt = new Date().toISOString();
  return report;
}

export async function assertEmptyTarget(client) {
  const models = ['user', 'knowledgeSpace', 'folder', 'tag', 'note', 'noteTag', 'attachment', 'contentAnnotation'];
  for (const model of models) {
    const count = await client[model].count();
    if (count > 0) {
      throw createAppError('MIGRATION_TARGET_NOT_EMPTY', `PostgreSQL target is not empty: ${model}`, 409, { model, count });
    }
  }
}

export const migrationSchemaVersion = LOCAL_DATA_SCHEMA_VERSION;
