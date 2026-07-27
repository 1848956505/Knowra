import { KnowledgeSpace } from '../domain/knowledge-space.js';
import { buildDefaultKnowledgeSpaceDto } from './dto/knowledge-space.dto.js';
import { createInMemoryKnowledgeSpaceRepository } from '../infrastructure/knowledge-space-repository.js';

export function createKnowledgeSpaceService({ repository = createInMemoryKnowledgeSpaceRepository() } = {}) {
  return {
    createDefaultKnowledgeSpace({ userId } = {}) {
      const dto = buildDefaultKnowledgeSpaceDto({ userId });
      const existingSpace = repository.findById(dto.id);
      if (existingSpace) {
        return existingSpace;
      }
      const space = new KnowledgeSpace(dto);

      repository.save(space);
      return space;
    },
    listKnowledgeSpaces(options = {}) {
      return repository.list(options);
    }
  };
}
