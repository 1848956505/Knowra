import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPostgresTestDatabase } from '../../../scripts/test-support/postgres-test-database.mjs';
import { createPostgresAppContext } from '../src/postgres-app.factory.js';

const baseline = (objective, item) => ({ reviewBaseline: { objectiveUpdatedAt: objective.updatedAt, knowledgeUpdatedAt: item.updatedAt } });
async function fixture(operation) {
  const database = await createPostgresTestDatabase();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-objective-review-pg-'));
  const apps = [];
  try {
    for (const name of ['a', 'b']) apps.push(await createPostgresAppContext({ databaseUrl: database.databaseUrl, storageRootDir: path.join(root, name), uploadsDir: path.join(root, name, 'uploads') }));
    const api = apps[0].http.knowledge;
    const { item: candidate } = await api.createKnowledgeItem({ title: '合成父知识', canonicalStatement: '审阅测试的合成内容', sourceMode: 'manual' });
    const item = await api.confirmKnowledgeItem({ id: candidate.id });
    const objective = await api.createLearningObjective({ knowledgeItemId: item.id, objective: '能够解释合成知识', actionVerb: 'explain', cognitiveLevel: 'understand', reviewBaseline: { knowledgeUpdatedAt: item.updatedAt } });
    await operation({ a: apps[0], b: apps[1], api, item, objective });
  } finally {
    try { for (const app of apps) await app.close(); }
    finally { try { await database.close(); } finally { fs.rmSync(root, { recursive: true, force: true }); } }
  }
}
async function confirmedQuestion(api, objective, item) {
  const confirmed = await api.confirmLearningObjective({ id: objective.id }, baseline(objective, item));
  const question = await api.createQuestion({ stem: '合成判断题', questionType: 'trueFalse', referenceAnswer: true, learningObjectiveIds: [confirmed.id], sources: [{ sourceType: 'manual', sourceId: 'synthetic', quoteText: '人工合成测试' }] });
  await api.validateQuestion({ id: question.id });
  await api.confirmQuestion({ id: question.id });
  return { confirmed, question };
}

function assertRawSerializationConflict(error) {
  const seen = new Set();
  const causes = [];
  for (let cause = error; cause && typeof cause === 'object' && !seen.has(cause); cause = cause.cause) {
    seen.add(cause);
    causes.push({ code: cause.code, sqlState: cause.meta?.code });
  }
  assert(causes.some(cause => cause.code === 'P2010' && cause.sqlState === '40001'), '必须实际触发原始行锁 SQLSTATE 40001');
  console.log('OBJECTIVE_REVIEW_PG_RAW_SERIALIZATION', JSON.stringify(causes));
}
async function waitForParentLock(app) {
  // 真实 SQL 等待证据；轮询间隔只用于等待，不据 promise 或延迟推断加锁。
  const started = Date.now();
  for (let attempt = 0; attempt < 100 && Date.now() - started < 2000; attempt++) {
    const rows = await app.prisma.$queryRawUnsafe('SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = $1 AND query LIKE $2', 'Lock', 'SELECT id FROM "KnowledgeItem" WHERE id = $1 FOR UPDATE%');
    if (rows.length > 0) return;
    await delay(10);
  }
  assert.fail('目标审阅必须在事务内等待父知识行锁');
}

// 本地不伪装 PostgreSQL 能力；由隔离数据库 CI 显式注册执行。
export const learningObjectiveReviewPostgresTests = process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? [
  { name: '真实 PostgreSQL 目标审阅：实际父行锁与双连接目标基线竞争', async run() {
    await fixture(async ({ a, api, b, item, objective }) => {
      let release, acquired;
      const ready = new Promise(resolve => { acquired = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const holder = a.prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe('SELECT id FROM "KnowledgeItem" WHERE id = $1 FOR UPDATE', item.id);
        acquired();
        await gate;
        await tx.knowledgeItem.update({ where: { id: item.id }, data: { importance: 2, updatedAt: new Date(Date.parse(item.updatedAt) + 1) } });
      }, { timeout: 10000 });
      await ready;
      const waitingOutcome = b.http.knowledge.confirmLearningObjective({ id: objective.id }, baseline(objective, item))
        .then(value => ({ value }), error => ({ error }));
      try { await waitForParentLock(a); }
      finally { release(); await holder; }
      // Serializable 快照建立后父行确实改变：等待锁的旧审阅必须映射竞争，不能重新执行。
      const outcome = await waitingOutcome;
      assert.equal(outcome.error?.code, 'LEARNING_OBJECTIVE_UPDATE_CONFLICT');
      assert.equal(outcome.error?.statusCode, 409);
      assertRawSerializationConflict(outcome.error);
      assert.deepEqual(await api.getLearningObjective({ id: objective.id }), objective);
      const latestParent = await api.getKnowledgeItem({ id: item.id });
      assert.equal(latestParent.importance, 2);
      const results = await Promise.allSettled([
        api.updateLearningObjective({ id: objective.id }, { objective: '能够解释并发编辑后的内容', ...baseline(objective, latestParent) }),
        b.http.knowledge.confirmLearningObjective({ id: objective.id }, baseline(objective, latestParent))
      ]);
      assert.equal(results.filter(entry => entry.status === 'fulfilled').length, 1);
      assert.equal(results.find(entry => entry.status === 'rejected').reason.code, 'LEARNING_OBJECTIVE_UPDATE_CONFLICT');
      const accepted = results.find(entry => entry.status === 'fulfilled').value;
      assert.deepEqual(await api.getLearningObjective({ id: objective.id }), accepted);
      assert(Date.parse(accepted.updatedAt) > Date.parse(objective.updatedAt));
    });
  } },
  { name: '真实 PostgreSQL 父知识修改与目标确认竞争：最终目标和题目均失效', async run() {
    await fixture(async ({ a, api, b, item, objective }) => {
      const { confirmed, question } = await confirmedQuestion(api, objective, item);
      let release, written;
      const ready = new Promise(resolve => { written = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const originalTransaction = a.prisma.$transaction;
      let gated = false;
      // 仅暂停真实 updateMany 成功后的 callback；所有 SQL、返回值和提交仍由真实数据库处理。
      a.prisma.$transaction = (operation, options) => originalTransaction.call(a.prisma, tx => operation(new Proxy(tx, {
        get(target, key) {
          if (key === 'knowledgeItem') return new Proxy(target.knowledgeItem, {
            get(model, method) {
              if (method === 'updateMany') return async input => {
                const result = await model.updateMany(input);
                if (!gated && input.where.id === item.id && result.count === 1) {
                  gated = true;
                  written();
                  await gate;
                }
                return result;
              };
              const value = model[method];
              return typeof value === 'function' ? value.bind(model) : value;
            }
          });
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        }
      })), { ...options, timeout: 10000 });
      const parentOutcome = api.updateKnowledgeItem({ id: item.id }, { canonicalStatement: '父知识语义已经修订', expectedUpdatedAt: item.updatedAt })
        .then(value => ({ value }), error => ({ error }));
      try {
        // 防止父事务在到达 gate 前失败而悬挂验收。
        await Promise.race([ready, parentOutcome.then(outcome => { throw outcome.error ?? new Error('父事务未进入真实写锁 gate'); })]);
        const confirmationOutcome = b.http.knowledge.confirmLearningObjective({ id: confirmed.id }, baseline(confirmed, item))
          .then(value => ({ value }), error => ({ error }));
        try { await waitForParentLock(a); }
        finally { release(); }
        const parent = await parentOutcome;
        if (parent.error) throw parent.error;
        const confirmation = await confirmationOutcome;
        assert.equal(confirmation.error?.code, 'LEARNING_OBJECTIVE_UPDATE_CONFLICT');
        assert.equal(confirmation.error?.statusCode, 409);
        assertRawSerializationConflict(confirmation.error);
      } finally {
        release();
        await parentOutcome;
        a.prisma.$transaction = originalTransaction;
      }
      assert.equal((await api.getKnowledgeItem({ id: item.id })).reviewStatus, 'needsRevision');
      assert.equal((await api.getLearningObjective({ id: confirmed.id })).reviewStatus, 'candidate');
      assert.equal((await api.getQuestion({ id: question.id })).reviewStatus, 'candidate');
      await assert.rejects(b.http.knowledge.confirmLearningObjective({ id: confirmed.id }, baseline(confirmed, item)), { code: 'LEARNING_OBJECTIVE_UPDATE_CONFLICT' });
    });
  } },
  { name: '真实 PostgreSQL 目标与父知识失效：关联题目写入失败全部回滚', async run() {
    await fixture(async ({ a, api, item, objective }) => {
      const { confirmed, question } = await confirmedQuestion(api, objective, item);
      const beforeItem = await api.getKnowledgeItem({ id: item.id });
      const beforeObjective = await api.getLearningObjective({ id: confirmed.id });
      const beforeQuestion = await api.getQuestion({ id: question.id });
      await a.prisma.$executeRawUnsafe(`CREATE FUNCTION fail_objective_review_question() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected objective review question failure'; END $$`);
      await a.prisma.$executeRawUnsafe(`CREATE TRIGGER objective_review_question_failure BEFORE UPDATE ON "Question" FOR EACH ROW EXECUTE FUNCTION fail_objective_review_question()`);
      try {
        await assert.rejects(api.updateLearningObjective({ id: confirmed.id }, { objective: '能够解释失败回滚的修订', ...baseline(confirmed, item) }));
        assert.deepEqual(await api.getLearningObjective({ id: confirmed.id }), beforeObjective);
        assert.deepEqual(await api.getQuestion({ id: question.id }), beforeQuestion);
        await assert.rejects(api.updateKnowledgeItem({ id: item.id }, { canonicalStatement: '同一事务中失败的父知识修订', expectedUpdatedAt: item.updatedAt }));
        assert.deepEqual(await api.getKnowledgeItem({ id: item.id }), beforeItem);
        assert.deepEqual(await api.getLearningObjective({ id: confirmed.id }), beforeObjective);
        assert.deepEqual(await api.getQuestion({ id: question.id }), beforeQuestion);
      } finally {
        await a.prisma.$executeRawUnsafe('DROP TRIGGER objective_review_question_failure ON "Question"');
        await a.prisma.$executeRawUnsafe('DROP FUNCTION fail_objective_review_question()');
      }
      const saved = await api.updateLearningObjective({ id: confirmed.id }, { objective: '能够解释成功提交的修订', ...baseline(confirmed, item) });
      assert.equal(saved.reviewStatus, 'candidate');
      assert.equal((await api.getQuestion({ id: question.id })).reviewStatus, 'candidate');
    });
  } }
] : [];
