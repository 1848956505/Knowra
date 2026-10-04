import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectAttachment } from './file-type.mjs';
import { ATTACHMENT_PARSE_LIMITS, failed } from './limits.mjs';
const parserDirectory = dirname(fileURLToPath(import.meta.url));
let activeParsers = 0;
function dependencyReadRoots() {
  const locations = ['mammoth', 'yauzl', 'pdfjs-dist/legacy/build/pdf.mjs'].map(specifier => {
    const location = realpathSync(fileURLToPath(import.meta.resolve(specifier)));
    const marker = location.indexOf('/node_modules/');
    if (marker < 0) throw new Error('Parser dependency is not installed as a package');
    // 使用实际依赖安装位置；生产 release 目录名称与源码仓库名称无关。
    return { root: location.slice(0, marker) + '/node_modules', url: pathToFileURL(location).href };
  });
  return { roots: [...new Set(locations.map(item => item.root))],
    env: { KNOWRA_ATTACHMENT_MAMMOTH_URL: locations[0].url, KNOWRA_ATTACHMENT_YAUZL_URL: locations[1].url, KNOWRA_ATTACHMENT_PDFJS_URL: locations[2].url } };
}
function validateResult(result, expectedKind) {
  if (!result || !['ready', 'unsupported', 'failed'].includes(result.status) || result.kind !== expectedKind
    || typeof result.text !== 'string' || result.text.length > ATTACHMENT_PARSE_LIMITS.textChars
    || !Array.isArray(result.segments) || result.segments.length > ATTACHMENT_PARSE_LIMITS.segments
    || result.status !== 'ready' && (result.text || result.segments.length)
    || result.status !== 'ready' && !/^AI_ATTACHMENT_[A-Z_]{1,64}$/.test(result.errorCode)) return false;
  let lastEnd = 0;
  for (const segment of result.segments) {
    if (!segment || typeof segment.label !== 'string' || segment.label.length > 200
      || !Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.end)
      || segment.start < lastEnd || segment.end < segment.start || segment.end > result.text.length
      || segment.page !== undefined && (!Number.isSafeInteger(segment.page) || segment.page < 1 || segment.page > ATTACHMENT_PARSE_LIMITS.pdfPages)) return false;
    lastEnd = segment.end;
  }
  return true;
}
/** options 只供受信宿主测试；HTTP 输入不得覆盖执行路径或资源限额。 */
export function createConversationAttachmentParser({ childPath = resolve(parserDirectory, 'child.mjs'),
  wallTimeMs = ATTACHMENT_PARSE_LIMITS.wallTimeMs } = {}) {
  if (!Number.isSafeInteger(wallTimeMs) || wallTimeMs < 1 || wallTimeMs > ATTACHMENT_PARSE_LIMITS.wallTimeMs) throw new TypeError('Invalid attachment parser deadline');
  return async function parseConversationAttachment(input) {
    let info;
    try { info = inspectAttachment(input); }
    catch (error) { return failed('unknown', error.code ?? 'AI_ATTACHMENT_INPUT_INVALID'); }
    const kind = info.kind;
    if (activeParsers >= ATTACHMENT_PARSE_LIMITS.concurrentParsers) return failed(kind, 'AI_ATTACHMENT_PARSER_BUSY');
    const prlimit = ['/usr/bin/prlimit', '/bin/prlimit'].find(existsSync);
    if (process.platform !== 'linux' || !prlimit) return failed(kind, 'AI_ATTACHMENT_ISOLATION_UNAVAILABLE');
    let dependencyRoots;
    try { dependencyRoots = dependencyReadRoots(); }
    catch { return failed(kind, 'AI_ATTACHMENT_PARSER_UNAVAILABLE'); }
    activeParsers++;
    try {
      return await new Promise(resolveResult => {
        const args = [`--as=${ATTACHMENT_PARSE_LIMITS.addressSpaceBytes}`, `--cpu=${ATTACHMENT_PARSE_LIMITS.cpuSeconds}`, '--core=0', '--', process.execPath,
          '--permission', `--allow-fs-read=${parserDirectory}`, ...dependencyRoots.roots.map(path => `--allow-fs-read=${path}`), `--allow-fs-read=${dirname(childPath)}`,
          '--v8-pool-size=1', '--single-threaded', '--jitless', '--disallow-code-generation-from-strings', `--max-old-space-size=${ATTACHMENT_PARSE_LIMITS.heapMiB}`, childPath];
        const child = spawn(prlimit, args, { stdio: ['pipe', 'pipe', 'ignore'], env: { NODE_NO_WARNINGS: '1', TZ: 'UTC', UV_THREADPOOL_SIZE: '1', ...dependencyRoots.env }, cwd: parserDirectory });
        const chunks = []; let bytes = 0, errorCode = null;
        const timer = setTimeout(() => { errorCode = 'AI_ATTACHMENT_PARSE_TIMEOUT'; child.kill('SIGKILL'); }, wallTimeMs);
        child.stdin.on('error', () => {});
        child.on('error', () => { clearTimeout(timer); resolveResult(failed(kind, 'AI_ATTACHMENT_ISOLATION_UNAVAILABLE')); });
        child.stdout.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > ATTACHMENT_PARSE_LIMITS.outputBytes) { errorCode = 'AI_ATTACHMENT_OUTPUT_LIMIT'; child.kill('SIGKILL'); }
          else chunks.push(chunk);
        });
        child.on('close', (code, signal) => {
          clearTimeout(timer);
          if (errorCode) return resolveResult(failed(kind, errorCode));
          if (code !== 0 || signal) return resolveResult(failed(kind, 'AI_ATTACHMENT_PARSE_RESOURCE_LIMIT'));
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            resolveResult(validateResult(result, kind) ? result : failed(kind, 'AI_ATTACHMENT_PARSE_RESULT_INVALID'));
          } catch { resolveResult(failed(kind, 'AI_ATTACHMENT_PARSE_RESULT_INVALID')); }
        });
        child.stdin.write(JSON.stringify({ fileName: input.fileName, mimeType: input.mimeType }) + '\n');
        child.stdin.end(input.buffer);
      });
    } finally { activeParsers--; }
  };
}
export const parseConversationAttachment = createConversationAttachmentParser();
export { ATTACHMENT_PARSE_LIMITS } from './limits.mjs';
