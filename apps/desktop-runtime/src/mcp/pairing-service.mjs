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
export function createMcpPairingService({ pairings, getAccess, audit, gate, socketPath, dataDirectory, now = () => new Date(), flags, adapter = null, proposalsEnabled = async () => false }) {
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
    list: () => pairings.list(),
    /** 设置页用：AI 总开关、紧急外发开关与适配器启动方式（命令与脚本路径；不含令牌，配对文件路径由各配对给出）。 */
    status: async () => ({ aiEnabled: Boolean(flags().aiEnabled), egressEnabled: Boolean(flags().allowExternal), proposalsEnabled: Boolean(await proposalsEnabled()), adapter }),
    recentAudit: options => audit.recent(options),
    async create(input) {
      if (!isPlainObject(input) || Object.keys(input).some(key => !['label', 'spaceId', 'scope', 'excludedNoteIds', 'expiresInDays', 'egressConfirmed', 'allowPropose', 'proposeConfirmed', 'allowKnowledgeRead', 'knowledgeReadConfirmed'].includes(key))) {
        throw mcpError('MCP_REQUEST_INVALID', '配对参数无效。', { status: 400 });
      }
      if (input.egressConfirmed !== true) throw mcpError('MCP_EGRESS_UNCONFIRMED', '请先确认：被读取的片段会发给该客户端所属的厂商。', { status: 422 });
      // 提交候选是比只读更高的权限：必须明确开启并单独确认，两者缺一不可。
      if (input.allowPropose !== undefined && typeof input.allowPropose !== 'boolean') throw mcpError('MCP_REQUEST_INVALID', '配对参数无效。', { status: 400 });
      if (input.allowPropose === true && input.proposeConfirmed !== true) throw mcpError('MCP_PROPOSE_UNCONFIRMED', '请先确认：该客户端提交的内容由它的模型生成，只会成为待你审核的候选。', { status: 422 });
      assertKnowledgeReadConfirmation(input);
      const label = typeof input.label === 'string' ? input.label.trim() : '';
      const days = input.expiresInDays ?? 7;
      if (!label || label.length > 60 || typeof input.spaceId !== 'string' || !Number.isInteger(days) || days < 1 || days > 90) {
        throw mcpError('MCP_REQUEST_INVALID', '配对名称、知识空间或有效期无效。', { status: 400 });
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
          allowPropose: input.allowPropose === true, allowKnowledgeRead: input.allowKnowledgeRead === true });
        audit.append({ event: 'created', pairingId: view.pairingId, status: 'ok' });
        return view;
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
      const view = pairings.setKnowledgeRead(pairingId, input.allowKnowledgeRead);
      audit.append({ event: input.allowKnowledgeRead ? 'knowledge_read_enabled' : 'knowledge_read_disabled', pairingId, status: 'ok' });
      return view;
    },
    async revoke(pairingId) {
      const row = pairings.get(pairingId);
      const view = pairings.revoke(pairingId);
      gate.forgetGrant(pairingId);
      const access = getAccess();
      // 配对记录已先标记撤销，之后任何调用都会被拒；策略撤销是第二道保险，失败不回滚撤销。
      if (access && row) await access.narrowPolicy(row.policyId, { revision: row.policyRevision, revoke: true }).catch(() => {});
      audit.append({ event: 'revoked', pairingId, status: 'ok' });
      return view;
    }
  };
}
