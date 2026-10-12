import { conflictError } from './knowledge-errors.js';
import { applyIdentityBindings } from './annotation-identity-binding.js';

/** 笔记变更的同步依赖级联；由原笔记服务的事务包裹，不另开事务。 */
export function createNoteDependencyLifecycle({
  contentAnnotationService, contentAnnotationRepository, annotationIdentityShadow,
  knowledgeItemService, questionService, noteVersionService, noteVersionRepository,
  knowledgeEvidenceRepository, questionSourceRepository, analysisScopeRepository,
  coalescePreviousVersion
}) {
  return {
    onNoteContentChanged: (note, version, annotationChange) => {
      const reconciliation = contentAnnotationService.reconcileForNote(note.id, version.contentHash, annotationChange);
      annotationIdentityShadow.observe(note, annotationChange);
      applyIdentityBindings(contentAnnotationRepository, note, contentAnnotationRepository.list({ noteId: note.id, includeDeleted: true }), annotationChange?.editorState);
      const changed = reconciliation.contentChangedAnnotationIds.flatMap((annotationId) => (
        knowledgeItemService.markEvidenceByAnnotationId(annotationId,
          contentAnnotationRepository.findById(annotationId)?.anchorStatus === 'missing' ? 'insufficient' : 'stale')
      ));
      questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
      const oldVersionIds = noteVersionService.listVersionIds({ noteId: note.id }).filter((id) => id !== version.id);
      const directEvidence = knowledgeItemService.markEvidenceByNoteVersionIds(oldVersionIds, 'stale', 'noteVersion');
      questionService.markSourcesStale('knowledgeEvidence', directEvidence.map((record) => record.id));
      questionService.markSourcesStale('noteVersion', oldVersionIds);
      coalescePreviousVersion(note, version, annotationChange);
    },
    onNoteDeleted: (noteId) => {
      const changed = knowledgeItemService.markEvidenceByNoteId(noteId, 'invalid');
      questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
      questionService.markSourcesStale('noteVersion', noteVersionService.listVersions({ noteId }).map((version) => version.id));
    },
    onBeforePermanentDelete: (noteId) => {
      if (knowledgeEvidenceRepository.list({ noteId }).length > 0) {
        throw conflictError('NOTE_HAS_KNOWLEDGE_EVIDENCE', 'Note has formal knowledge evidence and cannot be permanently deleted');
      }
      const versionIds = new Set(
        noteVersionRepository.list({ noteId }).map((version) => version.id)
      );
      if (
        questionSourceRepository.list().some((source) => (
          source.sourceType === 'noteVersion'
          && versionIds.has(source.sourceId)
        ))
      ) {
        throw conflictError(
          'NOTE_HAS_QUESTION_SOURCE',
          'Note has a formal question source and cannot be permanently deleted'
        );
      }
      if (analysisScopeRepository.list().some((snapshot) => (
        snapshot.noteVersions?.some((version) => (version.noteId === noteId || versionIds.has(version.noteVersionId)))
      ))) {
        throw conflictError('NOTE_HAS_ANALYSIS_SCOPE', 'NoteVersion is referenced by an analysis scope snapshot and cannot be deleted');
      }
    },
  };
}
