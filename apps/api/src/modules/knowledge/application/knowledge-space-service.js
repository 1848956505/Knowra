import { KnowledgeSpace } from '../domain/knowledge-space.js';
import { buildDefaultKnowledgeSpaceDto } from './dto/knowledge-space.dto.js';
import { createInMemoryKnowledgeSpaceRepository } from '../infrastructure/knowledge-space-repository.js';
import { createInMemoryTagGroupRepository } from '../infrastructure/tag-group-repository.js';
import { TagGroup } from '../domain/tag-group.js';
import { buildDefaultTagGroups } from '../domain/default-tag-groups.js';

export function createKnowledgeSpaceService({
  repository = createInMemoryKnowledgeSpaceRepository(),
  tagGroupRepository = createInMemoryTagGroupRepository(),
  runTransaction = (operation) => operation()
} = {}) {
  function ensureDefaultTagGroups(spaceId) {
    for (const definition of buildDefaultTagGroups(spaceId)) {
      if (!tagGroupRepository.findById(definition.id)) {
        tagGroupRepository.create(new TagGroup(definition));
      }
    }
  }
  return {
    createDefaultKnowledgeSpace({ userId } = {}) {
      return runTransaction(() => {
        const dto = buildDefaultKnowledgeSpaceDto({ userId });
        const space = repository.findById(dto.id) ?? repository.save(new KnowledgeSpace(dto));
        ensureDefaultTagGroups(space.id);
        return space;
      });
    },
    listKnowledgeSpaces(options = {}) {
      return repository.list(options);
    }
  };
}
