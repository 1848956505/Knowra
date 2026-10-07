import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalRuntime } from '../../desktop-runtime/src/runtime-server.mjs';
import { createAiCredentialBridge } from './ai-credential-bridge.mjs';
const [dataDirectory, distRoot] = process.argv.slice(2);
let runtime;
// 外部 AI 客户端（MCP）适配器随应用打包在 runtime.mjs 旁边；用应用自带的 Electron 可执行文件以 Node 模式运行，用户不需要另装 Node。
// 找不到打包的适配器（例如未带该文件的旧构建）时传 null，设置页会如实提示。
const resources = path.dirname(fileURLToPath(import.meta.url));
const adapterScript = path.join(resources, 'mcp-adapter.mjs');
const appExecutable = path.resolve(resources, '../../MacOS/Knowra');
const mcpAdapter = fs.existsSync(adapterScript) && fs.existsSync(appExecutable)
  ? { command: appExecutable, args: [adapterScript], env: { ELECTRON_RUN_AS_NODE: '1' } } : null;
const credentials = createAiCredentialBridge(process.parentPort);
try {
  runtime = await startLocalRuntime({ dataDirectory, distRoot, credentialSource: credentials, mcpAdapter, logger: {
    error(_message, error) {
      process.parentPort.postMessage({ type: 'diagnostic', code: error?.code ?? 'INTERNAL_SERVER_ERROR',
        // 排除异常首行及请求参数，只记录错误码和代码栈位置。
        frames: typeof error?.stack === 'string' ? error.stack.split('\n').slice(1, 9).filter(line => line.trim().startsWith('at ')) : [] });
    }
  } });
  process.parentPort.postMessage({ type: 'ready', launchUrl: runtime.launchUrl, origin: runtime.origin });
  process.parentPort.on('message', async ({ data }) => {
    if (data?.type === 'backup-transfer-request') {
      try {
        const result = runtime.backupTransfer(data);
        process.parentPort.postMessage({ type: 'backup-transfer-response', requestId: data.requestId, ok: true, result });
      } catch (error) {
        const message = /^[\u4e00-\u9fff]/.test(error.message ?? '') ? error.message : '完整备份校验或复制失败，原资料和已有目标已保留。';
        process.parentPort.postMessage({ type: 'backup-transfer-response', requestId: data.requestId, ok: false, message });
      }
      return;
    }
    if (data !== 'shutdown') return;
    try { await runtime.close(); credentials.close(); process.exit(0); }
    catch { process.parentPort.postMessage({ type: 'error', message: '本地服务未能正常关闭，数据目录已保留。' }); }
  });
} catch (error) {
  credentials.close();
  process.parentPort.postMessage({ type: 'error', message: error.message });
  process.exitCode = 1;
}
