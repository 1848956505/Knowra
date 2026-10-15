import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildUserPayload, checkResult, headingsOf, summarize, titleFlags } from '../experiments/knowledge-extraction-ab/lib.mjs';
import { buildPromptV2 } from '../experiments/knowledge-extraction-ab/prompt-v2.mjs';
import { main, resolveApiKey } from '../experiments/knowledge-extraction-ab/run.mjs';

const markdown = '## 2.3 线性代数\n\n矩阵和向量如何相乘？矩阵乘向量的结果是一个向量。';
const sources = [{ sourceId: 's1', markdown }];
const quote = '矩阵乘向量的结果是一个向量。';
const start = markdown.indexOf(quote);

test('标题标记能识别问题句、空泛后缀、照抄小标题和复用', () => {
  assert.deepEqual(titleFlags('矩阵和向量如何相乘？'), ['问题句']);
  assert.deepEqual(titleFlags('什么是链式法则'), ['问题句']);
  assert.deepEqual(titleFlags('深度学习的概念'), ['空泛后缀']);
  assert.deepEqual(titleFlags('线性代数', { headings: headingsOf(markdown) }), ['照抄小标题']);
  assert.deepEqual(titleFlags('矩阵-向量乘法', { existingTitles: ['矩阵-向量乘法'] }), ['复用已有']);
  assert.deepEqual(titleFlags('矩阵 向量乘法', { existingTitles: ['矩阵-向量乘法'] }), ['近似已有但未逐字复用']);
  assert.deepEqual(titleFlags('矩阵乘法不满足交换律'), []);
});

test('结果校验沿用线上引文规则：偏移不对的候选会被标出', () => {
  const content = JSON.stringify({ contractVersion: 1, requestId: 'r', candidates: [
    { title: '矩阵-向量乘法', canonicalStatement: '矩阵乘向量得到向量。', knowledgeType: 'fact',
      citations: [{ sourceId: 's1', start, end: start + quote.length, quote }] },
    { title: '错位引文', canonicalStatement: 'x', knowledgeType: 'fact',
      citations: [{ sourceId: 's1', start: 0, end: quote.length, quote }] }
  ] });
  const check = checkResult({ content, requestId: 'r', sources });
  assert.equal(check.ok, false);
  assert.equal(check.candidates[0].citationsExact, true);
  assert.equal(check.candidates[1].citationsExact, false);
  assert.equal(check.candidates[1].quoteFoundInSource, true);
  assert.equal(checkResult({ content: '不是 JSON', requestId: 'r', sources }).batchError, 'JSON 解析失败');
});

test('只有 v2 请求携带已有知识点标题，v1 外发结构与线上一致', () => {
  assert.deepEqual(Object.keys(buildUserPayload({ variant: 'v1', requestId: 'r', sources, existingTitles: ['x'] })).sort(),
    ['contractVersion', 'requestId', 'sources']);
  assert.deepEqual(buildUserPayload({ variant: 'v2', requestId: 'r', sources, existingTitles: ['x'] }).existingKnowledgeTitles, ['x']);
  assert.match(buildPromptV2({ type: 'object' }), /不能是问题句/);
});

test('API key 只从环境变量解析，多个候选变量时要求显式指定', () => {
  assert.deepEqual(resolveApiKey({ DEEPSEEK_API_KEY: 'k' }), { name: 'DEEPSEEK_API_KEY', value: 'k' });
  assert.throws(() => resolveApiKey({ DEEPSEEK_API_KEY: 'a', MY_DEEPSEEK_TOKEN: 'b' }), /--key-env/);
  assert.equal(resolveApiKey({ OTHER: 'x' }).value, undefined);
});

test('端到端：v2 逐篇累积已有标题，报告与汇总生成且不泄露 key', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'knowledge-ab-'));
  const notesDir = path.join(dir, 'notes');
  await import('node:fs/promises').then(fs => fs.mkdir(notesDir));
  await writeFile(path.join(notesDir, '1.md'), markdown);
  await writeFile(path.join(notesDir, '2.md'), markdown);
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const user = JSON.parse(body.messages[1].content);
    calls.push(user);
    const title = user.existingKnowledgeTitles === undefined ? '矩阵和向量如何相乘？' : '矩阵-向量乘法';
    const s = user.sources[0];
    const content = JSON.stringify({ contractVersion: 1, requestId: user.requestId, candidates: [
      { title, canonicalStatement: '矩阵乘向量得到向量。', knowledgeType: 'fact',
        citations: [{ sourceId: s.sourceId, start, end: start + quote.length, quote }] }] });
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  };
  const out = path.join(dir, 'out');
  const { summaries } = await main(['--notes', notesDir, '--out', out], {
    env: { DEEPSEEK_API_KEY: 'secret-key-value' }, fetchImpl, log: () => {},
    loadV1: async () => ({ v1Prompt: 'v1 prompt', schema: { type: 'object' } })
  });
  assert.equal(summaries.v1.questionTitles, 2);
  assert.equal(summaries.v1.crossNoteDuplicates, 1);
  assert.equal(summaries.v2.questionTitles, 0);
  assert.equal(summaries.v2.reusedExisting, 1);
  assert.deepEqual(calls[3].existingKnowledgeTitles, ['矩阵-向量乘法']);
  const report = await readFile(path.join(out, 'report.md'), 'utf8');
  assert.match(report, /问题句标题/);
  assert.equal(report.includes('secret-key-value'), false);
  assert.equal((await readFile(path.join(out, 'raw.json'), 'utf8')).includes('secret-key-value'), false);
});

test('单个长笔记按“章.节”切分，同一节的小节留在一篇里', async () => {
  const { splitBySection } = await import('../experiments/knowledge-extraction-ab/lib.mjs');
  const parts = splitBySection('前言\n# 1.0 引言\nA\n# 1.1 日常\nB\n## 2.1 数据\nC\n### 2.1.2 运算\nD\n### 2.3.2 向量\nE', 'n');
  assert.deepEqual(parts.map(part => part.name), ['n-01-0.md', 'n-02-1.0.md', 'n-03-1.1.md', 'n-04-2.1.md', 'n-05-2.3.md']);
  assert.match(parts[3].markdown, /2\.1\.2 运算\nD/);
});
