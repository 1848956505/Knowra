import { randomUUID } from 'node:crypto';

/** 存活关系保持身份；解除后重建同一组合使用新 ID，不能复活删除墓碑。 */
export function questionObjectiveRecords(questionId, objectiveIds, previous = [], createdAt = new Date().toISOString()) {
  const byObjective = new Map(previous.map(record => [record.learningObjectiveId, record]));
  return [...new Set(objectiveIds)].map((learningObjectiveId, order) => {
    const current = byObjective.get(learningObjectiveId);
    return { id: current?.id ?? `question-objective-${randomUUID()}`, questionId, learningObjectiveId,
      isPrimary: order === 0, order, createdAt: current?.createdAt ?? createdAt };
  });
}
