export interface ExamProfileConstructorInput {
  id: string;
  name: string;
  description?: string;
  scope?: unknown[];
  language?: string;
  commonQuestionTypes?: unknown[];
  difficultyProfile?: object;
  archivedAt?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function cloneJson<T>(value: T | null | undefined, fallback: T): T {
  if (value === undefined || value === null) return structuredClone(fallback);
  return structuredClone(value);
}

export class ExamProfile {
  declare id: string;
  declare name: string;
  declare description: string;
  declare scope: unknown[];
  declare language: string;
  declare commonQuestionTypes: unknown[];
  declare difficultyProfile: object;
  declare archivedAt: string | null;
  declare deletedAt: string | null;
  declare createdAt: string;
  declare updatedAt: string;

  constructor({
    id,
    name,
    description = '',
    scope = [],
    language = 'zh-CN',
    commonQuestionTypes = [],
    difficultyProfile = {},
    archivedAt = null,
    deletedAt = null,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }: ExamProfileConstructorInput) {
    if (!id?.trim()) throw new Error('ExamProfile id is required');
    if (typeof name !== 'string' || !name.trim()) throw new Error('ExamProfile name is required');
    if (typeof description !== 'string' || typeof language !== 'string')
      throw new Error('ExamProfile text fields are invalid');
    if (
      !Array.isArray(scope) ||
      !Array.isArray(commonQuestionTypes) ||
      !difficultyProfile ||
      typeof difficultyProfile !== 'object' ||
      Array.isArray(difficultyProfile)
    ) {
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
      deletedAt,
      createdAt,
      updatedAt
    });
  }
}
