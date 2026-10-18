// Knowra 正文内联标记：重点、挖空等以标记形式写在 Markdown 正文里（见《重点标记内联化方案》第 2 节）。
// 行内 `<mark data-k="id" ...>文字</mark>`，块级 `<!--k id s=section ...-->`，标题局部排除 `<!--k- id-->`。
// 此模块只做文本层扫描：不依赖 Markdown 解析器，不认识的属性与角色原样保留。

export const KNOWRA_MARKS_FORMAT = 1;

const ID = /^[A-Za-z0-9_-]{1,32}$/;
const ATTR_KEY = /^[a-z][a-z0-9-]*$/;
const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;
const ATX_HEADING = /^\s{0,3}#{1,6}(\s|$)/;
const THEMATIC_BREAK = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const DELIMITERS = new Set(['*', '_', '~', '=']);
const VOID_ELEMENTS = new Set(['br', 'img', 'hr', 'input', 'wbr', 'col', 'embed', 'source', 'track', 'area', 'base', 'link', 'meta', 'param']);

/** 覆盖文字的短校验值（FNV-1a 32 位，36 进制），用于发现编辑器外对代码块的改写。 */
export function knowraCheck(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

const encodeHtml = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decodeHtml = value => value.replace(/&(quot|lt|gt|#39|amp);/g, (_, name) => ({ quot: '"', lt: '<', gt: '>', '#39': "'", amp: '&' })[name]);
const rolesOf = attrs => (attrs.t ?? '').split(/\s+/).filter(Boolean);

function lineTable(markdown) {
  const lines = [];
  for (let start = 0; ;) {
    const newline = markdown.indexOf('\n', start);
    const end = newline < 0 ? markdown.length : newline;
    lines.push({ start, end, next: newline < 0 ? end : newline + 1, kind: 'text' });
    if (newline < 0) return lines;
    start = newline + 1;
  }
}

/** 标出围栏代码块与 `$$` 公式块；其中的文字是字面内容，不参与标记扫描。 */
function classifyLines(markdown, lines) {
  const fences = [];
  let fence = null;
  let math = false;
  lines.forEach((line, index) => {
    const text = markdown.slice(line.start, line.end);
    if (fence) {
      const close = FENCE_CLOSE.exec(text);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) {
        line.kind = 'fenceClose';
        fence.contentEnd = line.start;
        fence = null;
      } else line.kind = 'code';
      return;
    }
    if (math) {
      line.kind = 'math';
      if (text.trim() === '$$') math = false;
      return;
    }
    const open = FENCE_OPEN.exec(text);
    if (open && !(open[2][0] === '`' && open[3].includes('`'))) {
      line.kind = 'fenceOpen';
      fence = { line: index, char: open[2][0], length: open[2].length, indent: open[1].length, contentStart: line.next, contentEnd: markdown.length };
      fences.push(fence);
      return;
    }
    if (text.trim() === '$$') { line.kind = 'math'; math = true; }
  });
  return new Map(fences.map(item => [item.line, item]));
}

/** 代码块的逻辑内容：去掉开围栏的缩进，与编辑器看到的代码文字一致。 */
function codeText(markdown, fence) {
  const raw = markdown.slice(fence.contentStart, fence.contentEnd).replace(/\n$/, '');
  if (!fence.indent) return raw;
  return raw.split('\n').map(line => line.replace(new RegExp(`^ {0,${fence.indent}}`), '')).join('\n');
}

function parseOpenTag(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/\s([A-Za-z][\w-]*)\s*=\s*"([^"]*)"/g)) {
    if (match[1].toLowerCase().startsWith('data-')) attrs[match[1].slice(5).toLowerCase()] = decodeHtml(match[2]);
  }
  return attrs;
}

function parseComment(body) {
  const match = /^k(-?)\s+(\S+)((?:\s+\S+)*)\s*$/.exec(body);
  if (!match) return null;
  const marker = { id: match[2], exclude: match[1] === '-', attrs: {}, valid: ID.test(match[2]) };
  for (const token of match[3].trim().split(/\s+/).filter(Boolean)) {
    const separator = token.indexOf('=');
    const key = token.slice(0, separator);
    if (separator < 1 || !ATTR_KEY.test(key) || marker.exclude) { marker.valid = false; continue; }
    try { marker.attrs[key] = decodeURIComponent(token.slice(separator + 1)); } catch { marker.valid = false; }
  }
  // 块级标记至少带一个属性，避免把用户自己写的 `<!--k 备注-->` 误认成标记。
  if (!marker.exclude && !match[3].trim()) return null;
  return marker;
}

function backtickRun(markdown, index, end) {
  let length = 0;
  while (index + length < end && markdown[index + length] === '`') length += 1;
  return length;
}

/** 行尾"后缀"：结尾空白、硬换行反斜杠、ATX 标题的闭合 #。块级标记写在后缀之前。 */
function lineSuffixStart(text) {
  const heading = ATX_HEADING.test(text) ? /\s+#+\s*$/.exec(text) : null;
  if (heading && heading.index > text.search(/#/) + 1) return heading.index;
  const tail = /\\?[ \t\r]*$/.exec(text);
  return tail.index;
}

/**
 * 扫描一行正文：行内代码、普通注释、转义、实体和 HTML 标签是受保护区间（插入时边界不能落在其中）；
 * 同时收集 `<mark>` 开闭标签与 Knowra 注释。`<mark>` 必须在同一行内闭合。
 */
function scanTextLine(markdown, line, state, sink) {
  const stack = [];
  let index = line.start;
  while (index < line.end) {
    if (state.comment) {
      const close = markdown.indexOf('-->', index);
      if (close < 0 || close >= line.end) { sink.protect(index, line.end); return finish(); }
      sink.protect(index, close + 3);
      state.comment = false;
      index = close + 3;
      continue;
    }
    const char = markdown[index];
    if (char === '\\' && index + 1 < line.end) { sink.protect(index, index + 2); index += 2; continue; }
    if (char === '`') {
      const length = backtickRun(markdown, index, line.end);
      let close = index + length;
      while (close < line.end) {
        const next = markdown.indexOf('`', close);
        if (next < 0 || next >= line.end) { close = -1; break; }
        const run = backtickRun(markdown, next, line.end);
        if (run === length) break;
        close = next + run;
      }
      if (close >= 0 && close < line.end) { sink.protect(index, close + length); index = close + length; } else index += length;
      continue;
    }
    if (markdown.startsWith('<!--', index)) {
      const close = markdown.indexOf('-->', index + 4);
      if (close < 0 || close >= line.end) { state.comment = true; sink.protect(index, line.end); return finish(); }
      const marker = parseComment(markdown.slice(index + 4, close));
      if (marker) sink.marker({ ...marker, start: index, end: close + 3 });
      sink.protect(index, close + 3);
      index = close + 3;
      continue;
    }
    if (markdown.startsWith('<mark', index) && /[\s>]/.test(markdown[index + 5] ?? '')) {
      const close = markdown.indexOf('>', index);
      if (close < 0 || close >= line.end) { index += 5; continue; }
      const attrs = parseOpenTag(markdown.slice(index, close + 1));
      stack.push({ name: 'mark', ours: ID.test(attrs.k ?? ''), attrs, start: index, openEnd: close + 1 });
      sink.protect(index, close + 1);
      index = close + 1;
      continue;
    }
    if (char === '<') {
      const tag = /^<(\/?)([A-Za-z][\w-]*)\b[^<>\n]*?(\/?)>/.exec(markdown.slice(index, line.end));
      if (tag) {
        const end = index + tag[0].length;
        const name = tag[2].toLowerCase();
        if (tag[1]) {
          const at = stack.findLastIndex(item => item.name === name);
          if (at >= 0) {
            const [open] = stack.splice(at, stack.length - at);
            if (open.ours) sink.inline({ id: open.attrs.k, attrs: open.attrs, start: open.start, contentStart: open.openEnd, contentEnd: index, end });
            else sink.element(open.start, end);
          }
        } else if (!tag[3] && !VOID_ELEMENTS.has(name)) stack.push({ name, ours: false, start: index, openEnd: end });
        sink.protect(index, end);
        index = end;
        continue;
      }
    }
    if (char === '&') {
      const entity = /^&(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/i.exec(markdown.slice(index, line.end));
      if (entity) { sink.protect(index, index + entity[0].length); index += entity[0].length; continue; }
    }
    if (DELIMITERS.has(char)) {
      let end = index + 1;
      while (end < line.end && markdown[end] === char) end += 1;
      if (end - index > 1) sink.protect(index, end);
      index = end;
      continue;
    }
    index += 1;
  }
  return finish();
  function finish() {
    for (const open of stack) if (open.ours) sink.problem({ reason: 'unclosedMark', id: open.attrs.k, start: open.start, end: open.openEnd });
  }
}

function scan(markdown) {
  const lines = lineTable(markdown);
  const fences = classifyLines(markdown, lines);
  const state = { comment: false };
  const inline = [];
  const markers = [];
  const problems = [];
  const protectedSpans = new Map();
  lines.forEach((line, index) => {
    if (line.kind !== 'text') { state.comment = false; return; }
    const spans = [];
    const elements = [];
    scanTextLine(markdown, line, state, {
      protect: (start, end) => spans.push([start, end]),
      element: (start, end) => elements.push([start, end]),
      inline: mark => inline.push({ ...mark, line: index, roles: rolesOf(mark.attrs) }),
      marker: marker => markers.push({ ...marker, line: index }),
      problem: problem => problems.push(problem)
    });
    protectedSpans.set(index, { spans, elements });
  });
  inline.sort((left, right) => left.start - right.start);
  return { lines, fences, inline, markers, problems, protectedSpans };
}

/** 把同一行内首尾相接的有效块级注释归成一段，判断它是单独成行还是在行尾。 */
function markerRuns(markdown, lines, markers) {
  const runs = [];
  for (const marker of markers.filter(item => item.valid)) {
    const last = runs.at(-1);
    if (last && last.line === marker.line && last.end === marker.start) { last.markers.push(marker); last.end = marker.end; continue; }
    runs.push({ line: marker.line, start: marker.start, end: marker.end, markers: [marker] });
  }
  for (const run of runs) {
    const line = lines[run.line];
    const before = markdown.slice(line.start, run.start);
    const after = markdown.slice(run.end, line.end);
    if (!before.trim() && !after.trim()) run.placement = 'lineBefore';
    else if (/^(?:\s+#+\s*|\\?[ \t\r]*)$/.test(after)) run.placement = 'lineEnd';
    else run.placement = 'inline';
  }
  return runs;
}

/**
 * 解析正文中的 Knowra 标记。偏移均为 Markdown 源码偏移；`line` 为从 0 开始的行号。
 * 语法不合法的标记计入 problems，并且不出现在结果里（strip 也会把它们当普通文字保留）。
 */
export function parseKnowraMarks(markdown) {
  const text = typeof markdown === 'string' ? markdown : '';
  const { lines, fences, inline, markers, problems } = scan(text);
  for (const marker of markers.filter(item => !item.valid)) problems.push({ reason: 'invalidMarker', id: marker.id, start: marker.start, end: marker.end });
  const blocks = [];
  const runs = markerRuns(text, lines, markers);
  const standalone = new Set(runs.filter(item => item.placement === 'lineBefore').map(item => item.line));
  for (const run of runs) {
    let targetLine = run.line;
    if (run.placement === 'lineBefore') {
      targetLine = run.line + 1;
      while (standalone.has(targetLine)) targetLine += 1;
      if (targetLine >= lines.length) targetLine = null;
    }
    for (const marker of run.markers) {
      const block = { id: marker.id, attrs: marker.attrs, roles: rolesOf(marker.attrs), exclude: marker.exclude, start: marker.start, end: marker.end, line: run.line, placement: run.placement, targetLine };
      if (marker.attrs.s === 'code') {
        const fence = run.placement === 'lineBefore' ? fences.get(targetLine) : null;
        const range = /^(\d+)-(\d+)$/.exec(marker.attrs.r ?? '');
        const code = fence ? codeText(text, fence) : null;
        const from = range ? Number(range[1]) : NaN;
        const to = range ? Number(range[2]) : NaN;
        let reason = null;
        if (!fence) reason = 'codeTargetMissing';
        else if (!(from >= 0 && from < to && to <= code.length)) reason = 'codeRangeInvalid';
        else if (knowraCheck(code.slice(from, to)) !== marker.attrs.h) reason = 'codeCheckMismatch';
        block.code = { from, to, text: reason ? null : code.slice(from, to), resolved: !reason };
        if (reason) problems.push({ reason, id: marker.id, start: marker.start, end: marker.end });
      }
      blocks.push(block);
    }
  }
  problems.sort((left, right) => left.start - right.start);
  return { format: KNOWRA_MARKS_FORMAT, inline, blocks, problems };
}

/** 去掉全部有效的 Knowra 标记，其余文字逐字不变。不合法的标记当作普通文字保留。 */
export function stripKnowraMarks(markdown) {
  const text = typeof markdown === 'string' ? markdown : '';
  const { lines, inline, markers } = scan(text);
  const removals = [];
  for (const mark of inline) removals.push([mark.start, mark.contentStart], [mark.contentEnd, mark.end]);
  for (const run of markerRuns(text, lines, markers)) {
    const line = lines[run.line];
    if (run.placement === 'lineBefore') removals.push(line.next > line.end ? [line.start, line.next] : [Math.max(0, line.start - 1), line.end]);
    else removals.push([text[run.start - 1] === ' ' && run.start > line.start ? run.start - 1 : run.start, run.end]);
  }
  removals.sort((left, right) => left[0] - right[0]);
  let output = '';
  let cursor = 0;
  for (const [start, end] of removals) {
    if (start < cursor) { cursor = Math.max(cursor, end); continue; }
    output += text.slice(cursor, start);
    cursor = end;
  }
  return output + text.slice(cursor);
}

export function formatKnowraMarkOpen(id, attrs = {}) {
  if (!ID.test(id)) throw new Error(`Invalid Knowra mark id: ${id}`);
  const parts = [`data-k="${id}"`];
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'k' || value === undefined || value === null || value === '') continue;
    if (!ATTR_KEY.test(key)) throw new Error(`Invalid Knowra mark attribute: ${key}`);
    parts.push(`data-${key}="${encodeHtml(String(value))}"`);
  }
  return `<mark ${parts.join(' ')}>`;
}

export function formatKnowraMarker(id, attrs = {}, { exclude = false } = {}) {
  if (!ID.test(id)) throw new Error(`Invalid Knowra mark id: ${id}`);
  if (exclude) return `<!--k- ${id}-->`;
  const tokens = [];
  if (!Object.values(attrs).some(value => value !== undefined && value !== null && value !== '')) throw new Error(`Knowra marker ${id} needs at least one attribute`);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === '') continue;
    if (!ATTR_KEY.test(key)) throw new Error(`Invalid Knowra marker attribute: ${key}`);
    tokens.push(`${key}=${encodeURIComponent(String(value))}`);
  }
  return `<!--k ${id}${tokens.map(token => ` ${token}`).join('')}-->`;
}

const insideSpan = (spans, offset) => spans.some(([start, end]) => offset > start && offset < end);

/**
 * 在不含 Knowra 标记的正文中插入标记，供迁移和测试使用；结果满足 `stripKnowraMarks(结果) === 原文`。
 * - inline：`{ id, from, to, attrs }`，范围限在一行正文内，边界不能落在行内代码、标签、转义、实体或成串的强调符号中间；
 *   重叠范围自动切段并嵌套。是否与强调、链接等 Markdown 结构正确嵌套由调用方按语法树保证。
 * - blocks：`{ id, line, attrs, exclude, code: { from, to } }`。代码块、公式块、表格、HTML 块和分隔线写在前一行，其余写在行尾；
 *   `code` 只用于围栏代码块开头行，自动写入 `s=code`、`r` 和 `h`。
 */
export function insertKnowraMarks(markdown, { inline = [], blocks = [] } = {}) {
  const { lines, fences, protectedSpans, inline: existing, markers } = scan(markdown);
  if (existing.length || markers.some(marker => marker.valid)) throw new Error('Markdown already contains Knowra marks');
  const lineOf = offset => lines.findIndex(line => offset >= line.start && offset <= line.end);
  const operations = [];
  let sequence = 0;
  const add = (position, priority, text) => operations.push({ position, priority, sequence: sequence += 1, text });

  const byLine = new Map();
  inline.forEach((item, order) => {
    const { id, from, to } = item;
    if (!ID.test(id)) throw new Error(`Invalid Knowra mark id: ${id}`);
    if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && from < to && to <= markdown.length)) throw new Error(`Invalid range for ${id}`);
    const index = lineOf(from);
    const line = lines[index];
    if (line.kind !== 'text' || to > line.end) throw new Error(`Inline mark ${id} must stay within one text line`);
    const { spans = [], elements = [] } = protectedSpans.get(index) ?? {};
    if (insideSpan(spans, from) || insideSpan(spans, to)) throw new Error(`Inline mark ${id} splits protected Markdown syntax`);
    if (elements.some(([start, end]) => (from > start && from < end) !== (to > start && to < end))) throw new Error(`Inline mark ${id} crosses an HTML element`);
    if (!byLine.has(index)) byLine.set(index, []);
    byLine.get(index).push({ ...item, order });
  });
  for (const items of byLine.values()) {
    const boundaries = [...new Set(items.flatMap(item => [item.from, item.to]))].sort((left, right) => left - right);
    let stack = [];
    for (let step = 0; step < boundaries.length; step += 1) {
      const position = boundaries[step];
      const next = boundaries[step + 1];
      const wanted = next === undefined ? [] : items
        .filter(item => item.from <= position && item.to >= next)
        .sort((left, right) => left.from - right.from || right.to - left.to || left.order - right.order);
      let common = 0;
      while (common < stack.length && common < wanted.length && stack[common] === wanted[common]) common += 1;
      for (let index = stack.length - 1; index >= common; index -= 1) add(position, 1, '</mark>');
      for (const item of wanted.slice(common)) add(position, 2, formatKnowraMarkOpen(item.id, item.attrs));
      stack = wanted;
    }
  }

  const lineEnd = new Map();
  for (const item of blocks) {
    const line = lines[item.line];
    if (!line || line.kind === 'code' || line.kind === 'fenceClose') throw new Error(`Invalid block line for ${item.id}`);
    const text = markdown.slice(line.start, line.end);
    if (!text.trim()) throw new Error(`Block marker ${item.id} cannot target an empty line`);
    let attrs = item.attrs ?? {};
    if (item.code) {
      const fence = fences.get(item.line);
      if (!fence) throw new Error(`Code marker ${item.id} must target a fenced code block`);
      const code = codeText(markdown, fence);
      const { from, to } = item.code;
      if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && from < to && to <= code.length)) throw new Error(`Invalid code range for ${item.id}`);
      attrs = { ...attrs, s: 'code', r: `${from}-${to}`, h: knowraCheck(code.slice(from, to)) };
    }
    const marker = formatKnowraMarker(item.id, attrs, { exclude: item.exclude });
    const before = line.kind !== 'text' || /^\s*[|<]/.test(text) || THEMATIC_BREAK.test(text);
    if (before) { add(line.start, 0, `${text.match(/^\s*/)[0]}${marker}\n`); continue; }
    if (!lineEnd.has(item.line)) lineEnd.set(item.line, []);
    lineEnd.get(item.line).push(marker);
  }
  for (const [index, list] of lineEnd) {
    const line = lines[index];
    add(line.start + lineSuffixStart(markdown.slice(line.start, line.end)), 3, ` ${list.join('')}`);
  }

  operations.sort((left, right) => left.position - right.position || left.priority - right.priority || left.sequence - right.sequence);
  let output = '';
  let cursor = 0;
  for (const operation of operations) {
    output += markdown.slice(cursor, operation.position) + operation.text;
    cursor = operation.position;
  }
  return output + markdown.slice(cursor);
}
