import { MARKDOWN_PROJECTION_VERSION, projectMarkdown, anchorFromProjectedRange, anchorForSection, quoteForSegments, overlapsUnit, rangeError } from './projection.js';
import { resolveListAnchor, followListAnchor } from './list-anchor.js';

export function resolveAnchor(markdown, anchor) {
  const projection = projectMarkdown(markdown);
  if (anchor?.scopeType === 'list') return resolveListAnchor(projection, anchor);
  if (anchor?.tracking?.empty && anchor.scopeType === 'blocks' && Array.isArray(anchor.segments) && anchor.segments.length === 0
    && Number.isInteger(anchor.sourceStart) && anchor.sourceStart >= 0 && anchor.sourceStart <= projection.source.length) {
    return { status: 'resolved', reason: null, projection, quoteText: '', segments: [], anchor };
  }
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
  if (anchor?.scopeType === 'list') return followListAnchor(markdown, anchor);
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
  let proposedAnchor;
  try { proposedAnchor = anchorForSection(projection, sectionIndex); }
  catch (error) {
    if (error?.code !== 'ANNOTATION_RANGE_INVALID') throw error;
    return { status: 'missing', reason: 'sourceDeleted', projection };
  }
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
