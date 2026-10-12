import { conflictError } from '../knowledge-errors.js';
import { applyIdentityBindings } from '../annotation-identity-binding.js';

/** 只使用调用者装配的事务内依赖；标注服务仍在正文变更时惰性创建。 */
export function createAsyncNoteDependencyLifecycle({
  createAnnotationService, contentAnnotationRepository, noteVersionRepository,
  knowledgeEvidenceRepository, questionSourceRepository, analysisScopeRepository,
  knowledgeItemService, questionService
}) {
  return {
    onNoteContentChanged: async (note, version, annotationChange) => {
      const transactionAnnotationService = createAnnotationService();
      const reconciliation = await transactionAnnotationService.reconcileForNote(note.id, version.contentHash, annotationChange);
      await applyIdentityBindings(contentAnnotationRepository, note, await contentAnnotationRepository.list({ noteId: note.id, includeDeleted: true }), annotationChange?.editorState);
      const changed = [];
      for (const annotationId of reconciliation.contentChangedAnnotationIds) {
        const annotation = await contentAnnotationRepository.findById(annotationId);
        changed.push(...await knowledgeItemService.markEvidenceByAnnotationId(annotationId,
          annotation?.anchorStatus === 'missing' ? 'insufficient' : 'stale'));
      }
      await questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
      const oldVersionIds = (await noteVersionRepository.listIds({ noteId: note.id })).filter((id) => id !== version.id);
      const directEvidence = await knowledgeItemService.markEvidenceByNoteVersionIds(oldVersionIds, 'stale', 'noteVersion');
      await questionService.markSourcesStale('knowledgeEvidence', directEvidence.map((record) => record.id));
      await questionService.markSourcesStale('noteVersion', oldVersionIds);
    },
    onNoteDeleted: async (noteId) => {
      const changed = await knowledgeItemService.markEvidenceByNoteId(noteId, 'invalid');
      await questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
      const versions = await noteVersionRepository.list({ noteId });
      await questionService.markSourcesStale(
        'noteVersion',
        versions.map((version) => version.id)
      );
    },
    onBeforePermanentDelete: async (noteId) => {
      if ((await knowledgeEvidenceRepository.list({ noteId })).length > 0) {
        throw conflictError(
          'NOTE_HAS_KNOWLEDGE_EVIDENCE',
          'Note has formal knowledge evidence and cannot be permanently deleted'
        );
      }
      const versions = await noteVersionRepository.list({ noteId });
      const versionIds = new Set(versions.map((version) => version.id));
      const sources = await questionSourceRepository.list();
      if (sources.some((source) => (
        source.sourceType === 'noteVersion'
        && versionIds.has(source.sourceId)
      ))) {
        throw conflictError(
          'NOTE_HAS_QUESTION_SOURCE',
          'Note has a formal question source and cannot be permanently deleted'
        );
      }
      const snapshots = await analysisScopeRepository.list();
      if (snapshots.some((snapshot) => snapshot.noteVersions?.some((version) => (version.noteId === noteId || versionIds.has(version.noteVersionId))))) {
        throw conflictError('NOTE_HAS_ANALYSIS_SCOPE', 'NoteVersion is referenced by an analysis scope snapshot and cannot be deleted');
      }
    }
  };
}
