import { REVIEW_LIMITS as L, keys, text, id, list, choice, unique, fail, record, same } from './validation.js';
const kinds = ['definition', 'fact', 'procedure', 'application'];
const normalize = value => value.toLowerCase().replace(/[\s\-—_·・（）()【】\[\]“”"'：:，,。.、]/gu, '');
export const proposalKey = (reportId, rowId, index) => `${reportId}/${rowId}#${index}`;
export function validateCandidates(row, path) {
  list(row.candidateConcepts, L.concepts, `${path}.candidateConcepts`);
  list(row.candidateItems, L.items, `${path}.candidateItems`);
  for (const concept of row.candidateConcepts) {
    keys(concept, ['id', 'name', 'sense'], `${path}.concept`); id(concept.id, `${path}.concept.id`);
    text(concept.name, L.name, `${path}.concept.name`); text(concept.sense, L.sense, `${path}.concept.sense`);
  }
  unique(row.candidateConcepts.map(c => c.id), `${path}.concepts`);
  for (const item of row.candidateItems) {
    keys(item, ['id', 'conceptId', 'title', 'kind', 'statement'], `${path}.item`);
    id(item.id, `${path}.item.id`); id(item.conceptId, `${path}.item.conceptId`);
    text(item.title, L.title, `${path}.item.title`); text(item.statement, L.text, `${path}.item.statement`);
    choice(item.kind, kinds, `${path}.item.kind`);
    if (!row.candidateConcepts.some(c => c.id === item.conceptId)) fail(path, 'orphan-item');
  }
  unique(row.candidateItems.map(i => i.id), `${path}.items`);
}
function validateOriginal(link, row, path) {
  keys(link, ['conceptAction', 'conceptId', 'newConcept', 'possibleDuplicateOf', 'itemAction', 'existingItemId', 'item', 'sourceIssue'], path);
  keys(link.item, ['title', 'kind', 'statement', 'quote'], `${path}.item`);
  text(link.item.title, L.title, `${path}.item.title`); text(link.item.statement, L.statement, `${path}.item.statement`);
  text(link.item.quote, L.text, `${path}.item.quote`); choice(link.item.kind, kinds, `${path}.item.kind`);
  const first = row.note.markdown.indexOf(link.item.quote);
  if (first < 0 || row.note.markdown.indexOf(link.item.quote, first + 1) >= 0) fail(path, 'quote-not-unique');
  const substance = link.item.quote.split(/\r?\n/).filter(line => !/^\s{0,3}#{1,6}\s/.test(line) && !/^\s*```/.test(line))
    .map(line => line.replace(/^\s*(\d+[、.]|[-*])\s*/, '')).join('').replace(/\s/gu, '');
  if (!substance) fail(path, 'quote-without-substance');
  if (link.sourceIssue !== null) text(link.sourceIssue, L.sourceIssue, `${path}.sourceIssue`);
  choice(link.conceptAction, ['reuse', 'create'], `${path}.conceptAction`);
  choice(link.itemAction, ['reuse', 'new'], `${path}.itemAction`);
  const exists = value => row.candidateConcepts.some(c => c.id === value);
  if (link.conceptAction === 'reuse') {
    if (!exists(link.conceptId) || link.newConcept !== null) fail(path, 'concept-reference');
  } else {
    if (link.conceptId !== null) fail(path, 'new-concept-id');
    keys(link.newConcept, ['name', 'sense'], `${path}.newConcept`);
    text(link.newConcept.name, L.name, `${path}.newConcept.name`); text(link.newConcept.sense, L.sense, `${path}.newConcept.sense`);
  }
  if (link.possibleDuplicateOf !== null && (link.conceptAction !== 'create' || !exists(link.possibleDuplicateOf))) fail(path, 'duplicate-reference');
  if (link.itemAction === 'reuse') {
    if (!row.candidateItems.some(i => i.id === link.existingItemId && i.conceptId === link.conceptId)) fail(path, 'item-reference');
  } else if (link.existingItemId !== null) fail(path, 'new-item-id');
}
/** 保守导入规则：风险/被拒的新概念项仍传播风险，伪造 accepted=false 不能解除依赖。 */
export function riskDependencies(proposals, proposal) {
  const own = proposal.original;
  if (own?.conceptAction !== 'create') return [];
  const ownName = typeof own.newConcept?.name === 'string' ? normalize(own.newConcept.name) : null;
  return proposals.filter(p => {
    const original = p.original;
    if (original?.conceptAction !== 'create' || (p.validationAccepted && original.sourceIssue === null)) return false;
    const riskName = typeof original.newConcept?.name === 'string' ? normalize(original.newConcept.name) : null;
    return !ownName || !riskName || ownName === riskName;
  }).map(p => p.originalIndex);
}
export function validateProposals(row, path, reportId) {
  list(row.proposals, L.proposals, `${path}.proposals`);
  const links = row.providerResult?.parsed?.links;
  if (row.responseState === 'proposals' && (!Array.isArray(links) || !links.length || links.length !== row.proposals.length)) fail(path, 'proposal-coverage');
  if (row.responseState !== 'proposals' && row.proposals.length) fail(path, 'unexpected-proposals');
  for (const [index, p] of row.proposals.entries()) {
    const at = `${path}.proposals[${index}]`;
    keys(p, ['proposalId', 'originalIndex', 'original', 'validationAccepted', 'validationErrors', 'heldByProposalIndices'], at);
    if (p.originalIndex !== index || p.proposalId !== proposalKey(reportId, row.rowId, index)) fail(at, 'proposal-identity');
    if (!same(p.original, links[index])) fail(at, 'original-mismatch');
    if (typeof p.validationAccepted !== 'boolean') fail(at, 'validation-flag');
    list(p.validationErrors, L.proposals, `${at}.validationErrors`);
    p.validationErrors.forEach(error => text(error, L.text, `${at}.error`));
    if (p.validationAccepted ? p.validationErrors.length !== 0 : !p.validationErrors.length) fail(at, 'validation-errors');
    if (p.validationAccepted) validateOriginal(p.original, row, `${at}.original`);
    list(p.heldByProposalIndices, L.proposals, `${at}.heldByProposalIndices`);
    unique(p.heldByProposalIndices, at);
  }
  for (const p of row.proposals) {
    if (!same(p.heldByProposalIndices, riskDependencies(row.proposals, p))) fail(path, 'risk-dependency-mismatch');
  }
}
export function holdReasons(proposal) {
  const reasons = [];
  if (!proposal.validationAccepted) reasons.push('validation-rejected');
  if (record(proposal.original) && proposal.original.sourceIssue != null) reasons.push('reported-risk');
  if (proposal.heldByProposalIndices.length) reasons.push('risk-dependency');
  if (proposal.original?.itemAction === 'reuse') reasons.push('item-reuse-not-supported');
  return reasons;
}
