import path from 'node:path';
import { createTaskMcpExecutor } from './task-executor.mjs';
import { mcpError } from './mcp-error.mjs';
import { createPairingStore } from './pairing-store.mjs';
import { createAuditLog } from './audit-log.mjs';
import { createMcpGate } from './mcp-gate.mjs';
import { createMcpPairingService } from './pairing-service.mjs';
import { startMcpSocketServer } from './socket-server.mjs';
import { resolveSocketPath } from './socket-path.mjs';

/** 装配外部 AI 客户端（MCP）运行端：配对、统一外发出口、本机 socket。getAccess/flags 每次读取，资料库恢复后自动换新。 */
export async function startMcpRuntime({ dataDirectory, getAccess, getEntityResult, getTaskService = () => null, getTaskIdentity = () => null, flags, proposalsEnabled, proposalsNow, tools = {}, limits, now, adapter = null, logger = console }) {
  const directory = path.join(dataDirectory, 'mcp');
  const pairings = createPairingStore({ directory, now });
  const audit = createAuditLog({ directory, now });
  const taskExecutor = createTaskMcpExecutor({ pairings, getService: getTaskService, getIdentity: getTaskIdentity,
    timeoutMs: limits?.toolTimeoutMs ?? 15000, assertFlags: () => {
      const current = flags();
      if (!current.aiEnabled) throw mcpError('MCP_AI_DISABLED', 'AI 功能未开启。', { status: 403 });
      if (!current.allowExternal) throw mcpError('MCP_EGRESS_DISABLED', '外发已被紧急停止。', { status: 403 });
    } });
  const gate = createMcpGate({ pairings, getAccess, getEntityResult, flags, proposalsEnabled, proposalsNow, tools, taskExecutor, audit, limits, now });
  const socketPath = resolveSocketPath(dataDirectory);
  const service = createMcpPairingService({ pairings, getAccess, audit, gate, socketPath, dataDirectory, now, flags, adapter, proposalsEnabled, getTaskService, getTaskIdentity });
  const server = await startMcpSocketServer({ socketPath, pairings, gate, logger });
  return { service, gate, socketPath, close: () => server.close() };
}
