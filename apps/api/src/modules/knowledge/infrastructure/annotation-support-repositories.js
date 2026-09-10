function createArrayRepository(records, onChange) {
  const persist = () => onChange?.(records);
  return {
    save(record) {
      const index = records.findIndex((item) => item.id === record.id);
      if (index < 0) records.push(record);
      else records[index] = record;
      persist();
      return record;
    },
    findById(id) { return records.find((item) => item.id === id) ?? null; },
    delete(id) {
      const index = records.findIndex((item) => item.id === id);
      if (index < 0) return null;
      const [deleted] = records.splice(index, 1);
      persist();
      return deleted;
    },
    list(predicate = () => true) { return records.filter(predicate); }
  };
}

export function createInMemoryAnnotationExclusionRepository(options = {}) {
  const base = createArrayRepository(options.records ?? [], options.onChange);
  return {
    ...base,
    list({ parentAnnotationId, includeDeleted = false } = {}) {
      return base.list((item) => (
        (!parentAnnotationId || item.parentAnnotationId === parentAnnotationId)
        && (includeDeleted || item.status !== 'archived')
      ));
    },
    deleteByAnnotationIds(annotationIds) {
      const ids = new Set(annotationIds);
      return base.list((item) => ids.has(item.parentAnnotationId)).map((item) => base.delete(item.id));
    }
  };
}

export function createInMemoryAnnotationRevisionRepository(options = {}) {
  const base = createArrayRepository(options.records ?? [], options.onChange);
  return {
    ...base,
    list({ annotationId } = {}) {
      return base.list((item) => !annotationId || item.annotationId === annotationId)
        .sort((left, right) => left.revision - right.revision);
    },
    findByAnnotationRevision(annotationId, revision) {
      return base.list((item) => item.annotationId === annotationId && item.revision === revision)[0] ?? null;
    },
    deleteByAnnotationIds(annotationIds) {
      const ids = new Set(annotationIds);
      return base.list((item) => ids.has(item.annotationId)).map((item) => base.delete(item.id));
    }
  };
}

export function createInMemoryAnalysisScopeRepository(options = {}) {
  const base = createArrayRepository(options.records ?? [], options.onChange);
  return {
    ...base,
    findByIdempotencyKey(spaceId, idempotencyKey) {
      return base.list((item) => item.spaceId === spaceId && item.idempotencyKey === idempotencyKey)[0] ?? null;
    },
    list({ spaceId } = {}) { return base.list((item) => !spaceId || item.spaceId === spaceId); }
  };
}
