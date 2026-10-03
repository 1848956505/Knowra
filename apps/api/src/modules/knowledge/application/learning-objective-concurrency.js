import { createAppError } from '../../../errors/app-error.js';
import { conflictError } from './knowledge-errors.js';

const invalidBaseline = message => createAppError('LEARNING_OBJECTIVE_BASELINE_INVALID', message, 400);
const conflictMessage = '目标或父知识已被其他操作修改，请重新加载并核对后再保存或确认。';

function readReviewBaseline(input = {}, hasObjective = true) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalidBaseline('学习目标审阅参数无效。');
  }
  if (!Object.hasOwn(input, 'reviewBaseline')) return null;
  const baseline = input.reviewBaseline;
  const fields = hasObjective ? ['objectiveUpdatedAt', 'knowledgeUpdatedAt'] : ['knowledgeUpdatedAt'];
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)
    || fields.some(field => typeof baseline[field] !== 'string'
      || !Number.isFinite(Date.parse(baseline[field]))
      || new Date(baseline[field]).toISOString() !== baseline[field])) {
    throw invalidBaseline('审阅版本无效，请重新加载后再操作。');
  }
  return baseline;
}

/** 旧调用可省略；审阅入口须提交所展示的父知识与目标基线。 */
export function assertLearningObjectiveBaseline(objective, knowledgeItem, input = {}) {
  const baseline = readReviewBaseline(input, Boolean(objective));
  if (!baseline) return;
  const matches = (left, right) => typeof right === 'string' && Number.isFinite(Date.parse(right))
    && left === new Date(right).toISOString();
  if (!matches(baseline.knowledgeUpdatedAt, knowledgeItem.updatedAt)
    || (objective && !matches(baseline.objectiveUpdatedAt, objective.updatedAt))) {
    throw conflictError('LEARNING_OBJECTIVE_UPDATE_CONFLICT', conflictMessage);
  }
}

function isPostgresReviewConflict(error) {
  const seen = new Set();
  for (let cause = error; cause && typeof cause === 'object' && !seen.has(cause); cause = cause.cause) {
    seen.add(cause);
    if (cause.code === 'P2034'
      || (cause.code === 'P2010' && ['40001', '40P01'].includes(cause.meta?.code))) return true;
  }
  return false;
}

/** 仅新审阅动作映射可重审的事务竞争；不重试，也不改变旧调用或其他 API 错误。 */
export async function withLearningObjectiveReviewErrors(input, operation, { hasObjective = true } = {}) {
  const baseline = readReviewBaseline(input, hasObjective);
  try {
    return await operation();
  } catch (error) {
    const isExistingDomainError = error?.code && Number.isInteger(error.statusCode)
      && !error.code.startsWith('DATABASE_');
    if (baseline && !isExistingDomainError && isPostgresReviewConflict(error)) {
      throw createAppError('LEARNING_OBJECTIVE_UPDATE_CONFLICT', conflictMessage, 409, { cause: error });
    }
    throw error;
  }
}

export function nextLearningObjectiveTimestamp(objective) {
  return new Date(Math.max(Date.now(), (Date.parse(objective?.updatedAt) || 0) + 1)).toISOString();
}
