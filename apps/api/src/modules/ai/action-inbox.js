import { hashRecord } from './record-contract.js';
import { actionError } from './action-state.js';
import { buildActionPlan, finalizePlan } from './action-plan.js';

const pending = ['awaitingApproval', 'authorized', 'conflicted', 'expired'];
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value;
const requireInput = (input, keys) => {
  if (!input || Object.keys(input).some(key => !keys.includes(key)) || !validId(input.requestId)
    || !/^[a-f0-9]{64}$/.test(input.planHash)) actionError('AI_REQUEST_INVALID', '成果修订或重新预览请求无效。', 422);
};
const eventFor = (row, input, kind) => {
  const event = row.inboxEvents?.find(event => event.requestId === input.requestId);
  if (event && (event.kind !== kind || event.inputHash !== hashRecord(input))) actionError('AI_IDEMPOTENCY_CONFLICT', '相同成果请求 ID 的输入已变化。');
  return event;
};
const ensurePending = (row, input) => {
  if (row.plan.planHash !== input.planHash) actionError('AI_ACTION_PLAN_CHANGED', '成果已修订，请查看当前差异。');
  if (!pending.includes(row.status)) actionError('AI_ACTION_CONFLICT', '成果当前不可修订或重新预览。');
};

/** 成果是待审动作的视图；未经采纳不会出现在笔记库或普通笔记检索中。 */
export function createActionInboxMethods({ service, store, ownerId, now, run, rowFor, references, verifyDraft, verifyRevisionTurn }) {
  async function update(actionId, input, kind, build, origin = null) {
    await service.get(actionId);
    return store.transaction(() => run((function* () {
      const state = yield store.read(), row = rowFor(state, actionId, ownerId);
      if (eventFor(row, input, kind)) return row;
      ensurePending(row, input);
      yield verifyDraft(row, state, yield store.identity());
      const nextPlan = build ? yield build(row) : row.plan;
      if (origin) yield verifyRevisionTurn(origin, row);
      return yield store.write((current, identity) => {
        const latest = rowFor(current, actionId, ownerId);
        if (eventFor(latest, input, kind)) return latest;
        ensurePending(latest, input);
        if (latest.datasetId !== identity.datasetId || latest.datasetEpoch !== identity.datasetEpoch) actionError('AI_DATASET_STALE', '资料集已变化。');
        const previousPlan = latest.plan;
        latest.plan = nextPlan;
        if (origin?.sourceRefs) latest.grant.sourceRefs = [...new Map([...(latest.grant.sourceRefs ?? []), ...origin.sourceRefs].map(ref => [hashRecord(ref), structuredClone(ref)])).values()];
        latest.expiresAt = new Date(now().getTime() + 30 * 60000).toISOString();
        latest.grant.expiresAt = latest.expiresAt;
        latest.approval = null; latest.errorCode = null; latest.status = 'awaitingApproval';
        latest.inboxEvents ??= [];
        latest.inboxEvents.push({ kind, requestId: input.requestId, inputHash: hashRecord(input), createdAt: now().toISOString(),
          previousPlan, resultPlanHash: latest.plan.planHash, ...(origin ? { originTurnId: origin.turnId, originGeneration: origin.leaseGeneration } : {}) });
        return latest;
      });
    })()));
  }
  const methods = {
    async listInbox(spaceId) {
      // service.list performs owner/space authorization, but intentionally caps execution-history rows.
      await service.list(spaceId);
      const identity = await store.identity();
      const rows = (await store.read()).actions.filter(row => row.ownerId === ownerId && row.spaceId === spaceId
        && row.datasetId === identity.datasetId && row.plan.toolName !== 'notes_undo');
      return Promise.all(rows.map(async row => {
        const current = await service.get(row.actionId);
        return { ...current, datasetStale: current.datasetEpoch !== identity.datasetEpoch, reviewRequired: pending.includes(current.status),
          reauthorizationRequired: pending.includes(current.status) && Date.parse(current.expiresAt) <= now().getTime(),
          draftRetrieval: 'excluded', revision: (current.inboxEvents ?? []).filter(event => event.kind === 'revise').length + 1 };
      }));
    },
    async repreview(actionId, input) {
      requireInput(input, ['planHash', 'requestId']);
      return update(actionId, input, 'repreview');
    },
    async reviseForAssistantTurn(actionId, input, origin) { return methods.revise(actionId, input, origin); },
    async revise(actionId, input, origin = null) {
      requireInput(input, ['planHash', 'requestId', 'arguments']);
      if (!input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments)) actionError('AI_REQUEST_INVALID', '成果修订内容无效。', 422);
      return update(actionId, input, 'revise', row => run((function* () {
        const notes = row.plan.items.filter(item => item.before).map(item => ({ ...item.before, updatedAt: item.baseline.expectedUpdatedAt }));
        const args = structuredClone(input.arguments);
        if (row.plan.toolName === 'notes_propose_organize' && Array.isArray(args.changes)) {
          const order = new Map(row.plan.items.map((item, index) => [item.after.id, index]));
          args.changes.sort((left, right) => order.get(left.noteId) - order.get(right.noteId));
        }
        const targets = row.plan.toolName === 'notes_propose_organize' ? args.changes?.map(change => change.noteId) : [args.noteId];
        if (row.plan.toolName !== 'notes_create' && hashRecord([...(targets ?? [])].sort()) !== hashRecord(row.plan.items.map(item => item.after.id).sort())) actionError('AI_SCOPE_FORBIDDEN', '修订不得更换成果目标。', 403);
        const changes = row.plan.toolName === 'notes_propose_organize' ? args.changes : [args];
        const refs = yield run(references(row.spaceId, { folders: [...notes.map(note => note.folderId), ...changes.map(change => change.folderId)],
          tags: [...notes.flatMap(note => note.tagIds), ...changes.flatMap(change => change.tagIds ?? [])] }));
        const built = buildActionPlan({ toolName: row.plan.toolName, args, notes, references: refs,
          trusted: { ...row, identity: Object.fromEntries(['ownerId', 'actorId', 'datasetId', 'datasetEpoch', 'spaceId', 'requestId', 'operationId'].map(key => [key, row[key]])),
            targetNoteId: row.plan.items[0].after.id, note: notes[0], provenance: row.plan.provenance,
            allowedFolderIds: refs.filter(ref => ref.kind === 'folder').map(ref => ref.id), allowedTagIds: refs.filter(ref => ref.kind === 'tag').map(ref => ref.id) } });
        const { planHash: _hash, ...content } = structuredClone(built);
        for (const item of content.items) {
          const original = row.plan.items.find(original => original.after.id === item.after.id);
          item.before = structuredClone(original.before); item.baseline = structuredClone(original.baseline);
          if (original.after.aiVisibility === undefined) delete item.after.aiVisibility;
        }
        return finalizePlan(content);
      })()), origin);
    }
  };
  return methods;
}
