import { createTaskMcpAccess } from './task-access.mjs';
import { createTaskMcpTools } from './task-tools.mjs';
import { taskImageResult, taskTextResult } from './task-output.mjs';
import { validateInput } from './mcp-gate.mjs';
import { mcpError } from './mcp-error.mjs';

/** 统一 gate 的独立任务能力分支：不创建知识授权、不借用候选提交配额。 */
export function createTaskMcpExecutor({ pairings, getService, getIdentity, assertFlags, timeoutMs = 15000 }) {
  const access = createTaskMcpAccess({ pairings, getIdentity, assertFlags });
  const tools = createTaskMcpTools();
  const available = () => Boolean(getService());
  const outputs = new WeakMap();
  const sync = value => { if (value?.then) throw mcpError('MCP_RESULT_INVALID', '任务最终授权复核必须同步完成。', { status: 500 }); return value; };
  return {
    tools,
    assertCurrent(result) {
      const check = outputs.get(result);
      if (!check) throw mcpError('MCP_RESULT_INVALID', '任务输出未通过授权复核。', { status: 500 });
      check();
    },
    describe(row) {
      if (!available() || !row.taskWorkspaceGrants?.length) return [];
      return Object.entries(tools).filter(([, tool]) => access.allows(row, tool.taskCapability))
        .map(([name, { description, inputSchema }]) => ({ name, description, inputSchema }));
    },
    async call(row, name, input = {}, outerGuard = () => {}, track = null) {
      const entry = Object.hasOwn(tools, name) ? tools[name] : null;
      if (!entry) throw mcpError('MCP_TOOL_UNKNOWN', '未知工具。', { status: 404 });
      // 权限检查先于参数校验，不泄露未授权工作区的信息。
      if (!access.allows(row, entry.taskCapability, input?.workspaceId)) throw mcpError('MCP_TASK_ACCESS_REVOKED', '任务工作区授权已失效或该操作未获授权。', { status: 403 });
      validateInput(entry.inputSchema, input);
      for (const [key, max] of [['markdown', 262144], ['message', 4096], ['summary', 16384]]) {
        if (input[key] !== undefined && Buffer.byteLength(input[key], 'utf8') > max) throw mcpError('MCP_REQUEST_INVALID', '任务正文超过单次字节上限。', { status: 422 });
      }
      const service = getService();
      if (!service || typeof service[entry.method] !== 'function') throw mcpError('MCP_TOOL_UNAVAILABLE', '任务工作区服务当前不可用。', { status: 503 });
      const startedAt = Date.now();
      let aborted = false, timer;
      const timedOut = () => mcpError('MCP_TIMEOUT', '工具执行超时。', { status: 504 });
      const callGuard = () => { const allowed = outerGuard(); if (allowed === false || allowed?.then !== undefined) throw mcpError('MCP_TASK_ACCESS_REVOKED', '任务调用授权复核未通过。', { status: 403 }); if (aborted || Date.now() - startedAt >= timeoutMs) throw timedOut(); if (getService() !== service) throw mcpError('MCP_TASK_ACCESS_REVOKED', '任务资料集已切换。', { status: 403 }); };
      const captured = access.capture(row, entry.taskCapability, input.workspaceId, callGuard);
      const { ctx, guard } = captured;
      const args = { ...input }; delete args.end;
      try {
        const execution = (async () => {
          guard();
          const raw = await service[entry.method](ctx, args);
          guard();
          // service 负责同快照引用/lease校验；全列表仍额外拒绝越界实体，不静默掩盖 service 授权错误。
          if (entry.method === 'listWorkspaces' && raw.items.some(item => !captured.grants.some(grant => grant.workspaceId === item.id))) {
            throw mcpError('MCP_RESULT_INVALID', '任务工作区列表越过授权范围。', { status: 500 });
          }
          const result = entry.method === 'readAttachment' ? taskImageResult(raw, input) : taskTextResult(entry.method, raw, input);
          const assertCurrent = () => {
            guard();
            const workspaces = input.workspaceId ? [input.workspaceId] : raw.items.map(item => item.id);
            for (const workspaceId of workspaces) sync(service.getWorkspace(ctx, { workspaceId }));
            if (entry.method === 'readAttachment') {
              const document = sync(service.getDocument(ctx, { workspaceId: input.workspaceId, documentId: input.documentId, versionId: input.versionId }));
              const attachment = document.attachments.find(item => item.id === input.attachmentId);
              if (document.version.id !== input.versionId || document.version.contentHash !== raw.versionContentHash || !attachment || attachment.sha256 !== raw.attachment.sha256
                || attachment.size !== raw.bytes.length || attachment.mimeType !== raw.mimeType) {
                throw mcpError('MCP_RESULT_INVALID', '图片引用或授权快照已变化。', { status: 409 });
              }
            }
            guard();
          };
          assertCurrent(); // 编码后同步复核；统一gate最后一次await后再次调用。
          const output = { taskContent: result.content };
          outputs.set(output, assertCurrent);
          return output;
        })();
        // 受管桥保留实际工作槽直到底层读取结束；只暴露完成信号，不暴露正文。
        track?.(execution.then(() => undefined, () => undefined));
        return await Promise.race([execution, new Promise((_, reject) => { timer = setTimeout(() => { aborted = true; reject(timedOut()); }, timeoutMs); })]);
      } catch (error) {
        if (error?.code?.startsWith('MCP_')) throw error;
        if (error?.code?.startsWith('TASK_WORKSPACE_')) throw mcpError(`MCP_${error.code}`, '任务操作被拒绝，请重新读取当前状态并检查授权。', { status: error.status ?? error.statusCode ?? 422 });
        throw mcpError('MCP_INTERNAL', '任务工作区调用失败。', { status: 500 });
      } finally { clearTimeout(timer); }
    }
  };
}
