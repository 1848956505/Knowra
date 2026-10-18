import { createTaskPairingGrants } from './task-pairing-grants.mjs';
import { mcpError } from './mcp-error.mjs';

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function assertKnowledgeReadConfirmation(input) {
  if (input.allowKnowledgeRead !== undefined && typeof input.allowKnowledgeRead !== 'boolean'
    || input.knowledgeReadConfirmed !== undefined && typeof input.knowledgeReadConfirmed !== 'boolean') {
    throw mcpError('MCP_REQUEST_INVALID', '知识读取设置无效。', { status: 400 });
  }
  if (input.allowKnowledgeRead === true && input.knowledgeReadConfirmed !== true) {
    throw mcpError('MCP_KNOWLEDGE_READ_UNCONFIRMED', '请先确认：该客户端及其所属厂商可读取当前资料库中的全部知识点，包括改写、手写及开启期间新建或编辑的内容；没有来源记录的手工或旧知识不受所选笔记范围进一步缩小，已知来源仍受授权范围、排除项和私密标记限制；可随时关闭。', { status: 422 });
  }
}

/** 创建/撤销配对：创建一条只读、不带外发的授权策略；外部外发许可记在配对上，由统一外发出口逐调用复核。 */
export function createMcpPairingService({ pairings, getAccess, audit, gate, socketPath, dataDirectory, now = () => new Date(), flags, adapter = null, proposalsEnabled = async () => false, getTaskService = () => null, getTaskIdentity = () => null }) {
  const taskGrants = createTaskPairingGrants({ getTaskService, getTaskIdentity, flags });
  const decorate = view => taskGrants.decorate(view, pairings.get(view.pairingId));
  const accessOrThrow = () => {
    const access = getAccess();
    if (!access) throw mcpError('MCP_AI_DISABLED', 'AI 功能未开启，不能创建外部客户端配对。', { status: 409 });
    return access;
  };
  const tidy = error => {
    if (error?.code?.startsWith?.('AI_')) return mcpError(error.code === 'AI_SCOPE_FORBIDDEN' ? 'MCP_SCOPE_FORBIDDEN' : 'MCP_SCOPE_INVALID', error.message, { status: 422 });
    return error;
  };
  return {
    list: () => pairings.list().map(decorate),
    /** 设置页用：AI 总开关、紧急外发开关与适配器启动方式（命令与脚本路径；不含令牌，配对文件路径由各配对给出）。 */
    status: async () => ({ aiEnabled: Boolean(flags().aiEnabled), egressEnabled: Boolean(flags().allowExternal), proposalsEnabled: Boolean(await proposalsEnabled()), taskWorkspacesAvailable: Boolean(getTaskService()), adapter }),
    assertTaskWorkspaceEpoch(epoch) {
      const current = getTaskIdentity();
      if (typeof epoch !== 'string' || !current || current.datasetEpoch !== epoch) throw mcpError('MCP_TASK_ACCESS_REVOKED', '任务工作区已变化，请重新打开授权设置并确认。', { status: 409 });
    },
    recentAudit: options => audit.recent(options),
    async create(input) {
      if (!isPlainObject(input) || Object.keys(input).some(key => !['label', 'spaceId', 'scope', 'excludedNoteIds', 'expiresInDays', 'egressConfirmed', 'allowPropose', 'proposeConfirmed', 'allowKnowledgeRead', 'knowledgeReadConfirmed', 'taskWorkspaceGrants', 'taskWorkspaceConfirmed', 'taskImagesConfirmed'].includes(key))) {
        throw mcpError('MCP_REQUEST_INVALID', '配对参数无效。', { status: 400 });
      }
      if (input.egressConfirmed !== true) throw mcpError('MCP_EGRESS_UNCONFIRMED', '请先确认：被读取的片段会发给该客户端所属的厂商。', { status: 422 });
      // 提交候选是比只读更高的权限：必须明确开启并单独确认，两者缺一不可。
      if (input.allowPropose !== undefined && typeof input.allowPropose !== 'boolean') throw mcpError('MCP_REQUEST_INVALID', '配对参数无效。', { status: 400 });
      if (input.allowPropose === true && input.proposeConfirmed !== true) throw mcpError('MCP_PROPOSE_UNCONFIRMED', '请先确认：该客户端提交的内容由它的模型生成，只会成为待你审核的候选。', { status: 422 });
      assertKnowledgeReadConfirmation(input);
      // 先验证独立任务确认，未确认不能创建任何普通笔记policy。
      const taskServiceAtConfirmation = getTaskService();
      const taskState = taskGrants.prepare(input);
      const recheckTaskState = () => {
        const current = taskGrants.prepare(input);
        if (taskState.taskWorkspaceGrants.length && (getTaskService() !== taskServiceAtConfirmation
          || current.taskWorkspaceDatasetId !== taskState.taskWorkspaceDatasetId || current.taskWorkspaceDatasetEpoch !== taskState.taskWorkspaceDatasetEpoch)) {
          throw mcpError('MCP_TASK_ACCESS_REVOKED', '确认权限期间任务资料库已变化，请重新选择并确认。', { status: 409 });
        }
        return current;
      };
      const noNotes = input.scope?.kind === 'none';
      if (noNotes && (Object.keys(input.scope).length !== 1 || !taskState.taskWorkspaceGrants.length
        || input.allowPropose === true || input.allowKnowledgeRead === true || input.excludedNoteIds?.length)) {
        throw mcpError('MCP_SCOPE_INVALID', '仅任务配对需选择任务工作区，不能同时授予笔记或知识权限。', { status: 422 });
      }
      const label = typeof input.label === 'string' ? input.label.trim() : '';
      const days = input.expiresInDays ?? 7;
      if (!label || label.length > 60 || (!noNotes && typeof input.spaceId !== 'string') || !Number.isInteger(days) || days < 1 || days > 90) {
        throw mcpError('MCP_REQUEST_INVALID', '配对名称、知识空间或有效期无效。', { status: 400 });
      }
      if (noNotes) {
        const current = recheckTaskState();
        const view = pairings.create({ label, spaceId: '', scope: { kind: 'none' }, excludedNoteIds: [], policyId: '', policyRevision: 0,
          expiresInDays: days, socketPath, dataDirectory, ...current });
        audit.append({ event: 'created', pairingId: view.pairingId, status: 'ok' });
        return decorate(view);
      }
      const access = accessOrThrow();
      let policy;
      try {
        policy = await access.createPolicy({ spaceId: input.spaceId, scope: input.scope, excludedNoteIds: input.excludedNoteIds ?? [],
          includeAttachments: false, read: true, egress: false, recipients: [],
          expiresAt: new Date(now().getTime() + days * 86_400_000).toISOString() });
      } catch (error) { throw tidy(error); }
      try {
        const view = pairings.create({ label, spaceId: policy.spaceId, scope: policy.scope, excludedNoteIds: policy.excludedNoteIds,
          policyId: policy.policyId, policyRevision: policy.revision, expiresInDays: days, socketPath, dataDirectory,
          allowPropose: input.allowPropose === true, allowKnowledgeRead: input.allowKnowledgeRead === true, ...recheckTaskState() });
        audit.append({ event: 'created', pairingId: view.pairingId, status: 'ok' });
        return decorate(view);
      } catch (error) {
        await access.narrowPolicy(policy.policyId, { revision: policy.revision, revoke: true }).catch(() => {});
        throw error;
      }
    },
    setKnowledgeRead(pairingId, input) {
      if (!isPlainObject(input) || typeof input.allowKnowledgeRead !== 'boolean'
        || Object.keys(input).some(key => !['allowKnowledgeRead', 'knowledgeReadConfirmed'].includes(key))) {
        throw mcpError('MCP_REQUEST_INVALID', '知识读取设置无效。', { status: 400 });
      }
      assertKnowledgeReadConfirmation(input);
      if (input.allowKnowledgeRead && pairings.get(pairingId)?.scope?.kind === 'none') throw mcpError('MCP_SCOPE_INVALID', '仅任务配对不能开启知识读取，请重新创建并明确选择笔记范围。', { status: 422 });
      const view = pairings.setKnowledgeRead(pairingId, input.allowKnowledgeRead);
      audit.append({ event: input.allowKnowledgeRead ? 'knowledge_read_enabled' : 'knowledge_read_disabled', pairingId, status: 'ok' });
      return view;
    },
    setTaskWorkspaceGrants(pairingId, input) {
      if (!isPlainObject(input) || Object.keys(input).some(key => !['taskWorkspaceGrants', 'taskWorkspaceConfirmed', 'taskImagesConfirmed'].includes(key))
        || !Object.hasOwn(input, 'taskWorkspaceGrants')) throw mcpError('MCP_REQUEST_INVALID', '任务授权设置无效。', { status: 422 });
      const view = pairings.setTaskWorkspaceGrants(pairingId, taskGrants.prepare(input));
      gate.forgetGrant(pairingId);
      audit.append({ event: 'task_grants_changed', pairingId, status: 'ok' });
      return decorate(view);
    },
    async revoke(pairingId) {
      const row = pairings.get(pairingId);
      const view = pairings.revoke(pairingId);
      gate.forgetGrant(pairingId);
      const access = getAccess();
      // 配对记录已先标记撤销，之后任何调用都会被拒；策略撤销是第二道保险，失败不回滚撤销。
      if (access && row?.policyId) await access.narrowPolicy(row.policyId, { revision: row.policyRevision, revoke: true }).catch(() => {});
      audit.append({ event: 'revoked', pairingId, status: 'ok' });
      return view;
    }
  };
}
