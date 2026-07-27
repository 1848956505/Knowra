import { KnowledgeSpace } from '../../domain/knowledge-space.js';
import { buildDefaultKnowledgeSpaceDto } from '../dto/knowledge-space.dto.js';

export function createAsyncKnowledgeSpaceService({ repository } = {}) {
  if (!repository) throw new TypeError('Async space service requires a repository');
  return {
    async createDefaultKnowledgeSpace({ userId } = {}) {
      const dto = buildDefaultKnowledgeSpaceDto({ userId });
      const existingSpace = await repository.findById(dto.id);
      if (existingSpace) return existingSpace;
      return repository.save(new KnowledgeSpace(dto));
    },
    listKnowledgeSpaces(options = {}) { return repository.list(options); }
  };
}
