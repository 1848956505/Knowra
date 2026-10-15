import { mcpError } from './mcp-error.mjs';

export const REMOTE_READ_TOOLS = Object.freeze(['task_documents_read', 'tasks_get']);
const denied = () => mcpError('MCP_REMOTE_DENIED', '远程绑定未配置、已失效或未获独立授权。', { status: 403 });
const textKeys = ['issuer', 'subject', 'clientId', 'deviceId', 'grantId', 'pairingId', 'datasetId', 'datasetEpoch', 'sessionGeneration'];
const numberKeys = ['grantRevision'];
const expectedKeys = ['deviceId', 'grantId', 'grantRevision', 'datasetEpoch', 'sessionGeneration'];
const syncTrue = value => { if (value !== true) throw denied(); };

/** 宿主专用端口，不签发身份/句柄，不交换本地 token。生产宿主尚未装配 authority。
 * authority.resolve 必须同步识别不透明句柄（JSON 副本不能有效），返回冻结 binding 及同步 assertCurrent。
 * assertCurrent 必须验证独立远程 consent、主体/设备/授权状态及该 tool/workspace，且仅 true 表示放行。
 */
export function createRemoteBindingPort({ authority = null, pairings } = {}) {
  const pinned = new WeakMap(); // 同一能力句柄不能在后续调用中变成另一个身份或连接代际。
  function resolve(handle) {
    if (!authority || typeof authority.resolve !== 'function' || !handle || typeof handle !== 'object') throw denied();
    let resolved;
    try { resolved = authority.resolve(handle); } catch { throw denied(); }
    const b = resolved?.binding;
    if (!resolved || resolved.then || !b || !Object.isFrozen(b) || b.remoteConsent !== true
      || textKeys.some(key => typeof b[key] !== 'string' || !b[key] || b[key].length > 256)
      || numberKeys.some(key => !Number.isSafeInteger(b[key]) || b[key] < 0)
      || typeof resolved.assertCurrent !== 'function') throw denied();
    const binding = Object.freeze(Object.fromEntries([...textKeys, ...numberKeys].map(key => [key, b[key]])));
    const stamp = JSON.stringify(binding);
    if (pinned.has(handle) && pinned.get(handle) !== stamp) throw denied();
    pinned.set(handle, stamp);
    return { binding, check: resolved.assertCurrent };
  }
  return {
    capture(handle, request) {
      if (!REMOTE_READ_TOOLS.includes(request?.tool) || typeof request?.input?.workspaceId !== 'string' || !request.input.workspaceId) throw denied();
      const first = resolve(handle), stamp = JSON.stringify(first.binding);
      const guard = () => {
        const current = resolve(handle), b = current.binding;
        if (JSON.stringify(b) !== stamp || expectedKeys.some(key => request[key] !== b[key])) throw denied();
        try { syncTrue(current.check({ tool: request.tool, workspaceId: request.input.workspaceId })); } catch { throw denied(); }
        const row = pairings.get(b.pairingId);
        if (!row || row.then || row.taskWorkspaceDatasetId !== b.datasetId || row.taskWorkspaceDatasetEpoch !== b.datasetEpoch) throw denied();
        pairings.assertActive(row);
        return row;
      };
      guard();
      return { guard };
    }
  };
}
