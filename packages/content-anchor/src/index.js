import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';

export const MARKDOWN_PROJECTION_VERSION = 1;

const BLOCK_TYPES = new Set([
  'heading', 'paragraph', 'code', 'blockquote', 'listItem', 'table',
  'thematicBreak', 'html'
]);
const LEAF_BLOCK_TYPES = new Set(['heading', 'paragraph', 'code', 'tableCell']);

export function calculateContentHash(markdown) {
  const bytes = new TextEncoder().encode(String(markdown ?? ''));
  const words = [];
  const bitLength = bytes.length * 8;
  for (const byte of bytes) words.push(byte);
  words.push(0x80);
  while (words.length % 64 !== 56) words.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) words.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) words.push((low >>> shift) & 0xff);
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
  for (let offset = 0; offset < words.length; offset += 64) {
    const schedule = new Array(64);
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      schedule[index] = ((words[start] << 24) | (words[start + 1] << 16) | (words[start + 2] << 8) | words[start + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotate(schedule[index - 15], 7) ^ rotate(schedule[index - 15], 18) ^ (schedule[index - 15] >>> 3);
      const s1 = rotate(schedule[index - 2], 17) ^ rotate(schedule[index - 2], 19) ^ (schedule[index - 2] >>> 10);
      schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choose + constants[index] + schedule[index]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      [a, b, c, d, e, f, g, h] = [(temp1 + temp2) >>> 0, a, b, c, (d + temp1) >>> 0, e, f, g];
    }
    [a, b, c, d, e, f, g, h].forEach((value, index) => { state[index] = (state[index] + value) >>> 0; });
  }
  return state.map((value) => value.toString(16).padStart(8, '0')).join('');
}

export function projectMarkdown(markdown) {
  const source = String(markdown ?? '');
  const tree = fromMarkdown(source, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()]
  });
  const units = [];
  const blocks = [];
  const headings = [];
  const leafBlocks = [];

  walk(tree, [], (node, path) => {
    if (BLOCK_TYPES.has(node.type) && hasOffsets(node)) {
      blocks.push(buildBlock(node, path));
    }
    if (node.type === 'heading' && hasOffsets(node)) {
      headings.push({
        ...buildBlock(node, path),
        level: Number(node.depth),
        title: visibleText(node, source)
      });
    }
    if (LEAF_BLOCK_TYPES.has(node.type) && hasOffsets(node)) {
      leafBlocks.push({ node, path });
    }
  });

  leafBlocks.sort((left, right) => offset(left.node) - offset(right.node));
  leafBlocks.forEach(({ node, path }, index) => {
    if (index > 0) units.push(separatorUnit('\n'));
    appendLeafUnits(units, node, path, source);
  });

  let projectedOffset = 0;
  for (const unit of units) {
    unit.projectedStart = projectedOffset;
    projectedOffset += unit.text.length;
    unit.projectedEnd = projectedOffset;
  }
  const text = units.map((unit) => unit.text).join('');
  const sections = headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    return {
      ...heading,
      sourceEnd: next?.sourceStart ?? source.length,
      endBoundaryPath: next?.path ?? null,
      endBoundaryLevel: next?.level ?? null,
      endBoundaryTitle: next?.title ?? null,
      memberFingerprint: fingerprintBlocks(blocks.filter((block) => (
        block.sourceStart >= heading.sourceStart
        && block.sourceStart < (next?.sourceStart ?? source.length)
      )))
    };
  });

  return {
    version: MARKDOWN_PROJECTION_VERSION,
    source,
    contentHash: calculateContentHash(source),
    text,
    units,
    blocks: blocks.sort((left, right) => left.sourceStart - right.sourceStart),
    headings,
    sections
  };
}

export function anchorFromProjectedRange(projection, projectedStart, projectedEnd, options = {}) {
  assertProjection(projection);
  if (!Number.isInteger(projectedStart) || !Number.isInteger(projectedEnd)
    || projectedStart < 0 || projectedStart >= projectedEnd || projectedEnd > projection.text.length) {
    throw rangeError('Projected range is invalid');
  }
  const selected = projection.units.filter((unit) => (
    unit.projectedEnd > projectedStart && unit.projectedStart < projectedEnd
  ));
  const sourceUnits = selected.filter((unit) => unit.sourceStart !== null);
  if (sourceUnits.length === 0) throw rangeError('Projected range has no source content');
  const segments = [];
  for (const unit of sourceUnits) {
    const clipped = clipUnit(unit, projectedStart, projectedEnd);
    const previous = segments.at(-1);
    if (previous && previous.end === clipped.start && previous.path === clipped.path) {
      previous.end = clipped.end;
    } else {
      segments.push(clipped);
    }
  }
  return buildAnchor(projection, segments, {
    projectedStart,
    projectedEnd,
    scopeType: options.scopeType ?? 'selection',
    structurePath: options.structurePath ?? sourceUnits[0].path
  });
}

export function anchorForSourceRange(projection, sourceStart, sourceEnd, options = {}) {
  assertProjection(projection);
  if (!Number.isInteger(sourceStart) || !Number.isInteger(sourceEnd)
    || sourceStart < 0 || sourceStart >= sourceEnd || sourceEnd > projection.source.length) {
    throw rangeError('Source range is invalid');
  }
  const segments = projection.units
    .filter((unit) => unit.sourceStart !== null && unit.sourceEnd > sourceStart && unit.sourceStart < sourceEnd)
    .map((unit) => ({
      start: Math.max(unit.sourceStart, sourceStart),
      end: Math.min(unit.sourceEnd, sourceEnd),
      path: unit.path
    }));
  if (segments.length === 0) throw rangeError('Source range has no projected content');
  return buildAnchor(projection, mergeSegments(segments), {
    scopeType: options.scopeType ?? 'selection',
    structurePath: options.structurePath ?? segments[0].path
  });
}

export function anchorForBlock(projection, blockIndex) {
  const block = projection.blocks[blockIndex];
  if (!block) throw rangeError('Markdown block does not exist');
  return anchorForSourceRange(projection, block.sourceStart, block.sourceEnd, {
    scopeType: 'blocks',
    structurePath: block.path
  });
}

export function anchorForSection(projection, headingIndex) {
  const section = projection.sections[headingIndex];
  if (!section) throw rangeError('Markdown heading does not exist');
  const anchor = anchorForSourceRange(projection, section.sourceStart, section.sourceEnd, {
    scopeType: 'section',
    structurePath: section.path
  });
  return {
    ...anchor,
    section: {
      headingLevel: section.level,
      title: section.title,
      sourceStart: section.sourceStart,
      sourceEnd: section.sourceEnd,
      endBoundaryPath: section.endBoundaryPath,
      endBoundaryLevel: section.endBoundaryLevel,
      endBoundaryTitle: section.endBoundaryTitle,
      memberFingerprint: section.memberFingerprint
    }
  };
}

export function resolveAnchor(markdown, anchor) {
  const projection = projectMarkdown(markdown);
  validateAnchorShape(anchor, Number.MAX_SAFE_INTEGER);
  // 旧版本的合法范围可能超出缩短后的正文；返回失效状态，让重定位继续查找。
  if (anchor.segments.some(segment => segment.end > projection.source.length)) {
    return { status: 'missing', reason: 'sourceDeleted', projection };
  }
  if (anchor.projectionVersion !== MARKDOWN_PROJECTION_VERSION) {
    return { status: 'needsReview', reason: 'projectionVersionMismatch', projection };
  }
  const segments = anchor.segments.map((segment) => ({ ...segment }));
  const quoteText = quoteForSegments(projection, segments);
  if (!quoteText) return { status: 'missing', reason: 'sourceDeleted', projection };
  const exact = quoteText === anchor.quoteText;
  const pathMatches = !anchor.structurePath
    || projection.units.some((unit) => (
      (unit.path === anchor.structurePath || unit.path.startsWith(`${anchor.structurePath}.`))
      && segments.some((segment) => overlapsUnit(segment, unit))
    ));
  if (!exact || !pathMatches) {
    return { status: 'needsReview', reason: exact ? 'structureChanged' : 'contentChanged', projection, quoteText, segments };
  }
  if (anchor.scopeType === 'section' && anchor.section) {
    const section = projection.sections.find((candidate) => candidate.path === anchor.structurePath);
    if (!section) return { status: 'missing', reason: 'sectionDeleted', projection, quoteText, segments };
    if (section.endBoundaryPath !== (anchor.section.endBoundaryPath ?? null)
      || section.endBoundaryLevel !== (anchor.section.endBoundaryLevel ?? null)) {
      return { status: 'needsReview', reason: 'boundaryChanged', projection, quoteText, segments, section };
    }
  }
  return { status: 'resolved', reason: null, projection, quoteText, segments };
}

export function relocateAnchor(markdown, anchor) {
  const exact = resolveAnchor(markdown, anchor);
  if (exact.status === 'resolved') return exact;
  const projection = exact.projection;
  const occurrences = findOccurrences(projection.text, anchor.quoteText);
  const candidates = occurrences.map((start) => {
    try {
      return anchorFromProjectedRange(projection, start, start + anchor.quoteText.length, {
        scopeType: anchor.scopeType
      });
    } catch {
      return null;
    }
  }).filter(Boolean).filter((candidate) => contextScore(projection.text, candidate, anchor) >= 1);
  if (candidates.length !== 1) {
    return {
      ...exact,
      status: candidates.length === 0 ? 'missing' : 'needsReview',
      reason: candidates.length === 0 ? 'sourceDeleted' : 'ambiguousMatch',
      candidates
    };
  }
  return { status: 'resolved', reason: null, projection, quoteText: candidates[0].quoteText, segments: candidates[0].segments, anchor: candidates[0] };
}

export function followSectionAnchor(markdown, anchor) {
  const projection = projectMarkdown(markdown);
  if (anchor?.scopeType !== 'section' || !anchor.section || !anchor.structurePath) {
    return { status: 'needsReview', reason: 'sectionIdentityMissing', projection };
  }
  const sectionIndex = projection.sections.findIndex((candidate) => candidate.path === anchor.structurePath);
  if (sectionIndex < 0) return { status: 'missing', reason: 'sectionDeleted', projection };
  const section = projection.sections[sectionIndex];
  const proposedAnchor = anchorForSection(projection, sectionIndex);
  const sameHeadingLevel = section.level === anchor.section.headingLevel;
  const sameBoundary = section.endBoundaryLevel === (anchor.section.endBoundaryLevel ?? null)
    && section.endBoundaryTitle === (anchor.section.endBoundaryTitle ?? null);
  if (!sameHeadingLevel || !sameBoundary) {
    return {
      status: 'needsReview', reason: 'boundaryChanged', projection,
      quoteText: proposedAnchor.quoteText, segments: proposedAnchor.segments,
      anchor: proposedAnchor, section
    };
  }
  return {
    status: 'resolved', reason: null, projection,
    quoteText: proposedAnchor.quoteText, segments: proposedAnchor.segments,
    anchor: proposedAnchor, section
  };
}

export function headingPathForSourceOffset(projection, sourceOffset) {
  const byLevel = new Map();
  for (const heading of projection.headings) {
    if (heading.sourceStart >= sourceOffset) break;
    byLevel.set(heading.level, heading.title);
    for (const level of [...byLevel.keys()]) if (level > heading.level) byLevel.delete(level);
  }
  return [...byLevel.entries()].sort(([left], [right]) => left - right).map(([, title]) => title);
}

function buildAnchor(projection, segments, options) {
  const quoteText = quoteForSegments(projection, segments);
  const sourceStart = Math.min(...segments.map((segment) => segment.start));
  const sourceEnd = Math.max(...segments.map((segment) => segment.end));
  const prefixText = projection.text.slice(Math.max(0, options.projectedStart ?? projectedIndexAtSource(projection, sourceStart) - 64), options.projectedStart ?? projectedIndexAtSource(projection, sourceStart));
  const projectedEnd = options.projectedEnd ?? projectedIndexAtSource(projection, sourceEnd, true);
  const suffixText = projection.text.slice(projectedEnd, projectedEnd + 64);
  return {
    projectionVersion: MARKDOWN_PROJECTION_VERSION,
    scopeType: options.scopeType,
    segments,
    structurePath: options.structurePath ?? null,
    quoteText,
    prefixText,
    suffixText,
    sourceStart,
    sourceEnd,
    projectedStart: options.projectedStart ?? projectedIndexAtSource(projection, sourceStart),
    projectedEnd
  };
}

function appendLeafUnits(units, node, path, source) {
  if (node.type === 'code') {
    appendCodeUnits(units, node, path, source);
    return;
  }
  walk(node, path, (child, childPath) => {
    if (child !== node && LEAF_BLOCK_TYPES.has(child.type)) return false;
    if (child.type === 'text') appendDecodedUnits(units, child.value, sliceForNode(child, source), offset(child), childPath);
    else if (child.type === 'inlineCode') appendInlineCodeUnits(units, child, childPath, source);
    else if (child.type === 'break') units.push(separatorUnit('\n', childPath));
    else if (child.type === 'image') units.push({ text: '\uFFFC', sourceStart: offset(child), sourceEnd: endOffset(child), path: childPath, atomic: true });
    return true;
  });
}

function appendDecodedUnits(units, value, raw, rawOffset, path) {
  let rawIndex = 0;
  for (const character of value) {
    let start = raw.indexOf(character, rawIndex);
    let end;
    if (start >= 0) {
      end = start + character.length;
    } else if (raw[rawIndex] === '&') {
      const entityEnd = raw.indexOf(';', rawIndex);
      start = rawIndex;
      end = entityEnd >= 0 ? entityEnd + 1 : rawIndex + 1;
    } else {
      start = rawIndex;
      end = Math.min(raw.length, rawIndex + character.length);
    }
    units.push({ text: character, sourceStart: rawOffset + start, sourceEnd: rawOffset + end, path });
    rawIndex = end;
  }
}

function appendInlineCodeUnits(units, node, path, source) {
  const raw = sliceForNode(node, source);
  const opening = raw.match(/^`+/)?.[0].length ?? 1;
  const closing = raw.match(/`+$/)?.[0].length ?? opening;
  let contentStart = opening;
  let contentEnd = raw.length - closing;
  if (raw.slice(contentStart, contentEnd).startsWith(' ') && raw.slice(contentStart, contentEnd).endsWith(' ') && node.value !== ' ') {
    contentStart += 1;
    contentEnd -= 1;
  }
  appendDecodedUnits(units, node.value, raw.slice(contentStart, contentEnd), offset(node) + contentStart, path);
}

function appendCodeUnits(units, node, path, source) {
  const raw = sliceForNode(node, source);
  if (!raw.startsWith('```') && !raw.startsWith('~~~')) {
    appendDecodedUnits(units, node.value, raw, offset(node), path);
    return;
  }
  const firstBreak = raw.indexOf('\n');
  const closingStart = Math.max(firstBreak + 1, raw.lastIndexOf('\n'));
  const contentStart = firstBreak < 0 ? raw.length : firstBreak + 1;
  const contentEnd = closingStart > contentStart ? closingStart : raw.length;
  appendDecodedUnits(units, node.value, raw.slice(contentStart, contentEnd), offset(node) + contentStart, path);
}

function quoteForSegments(projection, segments) {
  const selected = projection.units.filter((unit) => unit.sourceStart !== null && segments.some((segment) => overlapsUnit(segment, unit)));
  if (selected.length === 0) return '';
  const output = [];
  let previous = null;
  for (const unit of selected) {
    if (previous && unit.projectedStart > previous.projectedEnd) {
      output.push(projection.text.slice(previous.projectedEnd, unit.projectedStart));
    }
    output.push(unit.text);
    previous = unit;
  }
  return output.join('');
}

function clipUnit(unit, projectedStart, projectedEnd) {
  const startDelta = Math.max(0, projectedStart - unit.projectedStart);
  const endDelta = Math.max(0, unit.projectedEnd - projectedEnd);
  return {
    start: unit.sourceStart + Math.min(startDelta, unit.sourceEnd - unit.sourceStart),
    end: unit.sourceEnd - Math.min(endDelta, unit.sourceEnd - unit.sourceStart),
    path: unit.path
  };
}

function projectedIndexAtSource(projection, sourceOffset, preferEnd = false) {
  const candidate = projection.units.find((unit) => unit.sourceStart !== null && (
    preferEnd ? unit.sourceEnd >= sourceOffset : unit.sourceStart >= sourceOffset
  ));
  return candidate ? (preferEnd ? candidate.projectedEnd : candidate.projectedStart) : projection.text.length;
}

function visibleText(node, source) {
  const temp = [];
  appendLeafUnits(temp, node, 'heading', source);
  return temp.map((unit) => unit.text).join('');
}

function fingerprintBlocks(blocks) {
  return calculateContentHash(blocks.map((block) => `${block.type}:${block.path}`).join('|'));
}

function contextScore(text, candidate, anchor) {
  const start = candidate.projectedStart;
  const prefixMatches = !anchor.prefixText || text.slice(Math.max(0, start - anchor.prefixText.length), start) === anchor.prefixText;
  const end = start + candidate.quoteText.length;
  const suffixMatches = !anchor.suffixText || text.slice(end, end + anchor.suffixText.length) === anchor.suffixText;
  return Number(prefixMatches) + Number(suffixMatches);
}

function findOccurrences(text, quote) {
  const matches = [];
  if (!quote) return matches;
  for (let from = 0; from <= text.length - quote.length;) {
    const index = text.indexOf(quote, from);
    if (index < 0) break;
    matches.push(index);
    from = index + Math.max(1, quote.length);
  }
  return matches;
}

function buildBlock(node, path) {
  return { type: node.type, path: String(path), sourceStart: offset(node), sourceEnd: endOffset(node) };
}

function walk(node, path, visitor) {
  const pathParts = Array.isArray(path)
    ? path
    : String(path).split('.').filter(Boolean).map((part) => Number(part));
  const outcome = visitor(node, pathParts.join('.'));
  if (outcome === false || !Array.isArray(node.children)) return;
  node.children.forEach((child, index) => walk(child, [...pathParts, index], visitor));
}

function separatorUnit(text, path = 'separator') {
  return { text, sourceStart: null, sourceEnd: null, path };
}

function sliceForNode(node, source) { return source.slice(offset(node), endOffset(node)); }
function offset(node) { return node.position?.start?.offset ?? 0; }
function endOffset(node) { return node.position?.end?.offset ?? offset(node); }
function hasOffsets(node) { return Number.isInteger(node.position?.start?.offset) && Number.isInteger(node.position?.end?.offset); }
function overlapsUnit(segment, unit) { return unit.sourceStart !== null && segment.start < unit.sourceEnd && segment.end > unit.sourceStart; }

function mergeSegments(segments) {
  const merged = [];
  for (const segment of segments.sort((left, right) => left.start - right.start)) {
    const previous = merged.at(-1);
    if (previous && previous.end === segment.start && previous.path === segment.path) previous.end = segment.end;
    else merged.push({ ...segment });
  }
  return merged;
}

function assertProjection(projection) {
  if (!projection || projection.version !== MARKDOWN_PROJECTION_VERSION || !Array.isArray(projection.units)) {
    throw new TypeError('Markdown projection is invalid');
  }
}

function validateAnchorShape(anchor, sourceLength) {
  if (!anchor || !Array.isArray(anchor.segments) || anchor.segments.length === 0) throw rangeError('Anchor segments are required');
  let previousEnd = -1;
  for (const segment of anchor.segments) {
    if (!Number.isInteger(segment.start) || !Number.isInteger(segment.end)
      || segment.start < 0 || segment.start >= segment.end || segment.end > sourceLength || segment.start < previousEnd) {
      throw rangeError('Anchor source range is invalid');
    }
    previousEnd = segment.end;
  }
}

function rangeError(message) {
  const error = new RangeError(message);
  error.code = 'ANNOTATION_RANGE_INVALID';
  return error;
}
