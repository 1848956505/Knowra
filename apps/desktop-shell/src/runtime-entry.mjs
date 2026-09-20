import { startLocalRuntime } from '../../desktop-runtime/src/runtime-server.mjs';
const [dataDirectory, distRoot] = process.argv.slice(2);
let runtime;
try {
  runtime = await startLocalRuntime({ dataDirectory, distRoot, logger: {
    error(_message, error) {
      process.parentPort.postMessage({ type: 'diagnostic', code: error?.code ?? 'INTERNAL_SERVER_ERROR',
        // 排除异常首行及请求参数，只记录错误码和代码栈位置。
        frames: typeof error?.stack === 'string' ? error.stack.split('\n').slice(1, 9).filter(line => line.trim().startsWith('at ')) : [] });
    }
  } });
  process.parentPort.postMessage({ type: 'ready', launchUrl: runtime.launchUrl, origin: runtime.origin });
  process.parentPort.on('message', async ({ data }) => {
    if (data !== 'shutdown') return;
    try { await runtime.close(); process.exit(0); }
    catch { process.parentPort.postMessage({ type: 'error', message: '本地服务未能正常关闭，数据目录已保留。' }); }
  });
} catch (error) {
  process.parentPort.postMessage({ type: 'error', message: error.message });
  process.exitCode = 1;
}
