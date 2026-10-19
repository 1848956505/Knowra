import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createReviewEnvelope } from '../experiments/knowledge-incremental/review-envelope.mjs';
import { exportReviewFile, MAX_REVIEW_SOURCE_BYTES } from '../experiments/knowledge-incremental/export-review.mjs';
import { parseReviewEnvelope, createReviewDraft, decideReview } from '../../packages/shared/src/incremental-review.js';
const fixtureUrl = new URL('./fixtures/knowledge-incremental-session-20261019.json', import.meta.url);
const fixtureBytes = await readFile(fixtureUrl);
const fixture = JSON.parse(fixtureBytes);
const hash = value => createHash('sha256').update(value).digest('hex');

test('冻结18份合成模型输出完整转为审阅envelope，原始输入与gold不变', () => {
  const before = JSON.stringify(fixture); const envelope = createReviewEnvelope(fixture, { reportId: 'frozen-synthetic-18' });
  assert.equal(envelope.rows.length, 18); assert.equal(JSON.stringify(fixture), before);
  for (const [index, row] of envelope.rows.entries()) {
    assert.deepEqual(row.providerResult, fixture.rows[index].provider);
    assert.deepEqual(row.note, fixture.rows[index].note);
    assert.deepEqual(row.candidateConcepts, fixture.rows[index].request.candidateConcepts);
    assert.deepEqual(row.candidateItems, fixture.rows[index].request.candidateItems);
    for (const p of row.proposals) assert.deepEqual(p.original, fixture.rows[index].provider.parsed.links[p.originalIndex]);
  }
  const riskRows = envelope.rows.filter(row => row.note.id === 'I09');
  assert.equal(riskRows.length, 2);
  for (const row of riskRows) {
    const p = row.proposals[0];
    assert.throws(() => decideReview(envelope, {}, p.proposalId, { kind: 'existing', conceptId: p.original.conceptId }), /held-proposal/);
    const draft = createReviewDraft(envelope, decideReview(envelope, {}, p.proposalId, { kind: 'defer' }));
    assert.equal(draft.approval, 'not-granted');
    assert.equal(draft.report.rows.find(r => r.rowId === row.rowId).proposals[0].original.sourceIssue, p.original.sourceIssue);
  }
  assert.ok(envelope.rows.filter(row => row.note.id === 'I04').every(row => row.responseState === 'no_proposals'));
});
test('转换器拒绝未知wrapper、错误快照/候选/笔记对应，不删字段凑通过', () => {
  for (const mutate of [f => delete f.rows[0].provider, f => f.rows[0].snapshotHash = 'wrong',
    f => f.rows[0].request.candidateConcepts[0].sense = '被改写', f => f.rows[0].request.note.markdown = '不一致',
    f => f.rows[0].provider.parsed.links[0].sourceIssue = '新增风险没有同步rawText']) {
    const copy = structuredClone(fixture); mutate(copy); const before = JSON.stringify(copy);
    assert.throws(() => createReviewEnvelope(copy, { reportId: 'synthetic' })); assert.equal(JSON.stringify(copy), before);
  }
});
test('独立离线文件转换、输入哈希不变、只建新输出、解析成功、文件大小上限', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'knowra-review-synthetic-'));
  try {
    const input = join(dir, 'input.json'); const output = join(dir, 'review.json'); await writeFile(input, fixtureBytes);
    const before = hash(await readFile(input));
    const result = await exportReviewFile({ input, output, reportId: 'synthetic-private-file' });
    assert.equal(result.rows, 18); assert.equal(hash(await readFile(input)), before);
    const bytes = await readFile(output); assert.equal(result.bytes, bytes.length); assert.equal(parseReviewEnvelope(bytes.toString()).rows.length, 18);
    if (process.platform !== 'win32') assert.equal((await stat(output)).mode & 0o777, 0o600);
    await assert.rejects(() => exportReviewFile({ input, output, reportId: 'synthetic-private-file' }), /EEXIST/);
    assert.deepEqual(await readFile(output), bytes);
    await assert.rejects(() => exportReviewFile({ input, output: input, reportId: 'synthetic' }), /review-file-paths/);
    await writeFile(input, ' '.repeat(MAX_REVIEW_SOURCE_BYTES + 1));
    await assert.rejects(() => exportReviewFile({ input, output: join(dir, 'oversized.json'), reportId: 'synthetic' }), /review-source-size/);
  } finally { await rm(dir, { recursive: true, force: true }); }
  assert.equal(hash(await readFile(fixtureUrl)), hash(fixtureBytes));
});


test('审查门前拒绝过大/重复/断链快照及累计模拟预算', () => {
  const large = structuredClone(fixture); large.rows = large.rows.slice(0, 1);
  for (let index = 0; index < 3000; index++) large.snapshot.concepts.push({ ...large.snapshot.concepts[0], id: `extra-${index}` });
  assert.throws(() => createReviewEnvelope(large, { reportId: 'synthetic' }), /snapshot.concepts: array/);
  const duplicate = structuredClone(fixture); duplicate.snapshot.concepts.push(structuredClone(duplicate.snapshot.concepts[0]));
  assert.throws(() => createReviewEnvelope(duplicate, { reportId: 'synthetic' }), /duplicate/);
  const costly = structuredClone(fixture); costly.rows = Array.from({ length: 100 }, () => structuredClone(costly.rows[0]));
  costly.snapshot.items = Array.from({ length: 200 }, (_, i) => ({ ...structuredClone(costly.snapshot.items[0]), id: `item-${i}` }));
  assert.throws(() => createReviewEnvelope(costly, { reportId: 'synthetic' }), /simulation-work-limit/);
});


test('进入旧gate前限制累计最长公共子串工作量，不实际执行昂贵预览', () => {
  const source = structuredClone(fixture); source.rows = source.rows.slice(0, 1);
  source.snapshot.items = Array.from({ length: 35 }, (_, i) => ({ ...structuredClone(source.snapshot.items[0]), id: `item-${i}`, statement: '字'.repeat(8192) }));
  source.rows[0].provider.parsed.links = Array.from({ length: 20 }, (_, i) => ({
    conceptAction: 'create', conceptId: null, newConcept: { name: `合成概念${i}`, sense: '境'.repeat(240) },
    possibleDuplicateOf: null, itemAction: 'new', existingItemId: null,
    item: { title: '合成', kind: 'fact', statement: '句'.repeat(1200), quote: '合成引用' }, sourceIssue: null
  }));
  assert.throws(() => createReviewEnvelope(source, { reportId: 'synthetic' }), /review-similarity-work-limit/);
});
