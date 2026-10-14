import { bindingFromAnchor, bindingFromEditor, validBinding, validIdentityTable, identityFromEditorState } from '@study-accelerator/content-anchor';

/**
 * 稳定身份迁移 S2b-2：保存或创建后刷新重点绑定。影子阶段只记录，不改变重点状态、修订号或旧链路字段。
 * 规则：编辑器上报且与当前正文一致 → 采用；否则由旧链路已定位锚点推出；仍不可得时保留仍有效的旧绑定，否则清空。
 * 身份表不可用时不做任何改动（绑定引用的块可能仍可在之后恢复）。
 */
export function nextIdentityBindings(note, annotations, editorState = null) {
  const identity = note?.annotationStructure?.identity;
  if (!validIdentityTable(note?.rawMarkdown ?? '', identity)) return [];
  const reportedIdentity = identityFromEditorState(note.rawMarkdown, editorState);
  const reportMatches = reportedIdentity?.blocks.length === identity.blocks.length
    && reportedIdentity.blocks.every((block, index) => block.id === identity.blocks[index].id && block.type === identity.blocks[index].type);
  const reportedById = new Map((reportMatches ? editorState.annotations : []).map(item => [item.id, item]));
  const changes = [];
  const bindingContext = {}; // 仅本次保存共用同一份正文与身份表的不可变解析结果。
  for (const annotation of annotations) {
    if ((annotation.lifecycleStatus ?? 'active') !== 'active') continue;
    const reported = reportedById.get(annotation.id);
    const previous = annotation.identityBinding ?? null;
    const next = (reported?.scopeType === annotation.scopeType ? bindingFromEditor(note.rawMarkdown, identity, reported, bindingContext) : null)
      ?? bindingFromAnchor(note.rawMarkdown, identity, annotation, bindingContext)
      ?? (previous && validBinding(note.rawMarkdown, identity, previous, bindingContext) ? previous : null);
    if (JSON.stringify(next) !== JSON.stringify(previous)) changes.push({ annotation, identityBinding: next });
  }
  return changes;
}

/** 写入绑定变化；同步与异步仓储共用。诊断数据的计算失败不能影响保存。 */
export function applyIdentityBindings(repository, note, annotations, editorState) {
  let changes;
  try { changes = nextIdentityBindings(note, annotations, editorState); } catch { return []; }
  // 异步仓储（PostgreSQL 事务）逐条顺序写入，不在同一事务内并发查询。
  const saved = [];
  const step = (index) => {
    for (let i = index; i < changes.length; i += 1) {
      const { annotation, identityBinding } = changes[i];
      const result = repository.save({ ...annotation, identityBinding });
      if (result && typeof result.then === 'function') return result.then(item => { saved.push(item); return step(i + 1); });
      saved.push(result);
    }
    return saved;
  };
  return step(0);
}

/** 新建重点时由已确认的锚点推出初始绑定；不可得或出错时为 null。 */
export function initialIdentityBinding(note, annotation) {
  try {
    return bindingFromAnchor(note?.rawMarkdown ?? '', note?.annotationStructure?.identity, { ...annotation, anchorStatus: 'resolved' });
  } catch { return null; }
}

/**
 * 在笔记依赖级联之后刷新绑定：包住级联返回的 onNoteContentChanged，级联本身（及其冻结的调用序列）保持不变。
 * 绑定依赖旧链路跟随后的最终状态，因此必须在级联完成后执行。
 */
export function withIdentityBindingRefresh(lifecycle, repository) {
  const refresh = (note, annotationChange) => {
    const annotations = repository.list({ noteId: note.id, includeDeleted: true });
    return annotations && typeof annotations.then === 'function'
      ? annotations.then(list => applyIdentityBindings(repository, note, list, annotationChange?.editorState))
      : applyIdentityBindings(repository, note, annotations, annotationChange?.editorState);
  };
  return {
    ...lifecycle,
    onNoteIdentityChanged: refresh,
    onNoteContentChanged: (note, version, annotationChange) => {
      const result = lifecycle.onNoteContentChanged(note, version, annotationChange);
      if (result && typeof result.then === 'function') return result.then(async value => { await refresh(note, annotationChange); return value; });
      refresh(note, annotationChange);
      return result;
    }
  };
}
