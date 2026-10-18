import { createHash } from 'node:crypto';
import { mcpError } from './mcp-error.mjs';

export const TASK_CAPABILITIES = Object.freeze(['read', 'writeDocuments', 'executeTasks', 'includeImages']);
const denied = () => mcpError('MCP_TASK_ACCESS_REVOKED', '任务工作区授权已失效或该操作未获授权。', { status: 403 });
const assertSyncAllowed = result => { if (result === false || result?.then !== undefined) throw denied(); };
const invalid = () => mcpError('MCP_REQUEST_INVALID', '任务工作区授权设置无效。', { status: 422 });

/** 缺省为空；不继承知识空间、知识读取或提交候选权限。 */
export function normalizeTaskWorkspaceGrants(value = []) {
  if (!Array.isArray(value) || value.length > 100) throw invalid();
  const seen = new Set();
  return value.map(grant => {
    if (!grant || typeof grant !== 'object' || Array.isArray(grant)
      || Object.keys(grant).some(key => !['workspaceId', ...TASK_CAPABILITIES].includes(key))
      || typeof grant.workspaceId !== 'string' || !grant.workspaceId || grant.workspaceId.length > 128
      || seen.has(grant.workspaceId) || grant.read !== true
      || TASK_CAPABILITIES.some(key => grant[key] !== undefined && typeof grant[key] !== 'boolean')) throw invalid();
    seen.add(grant.workspaceId);
    return { workspaceId: grant.workspaceId, read: true, writeDocuments: grant.writeDocuments === true,
      executeTasks: grant.executeTasks === true, includeImages: grant.includeImages === true };
  }).sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));
}

export function assertTaskGrantConfirmation(input) {
  if (['taskWorkspaceConfirmed', 'taskImagesConfirmed'].some(key => input[key] !== undefined && typeof input[key] !== 'boolean')) throw invalid();
  const grants = normalizeTaskWorkspaceGrants(input.taskWorkspaceGrants);
  if (grants.length && input.taskWorkspaceConfirmed !== true) {
    throw mcpError('MCP_TASK_EGRESS_UNCONFIRMED', '请确认：该客户端及其所属厂商可读取所选工作区现有及以后新建的文档；协写、执行任务和图片读取需分别开启。', { status: 422 });
  }
  if (grants.some(grant => grant.includeImages) && input.taskImagesConfirmed !== true) {
    throw mcpError('MCP_TASK_IMAGES_UNCONFIRMED', '请单独确认：所选工作区中被文档引用的图片原始内容会发送给该客户端及其所属厂商。', { status: 422 });
  }
  return grants;
}
const contexts = new WeakMap();
const actionCapability = { createDocument: 'writeDocuments', updateDocument: 'writeDocuments',
  claimTask: 'executeTasks', renewTask: 'executeTasks', reportProgress: 'executeTasks', submitTask: 'executeTasks', releaseTask: 'executeTasks',
  readAttachment: 'includeImages', capabilities: 'read', listWorkspaces: 'read', getWorkspace: 'read',
  listDocuments: 'read', getDocument: 'read', listTasks: 'read', getTask: 'read', listTaskEvents: 'read' };
/** 宿主传给领域 service 的同步授权器；只有本模块签发的 ctx 能代表 MCP。 */
export function authorizeTaskMcpContext(ctx, { action, workspaceId }) {
  const check = contexts.get(ctx);
  return check ? check(action, workspaceId) : false;
}
const fingerprint = row => createHash('sha256').update(JSON.stringify({ grants: normalizeTaskWorkspaceGrants(row.taskWorkspaceGrants),
  revision: row.taskWorkspaceGrantRevision ?? 0, datasetId: row.taskWorkspaceDatasetId, datasetEpoch: row.taskWorkspaceDatasetEpoch, expiresAt: row.expiresAt, revokedAt: row.revokedAt ?? null })).digest('hex');

/** getIdentity/get/assertActive 必须同步：事务提交前和最后输出前不得让出事件循环。 */
export function createTaskMcpAccess({ pairings, getIdentity, assertFlags }) {
  const liveRow = id => {
    const row = pairings.get(id);
    if (!row || row.then !== undefined) throw denied();
    assertSyncAllowed(pairings.assertActive(row)); assertSyncAllowed(assertFlags());
    return row;
  };
  function has(row, capability, workspaceId) {
    const identity = getIdentity();
    if (!identity || identity.then !== undefined || !row.taskWorkspaceDatasetId || row.taskWorkspaceDatasetEpoch === undefined
      || row.taskWorkspaceDatasetId !== identity.datasetId || row.taskWorkspaceDatasetEpoch !== identity.datasetEpoch
      || !TASK_CAPABILITIES.includes(capability)) return false;
    return normalizeTaskWorkspaceGrants(row.taskWorkspaceGrants).some(grant =>
      (workspaceId === undefined || grant.workspaceId === workspaceId) && grant.read && grant[capability]);
  }
  return {
    allows(row, capability, workspaceId) { return has(liveRow(row.pairingId), capability, workspaceId); },
    capture(row, capability, workspaceId, callGuard = () => {}) {
      const initial = liveRow(row.pairingId);
      const sourceIdentity = getIdentity();
      const identity = sourceIdentity && { ...sourceIdentity };
      if (!identity || typeof identity.datasetId !== 'string' || identity.datasetEpoch === undefined || sourceIdentity?.then) throw denied();
      const stamp = fingerprint(initial);
      const guard = () => {
        assertSyncAllowed(callGuard());
        const live = liveRow(initial.pairingId), current = getIdentity();
        if (!current || current.then !== undefined || current.datasetId !== identity.datasetId || current.datasetEpoch !== identity.datasetEpoch
          || fingerprint(live) !== stamp || !has(live, capability, workspaceId)) throw denied();
      };
      guard();
      const ctx = Object.freeze({ actor: Object.freeze({ kind: 'mcp', id: initial.pairingId }),
        datasetId: identity.datasetId, datasetEpoch: identity.datasetEpoch, authorizationRevision: stamp, guard });
      contexts.set(ctx, (action, target) => {
        guard();
        const needed = actionCapability[action];
        return Boolean(needed && has(liveRow(initial.pairingId), needed, target ?? undefined));
      });
      return { ctx, guard, grants: normalizeTaskWorkspaceGrants(initial.taskWorkspaceGrants) };
    }
  };
}
