import fs from 'node:fs';
import path from 'node:path';
import { createAppError } from '../../errors/app-error.js';
import {
  LOCAL_DATA_SCHEMA_VERSION,
  validateLocalSnapshot,
  validatePersistedLocalState
} from '../local-data-schema.js';
import { createMigrationReport } from './migration-report.js';
import {
  dbAnnotation,
  dbAttachment,
  dbFolder,
  dbKnowledgeEvidence,
  dbKnowledgeItem,
  dbLearningObjective,
  dbExamProfile,
  dbExamFocus,
  dbQuestion,
  dbQuestionObjective,
  dbQuestionSource,
  dbNote,
  dbNoteVersion,
  dbSpace,
  dbTag,
  dbUser
} from './db-mappers.js';
import {
  checksumPlan,
  transformAnnotation,
  transformAttachment,
  transformFolder,
  transformKnowledgeEvidence,
  transformKnowledgeItem,
  transformLearningObjective,
  transformExamProfile,
  transformExamFocus,
  transformQuestion,
  transformQuestionObjective,
  transformQuestionSource,
  transformNote,
  transformNoteVersion,
  transformSpace,
  transformTag,
  validateDatabaseConstraints
} from './json-transformers.js';
import { createPostgresAdvisoryLock } from '../postgres-advisory-lock.js';
import { findInsecureImageUrls } from '../../modules/knowledge/application/note-content-policy.js';

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
  uploadsDir = null,
  fallbackTimestamp = new Date().toISOString(),
  allowMissingAttachments = false,
  ownerId = null
} = {}) {
  const reportTools = createMigrationReport({ sourceFile, storageRootDir });
  const { report } = reportTools;
  let state;
  try {
    state = Object.hasOwn(input ?? {}, 'data')
      ? validateLocalSnapshot(input).data
      : validatePersistedLocalState(input);
  } catch (error) {
    reportTools.error(error.code ?? 'MIGRATION_SOURCE_INVALID', error.message);
    return { plan: null, report: reportTools.finish(), canApply: false };
  }

  const original = input?.data ?? input ?? {};
  if (input?.schemaVersion === undefined && original.schemaVersion === undefined) {
    reportTools.repair('SCHEMA_VERSION_DEFAULTED', 'Source JSON has no schemaVersion; treated as local schema v1');
  }
  for (const note of state.notes) {
    const insecureUrls = findInsecureImageUrls(note.rawMarkdown);
    if (insecureUrls.length > 0) {
      reportTools.error(
        'INSECURE_IMAGE_URL',
        'Note contains insecure HTTP image sources and must be repaired before migration',
        { noteId: note.id, count: insecureUrls.length }
      );
    }
  }
  const plan = {
    users: [],
    spaces: state.spaces.map((space) => transformSpace(space, fallbackTimestamp)),
    folders: state.folders.map((folder) => transformFolder(folder, fallbackTimestamp)),
    tags: state.tags.map((tag) => transformTag(tag, fallbackTimestamp)),
    notes: state.notes.map((note) => transformNote(note, fallbackTimestamp, reportTools)),
    noteVersions: [],
    knowledgeItems: state.knowledgeItems.map((item) => transformKnowledgeItem(item, fallbackTimestamp, reportTools)),
    knowledgeEvidence: state.knowledgeEvidence.map((evidence) => transformKnowledgeEvidence(evidence, fallbackTimestamp)),
    learningObjectives: state.learningObjectives.map((objective) => transformLearningObjective(objective, fallbackTimestamp)),
    examProfiles: state.examProfiles.map((profile) => transformExamProfile(profile, fallbackTimestamp)),
    examFocuses: state.examFocuses.map((focus) => transformExamFocus(focus, fallbackTimestamp)),
    questions: state.questions.map((question) => transformQuestion(question, fallbackTimestamp)),
    questionObjectives: state.questionObjectives.map((relation) => transformQuestionObjective(relation, fallbackTimestamp)),
    questionSources: state.questionSources.map((source) => transformQuestionSource(source, fallbackTimestamp)),
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
  if (ownerId) {
    const normalizedOwnerId = String(ownerId).trim();
    const foreignSpaces = plan.spaces.filter((space) => space.userId !== normalizedOwnerId);
    if (foreignSpaces.length > 0) {
      reportTools.error(
        'OWNER_BOUNDARY_VIOLATION',
        'Migration source contains knowledge spaces owned by another user',
        {
          ownerId: normalizedOwnerId,
          spaceIds: foreignSpaces.map((space) => space.id)
        }
      );
    }
    if (normalizedOwnerId && !users.has(normalizedOwnerId)) {
      users.set(normalizedOwnerId, {
        id: normalizedOwnerId,
        email: null,
        passwordHash: null,
        nickname: null,
        status: 'active',
        createdAt: fallbackTimestamp,
        updatedAt: fallbackTimestamp
      });
    }
  }
  plan.users = [...users.values()];
  const versionsByNoteAndHash = new Map();
  for (const note of plan.notes) {
    const versions = state.noteVersions.filter((version) => version.noteId === note.id);
    const sourceVersions = versions.length > 0
      ? versions.map((version) => transformNoteVersion(version, fallbackTimestamp, reportTools))
      : [{
          id: `note-version-baseline-${note.id}`,
          noteId: note.id,
          content: note.rawMarkdown,
          contentHash: note.contentHash,
          createdAt: note.updatedAt,
          createdBy: 'system-migration'
        }];
    for (const version of sourceVersions) {
      const key = `${version.noteId}\u0000${version.contentHash}`;
      if (!versionsByNoteAndHash.has(key)) {
        versionsByNoteAndHash.set(key, version);
        plan.noteVersions.push(version);
      }
    }
  }
  const versionByKey = new Map(plan.noteVersions.map((version) => [`${version.noteId}\u0000${version.contentHash}`, version]));
  plan.annotations = plan.annotations.map((annotation) => {
    if (annotation.noteVersionId) return annotation;
    const version = versionByKey.get(`${annotation.noteId}\u0000${annotation.noteContentHash}`);
    if (version) return { ...annotation, noteVersionId: version.id };
    reportTools.warn('ANNOTATION_VERSION_UNRESOLVED', 'Annotation could not be safely bound to a NoteVersion', { annotationId: annotation.id });
    return { ...annotation, status: annotation.status === 'archived' ? annotation.status : 'stale' };
  });
  const annotationById = new Map(plan.annotations.map((annotation) => [annotation.id, annotation]));
  const versionById = new Map(plan.noteVersions.map((version) => [version.id, version]));
  plan.knowledgeEvidence = plan.knowledgeEvidence.map((evidence) => {
    const annotation = evidence.annotationId ? annotationById.get(evidence.annotationId) : null;
    const version = evidence.noteVersionId ? versionById.get(evidence.noteVersionId) : null;
    return {
      ...evidence,
      noteId: evidence.noteId ?? annotation?.noteId ?? version?.noteId ?? null,
      noteVersionId: evidence.noteVersionId ?? annotation?.noteVersionId ?? null,
      sourceId: evidence.sourceId ?? annotation?.id ?? version?.id ?? null,
      status: evidence.sourceType === 'annotation' && !annotation?.noteVersionId && evidence.status === 'valid'
        ? 'stale'
        : evidence.status
    };
  });
  plan.noteTags = plan.notes.flatMap((note) => note.tagIds.map((tagId) => ({ noteId: note.id, tagId })));

  const noteIds = new Set(plan.notes.map((note) => note.id));
  for (const attachment of state.attachments) {
    const transformed = transformAttachment(attachment, {
      storageRootDir,
      uploadsDir: uploadsDir ?? undefined,
      noteIds,
      allowMissingAttachments,
      fallbackTimestamp,
      reportTools
    });
    if (transformed) plan.attachments.push(transformed);
  }

  for (const collection of ['users', 'spaces', 'folders', 'tags', 'notes', 'noteVersions', 'knowledgeItems', 'knowledgeEvidence', 'learningObjectives', 'examProfiles', 'examFocuses', 'questions', 'questionObjectives', 'questionSources', 'noteTags', 'annotations', 'attachments']) {
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
  if (!client) throw new TypeError('JSON migration requires a Prisma client');
  if (!plan || report?.errors?.length) {
    throw createAppError('MIGRATION_PRECHECK_FAILED', 'JSON migration preflight did not pass', 422, { report });
  }

  const applyPlan = async (tx) => {
    if (requireEmptyTarget) await assertEmptyTarget(tx);
    if (replaceExisting) {
      await tx.questionSource.deleteMany();
      await tx.questionObjective.deleteMany();
      await tx.question.deleteMany();
      await tx.examFocus.deleteMany();
      await tx.examProfile.deleteMany();
      await tx.learningObjective.deleteMany();
      await tx.knowledgeEvidence.deleteMany();
      await tx.knowledgeItem.deleteMany();
      await tx.contentAnnotation.deleteMany();
      await tx.noteVersion.deleteMany();
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
    if (plan.noteVersions.length) await tx.noteVersion.createMany({ data: plan.noteVersions.map(dbNoteVersion) });
    if (plan.noteTags.length) await tx.noteTag.createMany({ data: plan.noteTags });
    if (plan.annotations.length) await tx.contentAnnotation.createMany({ data: plan.annotations.map(dbAnnotation) });
    if (plan.knowledgeItems.length) await tx.knowledgeItem.createMany({ data: plan.knowledgeItems.map(dbKnowledgeItem) });
    if (plan.knowledgeEvidence.length) await tx.knowledgeEvidence.createMany({ data: plan.knowledgeEvidence.map(dbKnowledgeEvidence) });
    if (plan.learningObjectives.length) await tx.learningObjective.createMany({ data: plan.learningObjectives.map(dbLearningObjective) });
    if (plan.examProfiles.length) await tx.examProfile.createMany({ data: plan.examProfiles.map(dbExamProfile) });
    if (plan.examFocuses.length) await tx.examFocus.createMany({ data: plan.examFocuses.map(dbExamFocus) });
    if (plan.questions.length) await tx.question.createMany({ data: plan.questions.map(dbQuestion) });
    if (plan.questionObjectives.length) await tx.questionObjective.createMany({ data: plan.questionObjectives.map(dbQuestionObjective) });
    if (plan.questionSources.length) await tx.questionSource.createMany({ data: plan.questionSources.map(dbQuestionSource) });
    if (plan.attachments.length) {
      await tx.attachment.createMany({ data: plan.attachments.map(dbAttachment) });
    }
  };
  const advisoryLock = createPostgresAdvisoryLock(client);
  if (typeof client.$transaction === 'function') {
    await advisoryLock.runExclusive(applyPlan);
  } else {
    await applyPlan(client);
  }
  report.status = 'applied';
  report.appliedAt = new Date().toISOString();
  return report;
}

export async function assertEmptyTarget(client) {
  const models = ['user', 'knowledgeSpace', 'folder', 'tag', 'note', 'noteTag', 'attachment', 'contentAnnotation', 'noteVersion', 'knowledgeItem', 'knowledgeEvidence', 'learningObjective', 'examProfile', 'examFocus', 'question', 'questionObjective', 'questionSource'];
  for (const model of models) {
    const count = await client[model].count();
    if (count > 0) {
      throw createAppError('MIGRATION_TARGET_NOT_EMPTY', `PostgreSQL target is not empty: ${model}`, 409, { model, count });
    }
  }
}

export const migrationSchemaVersion = LOCAL_DATA_SCHEMA_VERSION;
