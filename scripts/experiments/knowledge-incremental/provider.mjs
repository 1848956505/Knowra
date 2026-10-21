// 真实调用仅由显式 CLI 启用；本模块导入时不读取环境、不发网络请求。
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MAX_PROVIDER_CALLS = 20;
const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const EXPERIMENT_ID = 'knowledge-incremental-20261019';

export async function reserveProviderCall(budgetDir) {
  await mkdir(budgetDir, { recursive: true });
  const metadata = { experimentId: EXPERIMENT_ID, maxCalls: MAX_PROVIDER_CALLS };
  const manifest = path.join(budgetDir, 'budget.json');
  try { await writeFile(manifest, JSON.stringify(metadata), { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = JSON.parse(await readFile(manifest, 'utf8'));
    if (JSON.stringify(existing) !== JSON.stringify(metadata)) throw Error('budget-mismatch');
  }
  for (let slot = 1; slot <= MAX_PROVIDER_CALLS; slot++) {
    try {
      await writeFile(path.join(budgetDir, `attempt-${String(slot).padStart(2, '0')}.json`),
        JSON.stringify({ experimentId: EXPERIMENT_ID, slot }), { flag: 'wx' });
      return slot;
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw Error('provider-budget-exhausted');
}

export function createProviderInvoker({ apiKey, budgetDir, fetchImpl = fetch }) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || !budgetDir) throw Error('provider-configuration-missing');
  return async ({ systemPrompt, request }) => {
    // 网络失败、超时也消耗预留；没有自动重试，更换输出目录不重置本预算。
    const attempt = await reserveProviderCall(budgetDir);
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', temperature: 0, max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: JSON.stringify(request) }] }),
      signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) throw Error('provider-http-failed');
    const body = await response.json();
    const choice = body?.choices?.[0];
    const rawText = typeof choice?.message?.content === 'string' ? choice.message.content : null;
    const usage = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens']
      .filter(key => Number.isSafeInteger(body?.usage?.[key]) && body.usage[key] >= 0).map(key => [key, body.usage[key]]));
    let parsed = null;
    let status = 'incomplete-response';
    if (choice?.finish_reason === 'stop' && rawText !== null) {
      try { parsed = JSON.parse(rawText); status = 'complete'; } catch { status = 'invalid-json'; }
    }
    return { kind: 'provider-result', attempt, status, rawText, parsed, usage };
  };
}

export async function readBudgetUsage(budgetDir) {
  const names = await readdir(budgetDir);
  return { limit: MAX_PROVIDER_CALLS, reservedCalls: names.filter(name => /^attempt-(0[1-9]|1[0-9]|20)\.json$/.test(name)).length };
}
