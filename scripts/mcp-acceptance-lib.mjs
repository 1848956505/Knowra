// MCP 真实客户端验收脚本的纯逻辑：解析 Claude Code 的 stream-json、按工具调用关联结果、判定检查项。可单测，不依赖运行端与客户端。
export const TOOL_PREFIX = 'mcp__knowra__';

/** 解析 stream-json：把每个 tool_use 与它自己的 tool_result 用 id 关联起来（结果文本、是否错误）。 */
export function parseClaudeStream(output) {
  const events = output.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const calls = new Map();
  for (const event of events) for (const part of event.message?.content ?? []) {
    if (part.type === 'tool_use') calls.set(part.id, { id: part.id, name: part.name, input: part.input ?? {}, result: null });
    if (part.type === 'tool_result' && calls.has(part.tool_use_id)) {
      calls.get(part.tool_use_id).result = { isError: part.is_error === true,
        text: Array.isArray(part.content) ? part.content.map(item => item.text ?? '').join('') : String(part.content ?? '') };
    }
  }
  const final = events.findLast(event => event.type === 'result');
  const init = events.find(event => event.type === 'system' && event.subtype === 'init');
  return { calls: [...calls.values()], answer: final?.result ?? '', turns: final?.num_turns ?? null, cost: final?.total_cost_usd ?? null, mcpServers: init?.mcp_servers ?? null };
}

/** 模型是否真的执行了某个暗号的检索：必须是 notes_search 调用、参数含暗号、且拿到了成功的空结果（不是错误，也没有片段）。 */
export function canaryProbe(calls, canary) {
  const matched = calls.filter(call => call.name === `${TOOL_PREFIX}notes_search` && JSON.stringify(call.input).includes(canary));
  const answered = matched.filter(call => call.result && !call.result.isError);
  return { executed: answered.length > 0, empty: answered.length > 0 && answered.every(call => /"fragments":\[\]/.test(call.result.text)),
    leaked: calls.some(call => call.result?.text.includes(canary)) };
}

const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };
/** 某个工具是否有一次“对目标笔记成功”的调用：同一调用的参数与结果一起核对，失败（工具错误、权限错误）的调用不算。 */
function succeeded(calls, name, accept) {
  return calls.some(call => {
    if (call.name !== `${TOOL_PREFIX}${name}` || !call.result || call.result.isError) return false;
    const body = parseJson(call.result.text);
    return Array.isArray(body?.fragments) && accept(call.input, body.fragments);
  });
}

/** 全部检查项。未执行的探测不能通过：executed 必须为真，且结果为空。 */
export function evaluate({ health, first, afterRevoke, sameConnection, listAfterRevoke, audit, canaries, target }) {
  const calls = first.calls;
  const privateProbe = canaryProbe(calls, canaries.private), outsideProbe = canaryProbe(calls, canaries.outside);
  return {
    '设置页生成的 add-json 片段被真实 Claude Code 接受，mcp list 显示已连接': health.addJsonExit === 0 && health.connected,
    // 以下三项必须是“同一次调用的参数与成功结果”都对：失败的调用（如 MCP_ACCESS_REVOKED）、对别的笔记的调用、别的工具的结果都不能满足。
    '检索成功：搜索“线粒体”并命中目标笔记': succeeded(calls, 'notes_search', (input, fragments) => String(input.query ?? '').includes('线粒体')
      && fragments.some(item => item.noteId === target.noteId && String(item.text).includes('线粒体'))),
    '读取成功：notes_read 读取目标笔记开头并拿到正文': succeeded(calls, 'notes_read', (input, fragments) => input.noteId === target.noteId && (input.start ?? 0) === 0
      && fragments.length > 0 && fragments.every(item => item.noteId === target.noteId && item.start === 0) && String(fragments[0].text).startsWith(target.opening)),
    '重点列表成功：annotations_list 返回目标笔记的 core 重点': succeeded(calls, 'annotations_list', (input, fragments) => input.noteId === target.noteId
      && fragments.some(item => item.noteId === target.noteId && item.attrs?.importance === 'core' && String(item.text).startsWith(target.opening))),
    '客户端确实搜索了私密笔记暗号，且得到成功的空结果': privateProbe.executed && privateProbe.empty,
    '客户端确实搜索了范围外笔记暗号，且得到成功的空结果': outsideProbe.executed && outsideProbe.empty,
    '私密笔记暗号没有出现在任何工具结果里': !privateProbe.leaked,
    '范围外笔记暗号没有出现在任何工具结果里': !outsideProbe.leaked,
    '审计记录了调用且不含正文': audit.filter(item => item.event === 'call').length >= 3 && !JSON.stringify(audit).includes('能量工厂'),
    '同一连接在撤销后调用立即失败（工具错误）': sameConnection.isError === true && /MCP_/.test(sameConnection.text) && !sameConnection.text.includes('能量工厂'),
    // 撤销后新启动的客户端：连接阶段即被明确拒绝（工具清单获取失败，mcp list 不再显示已连接），模型无法调用，也不会读到任何正文。
    '撤销后真实 Claude Code 的 mcp list 不再显示已连接': listAfterRevoke.connected === false,
    '撤销后新会话没有读到任何正文': afterRevoke === null || (afterRevoke.calls.every(call => !call.result?.text.includes('能量工厂')) && !afterRevoke.answer.includes('能量工厂'))
  };
}
