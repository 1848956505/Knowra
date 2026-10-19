import { REVIEW_LIMITS as L, keys, text, id, list, choice, unique, fail, boundedJson, parseJson, clone, record, same } from './validation.js';
import { validateCandidates, validateProposals } from './proposals.js';
export const REVIEW_KIND = 'knowra.incremental-review';
export const DRAFT_KIND = 'knowra.incremental-review-draft';
export const REVIEW_VERSION = 1;
function validateResponse(row, path) {
  const provider = row.providerResult;
  if (!record(provider) || provider.kind !== 'provider-result') fail(path, 'provider-wrapper');
  choice(provider.status, ['complete', 'invalid-json', 'incomplete-response', 'invocation-failed'], `${path}.provider.status`);
  if (provider.status !== 'complete') {
    if (provider.parsed != null) fail(path, 'noncomplete-parsed');
    if (provider.status === 'invocation-failed' && provider.rawText != null) fail(path, 'failed-with-response');
    if (provider.status === 'incomplete-response' && provider.rawText != null && typeof provider.rawText !== 'string') fail(path, 'incomplete-raw');
    if (provider.status === 'invalid-json') {
      if (typeof provider.rawText !== 'string') fail(path, 'invalid-json-raw');
      let parseable = false; try { JSON.parse(provider.rawText); parseable = true; } catch { /* 预期解析失败。 */ }
      if (parseable) fail(path, 'invalid-json-parseable');
    }
    const expected = ['invalid-json', 'incomplete-response'].includes(provider.status) ? 'invalid_response' : 'provider_failure';
    if (row.responseState !== expected || row.explanation !== null) fail(path, 'response-state');
    return;
  }
  const response = provider.parsed;
  if (typeof provider.rawText !== 'string') fail(path, 'raw-response-required');
  let raw; try { raw = JSON.parse(provider.rawText); } catch { fail(path, 'raw-response-json'); }
  if (!same(raw, response)) fail(path, 'raw-response-mismatch');
  const outerValid = record(response) && Object.keys(response).sort().join(',') === 'links,remarks,requestId'
    && response.requestId === row.requestId && Array.isArray(response.links) && response.links.length <= L.linksPerRow;
  const expected = !outerValid ? 'invalid_response' : response.links.length ? 'proposals' : 'no_proposals';
  if (row.responseState !== expected) fail(path, 'response-state');
  if (expected === 'invalid_response') { if (row.explanation !== null) fail(path, 'explanation'); return; }
  keys(response, ['requestId', 'links', 'remarks'], `${path}.response`);
  if (response.requestId !== row.requestId) fail(path, 'request-mismatch');
  text(response.remarks, L.text, `${path}.response.remarks`, true);
  if (row.responseState === 'no_proposals') {
    if (!Array.isArray(response.links) || response.links.length !== 0) fail(path, 'empty-response');
    keys(row.explanation, ['kind', 'text', 'nativeAbstain', 'nextAction'], `${path}.explanation`);
    if (!same(row.explanation, { kind: 'model-explanation-unverified', text: response.remarks, nativeAbstain: false, nextAction: 'inspect-or-clarify' })) fail(path, 'explanation');
  } else if (row.explanation !== null) fail(path, 'explanation');
}
/** 结构验证不验证文件真实性、模型语义或事实；返回独立副本，调用者不得以此作为提交许可。 */
export function validateReviewEnvelope(value) {
  boundedJson(value);
  keys(value, ['kind', 'version', 'reportId', 'snapshotRef', 'approval', 'semanticSafety', 'rows'], '$');
  if (value.kind !== REVIEW_KIND || value.version !== REVIEW_VERSION) fail('$', 'version');
  if (value.approval !== 'not-granted' || value.semanticSafety !== 'not-verified') fail('$', 'authority');
  id(value.reportId, '$.reportId');
  if (typeof value.snapshotRef !== 'string' || !/^[a-f0-9]{64}$/.test(value.snapshotRef)) fail('$.snapshotRef', 'hash-reference');
  list(value.rows, L.rows, '$.rows'); unique(value.rows.map(row => row?.rowId), '$.rows');
  let count = 0;
  for (const [index, row] of value.rows.entries()) {
    const path = `$.rows[${index}]`;
    keys(row, ['rowId', 'requestId', 'arm', 'note', 'candidateConcepts', 'candidateItems', 'providerResult', 'responseState', 'explanation', 'proposals'], path);
    id(row.rowId, `${path}.rowId`); id(row.requestId, `${path}.requestId`);
    choice(row.arm, ['retrieval', 'oracle'], `${path}.arm`);
    keys(row.note, Object.hasOwn(row.note ?? {}, 'candidates') ? ['id', 'markdown', 'candidates'] : ['id', 'markdown'], `${path}.note`);
    id(row.note.id, `${path}.note.id`); text(row.note.markdown, L.note, `${path}.note.markdown`);
    if (row.requestId !== `concept-link-r2-${row.note.id}` || row.rowId !== `${row.arm}:${row.note.id}`) fail(path, 'row-identity');
    validateCandidates(row, path);
    if (row.note.candidates !== undefined) {
      list(row.note.candidates, L.concepts, `${path}.note.candidates`); unique(row.note.candidates, path);
      if (!same(row.note.candidates, row.candidateConcepts.map(c => c.id))) fail(path, 'note-candidates');
    }
    choice(row.responseState, ['proposals', 'no_proposals', 'invalid_response', 'provider_failure'], `${path}.responseState`);
    validateResponse(row, path); validateProposals(row, path, value.reportId);
    count += row.proposals.length;
  }
  if (count > L.proposals) fail('$.rows', 'total-proposals');
  return clone(value);
}
export const parseReviewEnvelope = input => validateReviewEnvelope(parseJson(input));
