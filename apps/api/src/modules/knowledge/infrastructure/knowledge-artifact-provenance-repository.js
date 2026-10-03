import { createAppError } from '../../../errors/app-error.js';
import { validateKnowledgeArtifactProvenance } from '../domain/knowledge-artifact-provenance-contract.js';

export function assertProvenanceWrite(existing, record, { upgradeLegacy = false } = {}) {
  validateKnowledgeArtifactProvenance(record);
  if (!existing) return;
  validateKnowledgeArtifactProvenance(existing);
  if (existing.provenanceHash === record.provenanceHash) return;
  if (upgradeLegacy && existing.state === 'legacy-unavailable' && record.state === 'recorded'
    && existing.id === record.id && existing.artifactId === record.artifactId) return;
  throw createAppError('KNOWLEDGE_ARTIFACT_PROVENANCE_CONFLICT', '已保存的来源事实不能覆盖或降级。', 409);
}

/** 无通用更新入口；upgradeLegacy 仅供合法历史 receipt 的受限回填。 */
export function createInMemoryKnowledgeArtifactProvenanceRepository({ records = [], onChange } = {}) {
  const write = (input, upgradeLegacy = false) => {
    const record = validateKnowledgeArtifactProvenance(input);
    const index = records.findIndex(item => item.id === record.id || item.artifactId === record.artifactId);
    const existing = records[index];
    assertProvenanceWrite(existing, record, { upgradeLegacy });
    if (existing?.provenanceHash === record.provenanceHash) return structuredClone(existing);
    if (index < 0) records.push(structuredClone(record));
    else records[index] = structuredClone(record);
    try { onChange?.(records); }
    catch (error) {
      if (index < 0) {
        const inserted = records.findIndex(item => item.id === record.id);
        if (inserted >= 0) records.splice(inserted, 1);
      }
      else records[index] = existing;
      throw error;
    }
    return structuredClone(record);
  };
  return {
    create: record => write(record),
    upgradeLegacy: record => write(record, true),
    findById: id => structuredClone(records.find(record => record.id === id) ?? null),
    findByArtifactId: artifactId => structuredClone(records.find(record => record.artifactId === artifactId) ?? null),
    list: ({ artifactId } = {}) => structuredClone(records.filter(record => !artifactId || record.artifactId === artifactId)),
    deleteByKnowledgeItemId(artifactId) {
      const removed = records.filter(record => record.artifactId === artifactId);
      for (const record of removed) records.splice(records.indexOf(record), 1);
      if (removed.length) onChange?.(records);
      return structuredClone(removed);
    }
  };
}
