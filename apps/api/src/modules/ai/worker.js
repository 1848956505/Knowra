import { randomUUID } from 'node:crypto';
import { hashRecord } from './record-contract.js';
import { beijingDay } from './budget-ledger.js';
import { normalizeAiRequest } from './gateway.js';
import { outboundPayloadHash, serializedDeepSeekPayload } from './outbound-payload.js';

const MAX_ATTEMPTS = 4;
const MAX_INPUT_TOKENS = 100_000;
const MAX_OUTPUT_TOKENS = 20_000;
const LEASE_MS = 120_000;
const allowedTools = new Set(['notes_search', 'notes_read']);
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function later(now, previous) { return new Date(Math.max(now.getTime(), Date.parse(previous) + 1)).toISOString(); }
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;

/** 价格配置由受信部署代码提供；过期或缺失时拒绝付费调用。 */
export function quoteWorstCase({ request, priceProfile, now = new Date() }) {
  if (!priceProfile?.version || !Number.isFinite(Date.parse(priceProfile.expiresAt)) || Date.parse(priceProfile.expiresAt) <= now.getTime()
    || !nonnegative(priceProfile.inputMicrounitsPerMillion) || !nonnegative(priceProfile.outputMicrounitsPerMillion)) {
    fail('AI_PRICE_UNAVAILABLE', '当前价格配置不可用，已阻止模型调用。');
  }
  if (!request || !Array.isArray(request.messages) || !Number.isSafeInteger(request.maxTokens)
    || request.maxTokens < 1 || request.maxTokens > MAX_OUTPUT_TOKENS
    || !Array.isArray(request.tools) || request.tools.length > 8
    || request.tools.some(tool => !allowedTools.has(tool.name))) fail('AI_REQUEST_LIMIT', '模型调用超过 P1 边界。');
  // 以实际发送的完整 JSON 请求体字节数作保守输入上界，包含工具 schema 等元数据。
  const normalized = normalizeAiRequest(request);
  const outbound = { ...normalized, modelId: request.modelId };
  const serialized = serializedDeepSeekPayload(outbound);
  const inputUpperBound = Buffer.byteLength(serialized, 'utf8');
  if (inputUpperBound > MAX_INPUT_TOKENS) fail('AI_REQUEST_LIMIT', '输入超过单任务 token 上限。');
  const estimate = Math.ceil((inputUpperBound * priceProfile.inputMicrounitsPerMillion
    + request.maxTokens * priceProfile.outputMicrounitsPerMillion) / 1_000_000);
  // 两倍预留缓冲供应商 token 计数与价格差异；仍受 2 元任务上限限制。
  const reservedMicrounits = Math.max(1, estimate * 2);
  if (reservedMicrounits > 2_000_000) fail('AI_JOB_BUDGET_EXCEEDED', '最坏费用超过任务预留上限。');
  return { reservedMicrounits, inputUpperBound, payloadHash: outboundPayloadHash(outbound) };
}

export function createAiWorker({ repository, budget, gateway, priceProfile, accountRef = 'deepseek-primary',
  workerId = randomUUID(), now = () => new Date(), allowExternal = false,
  authorizeAttempt = () => {}, revokeAttempt = () => {}, verifySources = null, validateResult = null } = {}) {
  if (!repository || !budget || !gateway) throw new TypeError('AI Worker needs repository, budget and gateway');
  const controllers = new Map();

  async function replace(kind, previous, patch) {
    const next = { ...previous, ...patch };
    if (kind === 'aiJob') next.updatedAt = later(now(), previous.updatedAt);
    return repository.replace(kind, next, hashRecord(previous));
  }
  async function validBoundary(job) {
    const identity = await repository.identity();
    const grant = await repository.get('aiGrant', job.grantId);
    const manifest = await repository.get('contextManifest', job.manifestId);
    if (!grant || !manifest || job.datasetId !== identity.datasetId || job.datasetEpoch !== identity.datasetEpoch
      || grant.datasetEpoch !== identity.datasetEpoch || grant.revokedAt || Date.parse(grant.expiresAt) <= now().getTime()
      || manifest.datasetEpoch !== identity.datasetEpoch || job.manifestHash !== hashRecord(manifest)) {
      fail('AI_GRANT_STALE', '任务授权或资料集已失效。');
    }
    return { grant, manifest };
  }
  async function cancel(jobId) {
    const job = await repository.get('aiJob', jobId);
    if (!job) fail('AI_JOB_NOT_FOUND', '任务不存在。');
    if (['cancelled', 'succeeded', 'failed'].includes(job.status)) return job;
    const next = job.status === 'cancelling' ? job : await replace('aiJob', job, { status: 'cancelling' });
    controllers.get(jobId)?.abort();
    return next;
  }
  async function recover() {
    const identity = await repository.identity();
    const jobs = await repository.list('aiJob');
    let changed = 0;
    for (const job of jobs) {
      if (job.datasetId !== identity.datasetId || job.datasetEpoch !== identity.datasetEpoch) continue;
      if (!['running', 'cancelling'].includes(job.status)) continue;
      const attempts = (await repository.list('aiJobAttempt', { jobId: job.jobId })).sort((a, b) => b.ordinal - a.ordinal);
      const active = attempts[0];
      if (job.status !== 'cancelling' && active && Date.parse(active.leaseExpiresAt) > now().getTime()) continue;
      if (active && ['leased', 'sent'].includes(active.status)) {
        await replace('aiJobAttempt', active, { status: job.status === 'cancelling' ? 'cancelled' : 'timedOut',
          deliveryUncertain: active.status === 'sent', finishedAt: now().toISOString() });
        // 预留既可能已送达供应商，也可能没有；超时一律保守占用，不能算零费用。
        await Promise.resolve().then(() => budget.settle({ accountRef, attemptId: active.attemptId, disposition: 'unknown' })).catch(error => {
          if (error.code !== 'AI_BUDGET_NOT_FOUND') throw error;
        });
      }
      const current = await repository.get('aiJob', job.jobId);
      if (current.status === job.status) { await replace('aiJob', current, { status: job.status === 'cancelling' ? 'cancelled' : 'failed', phase: 'finished' }); changed++; }
    }
    return changed;
  }
  async function run(jobId, request) {
    let job = await repository.get('aiJob', jobId);
    if (!job) fail('AI_JOB_NOT_FOUND', '任务不存在。');
    const provider = gateway.capabilities?.().provider;
    if (provider !== 'mock' && !allowExternal) fail('AI_EGRESS_NOT_READY', '实际资料发送范围尚未完成核验。');
    if (provider !== 'mock' && (!verifySources || !validateResult)) fail('AI_CONTEXT_NOT_READY', '来源与回答校验尚未接入。');
    const { grant, manifest } = await validBoundary(job);
    if (verifySources) await verifySources(job, request);
    if (request?.modelId !== job.modelId || request?.credentialRef !== job.credentialRef
      || job.jobKind !== 'answer' || !grant.actionKinds.includes('read')
      || request?.tools?.some(tool => !allowedTools.has(tool.name) || !grant.allowedTools.includes(tool.name))
      || manifest.attachmentIds.length) {
      fail('AI_REQUEST_INVALID', '执行请求与任务配置不一致。');
    }
    const quote = quoteWorstCase({ request, priceProfile, now: now() });
    if (manifest.payloadHash !== quote.payloadHash) fail('AI_PAYLOAD_STALE', '实际发送内容与已确认范围不一致。');
    const attempts = await repository.list('aiJobAttempt', { jobId });
    if (attempts.length >= MAX_ATTEMPTS) fail('AI_ATTEMPT_LIMIT', '任务已达到四次调用上限。');
    if (job.status === 'failed') job = await replace('aiJob', job, { status: 'retrying', phase: 'preparing' });
    if (!['pending', 'retrying'].includes(job.status)) fail('AI_JOB_NOT_RUNNABLE', '任务当前不可领取。');
    job = await replace('aiJob', job, { status: 'running', phase: 'generating' });
    const startedAt = now().toISOString();
    let attempt = await repository.insert('aiJobAttempt', { contractVersion: 1, kind: 'aiJobAttempt',
      attemptId: randomUUID(), jobId, ordinal: attempts.length + 1,
      leaseGeneration: Math.max(0, ...attempts.map(item => item.leaseGeneration)) + 1,
      leaseOwner: workerId, leaseExpiresAt: new Date(now().getTime() + LEASE_MS).toISOString(),
      providerRequestId: null, deliveryUncertain: false, status: 'leased', startedAt, finishedAt: null });
    let reserved = false;
    let sent = false;
    const controller = new AbortController();
    controllers.set(jobId, controller);
    const timer = setTimeout(() => controller.abort(), LEASE_MS);
    timer.unref?.();
    try {
      await budget.reserve({ accountRef, jobId, attemptId: attempt.attemptId, priceVersion: priceProfile.version,
        reservedMicrounits: quote.reservedMicrounits, day: beijingDay(now()) });
      reserved = true;
      const beforeSend = await repository.get('aiJob', jobId);
      await validBoundary(beforeSend);
      if (verifySources) await verifySources(beforeSend, request);
      if (beforeSend.status !== 'running' || controller.signal.aborted) fail('AI_CANCELLED', '任务已取消，未发送模型请求。');
      attempt = await replace('aiJobAttempt', attempt, { status: 'sent' });
      sent = true;
      authorizeAttempt(attempt.attemptId);
      const result = await gateway.complete({ ...request, signal: controller.signal, budgetAttemptId: attempt.attemptId });
      const currentJob = await repository.get('aiJob', jobId);
      const currentAttempt = await repository.get('aiJobAttempt', attempt.attemptId);
      await validBoundary(currentJob);
      if (currentJob.status !== 'running' || currentAttempt.status !== 'sent'
        || currentAttempt.leaseGeneration !== attempt.leaseGeneration
        || Date.parse(currentAttempt.leaseExpiresAt) <= now().getTime() || controller.signal.aborted) {
        fail('AI_LATE_RESULT', '任务已取消或租约失效，迟到响应已丢弃。');
      }
      if (validateResult) await validateResult(currentJob, result);
      const usage = result.usage;
      const actual = usage?.unknown ? null : Math.ceil((usage.inputTokens * priceProfile.inputMicrounitsPerMillion
        + usage.outputTokens * priceProfile.outputMicrounitsPerMillion) / 1_000_000);
      if (actual !== null && (actual > quote.reservedMicrounits || usage.inputTokens > MAX_INPUT_TOKENS
        || usage.outputTokens > MAX_OUTPUT_TOKENS)) fail('AI_USAGE_LIMIT', '供应商用量超过预留或任务边界。');
      await budget.settle({ accountRef, attemptId: attempt.attemptId, disposition: actual === null ? 'unknown' : 'settled', actualMicrounits: actual });
      await repository.insert('aiUsageRecord', { contractVersion: 1, kind: 'aiUsageRecord', usageId: randomUUID(),
        jobId, attemptId: attempt.attemptId, beijingDay: beijingDay(new Date(startedAt)), currency: 'CNY',
        priceVersion: priceProfile.version, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
        reservedMicrounits: quote.reservedMicrounits, actualMicrounits: actual,
        usageUnknown: actual === null, createdAt: now().toISOString() });
      attempt = await replace('aiJobAttempt', currentAttempt, { status: 'validated', providerRequestId: result.requestId ?? null,
        finishedAt: now().toISOString() });
      await replace('aiJob', currentJob, { status: 'succeeded', phase: 'finished', acceptedAttemptId: attempt.attemptId,
        outputHash: hashRecord(result.content ?? '') });
      return result;
    } catch (error) {
      if (reserved) await Promise.resolve().then(() => budget.settle({ accountRef, attemptId: attempt.attemptId,
        disposition: sent ? 'unknown' : 'released' })).catch(() => undefined);
      const currentAttempt = await repository.get('aiJobAttempt', attempt.attemptId);
      if (['leased', 'sent'].includes(currentAttempt?.status)) await replace('aiJobAttempt', currentAttempt, {
        status: controller.signal.aborted ? 'cancelled' : 'rejected', deliveryUncertain: sent,
        finishedAt: now().toISOString() });
      const currentJob = await repository.get('aiJob', jobId);
      if (['running', 'cancelling'].includes(currentJob?.status)) await replace('aiJob', currentJob,
        { status: currentJob.status === 'cancelling' ? 'cancelled' : 'failed', phase: 'finished' });
      throw error;
    } finally { revokeAttempt(attempt.attemptId); clearTimeout(timer); controllers.delete(jobId); }
  }
  return { run, cancel, recover };
}
