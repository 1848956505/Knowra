import assert from 'node:assert/strict';
import test from 'node:test';
import { canaryProbe, evaluate, parseClaudeStream, TOOL_PREFIX } from '../mcp-acceptance-lib.mjs';

const P = 'PRIVATE-CANARY-7731', O = 'OUTSIDE-CANARY-4410';
const use = (id, name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `${TOOL_PREFIX}${name}`, input }] } });
const res = (id, text, isError = false) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: [{ type: 'text', text }] }] } });
const stream = events => events.map(event => JSON.stringify(event)).join('\n');
const T = '线粒体是细胞的能量工厂';
const frag = (extra = {}) => JSON.stringify({ fragments: [{ noteId: 'n', title: '线粒体与能量', start: 0, end: 12, text: `${T}，通过有氧呼吸`, ...extra }], meta: {} });
const base = [
  use('1', 'notes_search', { query: '线粒体' }), res('1', frag()),
  use('2', 'notes_read', { noteId: 'n', start: 0, end: 60 }), res('2', frag()),
  use('3', 'annotations_list', { noteId: 'n' }), res('3', frag({ attrs: { importance: 'core' } }))];
const probes = [use('4', 'notes_search', { query: P }), res('4', '{"fragments":[],"meta":{"inspected":3,"truncated":false}}'),
  use('5', 'notes_search', { query: O }), res('5', '{"fragments":[],"meta":{"inspected":3,"truncated":false}}')];
const ok = { sameConnection: { isError: true, text: 'MCP_PAIRING_FILE_MISSING：配对文件不存在' }, listAfterRevoke: { connected: false },
  health: { addJsonExit: 0, connected: true }, audit: [{ event: 'call' }, { event: 'call' }, { event: 'call' }], canaries: { private: P, outside: O }, target: { noteId: 'n', opening: T } };
const run = (events, overrides = {}) => evaluate({ ...ok, first: parseClaudeStream(stream(events)), afterRevoke: null, ...overrides });

test('完整执行：全部检查通过', () => {
  const checks = run([...base, ...probes]);
  assert.deepEqual(Object.entries(checks).filter(([, value]) => !value), []);
});

test('跳过越权查询时不能通过（只检索、读取、列重点不够）', () => {
  const checks = run(base);
  assert.equal(checks['客户端确实搜索了私密笔记暗号，且得到成功的空结果'], false);
  assert.equal(checks['客户端确实搜索了范围外笔记暗号，且得到成功的空结果'], false);
  // 旧写法下这两项“没有出现暗号”会误为 true，现在必须同时满足“确实执行”。
});

test('只搜了其中一个暗号、或搜索报错而不是返回空结果，都不能通过', () => {
  assert.equal(run([...base, ...probes.slice(0, 2)])['客户端确实搜索了范围外笔记暗号，且得到成功的空结果'], false);
  const errored = [...base, use('4', 'notes_search', { query: P }), res('4', 'MCP_RATE_LIMITED：调用过于频繁', true), ...probes.slice(2)];
  assert.equal(run(errored)['客户端确实搜索了私密笔记暗号，且得到成功的空结果'], false);
  const stray = [...base, use('4', 'notes_search', { query: P }), ...probes.slice(2)];
  assert.equal(run(stray)['客户端确实搜索了私密笔记暗号，且得到成功的空结果'], false, '没有对应结果的调用不算执行');
});

test('暗号出现在任何工具结果里：泄露检查失败；结果用 id 关联，不会错配', () => {
  const leaked = [...base, use('4', 'notes_search', { query: P }), res('4', `{"fragments":[{"text":"暗号：${P}"}]}`), ...probes.slice(2)];
  const checks = run(leaked);
  assert.equal(checks['私密笔记暗号没有出现在任何工具结果里'], false);
  assert.equal(checks['客户端确实搜索了私密笔记暗号，且得到成功的空结果'], false);
  const swapped = parseClaudeStream(stream([use('a', 'notes_search', { query: P }), use('b', 'notes_search', { query: O }), res('b', '{"fragments":[]}'), res('a', '{"fragments":[{"text":"x"}]}')]));
  assert.equal(canaryProbe(swapped.calls, P).empty, false); assert.equal(canaryProbe(swapped.calls, O).empty, true);
});

test('撤销：正确的撤销不被误判；同一连接仍能调用或 mcp list 仍显示已连接才算失败', () => {
  assert.equal(run([...base, ...probes])['撤销后真实 Claude Code 的 mcp list 不再显示已连接'], true);
  assert.equal(run([...base, ...probes], { listAfterRevoke: { connected: true } })['撤销后真实 Claude Code 的 mcp list 不再显示已连接'], false);
  assert.equal(run([...base, ...probes], { sameConnection: { isError: false, text: '{"fragments":[]}' } })['同一连接在撤销后调用立即失败（工具错误）'], false);
  // 新会话因连接阶段被拒而没有任何工具调用：属于预期，不应因为“没有工具错误结果”判失败。
  assert.equal(run([...base, ...probes], { afterRevoke: parseClaudeStream(stream([{ type: 'result', result: '无法使用 knowra 工具', num_turns: 1 }])) })['撤销后新会话没有读到任何正文'], true);
  assert.equal(run([...base, ...probes], { afterRevoke: parseClaudeStream(stream([use('9', 'notes_search', { query: 'x' }), res('9', '线粒体是细胞的能量工厂')])) })['撤销后新会话没有读到任何正文'], false);
});

const GOOD = ['检索成功：搜索“线粒体”并命中目标笔记', '读取成功：notes_read 读取目标笔记开头并拿到正文', '重点列表成功：annotations_list 返回目标笔记的 core 重点'];
test('读取失败（如 MCP_ACCESS_REVOKED）不能被检索结果顶替：三项成功检查各自只认对应工具的成功调用', () => {
  const failedRead = [base[0], base[1], use('2', 'notes_read', { noteId: 'n' }), res('2', 'MCP_ACCESS_REVOKED：来源不在授权范围。', true), base[4], base[5], ...probes];
  const checks = run(failedRead);
  assert.equal(checks[GOOD[1]], false);
  assert.equal(checks[GOOD[0]], true); assert.equal(checks[GOOD[2]], true);
  // 读取返回了成功结果，但读的是别的笔记、或从中间开始、或没有目标正文，都不算。
  for (const [input, body] of [[{ noteId: 'other' }, frag({ noteId: 'other' })], [{ noteId: 'n', start: 5 }, frag({ start: 5 })], [{ noteId: 'n' }, frag({ text: '别的内容' })], [{ noteId: 'n' }, '{"fragments":[]}']]) {
    assert.equal(run([base[0], base[1], use('2', 'notes_read', input), res('2', body), base[4], base[5], ...probes])[GOOD[1]], false, JSON.stringify(input));
  }
});
test('检索与重点列表同样核对参数与结果：检索没命中目标笔记、重点不是 core 或属于别的笔记都不算', () => {
  assert.equal(run([use('1', 'notes_search', { query: '线粒体' }), res('1', '{"fragments":[]}'), ...base.slice(2), ...probes])[GOOD[0]], false);
  assert.equal(run([use('1', 'notes_search', { query: '别的' }), res('1', frag()), ...base.slice(2), ...probes])[GOOD[0]], false);
  assert.equal(run([...base.slice(0, 4), use('3', 'annotations_list', { noteId: 'n' }), res('3', frag({ attrs: { importance: 'important' } })), ...probes])[GOOD[2]], false);
  assert.equal(run([...base.slice(0, 4), use('3', 'annotations_list', { noteId: 'other' }), res('3', frag({ noteId: 'other', attrs: { importance: 'core' } })), ...probes])[GOOD[2]], false);
  assert.equal(run([...base.slice(0, 4), use('3', 'annotations_list', { noteId: 'n' }), res('3', 'MCP_RATE_LIMITED：调用过于频繁', true), ...probes])[GOOD[2]], false);
  // 工具结果错配：读取调用拿到的是检索工具的结果文本时，由调用 ID 保证不会串。
  const mismatched = [use('1', 'notes_search', { query: '线粒体' }), res('1', frag()), use('2', 'notes_read', { noteId: 'n' }), res('2', '', true), base[4], base[5], ...probes];
  assert.equal(run(mismatched)[GOOD[1]], false);
});
