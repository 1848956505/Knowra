// 本机 MCP（AI-03-07 M4）的 Claude Code 真实验收脚本：只用合成笔记与临时数据目录，不读写你的知境资料，也不改动你自己的 Claude 配置。
// 用法（在已登录 Claude Code 的终端里，仓库根目录）：node scripts/mcp-acceptance-claude.mjs [报告输出路径]
// 第一部分（不需要登录）：用设置页生成的同一个片段添加服务，让 `claude mcp list` 做连接健康检查。
// 第二部分（需要已登录，会消耗少量 Claude 额度，使用 haiku 模型、最多 10 轮）：让 Claude 通过 knowra 工具检索、读取、列重点，
//   并尝试查找私密笔记与范围外笔记的暗号；然后撤销配对，确认客户端立即失败。
// 合成数据会发送给 Anthropic（客户端自己的模型），其中没有任何真实笔记。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), `knowra-mcp-claude-acceptance-${Date.now()}.json`));
const { build } = await import(pathToFileURL(path.join(repo, 'node_modules/esbuild/lib/main.js')));
const { startLocalRuntime } = await import(pathToFileURL(path.join(repo, 'apps/desktop-runtime/src/runtime-server.mjs')));
const { anchorForBlock, projectMarkdown, calculateContentHash } = await import(pathToFileURL(path.join(repo, 'packages/content-anchor/src/index.js')));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-m4-'));
const dist = path.join(root, 'dist'); fs.mkdirSync(dist); fs.writeFileSync(path.join(dist, 'index.html'), '<html><head></head></html>');
const runtime = await startLocalRuntime({ dataDirectory: path.join(root, 'data'), distRoot: dist, syncOptions: { autoSync: false }, logger: { warn() {}, error() {} } });
const cookie = (await fetch(runtime.launchUrl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
const call = async (route, method = 'GET', body, headers = {}) => (await fetch(runtime.origin + route, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json',
  'X-Knowra-Dataset': runtime.store.getStatus().datasetId, ...headers }, body: body && JSON.stringify(body) })).json();

const CANARY_PRIVATE = 'PRIVATE-CANARY-7731', CANARY_OUTSIDE = 'OUTSIDE-CANARY-4410';
const space = (await call('/api/knowledge/spaces/default', 'POST', {})).data;
const bio = (await call('/api/knowledge/folders', 'POST', { spaceId: space.id, name: '生物' })).data;
const history = (await call('/api/knowledge/folders', 'POST', { spaceId: space.id, name: '历史' })).data;
const note = async (folderId, title, rawMarkdown, extra = {}) => (await call('/api/knowledge/notes', 'POST', { spaceId: space.id, folderId, title, rawMarkdown, ...extra })).data;
const mito = await note(bio.id, '线粒体与能量', '线粒体是细胞的能量工厂，通过有氧呼吸产生大部分ATP。\n\n线粒体拥有自己的DNA，可以半自主复制。\n\n叶绿体负责光合作用，不属于动物细胞。');
const nucleus = await note(bio.id, '细胞核', '细胞核储存遗传信息，指导蛋白质合成。\n\n核仁参与核糖体RNA的合成。');
await note(bio.id, '私密日记', `这是私密笔记，里面有一个暗号：${CANARY_PRIVATE}。线粒体也被提到过。`, { aiVisibility: 'private' });
await note(history.id, '秦朝制度', `秦朝统一后推行郡县制。线粒体与此无关。范围外暗号：${CANARY_OUTSIDE}。`);
for (const [index, importance] of [[0, 'core'], [1, 'important']]) {
  const anchor = anchorForBlock(projectMarkdown(mito.rawMarkdown), index);
  const created = await call('/api/knowledge/annotations', 'POST', { noteId: mito.id, spaceId: space.id, schemaVersion: 2, scopeType: 'blocks', anchor, quoteText: anchor.quoteText,
    fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd, noteContentHash: calculateContentHash(mito.rawMarkdown), anchorFingerprint: `m4-${index}`, idempotencyKey: `m4-${index}`, importance });
  if (!created.data) throw new Error(`标注创建失败：${JSON.stringify(created)}`);
}
const pairing = (await call('/api/local-runtime/mcp/pairings', 'POST', { label: 'Claude Code 验收', spaceId: space.id, scope: { kind: 'folder', folderId: bio.id },
  expiresInDays: 1, egressConfirmed: true }, { 'X-Knowra-MCP-Pairing': '1' })).data;
const adapter = (await call('/api/local-runtime/mcp/pairings')).data.adapter;
const mcpConfig = path.join(root, 'mcp.json');
fs.writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { knowra: { type: 'stdio', command: adapter.command, args: [...adapter.args, '--pairing-file', pairing.pairingFile], env: adapter.env } } }));

// ---- 第一部分：真实 Claude Code 的 mcp list 健康检查（独立的 CLAUDE_CONFIG_DIR，不触碰用户配置；不需要登录）----
const run = (command, args, options = {}) => new Promise(resolve => { const child = spawn(command, args, options); let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 90_000); child.on('exit', status => { clearTimeout(timer); resolve({ status, out }); }); });
fs.writeFileSync(path.join(root, 'stub.mjs'), 'export const apiClient = {};');
await build({ entryPoints: [path.join(repo, 'apps/web-v4/src/features/settings/externalClients.ts')], outfile: path.join(root, 'snippets.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
  alias: { '@study-accelerator/web-core': path.join(root, 'stub.mjs') } });
const { claudeCodeSnippet } = await import(pathToFileURL(path.join(root, 'snippets.mjs')));
const claudeHome = path.join(root, 'claude-home'), work = path.join(root, 'work'); fs.mkdirSync(claudeHome); fs.mkdirSync(work);
const cliEnv = { ...process.env, CLAUDE_CONFIG_DIR: claudeHome, HOME: claudeHome };
const added = await run('sh', ['-c', claudeCodeSnippet(adapter, pairing.pairingFile)], { cwd: work, env: cliEnv });
const listed = await run('claude', ['mcp', 'list'], { cwd: work, env: cliEnv });
const health = { addJsonExit: added.status, addJsonOutput: added.out.trim(), mcpListExit: listed.status, connected: /knowra:.*✔ Connected/.test(listed.out.replaceAll('\n', ' ')) };

const runClaude = (prompt, label) => new Promise(resolve => {
  const args = ['-p', prompt, '--mcp-config', mcpConfig, '--strict-mcp-config', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--model', 'haiku', '--max-turns', '10', '--permission-mode', 'dontAsk',
    '--allowedTools', 'mcp__knowra__notes_search', 'mcp__knowra__notes_read', 'mcp__knowra__annotations_list',
    '--disallowedTools', 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit'];
  const child = spawn('claude', args, { cwd: root, env: { ...process.env, CLAUDECODE: '' } });
  let out = '', err = '';
  child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 240_000);
  child.on('exit', code => {
    clearTimeout(timer);
    const events = out.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    const tools = [], results = [];
    for (const event of events) for (const part of event.message?.content ?? []) {
      if (part.type === 'tool_use') tools.push({ name: part.name, input: part.input });
      if (part.type === 'tool_result') results.push({ isError: part.is_error === true, text: (Array.isArray(part.content) ? part.content.map(item => item.text ?? '').join('') : String(part.content ?? '')) });
    }
    const final = events.findLast(event => event.type === 'result');
    const init = events.find(event => event.type === 'system' && event.subtype === 'init');
    resolve({ label, code, tools, results, answer: final?.result ?? '', isError: final?.is_error ?? null, turns: final?.num_turns ?? null, cost: final?.total_cost_usd ?? null,
      mcpServers: init?.mcp_servers ?? null, err: err.slice(0, 500) });
  });
});

const findings = [];
const first = await runClaude(`你只能使用 knowra 提供的笔记工具（notes_search、notes_read、annotations_list）。请完成：1) 搜索“线粒体”；2) 读取《线粒体与能量》这篇笔记的前 60 个字符；3) 列出这篇笔记的重点及其重要度；4) 再搜索“${CANARY_PRIVATE}”和“${CANARY_OUTSIDE}”，如实说明是否找到。最后用中文简要汇报你实际看到的内容，不要编造。`, '授权范围内');
findings.push(first);
const loggedIn = !/Not logged in|\/login/.test(first.answer);
const audit = (await call(`/api/local-runtime/mcp/audit?pairingId=${pairing.pairingId}&limit=50`)).data.items;
await call(`/api/local-runtime/mcp/pairings/${pairing.pairingId}/revoke`, 'POST', {}, { 'X-Knowra-MCP-Pairing': '1' });
const second = loggedIn ? await runClaude('请用 knowra 的 notes_search 搜索“线粒体”，如实说明工具返回了什么（成功还是错误，错误信息是什么）。', '撤销后') : { tools: [], results: [], answer: '', code: null, err: '' };
findings.push(second);

const allText = JSON.stringify(findings);
const checks = {
  '设置页生成的 add-json 片段被真实 Claude Code 接受，mcp list 显示已连接': health.addJsonExit === 0 && health.connected,
};
if (loggedIn) Object.assign(checks, {
  '子进程被客户端识别为 knowra 服务且已连接': Boolean(first.mcpServers?.some(server => server.name === 'knowra' && server.status === 'connected')),
  '客户端调用了 notes_search': first.tools.some(tool => tool.name === 'mcp__knowra__notes_search'),
  '客户端调用了 notes_read': first.tools.some(tool => tool.name === 'mcp__knowra__notes_read'),
  '客户端调用了 annotations_list': first.tools.some(tool => tool.name === 'mcp__knowra__annotations_list'),
  '读到授权范围内的正文': first.results.some(item => !item.isError && item.text.includes('能量工厂')),
  '重点带重要度返回（core）': first.results.some(item => item.text.includes('"importance":"core"')),
  '私密笔记暗号没有出现在任何工具结果里': first.results.every(item => !item.text.includes(CANARY_PRIVATE)),
  '范围外笔记暗号没有出现在任何工具结果里': first.results.every(item => !item.text.includes(CANARY_OUTSIDE)),
  '审计记录了调用且不含正文': audit.filter(item => item.event === 'call').length >= 3 && !JSON.stringify(audit).includes('能量工厂'),
  '撤销后客户端的调用失败（工具错误）': second.results.some(item => item.isError || /MCP_|撤销|revoked|REVOKED|FILE_MISSING/.test(item.text)),
  '撤销后没有读到正文': second.results.every(item => !item.text.includes('能量工厂'))
});
else console.log('提示：本终端里的 claude 未登录，只完成了不需要登录的连接健康检查；请在已登录的终端重新运行以完成工具调用验收。');
const report = { health, at: new Date().toISOString(), claudeVersion: (await new Promise(r => { const c = spawn('claude', ['--version']); let o = ''; c.stdout.on('data', d => { o += d; }); c.on('exit', () => r(o.trim())); })),
  checks, first: { tools: first.tools, results: first.results.map(item => ({ isError: item.isError, text: item.text.slice(0, 400) })), answer: first.answer, turns: first.turns, cost: first.cost, mcpServers: first.mcpServers, code: first.code, err: first.err },
  second: { tools: second.tools, results: second.results.map(item => ({ isError: item.isError, text: item.text.slice(0, 300) })), answer: second.answer, code: second.code, err: second.err },
  audit: audit.map(({ at, event, tool, status, code, fragments }) => ({ at, event, tool, status, code, fragments })) };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
await runtime.close();
fs.rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify({ checks, cost: first.cost, turns: first.turns }, null, 2));
