// 知识提炼 A/B 实验的纯函数：构造请求、按线上规则校验结果、统计标题质量、生成对比报告。
// 不访问网络、不读写知识库；网络调用与文件读写在 run.mjs。

const TYPES = new Set(['concept', 'fact', 'principle', 'process', 'algorithm', 'formula', 'comparison', 'application']);

export function buildUserPayload({ variant, requestId, sources, existingTitles = [] }) {
  const payload = { contractVersion: 1, requestId, sources: sources.map(({ sourceId, markdown }) => ({ sourceId, markdown })) };
  if (variant === 'v2') return { contractVersion: 1, requestId, existingKnowledgeTitles: [...existingTitles], sources: payload.sources };
  return payload;
}

/**
 * A/B 独立评估工具。与线上 knowledge-extraction-contract.js 的 anchorQuote
 * 保持相同的“精确匹配优先、否则唯一 quote 重定位”规则；不调用实际存储。
 * 只有能在所选片段中找到唯一来源时才算定位有效；引文有效≠语义正确。
 */
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, expected) => isRecord(value)
  && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const splitsSurrogate = (value, index) => {
  const left = value.charCodeAt(index - 1);
  const right = value.charCodeAt(index);
  return left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff;
};
const validRange = (start, end, value) => Number.isSafeInteger(start) && Number.isSafeInteger(end)
  && start >= 0 && start < end && end <= value.length
  && !splitsSurrogate(value, start) && !splitsSurrogate(value, end);

export function locateQuote(markdown, citation) {
  if (typeof markdown !== 'string' || !onlyKeys(citation, ['sourceId', 'start', 'end', 'quote'])
      || !Number.isSafeInteger(citation.start) || !Number.isSafeInteger(citation.end)
      || typeof citation.quote !== 'string' || !citation.quote.trim()
      || citation.quote.length > 8000) return { status: 'invalid', reason: '引文结构无效' };
  const { start, end, quote } = citation;
  if (validRange(start, end, markdown) && markdown.slice(start, end) === quote) {
    return { status: 'exact', start, end };
  }
  const first = markdown.indexOf(quote);
  if (first < 0) return { status: 'invalid', reason: '原文中找不到引文' };
  if (markdown.indexOf(quote, first + 1) >= 0) {
    return { status: 'invalid', reason: '引文多处出现，原偏移又不正确，无法唯一定位' };
  }
  if (!validRange(first, first + quote.length, markdown)) {
    return { status: 'invalid', reason: '引文跨越非法 UTF-16 边界' };
  }
  return { status: 'relocated', start: first, end: first + quote.length };
}

/**
 * 按“线上 quote 唯一重定位”验证引用；标题质量另外统计，不受偏移错位干扰。
 * 模型陈述是否真正由 quote 支持仍需人工判断，不能用定位成功代替语义审核。
 */
export function checkResult({ content, requestId, sources }) {
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return { ok: false, batchError: 'JSON 解析失败', candidates: [] }; }
  if (!onlyKeys(parsed, ['contractVersion', 'requestId', 'candidates'])
      || parsed.contractVersion !== 1 || parsed.requestId !== requestId
      || !Array.isArray(parsed.candidates) || parsed.candidates.length > 40) {
    return { ok: false, batchError: '输出契约/请求 ID/候选数不符合线上要求', candidates: [] };
  }
  const byId = new Map(sources.map(source => [source.sourceId, source]));
  const candidates = parsed.candidates.map(candidate => {
    const problems = [];
    if (!onlyKeys(candidate, ['title', 'canonicalStatement', 'knowledgeType', 'citations'])) {
      problems.push('候选字段不符合契约');
    }
    if (typeof candidate?.title !== 'string' || !candidate.title.trim() || candidate.title.length > 200) problems.push('title 无效');
    if (typeof candidate?.canonicalStatement !== 'string' || !candidate.canonicalStatement.trim()
        || candidate.canonicalStatement.length > 8000) problems.push('陈述无效');
    if (!TYPES.has(candidate?.knowledgeType)) problems.push('knowledgeType 无效');
    const citations = Array.isArray(candidate?.citations) ? candidate.citations : [];
    if (citations.length === 0 || citations.length > 8) problems.push('引文数量不合规');
    const seen = new Set();
    const resolutions = citations.map(citation => {
      const source = byId.get(citation?.sourceId);
      const located = locateQuote(source?.markdown, citation);
      if (located.status === 'invalid') {
        problems.push(located.reason);
        return located;
      }
      const identity = `${citation.sourceId}:${located.start}:${located.end}`;
      if (seen.has(identity)) {
        problems.push('同一候选重复引用相同片段');
        return { status: 'invalid', reason: '重复引文' };
      }
      seen.add(identity);
      return located;
    });
    const citationsExact = resolutions.length > 0 && resolutions.every(item => item.status === 'exact');
    const citationsLocated = resolutions.length > 0 && resolutions.every(item => item.status !== 'invalid');
    const citationsRelocated = citationsLocated && resolutions.some(item => item.status === 'relocated');
    const quoteFoundInSource = citations.some(citation => typeof citation?.quote === 'string'
      && byId.get(citation.sourceId)?.markdown.includes(citation.quote));
    return {
      title: String(candidate?.title ?? ''), canonicalStatement: String(candidate?.canonicalStatement ?? ''),
      knowledgeType: String(candidate?.knowledgeType ?? ''), citationCount: citations.length,
      citationsExact, citationsLocated, citationsRelocated, quoteFoundInSource,
      problems
    };
  });
  return { ok: candidates.every(candidate => candidate.problems.length === 0), batchError: null, candidates };
}

const QUESTION = /([？?]\s*$)|(^(什么是|何为|如何|怎样|怎么|为什么|为何))|((是什么|是啥|如何|怎么办|吗|呢)\s*[？?]?\s*$)/u;
const FILLER_SUFFIX = /(的(概念|定义|介绍|简介|含义|理解|基本概念))$|^(关于|简介[:：]?)/u;

export const normalizeTitle = title => title.toLowerCase().replace(/[\s\-—_·・（）()【】\[\]“”"'：:，,。.]/gu, '');

/**
 * 把一份按“章.节”编号的长笔记切成多篇，模拟用户逐节提炼。
 * 遇到编号的“章.节”变化的标题（如 # 2.1、### 2.3.2）就开始新的一篇；编号之前的内容并入第一篇。
 */
export function splitBySection(markdown, baseName = 'note') {
  const parts = [];
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\s{0,3}#{1,6}\s*(\d+)\.(\d+)/.exec(line);
    const key = match ? `${match[1]}.${match[2]}` : null;
    if (key && key !== current?.key) {
      current = { key, lines: [] };
      parts.push(current);
    }
    if (!current) { current = { key: '0', lines: [] }; parts.push(current); }
    current.lines.push(line);
  }
  return parts.map((part, index) => ({
    name: `${baseName}-${String(index + 1).padStart(2, '0')}-${part.key}.md`, markdown: `${part.lines.join('\n').trim()}\n`
  })).filter(part => part.markdown.trim());
}

export function headingsOf(markdown) {
  return markdown.split(/\r?\n/).map(line => /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1]).filter(Boolean)
    .map(heading => heading.replace(/^[\d.]+\s*/, '').trim());
}

/** 给单个标题打上质量标记；existingTitles 用于判断是否复用了已有知识。 */
export function titleFlags(title, { headings = [], existingTitles = [] } = {}) {
  const flags = [];
  const trimmed = title.trim();
  if (QUESTION.test(trimmed)) flags.push('问题句');
  if (FILLER_SUFFIX.test(trimmed)) flags.push('空泛后缀');
  const normalized = normalizeTitle(trimmed);
  if (headings.some(heading => normalizeTitle(heading) === normalized)) flags.push('照抄小标题');
  if (existingTitles.some(existing => existing === trimmed)) flags.push('复用已有');
  else if (existingTitles.some(existing => normalizeTitle(existing) === normalized)) flags.push('近似已有但未逐字复用');
  return flags;
}

/** 汇总一个变体在全部笔记上的指标。runs: [{ note, check, headings, existingTitles }] */
export function summarize(runs) {
  const all = runs.flatMap(run => run.check.candidates.map(candidate => ({
    ...candidate, note: run.note, flags: titleFlags(candidate.title, run)
  })));
  const seen = new Map();
  for (const candidate of all) {
    const key = normalizeTitle(candidate.title);
    seen.set(key, (seen.get(key) ?? new Set()).add(candidate.note));
  }
  const crossNoteDuplicates = [...seen.entries()].filter(([, notes]) => notes.size > 1).length;
  const count = flag => all.filter(candidate => candidate.flags.includes(flag)).length;
  return {
    notes: runs.length,
    failedBatches: runs.filter(run => run.check.batchError || run.error).length,
    batchesRejectedOnline: runs.filter(run => !run.check.ok).length,
    candidates: all.length,
    exactCitationCandidates: all.filter(candidate => candidate.citationsExact).length,
    relocatedCitationCandidates: all.filter(candidate => candidate.citationsRelocated).length,
    locatedCitationCandidates: all.filter(candidate => candidate.citationsLocated).length,
    invalidCitationCandidates: all.filter(candidate => !candidate.citationsLocated).length,
    notesWithExistingTitles: runs.filter(run => run.existingTitles.length > 0).length,
    quoteFoundCandidates: all.filter(candidate => candidate.quoteFoundInSource).length,
    questionTitles: count('问题句'),
    fillerTitles: count('空泛后缀'),
    headingCopies: count('照抄小标题'),
    reusedExisting: count('复用已有'),
    nearMissReuse: count('近似已有但未逐字复用'),
    crossNoteDuplicates,
    byType: Object.fromEntries([...TYPES].map(type => [type, all.filter(candidate => candidate.knowledgeType === type).length]).filter(([, n]) => n > 0)),
    usage: runs.reduce((total, run) => ({
      promptTokens: total.promptTokens + (run.usage?.prompt_tokens ?? 0),
      completionTokens: total.completionTokens + (run.usage?.completion_tokens ?? 0)
    }), { promptTokens: 0, completionTokens: 0 }),
    candidatesDetail: all
  };
}

const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const cell = value => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function renderReport({ variants, summaries, runsByVariant, meta }) {
  const rows = [
    ['笔记数', s => s.notes],
    ['候选总数', s => s.candidates],
    ['线上会被整批拒绝的笔记数', s => s.batchesRejectedOnline],
    ['引文偏移直接正确的候选', s => s.exactCitationCandidates],
    ['偏移有误但可唯一重定位的候选', s => s.relocatedCitationCandidates],
    ['引文最终定位有效的候选', s => `${s.locatedCitationCandidates}（${pct(s.locatedCitationCandidates, s.candidates)}）`],
    ['引文无法安全定位的候选', s => s.invalidCitationCandidates],
    ['至少有引文内容出现在来源中的候选', s => s.quoteFoundCandidates],
    ['收到已有标题上下文的笔记数', s => s.notesWithExistingTitles],
    ['问题句标题', s => `${s.questionTitles}（${pct(s.questionTitles, s.candidates)}）`],
    ['“的概念”类空泛后缀标题', s => s.fillerTitles],
    ['照抄笔记小标题', s => s.headingCopies],
    ['跨笔记重复标题（组）', s => s.crossNoteDuplicates],
    ['逐字复用已有知识点', s => s.reusedExisting],
    ['与已有知识近似但未复用', s => s.nearMissReuse],
    ['类型分布', s => Object.entries(s.byType).map(([type, n]) => `${type} ${n}`).join('，')],
    ['token（输入 / 输出）', s => `${s.usage.promptTokens} / ${s.usage.completionTokens}`]
  ];
  const lines = [
    '# 知识提炼提示词 A/B 对比报告', '',
    `> 生成时间：${meta.generatedAt}  `,
    `> 模型：${meta.model}，temperature ${meta.temperature}  `,
    `> 笔记目录：${meta.notesLabel}  `,
    `> v2 已有知识点：${meta.existingNote}`, '',
    '标题质量由启发式规则估计；引文有效只说明 quote 可以定位，不能证明陈述被来源支持，更不能证明真伪。',
    'v2 的“已有标题”包括预置清单与逐篇整批校验成功后模拟采用的候选；它们不等于用户已确认的正式知识。', '',
    '## 汇总', '',
    `| 指标 | ${variants.join(' | ')} |`, `| --- | ${variants.map(() => '---').join(' | ')} |`,
    ...rows.map(([label, get]) => `| ${label} | ${variants.map(variant => cell(get(summaries[variant]))).join(' | ')} |`),
    '', '## 逐篇明细', ''
  ];
  const notes = runsByVariant[variants[0]].map(run => run.note);
  for (const note of notes) {
    lines.push(`### ${note}`, '');
    for (const variant of variants) {
      const run = runsByVariant[variant].find(entry => entry.note === note);
      lines.push(`**${variant}**${run?.error ? `：调用失败 ${run.error}` : run?.check.batchError ? `：${run.check.batchError}` : ''}`, '');
      if (!run || run.error || run.check.batchError) { lines.push(''); continue; }
      lines.push('| 标题 | 类型 | 标记 | 陈述 |', '| --- | --- | --- | --- |');
      for (const candidate of run.check.candidates) {
        const marks = [...titleFlags(candidate.title, run), ...(candidate.citationsRelocated ? ['引文重新定位'] : []), ...candidate.problems].join('；') || '—';
        lines.push(`| ${cell(candidate.title)} | ${candidate.knowledgeType} | ${cell(marks)} | ${cell(candidate.canonicalStatement)} |`);
      }
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}
