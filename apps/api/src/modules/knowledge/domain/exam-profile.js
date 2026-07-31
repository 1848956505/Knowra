function cloneJson(value, fallback) {
  if (value === undefined || value === null) return structuredClone(fallback);
  return structuredClone(value);
}

export class ExamProfile {
  constructor({
    id,
    name,
    description = '',
    scope = [],
    language = 'zh-CN',
    commonQuestionTypes = [],
    difficultyProfile = {},
    archivedAt = null,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim()) throw new Error('ExamProfile id is required');
    if (typeof name !== 'string' || !name.trim()) throw new Error('ExamProfile name is required');
    if (typeof description !== 'string' || typeof language !== 'string') throw new Error('ExamProfile text fields are invalid');
    if (!Array.isArray(scope) || !Array.isArray(commonQuestionTypes) || !difficultyProfile || typeof difficultyProfile !== 'object' || Array.isArray(difficultyProfile)) {
      throw new Error('ExamProfile structured fields are invalid');
    }

    Object.assign(this, {
      id,
      name: name.trim(),
      description: description.trim(),
      scope: cloneJson(scope, []),
      language: language.trim() || 'zh-CN',
      commonQuestionTypes: cloneJson(commonQuestionTypes, []),
      difficultyProfile: cloneJson(difficultyProfile, {}),
      archivedAt,
      createdAt,
      updatedAt
    });
  }
}
