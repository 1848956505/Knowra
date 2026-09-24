import { calculateContentHash } from '../domain/note-version.js';

export function buildNoteVersionPrunePreview({ note, versions, evidence, questionSources, annotations, exclusions, analysisScopes }) {
  const currentHash = calculateContentHash(note.rawMarkdown);
  const evidenceByVersion = new Map();
  for (const record of evidence) {
    if (!record.noteVersionId) continue;
    const values = evidenceByVersion.get(record.noteVersionId) ?? [];
    values.push(record.id);
    evidenceByVersion.set(record.noteVersionId, values);
  }
  return {
    noteId: note.id,
    mode: 'preview-only',
    retentionPointMetadataAvailable: false,
    versions: versions.map(version => {
      const references = [];
      if (version.contentHash === currentHash) references.push({ type: 'current-content', id: note.id });
      for (const id of evidenceByVersion.get(version.id) ?? []) references.push({ type: 'knowledgeEvidence', id });
      for (const source of questionSources) {
        if ((source.sourceType === 'noteVersion' && source.sourceId === version.id)
          || (source.sourceType === 'knowledgeEvidence' && (evidenceByVersion.get(version.id) ?? []).includes(source.sourceId))) {
          references.push({ type: 'questionSource', id: source.id });
        }
      }
      for (const annotation of annotations) if (annotation.noteVersionId === version.id) references.push({ type: 'contentAnnotation', id: annotation.id });
      for (const exclusion of exclusions) if (exclusion.noteVersionId === version.id) references.push({ type: 'annotationExclusion', id: exclusion.id });
      for (const scope of analysisScopes) if (scope.noteVersions?.some(record => record.noteVersionId === version.id)) references.push({ type: 'analysisScopeSnapshot', id: scope.id });
      return {
        id: version.id,
        createdAt: version.createdAt,
        createdBy: version.createdBy,
        references,
        candidateAfterRetentionReview: references.length === 0,
        canPruneNow: false,
        reason: references.length ? 'retained-reference' : 'retention-point-not-modeled'
      };
    })
  };
}
