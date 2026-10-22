import { projectMarkdown } from '@study-accelerator/content-anchor';
import { knowraMarkSpans, parseKnowraMarks } from '@study-accelerator/shared/knowra-marks';

/**
 * 内联重点（v3）在正文中的源码区间，供分析范围与 AI 读取使用：
 * 选区取 `<mark>` 内侧；章节取标题到下一个同级或更高级标题；列表项取整个子树；整块取所在块；
 * 代码范围按缩进换算回源码。最后挖掉所有标记本身占用的位置，切出的原文不含标签且偏移可直接用于来源校验。
 * 标记不在正文中时返回 null。
 */
export function inlineAnnotationSourceRanges(markdown, markId) {
  const text = String(markdown ?? '');
  const parsed = parseKnowraMarks(text);
  const inline = parsed.inline.filter(item => item.id === markId);
  const blocks = parsed.blocks.filter(item => item.id === markId);
  if (!inline.length && !blocks.some(item => !item.exclude)) return null;
  const projection = projectMarkdown(text);
  const lineStarts = [0];
  for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) lineStarts.push(index + 1);
  const lineRange = line => [lineStarts[line] ?? text.length, (lineStarts[line + 1] ?? text.length + 1) - 1];
  const startsOn = (line, item) => { const [from, to] = lineRange(line); return item.sourceStart >= from && item.sourceStart <= to; };
  const depth = item => String(item.path ?? '').split('.').length;

  const blockRange = (marker) => {
    const line = marker.targetLine ?? marker.line;
    if (marker.attrs.s === 'section') {
      const index = projection.headings.findIndex(heading => startsOn(line, heading));
      if (index < 0) return null;
      const heading = projection.headings[index];
      const next = projection.headings.slice(index + 1).find(item => item.level <= heading.level);
      return [heading.sourceStart, next ? next.sourceStart : text.length];
    }
    if (marker.attrs.s === 'list') {
      const item = projection.listItems.filter(candidate => startsOn(line, candidate)).sort((a, b) => depth(a) - depth(b))[0];
      return item ? [item.sourceStart, item.sourceEnd] : null;
    }
    const block = projection.blocks.filter(candidate => candidate.type !== 'html' && startsOn(line, candidate)).sort((a, b) => depth(a) - depth(b))[0];
    return block ? [block.sourceStart, block.sourceEnd] : null;
  };

  /** 代码文字偏移 → 源码偏移：开围栏有缩进时逐行跳过被去掉的缩进。 */
  const codeRange = (marker) => {
    const fenceLine = marker.targetLine;
    if (fenceLine === null || !marker.code?.resolved) return null;
    const [fenceStart] = lineRange(fenceLine);
    const indent = /^\s*/.exec(text.slice(fenceStart, lineRange(fenceLine)[1]))[0].length;
    const map = [];
    for (let line = fenceLine + 1; line < lineStarts.length; line += 1) {
      const [from, to] = lineRange(line);
      const raw = text.slice(from, to);
      if (/^\s*(`{3,}|~{3,})\s*$/.test(raw)) break;
      const skip = Math.min(indent, /^ */.exec(raw)[0].length);
      if (map.length) map.push(from - 1);
      for (let offset = from + skip; offset < to; offset += 1) map.push(offset);
    }
    const start = map[marker.code.from];
    const last = map[marker.code.to - 1];
    return Number.isInteger(start) && Number.isInteger(last) ? [start, last + 1] : null;
  };

  const raw = [];
  for (const mark of inline) raw.push([mark.contentStart, mark.contentEnd]);
  const excluded = [];
  for (const marker of blocks) {
    const range = marker.attrs.s === 'code' ? codeRange(marker) : blockRange(marker);
    if (!range) continue;
    (marker.exclude ? excluded : raw).push(range);
  }
  const spans = knowraMarkSpans(text);
  const clean = ([from, to]) => {
    const pieces = [];
    let cursor = from;
    for (const span of spans) {
      if (span.end <= cursor || span.start >= to) continue;
      if (span.start > cursor) pieces.push({ start: cursor, end: span.start });
      cursor = Math.max(cursor, span.end);
    }
    if (cursor < to) pieces.push({ start: cursor, end: to });
    // 去掉只剩空白的碎片（例如行尾注释前后的换行）。
    return pieces.filter(piece => text.slice(piece.start, piece.end).trim());
  };
  const merge = (ranges) => ranges.flatMap(clean).sort((a, b) => a.start - b.start)
    .reduce((list, piece) => { const last = list.at(-1); if (last && piece.start <= last.end) last.end = Math.max(last.end, piece.end); else list.push({ ...piece }); return list; }, []);
  return { ranges: merge(raw), excluded: merge(excluded) };
}
