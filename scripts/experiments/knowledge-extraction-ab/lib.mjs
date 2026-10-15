// 知识提炼 A/B 实验的纯函数：构造请求、按线上规则校验结果、统计标题质量、生成对比报告。
// 不访问网络、不读写知识库；网络调用与文件读写在 run.mjs。

const TYPES = new Set(['concept', 'fact', 'principle', 'process', 'algorithm', 'formula', 'comparison', 'application']);

export function buildUserPayload({ variant, requestId, sources, existingTitles = [] }) {
  const payload = { contractVersion: 1, requestId, sources: sources.map(({ sourceId, markdown }) => ({ sourceId, markdown })) };
  if (variant === 'v2') return { contractVersion: 1, requestId, existingKnowledgeTitles: [...existingTitles], sources: payload.sources };
  return payload;
}

/**
 * 按线上 validateKnowledgeExtractionResult 的同等规则逐个检查候选。
 * 线上任一候选不合格会整批拒绝；这里逐个记录，便于看出具体失败在哪里。
 */
export function checkResult({ content, requestId, sources }) {
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return { ok: false, batchError: 'JSON 解析失败', candidates: [] }; }
  if (!parsed || parsed.contractVersion !== 1 || parsed.requestId !== requestId || !Array.isArray(parsed.candidates)) {
    return { ok: false, batchError: 'contractVersion / requestId / candidates 不符合契约', candidates: [] };
  }
  const byId = new Map(sources.map(source => [source.sourceId, source]));
  const candidates = parsed.candidates.map(candidate => {
    const problems = [];
    const extraKeys = Object.keys(candidate ?? {}).filter(key => !['title', 'canonicalStatement', 'knowledgeType', 'citations'].includes(key));
    if (extraKeys.length) problems.push(`多余字段 ${extraKeys.join(',')}`);
    if (typeof candidate?.title !== 'string' || !candidate.title.trim()) problems.push('title 为空');
    if (typeof candidate?.canonicalStatement !== 'string' || !candidate.canonicalStatement.trim()) problems.push('陈述为空');
    if (!TYPES.has(candidate?.knowledgeType)) problems.push(`类型无效 ${candidate?.knowledgeType}`);
    const citations = Array.isArray(candidate?.citations) ? candidate.citations : [];
    if (citations.length === 0) problems.push('缺少引文');
    let badCitations = 0;
    for (const citation of citations) {
      const source = byId.get(citation?.sourceId);
      const exact = source && Number.isInteger(citation.start) && Number.isInteger(citation.end)
        && citation.start >= 0 && citation.end > citation.start && citation.end <= source.markdown.length
        && source.markdown.slice(citation.start, citation.end) === citation.quote;
      if (!exact) badCitations += 1;
    }
    if (badCitations) problems.push(`引文偏移不匹配 ${badCitations}/${citations.length}`);
    const quoteFound = citations.some(citation => byId.get(citation?.sourceId)?.markdown.includes(citation?.quote ?? '\u0000'));
    return {
      title: String(candidate?.title ?? ''), canonicalStatement: String(candidate?.canonicalStatement ?? ''),
      knowledgeType: String(candidate?.knowledgeType ?? ''), citationCount: citations.length,
      citationsExact: citations.length > 0 && badCitations === 0, quoteFoundInSource: quoteFound, problems
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
    ['引文偏移完全正确的候选', s => `${s.exactCitationCandidates}（${pct(s.exactCitationCandidates, s.candidates)}）`],
    ['引文原文存在但偏移不对的候选', s => s.quoteFoundCandidates - s.exactCitationCandidates],
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
    '标题质量指标由规则自动判断，只能发现明显问题；概念是否选对、陈述是否准确，需要人工阅读下方明细。', '',
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
        const marks = [...titleFlags(candidate.title, run), ...candidate.problems].join('；') || '—';
        lines.push(`| ${cell(candidate.title)} | ${candidate.knowledgeType} | ${cell(marks)} | ${cell(candidate.canonicalStatement)} |`);
      }
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}
