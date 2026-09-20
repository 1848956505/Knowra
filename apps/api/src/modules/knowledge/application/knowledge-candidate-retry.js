/** 客户端复用创建 ID 时，只有完全相同且未审核的候选才可作为丢响应重试恢复。 */
export function matchesKnowledgeCandidateRequest(item, dto, evidence, inputs) {
  if (item.deletedAt || item.reviewStatus !== 'candidate') return false;
  if (!['title', 'canonicalStatement', 'userExplanation', 'knowledgeType', 'importance', 'sourceMode'].every((field) => item[field] === dto[field])) return false;
  if (evidence.length !== inputs.length) return false;
  return inputs.every((input, index) => {
    const record = evidence[index];
    if (record.sourceType !== (input.sourceType ?? 'manual')) return false;
    for (const field of ['id', 'sourceId', 'noteId', 'noteVersionId', 'annotationId']) {
      if (input[field] != null && String(input[field]).trim() !== record[field]) return false;
    }
    // 标注摘录由服务端读取；其他来源摘录是用户请求的一部分。
    if (record.sourceType !== 'annotation') {
      if (String(input.quoteText ?? '').trim() !== record.quoteText) return false;
      if (JSON.stringify(input.headingPath ?? []) !== JSON.stringify(record.headingPath)) return false;
    }
    return true;
  });
}
