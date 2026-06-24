import { KnowledgePoint, KnowledgePointSource } from '../domain/knowledge-point.js';
import {
  createInMemoryKnowledgePointRepository,
  createInMemoryKnowledgePointSourceRepository,
  createInMemoryKnowledgePointTagRepository,
  createInMemoryNoteKnowledgePointRepository,
  createInMemoryTagGroupRepository
} from '../infrastructure/knowledge-point-repository.js';
import { createInMemoryTagRepository } from '../infrastructure/tag-repository.js';
import { createKnowledgePointTagGroupManager } from './knowledge-point-tag-groups.js';

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('Knowledge point must contain at least one source');
  }
  return sources;
}

export function createKnowledgePointService({
  knowledgePointRepository = createInMemoryKnowledgePointRepository(),
  sourceRepository = createInMemoryKnowledgePointSourceRepository(),
  tagRelationRepository = createInMemoryKnowledgePointTagRepository(),
  noteRelationRepository = createInMemoryNoteKnowledgePointRepository(),
  tagRepository = createInMemoryTagRepository(),
  tagGroupRepository = createInMemoryTagGroupRepository()
} = {}) {
  const tagGroupManager = createKnowledgePointTagGroupManager({
    tagRepository,
    tagGroupRepository
  });

  function requirePoint(knowledgePointId, options = {}) {
    const point = knowledgePointRepository.findById(knowledgePointId);
    if (!point || (point.deletedAt && !options.includeDeleted)) {
      throw new Error('Knowledge point not found');
    }
    return point;
  }

  function buildAggregate(point) {
    const sources = sourceRepository
      .list((source) => source.knowledgePointId === point.id)
      .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
    const tagIds = tagRelationRepository
      .list((relation) => relation.knowledgePointId === point.id)
      .map((relation) => relation.tagId);
    const noteIds = noteRelationRepository
      .list((relation) => relation.knowledgePointId === point.id)
      .map((relation) => relation.noteId);

    return {
      ...point,
      sources,
      tagIds,
      noteIds: unique(noteIds)
    };
  }

  function saveTagRelations(knowledgePointId, tagIds = []) {
    tagRelationRepository.deleteWhere((relation) => relation.knowledgePointId === knowledgePointId);
    unique(tagIds).forEach((tagId) => {
      tagRelationRepository.save({ knowledgePointId, tagId, createdAt: new Date().toISOString() });
    });
  }

  function saveNoteRelations({ knowledgePointId, spaceId, noteIds = [] }) {
    unique(noteIds).forEach((noteId) => {
      noteRelationRepository.save({
        noteId,
        knowledgePointId,
        spaceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });
  }

  function saveSource({ point, sourceInput, sortOrder }) {
    const source = new KnowledgePointSource({
      ...sourceInput,
      knowledgePointId: point.id,
      spaceId: sourceInput.spaceId ?? point.spaceId,
      sortOrder: sourceInput.sortOrder ?? sortOrder
    });
    sourceRepository.save(source);
    saveNoteRelations({
      knowledgePointId: point.id,
      spaceId: point.spaceId,
      noteIds: [source.noteId]
    });
    return source;
  }

  return {
    createKnowledgePoint(input) {
      const sources = normalizeSources(input.sources);
      const point = new KnowledgePoint(input);
      tagGroupManager.validateSelection({ spaceId: point.spaceId, tagIds: input.tagIds ?? [] });

      knowledgePointRepository.save(point);
      sources.forEach((source, index) => saveSource({
        point,
        sourceInput: source,
        sortOrder: index + 1
      }));
      saveNoteRelations({
        knowledgePointId: point.id,
        spaceId: point.spaceId,
        noteIds: [input.noteId, ...sources.map((source) => source.noteId)]
      });
      saveTagRelations(point.id, input.tagIds ?? []);

      return buildAggregate(point);
    },
    listKnowledgePoints(options = {}) {
      const requiredTagIds = Array.isArray(options.tagIds)
        ? options.tagIds
        : String(options.tagIds ?? '').split(',').map((value) => value.trim()).filter(Boolean);
      const notePointIds = options.noteId
        ? new Set(noteRelationRepository
          .list((relation) => relation.noteId === options.noteId)
          .map((relation) => relation.knowledgePointId))
        : null;

      return knowledgePointRepository
        .list((point) => (
          (!options.spaceId || point.spaceId === options.spaceId)
          && (options.includeDeleted ? true : !point.deletedAt)
          && (notePointIds ? notePointIds.has(point.id) : true)
        ))
        .map((point) => buildAggregate(point))
        .filter((point) => requiredTagIds.every((tagId) => point.tagIds.includes(tagId)));
    },
    updateKnowledgePoint(knowledgePointId, updates = {}) {
      const current = requirePoint(knowledgePointId, { includeDeleted: true });
      if (Array.isArray(updates.tagIds)) {
        tagGroupManager.validateSelection({ spaceId: current.spaceId, tagIds: updates.tagIds });
      }
      const updated = new KnowledgePoint({
        ...current,
        ...updates,
        id: current.id,
        spaceId: current.spaceId,
        deletedAt: current.deletedAt,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
      });
      knowledgePointRepository.save(updated);
      if (Array.isArray(updates.tagIds)) {
        saveTagRelations(updated.id, updates.tagIds);
      }
      return buildAggregate(updated);
    },
    listKnowledgePointTagGroups(options = {}) {
      return tagGroupManager.listGroups(options.spaceId);
    },
    deleteKnowledgePoint(knowledgePointId) {
      const current = requirePoint(knowledgePointId, { includeDeleted: true });
      const deleted = new KnowledgePoint({
        ...current,
        deletedAt: new Date().toISOString(),
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
      });
      knowledgePointRepository.save(deleted);
      return buildAggregate(deleted);
    },
    addSourceToKnowledgePoint(knowledgePointId, sourceInput) {
      const point = requirePoint(knowledgePointId);
      const currentSources = sourceRepository.list((source) => source.knowledgePointId === point.id);
      saveSource({
        point,
        sourceInput,
        sortOrder: currentSources.length + 1
      });
      return buildAggregate(point);
    },
    deleteKnowledgePointSource(sourceId) {
      const source = sourceRepository.findById(sourceId);
      if (!source) {
        throw new Error('Knowledge point source not found');
      }
      const point = requirePoint(source.knowledgePointId);
      const currentSources = sourceRepository.list((item) => item.knowledgePointId === point.id);
      if (currentSources.length <= 1) {
        throw new Error('Knowledge point must keep at least one source');
      }
      sourceRepository.deleteById(sourceId);
      const remainingSourcesForNote = sourceRepository.list((item) => (
        item.knowledgePointId === point.id && item.noteId === source.noteId
      ));
      if (remainingSourcesForNote.length === 0) {
        noteRelationRepository.deleteWhere((relation) => (
          relation.knowledgePointId === point.id && relation.noteId === source.noteId
        ));
      }
      return buildAggregate(point);
    }
  };
}
