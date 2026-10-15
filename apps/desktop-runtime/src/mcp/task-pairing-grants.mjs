import { assertTaskGrantConfirmation, normalizeTaskWorkspaceGrants } from './task-access.mjs';
import { mcpError } from './mcp-error.mjs';

/** 仅受浏览器会话保护的配对设置调用；无MCP工具可修改此授权。 */
export function createTaskPairingGrants({ getTaskService, getTaskIdentity, flags }) {
  const unavailable = () => mcpError('MCP_TASK_UNAVAILABLE', '当前任务工作区不可用，请刷新后重试。', { status: 503 });
  return {
    prepare(input) {
      const grants = assertTaskGrantConfirmation(input);
      if (!grants.length) return { taskWorkspaceGrants: [], taskWorkspaceDatasetId: null, taskWorkspaceDatasetEpoch: null };
      const service = getTaskService(), identity = getTaskIdentity();
      if (!service || !identity || identity.then !== undefined) throw unavailable();
      const snapshot = { ...identity };
      const guard = () => {
        const current = getTaskIdentity(), currentFlags = flags();
        if (!currentFlags.aiEnabled || !currentFlags.allowExternal || getTaskService() !== service || !current
          || current.datasetId !== snapshot.datasetId || current.datasetEpoch !== snapshot.datasetEpoch) throw unavailable();
      };
      const ctx = { actor: { kind: 'user', id: 'demo' }, ...snapshot, guard };
      try { for (const grant of grants) { guard(); const workspace = service.getWorkspace(ctx, { workspaceId: grant.workspaceId }); if (workspace?.then) throw unavailable(); } }
      catch { throw mcpError('MCP_TASK_SCOPE_INVALID', '所选任务工作区不存在、已归档或已切换，请重新选择。', { status: 422 }); }
      guard();
      return { taskWorkspaceGrants: grants, taskWorkspaceDatasetId: snapshot.datasetId, taskWorkspaceDatasetEpoch: snapshot.datasetEpoch };
    },
    decorate(view, row) {
      const current = getTaskIdentity();
      const grants = normalizeTaskWorkspaceGrants(row?.taskWorkspaceGrants);
      const needsAuthorization = grants.length > 0 && (!current || row.taskWorkspaceDatasetId !== current.datasetId || row.taskWorkspaceDatasetEpoch !== current.datasetEpoch);
      return { ...view, taskWorkspaceGrants: grants, taskWorkspaceReauthorizationRequired: needsAuthorization };
    }
  };
}
