import { mcpError } from './mcp-error.mjs';

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** 创建/撤销配对：创建一条只读、不带外发的授权策略；外部外发许可记在配对上，由统一外发出口逐调用复核。 */
export function createMcpPairingService({ pairings, getAccess, audit, gate, socketPath, dataDirectory, now = () => new Date(), flags, adapter = null }) {
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
    status: () => ({ aiEnabled: Boolean(flags().aiEnabled), egressEnabled: Boolean(flags().allowExternal), adapter }),
    recentAudit: options => audit.recent(options),
    async create(input) {
      if (!isPlainObject(input) || Object.keys(input).some(key => !['label', 'spaceId', 'scope', 'excludedNoteIds', 'expiresInDays', 'egressConfirmed'].includes(key))) {
        throw mcpError('MCP_REQUEST_INVALID', '配对参数无效。', { status: 400 });
      }
      if (input.egressConfirmed !== true) throw mcpError('MCP_EGRESS_UNCONFIRMED', '请先确认：被读取的片段会发给该客户端所属的厂商。', { status: 422 });
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
          policyId: policy.policyId, policyRevision: policy.revision, expiresInDays: days, socketPath, dataDirectory });
        audit.append({ event: 'created', pairingId: view.pairingId, status: 'ok' });
        return view;
      } catch (error) {
        await access.narrowPolicy(policy.policyId, { revision: policy.revision, revoke: true }).catch(() => {});
        throw error;
      }
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
