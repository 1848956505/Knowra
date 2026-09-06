import { KnowledgeSpace } from '../../domain/knowledge-space.js';
import { buildDefaultKnowledgeSpaceDto } from '../dto/knowledge-space.dto.js';
import { TagGroup } from '../../domain/tag-group.js';
import { buildDefaultTagGroups } from '../../domain/default-tag-groups.js';

export function createAsyncKnowledgeSpaceService({
  repository,
  tagGroupRepository,
  runTransaction = (operation) => operation({
    knowledgeSpaceRepository: repository,
    tagGroupRepository
  })
} = {}) {
  if (!repository) throw new TypeError('Async space service requires a repository');
  if (!tagGroupRepository) throw new TypeError('Async space service requires a tag group repository');
  return {
    async createDefaultKnowledgeSpace({ userId } = {}) {
      return runTransaction(async ({
        knowledgeSpaceRepository: spaces = repository,
        tagGroupRepository: groups = tagGroupRepository
      } = {}) => {
        const dto = buildDefaultKnowledgeSpaceDto({ userId });
        const space = await spaces.findById(dto.id) ?? await spaces.save(new KnowledgeSpace(dto));
        for (const definition of buildDefaultTagGroups(space.id)) {
          if (!(await groups.findById(definition.id))) {
            await groups.create(new TagGroup(definition));
          }
        }
        return space;
      });
    },
    listKnowledgeSpaces(options = {}) { return repository.list(options); }
  };
}
