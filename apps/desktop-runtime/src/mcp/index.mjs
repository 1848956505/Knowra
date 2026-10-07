import path from 'node:path';
import { createPairingStore } from './pairing-store.mjs';
import { createAuditLog } from './audit-log.mjs';
import { createMcpGate } from './mcp-gate.mjs';
import { createMcpPairingService } from './pairing-service.mjs';
import { startMcpSocketServer } from './socket-server.mjs';
import { resolveSocketPath } from './socket-path.mjs';

/** 装配外部 AI 客户端（MCP）运行端：配对、统一外发出口、本机 socket。getAccess/flags 每次读取，资料库恢复后自动换新。 */
export async function startMcpRuntime({ dataDirectory, getAccess, flags, proposalsEnabled, tools = {}, limits, now, adapter = null, logger = console }) {
  const directory = path.join(dataDirectory, 'mcp');
  const pairings = createPairingStore({ directory, now });
  const audit = createAuditLog({ directory, now });
  const gate = createMcpGate({ pairings, getAccess, flags, proposalsEnabled, tools, audit, limits, now });
  const socketPath = resolveSocketPath(dataDirectory);
  const service = createMcpPairingService({ pairings, getAccess, audit, gate, socketPath, dataDirectory, now, flags, adapter, proposalsEnabled });
  const server = await startMcpSocketServer({ socketPath, pairings, gate, logger });
  return { service, gate, socketPath, close: () => server.close() };
}
