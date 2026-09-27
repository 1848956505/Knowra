import { randomUUID } from 'node:crypto';
import { hashRecord, manifestHash } from './record-contract.js';

const PREVIEW_TTL_MS = 5 * 60_000;
const MAX_PREVIEWS = 32;
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const safeCode = value => typeof value === 'string' && /^AI_[A-Z0-9_]{1,64}$/.test(value)
  ? value : 'AI_TASK_FAILED';

/** HTTP 层只传递经过白名单整理的任务视图。预览请求仅在进程内短时保留。 */
export function createAiAssistantService({ getRuntime, ownerId, location = 'server', now = () => new Date(), logger = console }) {
  const previews = new Map();
  const runtime = () => getRuntime?.();
  const identity = async () => runtime()?.repository?.identity();
  async function appendDiagnostic(jobId, eventKind, safePayload) {
    try {
      const repository = runtime().repository;
      const sequence = (await repository.listEvents(jobId)).length + 1;
      await repository.appendEvent({ jobId, sequence, eventKind, safePayload, createdAt: now().toISOString() });
    } catch (error) {
      logger.warn?.('AI diagnostic event could not be saved', { jobId, eventKind,
        code: safeCode(error?.code) });
    }
  }

  function available(reference) {
    const ai = runtime();
    return Boolean(reference && ai?.readContext && ai?.worker && (typeof ai.generationAvailable === 'function'
      ? ai.generationAvailable(reference.modelId) : ai.generationAvailable));
  }

  async function readiness(reference) {
    if (!reference) return { ready: false, reason: '请先在设置中配置模型。', budget: null };
    if (!available(reference)) {
      const profile = runtime()?.priceProfile;
      const reason = profile?.modelId !== reference.modelId ? '当前模型尚未核价，请在设置中选择 deepseek-flash。'
        : profile?.expiresAt && Date.parse(profile.expiresAt) <= now().getTime() ? '模型价格档案已过期，请更新服务后重试。'
          : '当前运行端尚未启用真实模型调用。';
      return { ready: false, reason, budget: null };
    }
    try {
      const budget = await runtime().budgetAuthority?.status('deepseek-primary');
      if (!budget || budget.accountRef !== 'deepseek-primary' || !/^\d{4}-\d{2}-\d{2}$/.test(budget.day)
        || budget.limitMicrounits !== 10_000_000 || !Number.isSafeInteger(budget.availableMicrounits)
        || !Number.isSafeInteger(budget.spentMicrounits) || budget.spentMicrounits < 0
        || !Number.isSafeInteger(budget.heldMicrounits) || budget.heldMicrounits < 0
        || budget.availableMicrounits < 0 || budget.availableMicrounits > budget.limitMicrounits) {
        return { ready: false, reason: '预算状态无效，已阻止模型调用。', budget: null };
      }
      return budget.availableMicrounits > 0
        ? { ready: true, reason: null, budget: { day: budget.day, limitMicrounits: budget.limitMicrounits,
          availableMicrounits: budget.availableMicrounits, spentMicrounits: budget.spentMicrounits,
          heldMicrounits: budget.heldMicrounits } }
        : { ready: false, reason: '北京时间当日 10 元预算已用完。', budget: { day: budget.day,
          limitMicrounits: budget.limitMicrounits, availableMicrounits: 0,
          spentMicrounits: budget.spentMicrounits, heldMicrounits: budget.heldMicrounits } };
    } catch {
      return { ready: false, reason: '云端预算服务不可用，已阻止模型调用。', budget: null };
    }
  }

  async function status() {
    const ai = runtime();
    const reference = await ai?.credentialReference?.();
    const state = await readiness(reference);
    const provider = ai?.gateway?.capabilities?.();
    return { provider: 'deepseek', modelId: reference?.modelId ?? null, configured: Boolean(reference),
      executionLocation: location, generationAvailable: state.ready, unavailableReason: state.reason,
      budget: state.budget,
      capabilities: { readScopes: ['note', 'folder'], actions: ['answer', 'cancel'],
        responseMode: 'polling', writeTools: false,
        providerAdvertised: provider?.advertised ?? null, providerVerified: provider?.verified === true } };
  }

  async function assertJob(jobId) {
    const ai = runtime();
    const current = await identity();
    const job = await ai?.repository?.get('aiJob', jobId);
    if (!job || job.ownerId !== ownerId || job.datasetId !== current?.datasetId
      || job.datasetEpoch !== current?.datasetEpoch || job.jobKind !== 'answer') {
      fail('AI_JOB_NOT_FOUND', '任务不存在或资料集已切换。');
    }
    return job;
  }

  async function view(job, detailed = false) {
    const base = { jobId: job.jobId, spaceId: job.spaceId, question: job.question ?? null,
      status: job.status, phase: job.phase, modelId: job.modelId, createdAt: job.createdAt,
      updatedAt: job.updatedAt };
    if (!detailed) return base;
    const [manifest, events] = await Promise.all([
      runtime().repository.get('contextManifest', job.manifestId),
      runtime().repository.listEvents(job.jobId)
    ]);
    return { ...base, result: job.status === 'succeeded' ? job.resultJson ?? null : null,
      diagnostics: events.map(({ sequence, eventKind, safePayload, createdAt }) => (
        { sequence, eventKind, safePayload, createdAt })),
      sources: manifest?.sources.map(({ sourceId, noteId, noteVersionId, start, end }) => (
        { sourceId, noteId, noteVersionId, start, end })) ?? [],
      omissions: manifest?.omissions ?? [] };
  }

  async function list(spaceId) {
    if (typeof spaceId !== 'string' || !spaceId) fail('AI_SCOPE_INVALID', '请选择知识空间。');
    const ai = runtime();
    if (!ai?.repository) return [];
    const current = await identity();
    const jobs = await ai.repository.list('aiJob', { ownerId, datasetId: current.datasetId,
      datasetEpoch: current.datasetEpoch, spaceId, jobKind: 'answer' });
    return Promise.all(jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50).map(job => view(job)));
  }

  async function get(jobId) { return view(await assertJob(jobId), true); }

  async function preview(input) {
    const ai = runtime();
    const reference = await ai?.credentialReference?.();
    if (!reference || !ai?.readContext) fail('AI_NOT_CONFIGURED', '请先在设置中配置模型。');
    const prepared = await ai.readContext.prepareRead({ spaceId: input?.spaceId, scope: input?.scope,
      question: input?.question, modelId: reference.modelId, credentialRef: reference.credentialRef });
    for (const [id, item] of previews) if (item.expiresAt <= now().getTime()) previews.delete(id);
    if (previews.size >= MAX_PREVIEWS) previews.delete(previews.keys().next().value);
    const previewId = randomUUID();
    const expiresAt = now().getTime() + PREVIEW_TTL_MS;
    previews.set(previewId, { prepared, expiresAt, credentialRef: reference.credentialRef });
    return { previewId, expiresAt: new Date(expiresAt).toISOString(),
      scopeHash: prepared.scopeSnapshot.scopeHash, payloadHash: prepared.manifest.payloadHash,
      ...prepared.preview };
  }

  async function start(input) {
    const reference = await runtime()?.credentialReference?.();
    const state = await readiness(reference);
    if (!state.ready) fail('AI_GENERATION_UNAVAILABLE', state.reason);
    const item = previews.get(input?.previewId);
    if (!item || item.expiresAt <= now().getTime()) fail('AI_PREVIEW_EXPIRED', '预览已过期，请重新预览。');
    if (input.scopeHash !== item.prepared.scopeSnapshot.scopeHash
      || input.payloadHash !== item.prepared.manifest.payloadHash) fail('AI_APPROVAL_STALE', '确认范围与预览不一致。');
    if (typeof input.idempotencyKey !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(input.idempotencyKey)) {
      fail('AI_REQUEST_INVALID', '任务幂等键无效。');
    }
    const ai = runtime();
    if (reference?.credentialRef !== item.credentialRef) fail('AI_CREDENTIAL_STALE', '模型配置已改变，请重新预览。');
    previews.delete(input.previewId);
    const { manifest, grant, request } = await ai.readContext.authorizeRead({ prepared: item.prepared,
      actorId: ownerId, approvedScopeHash: input.scopeHash, approvedPayloadHash: input.payloadHash });
    const timestamp = now().toISOString();
    const question = JSON.parse(request.messages[1].content).question;
    const job = await ai.repository.insert('aiJob', { contractVersion: 1, kind: 'aiJob',
      jobId: randomUUID(), requestId: randomUUID(), parentJobId: null,
      ownerId, datasetId: grant.datasetId, datasetEpoch: grant.datasetEpoch, spaceId: grant.spaceId,
      grantId: grant.grantId, jobKind: 'answer', idempotencyKey: input.idempotencyKey,
      inputHash: hashRecord({ question, payloadHash: manifest.payloadHash }),
      manifestId: manifest.manifestId, manifestHash: manifestHash(manifest), credentialRef: request.credentialRef,
      provider: 'deepseek', modelId: request.modelId, promptVersion: 'p1-read-v1', resultSchemaVersion: 'p1-answer-v1',
      status: 'pending', phase: 'preparing', acceptedAttemptId: null, outputHash: null,
      question, createdAt: timestamp, updatedAt: timestamp });
    await appendDiagnostic(job.jobId, 'taskCreated', { phase: 'preparing', status: 'pending' });
    queueMicrotask(() => { void ai.worker.run(job.jobId, request).catch(async error => {
      const current = await ai.repository.get('aiJob', job.jobId);
      if (current && ['pending', 'retrying'].includes(current.status)) {
        await ai.repository.replace('aiJob', { ...current, status: 'failed', phase: 'finished',
          updatedAt: new Date(Math.max(now().getTime(), Date.parse(current.updatedAt) + 1)).toISOString() }, hashRecord(current));
      }
      await appendDiagnostic(job.jobId, 'taskFailed', {
        code: safeCode(error?.code), status: 'failed' });
      logger.warn?.('AI assistant task failed', { jobId: job.jobId, code: safeCode(error?.code) });
    }).catch(error => logger.error?.('AI task failure could not be persisted', { jobId: job.jobId,
      code: safeCode(error?.code) })); });
    return view(job, true);
  }

  async function cancel(jobId) {
    await assertJob(jobId);
    return view(await runtime().worker.cancel(jobId), true);
  }

  return { status, list, get, preview, start, cancel };
}
