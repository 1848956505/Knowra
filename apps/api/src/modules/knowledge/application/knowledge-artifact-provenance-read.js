import { createAppError } from '../../../errors/app-error.js';
import { validateKnowledgeArtifactProvenance, resolveKnowledgeArtifactProvenanceSource } from '../domain/knowledge-artifact-provenance-contract.js';

/** 核心只读投影：当前来源的宿主授权与历史生成事实分别核对，不加载 AI。 */
export function createKnowledgeArtifactProvenanceReader(repositories) {
  return async (artifactId, ownerId) => {
    const item = await repositories.knowledgeItemRepository.findById(artifactId);
    const notFound = () => createAppError('KNOWLEDGE_ITEM_NOT_FOUND', '知识点不存在。', 404);
    if (!item) throw notFound();
    const input = await repositories.knowledgeArtifactProvenanceRepository.findByArtifactId(artifactId);
    if (!input) {
      if (item.sourceMode === 'ai') throw createAppError('KNOWLEDGE_ARTIFACT_PROVENANCE_REQUIRED', 'AI 知识缺少明确的来源记录。', 422);
      return { artifactId, state: 'absent', record: null, sources: [] };
    }
    const record = validateKnowledgeArtifactProvenance(input);
    if (record.artifactId !== artifactId) throw notFound();
    const sources = [];
    for (const source of record.sources ?? []) {
      const [evidence, note] = await Promise.all([
        repositories.knowledgeEvidenceRepository.findById(source.evidenceId),
        repositories.noteRepository.findById(source.noteId)
      ]);
      const space = note ? await repositories.knowledgeSpaceRepository.findById(note.spaceId) : null;
      if (!ownerId || !space || space.userId !== ownerId) throw notFound();
      const noteVersion = evidence?.noteVersionId
        ? await repositories.noteVersionRepository.findById(evidence.noteVersionId) : null;
      if (evidence?.noteVersionId !== source.originNoteVersionId) {
        const original = await repositories.noteVersionRepository.findById(source.originNoteVersionId);
        if (original && (original.noteId !== source.noteId || original.contentHash !== source.contentHash)) {
          throw createAppError('KNOWLEDGE_ARTIFACT_PROVENANCE_SOURCE_MISMATCH', '原始来源版本身份不一致。', 422);
        }
      }
      sources.push({ evidenceId: source.evidenceId,
        ...resolveKnowledgeArtifactProvenanceSource({ record, source, evidence, noteVersion, note, knowledgeItem: item }) });
    }
    return { artifactId, state: record.state, record, sources };
  };
}
