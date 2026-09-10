import { startLocalRuntime } from '../../desktop-runtime/src/runtime-server.mjs';
const [dataDirectory, distRoot] = process.argv.slice(2);
let runtime;
try {
  runtime = await startLocalRuntime({ dataDirectory, distRoot });
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
