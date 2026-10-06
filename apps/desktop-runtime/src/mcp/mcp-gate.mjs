import { mcpError } from './mcp-error.mjs';

export const DEFAULT_MCP_LIMITS = Object.freeze({
  perMinute: 30, perDay: 1000, concurrent: 2, maxResultBytes: 65_536, maxFragments: 50, toolTimeoutMs: 15_000
});
const GRANT_TOOLS = ['notes_search', 'notes_read'];
const MIN_GRANT_LEFT_MS = 60_000;
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isInt = value => Number.isSafeInteger(value) && value >= 0;

/**
 * 外部 AI 客户端调用的统一外发出口。读取授权不等于外发许可：
 * 工具只能返回“正文片段 + 偏移”，由本出口逐条对照授权范围内笔记的当前正文复核，再生成响应与片段清单，
 * 因此响应内容与清单来自同一处，工具实现无法绕过。
 */
export function createMcpGate({ pairings, getAccess, flags, tools = {}, audit, limits = {}, now = () => new Date() } = {}) {
  const limit = { ...DEFAULT_MCP_LIMITS, ...limits };
  const windows = new Map();
  const inflight = new Map();
  const grants = new Map();

  function assertFlags() {
    const { aiEnabled, allowExternal } = flags();
    if (!aiEnabled) throw mcpError('MCP_AI_DISABLED', 'AI 功能未开启，外部客户端暂不可读取。', { status: 403 });
    if (!allowExternal) throw mcpError('MCP_EGRESS_DISABLED', '外发已被紧急停止，外部客户端暂不可读取。', { status: 403 });
  }
  function admit(row) {
    const nowMs = now().getTime();
    const recent = (windows.get(row.pairingId) ?? []).filter(time => nowMs - time < 60_000);
    if (recent.length >= limit.perMinute) {
      throw mcpError('MCP_RATE_LIMITED', '调用过于频繁，请稍后重试。', { status: 429, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + 60_000 - nowMs) / 1000)) });
    }
    if (pairings.dayCalls(row) >= limit.perDay) {
      const midnight = Date.parse(`${now().toISOString().slice(0, 10)}T00:00:00Z`) + 86_400_000;
      throw mcpError('MCP_RATE_LIMITED', '今日调用次数已达上限。', { status: 429, retryAfterSeconds: Math.max(1, Math.ceil((midnight - nowMs) / 1000)) });
    }
    if ((inflight.get(row.pairingId) ?? 0) >= limit.concurrent) {
      throw mcpError('MCP_RATE_LIMITED', '同时进行的调用过多，请稍后重试。', { status: 429, retryAfterSeconds: 1 });
    }
    recent.push(nowMs); windows.set(row.pairingId, recent);
    inflight.set(row.pairingId, (inflight.get(row.pairingId) ?? 0) + 1);
    pairings.recordUse(row);
  }
  const mapAccess = error => {
    if (!error?.code?.startsWith?.('AI_')) return error;
    if (['AI_TOOL_ARGUMENTS_INVALID', 'AI_SEARCH_INVALID'].includes(error.code)) return mcpError('MCP_REQUEST_INVALID', '工具参数无效。', { status: 400 });
    if (error.code === 'AI_SOURCE_STALE') return mcpError('MCP_SOURCE_CHANGED', '读取期间笔记已变化，请重试。', { status: 409 });
    return mcpError('MCP_ACCESS_REVOKED', error.code === 'AI_SCOPE_FORBIDDEN' ? '来源不在授权范围。' : '授权已撤销、过期、资料集已切换或来源已变化。', { status: 403 });
  };
  const normalize = entry => typeof entry === 'function' ? { run: entry, metaKeys: [], fragmentAttrs: {} }
    : { run: entry?.run, metaKeys: Array.isArray(entry?.metaKeys) ? entry.metaKeys : [], fragmentAttrs: entry?.fragmentAttrs ?? {},
      description: entry?.description, inputSchema: entry?.inputSchema };
  /** 片段附加字段只允许工具声明过的键，且值限于枚举、布尔值或受限格式的标识符，不能夹带自由文本。 */
  function checkAttrs(attrs, spec) {
    if (attrs === undefined) return undefined;
    if (!isPlainObject(attrs)) throw mcpError('MCP_RESULT_INVALID', '片段附加字段无效。', { status: 500 });
    for (const [key, value] of Object.entries(attrs)) {
      const rule = Object.hasOwn(spec, key) ? spec[key] : null;
      const ok = rule && (rule.enum ? rule.enum.includes(value) : rule.boolean ? typeof value === 'boolean'
        : rule.pattern ? typeof value === 'string' && new RegExp(rule.pattern).test(value) : false);
      if (!ok) throw mcpError('MCP_RESULT_INVALID', '工具返回了未声明的片段附加字段。', { status: 500 });
    }
    return attrs;
  }
  async function ensureGrant(access, row) {
    const cached = grants.get(row.pairingId);
    if (cached && cached.expiresAt - now().getTime() > MIN_GRANT_LEFT_MS) {
      await access.assertSearchGrant({ grantId: cached.grantId });
      return cached.grantId;
    }
    const grant = await access.createRunGrant({ policyId: row.policyId, conversationId: `mcp-${row.pairingId}`,
      allowedTools: GRANT_TOOLS, maxBudgetMicrounits: 0 });
    grants.set(row.pairingId, { grantId: grant.grantId, expiresAt: Date.parse(grant.expiresAt) });
    return grant.grantId;
  }
  /** 逐条核对片段：来自授权范围内、未被排除、非私密笔记的当前正文，标题与偏移文本必须逐字一致。 */
  async function verifyFragments(access, grantId, result, { metaKeys, fragmentAttrs }) {
    if (!isPlainObject(result) || !Array.isArray(result.fragments) || result.fragments.length > limit.maxFragments) {
      throw mcpError('MCP_RESULT_INVALID', '工具返回格式无效。', { status: 500 });
    }
    const meta = result.meta ?? {};
    // 附加信息只允许工具声明过的键，且值只能是数字或布尔值；其余内容一律只能走带偏移的片段。
    if (!isPlainObject(meta) || Object.entries(meta).some(([key, value]) => !metaKeys.includes(key)
      || typeof value !== 'number' && typeof value !== 'boolean' || typeof value === 'number' && !Number.isFinite(value))) {
      throw mcpError('MCP_RESULT_INVALID', '工具返回了未声明的附加信息。', { status: 500 });
    }
    const verified = new Map();
    const fragments = [], manifest = [];
    let bytes = 0;
    for (const item of result.fragments) {
      if (!isPlainObject(item) || typeof item.noteId !== 'string' || typeof item.title !== 'string' || typeof item.text !== 'string'
        || !isInt(item.start) || !isInt(item.end) || item.end <= item.start) throw mcpError('MCP_RESULT_INVALID', '工具返回的片段无效。', { status: 500 });
      if (!verified.has(item.noteId)) verified.set(item.noteId, await access.verifyRead({ grantId, noteId: item.noteId, tool: 'notes_read' }));
      const { note, version, contentHash } = verified.get(item.noteId);
      if (item.title !== note.title || item.end > version.content.length || item.text !== version.content.slice(item.start, item.end)) {
        throw mcpError('MCP_RESULT_INVALID', '工具返回内容与授权笔记的当前正文不一致，已拦截。', { status: 500 });
      }
      const size = Buffer.byteLength(item.text, 'utf8');
      bytes += size;
      const attrs = checkAttrs(item.attrs, fragmentAttrs);
      fragments.push({ noteId: note.id, title: note.title, noteVersionId: version.id, contentHash, start: item.start, end: item.end, text: item.text, ...(attrs ? { attrs } : {}) });
      manifest.push({ noteId: note.id, noteVersionId: version.id, start: item.start, end: item.end, bytes: size });
    }
    // 返回前对全部来源做一次批量复核（同一次仓库快照），逐篇校验期间被改为私密或改动的来源在此拦下。
    if (fragments.length) {
      await access.assertSearchSources({ grantId, sourceRefs: [...verified.values()].map(({ note, contentHash }) => ({ noteId: note.id, contentHash })) });
    }
    // 上限按最终序列化的响应计（含 JSON 转义、标题、偏移等全部字段），不是只数正文字节。
    const serialized = Buffer.byteLength(JSON.stringify({ data: { fragments, meta } }), 'utf8');
    if (serialized > limit.maxResultBytes) throw mcpError('MCP_RESULT_TOO_LARGE', '结果超过单次大小上限，请缩小范围后重试。', { status: 413 });
    return { fragments, manifest, bytes, meta };
  }

  async function call({ token, tool, input = {} }) {
    let row;
    try { row = pairings.authenticate(token); } catch (error) { audit.append({ event: 'rejected', status: 'error', code: error.code }); throw error; }
    const base = { event: 'call', pairingId: row.pairingId, tool: typeof tool === 'string' ? tool.slice(0, 64) : '?' };
    let admitted = false;
    try {
      pairings.assertActive(row);
      assertFlags();
      const entry = Object.hasOwn(tools, tool) ? normalize(tools[tool]) : null;
      const handler = entry?.run ?? null;
      if (!handler) throw mcpError('MCP_TOOL_UNKNOWN', '未知工具。', { status: 404 });
      if (!isPlainObject(input)) throw mcpError('MCP_REQUEST_INVALID', '工具参数必须是对象。', { status: 400 });
      admit(row); admitted = true;
      const access = getAccess();
      if (!access) throw mcpError('MCP_AI_DISABLED', 'AI 功能未开启，外部客户端暂不可读取。', { status: 403 });
      let timer;
      const outcome = await (async () => {
        const grantId = await ensureGrant(access, row);
        const raw = await Promise.race([handler({ input, grantId, access }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(mcpError('MCP_TIMEOUT', '工具执行超时。', { status: 504 })), limit.toolTimeoutMs); })])
          .finally(() => clearTimeout(timer));
        // 校验点：工具执行期间撤销、过期或关闭外发，都不返回任何正文。
        pairings.assertActive(row); assertFlags(); await access.assertSearchGrant({ grantId });
        return verifyFragments(access, grantId, raw, entry);
      })().catch(error => { pairings.assertActive(row); throw mapAccess(error); });
      pairings.assertActive(row); assertFlags();
      audit.append({ ...base, status: 'ok', fragments: outcome.fragments.length, bytes: outcome.bytes, manifest: outcome.manifest });
      return { fragments: outcome.fragments, meta: outcome.meta };
    } catch (error) {
      const failure = error.code?.startsWith?.('MCP_') ? error : mcpError('MCP_INTERNAL', '外部调用失败。', { status: 500 });
      audit.append({ ...base, status: 'error', code: failure.code, retryAfterSeconds: failure.retryAfterSeconds });
      throw failure;
    } finally {
      if (admitted) inflight.set(row.pairingId, Math.max(0, (inflight.get(row.pairingId) ?? 1) - 1));
    }
  }
  /** 工具清单：只有有效配对能看到；描述与参数结构由运行端统一定义，适配器不自带工具表。 */
  function describeTools({ token }) {
    const row = pairings.authenticate(token);
    pairings.assertActive(row);
    return Object.entries(tools).map(([name, raw]) => {
      const entry = normalize(raw);
      return { name, description: entry.description ?? '', inputSchema: entry.inputSchema ?? { type: 'object', properties: {}, additionalProperties: false } };
    });
  }
  return { call, describeTools, limits: limit, forgetGrant: id => grants.delete(id) };
}
