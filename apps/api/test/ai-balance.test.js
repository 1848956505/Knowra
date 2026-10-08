import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBalanceService, inferConsumption, normalizeBalance, parseMicrounits } from '../src/modules/ai/balance-service.js';

const body = (total, extra = {}) => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: total,
  granted_balance: '0.00', topped_up_balance: total, ...extra }] });
const reply = (json, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => json });

function fixture(responses) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-balance-'));
  const calls = [];
  let clock = Date.parse('2026-10-08T00:00:00.000Z');
  const service = createBalanceService({
    filePath: path.join(directory, 'ai-balance.json'),
    credentialReference: async () => ({ credentialRef: 'ref-1' }),
    resolveCredential: async reference => { assert.equal(reference, 'ref-1'); return { apiKey: 'sk-test' }; },
    fetchImpl: async (url, init) => { calls.push({ url, init }); const next = responses.shift(); if (next instanceof Error) throw next; return next; },
    now: () => new Date(clock)
  });
  return { service, calls, directory, file: path.join(directory, 'ai-balance.json'), advance: ms => { clock += ms; },
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

export const aiBalanceTests = [
  { name: '余额金额按十进制文本换算为百万分之一元，格式异常一律拒绝', run() {
    assert.equal(parseMicrounits('110.00'), 110_000_000);
    assert.equal(parseMicrounits('0.000001'), 1);
    assert.equal(parseMicrounits('12'), 12_000_000);
    for (const bad of ['-1', '1e3', '', null, 5, '1.2.3', 'abc']) assert.equal(parseMicrounits(bad), null);
    assert.throws(() => normalizeBalance({ is_available: true, balance_infos: [{ currency: 'EUR', total_balance: '1', granted_balance: '0', topped_up_balance: '1' }] }), { code: 'AI_BALANCE_INVALID' });
    assert.throws(() => normalizeBalance({ balance_infos: [] }), { code: 'AI_BALANCE_INVALID' });
  } },
  { name: '余额推算：下降计为消耗、上升计为充值，币种分开，只有一个快照时不推算', run() {
    const snap = (at, ...rows) => ({ at, isAvailable: true, balances: rows.map(([currency, total]) => ({ currency, totalMicrounits: total, grantedMicrounits: 0, toppedUpMicrounits: total })) });
    const [cny] = inferConsumption([snap('2026-10-01T00:00:00Z', ['CNY', 100_000_000]), snap('2026-10-02T00:00:00Z', ['CNY', 90_000_000]),
      snap('2026-10-03T00:00:00Z', ['CNY', 190_000_000]), snap('2026-10-04T00:00:00Z', ['CNY', 188_500_000])]);
    assert.deepEqual([cny.consumedMicrounits, cny.addedMicrounits, cny.currentMicrounits, cny.snapshots], [11_500_000, 100_000_000, 188_500_000, 4]);
    assert.equal(inferConsumption([snap('2026-10-01T00:00:00Z', ['CNY', 5], ['USD', 7])]).every(row => row.consumedMicrounits === 0), true);
  } },
  { name: '读取余额使用 Bearer 密钥，保存快照（0600）且文件不含密钥；10 分钟内无变化不重复保存', async run() {
    const f = fixture([reply(body('50.00')), reply(body('50.00')), reply(body('49.50'))]);
    try {
      const first = await f.service.refresh();
      assert.equal(f.calls[0].url, 'https://api.deepseek.com/user/balance');
      assert.equal(f.calls[0].init.headers.Authorization, 'Bearer sk-test');
      assert.equal(first.latest.balances[0].totalMicrounits, 50_000_000);
      assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);
      assert.equal(fs.readFileSync(f.file, 'utf8').includes('sk-test'), false);
      f.advance(60_000);
      await f.service.refresh();
      assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).snapshots.length, 1, '无变化的重复读取不新增快照');
      f.advance(3_600_000);
      const third = await f.service.refresh();
      assert.equal(third.inferred[0].consumedMicrounits, 500_000);
      assert.equal((await f.service.view()).inferred[0].snapshots, 2);
      assert.deepEqual(fs.readdirSync(f.directory), ['ai-balance.json']);
    } finally { f.cleanup(); }
  } },
  { name: '密钥被拒、网络失败、响应无效分别报错且不写快照；快照损坏时拒绝并保留原文件', async run() {
    const f = fixture([reply({}, 401), new Error('offline'), reply({ nope: true })]);
    try {
      await assert.rejects(f.service.refresh(), { code: 'AI_BALANCE_REJECTED' });
      await assert.rejects(f.service.refresh(), { code: 'AI_BALANCE_UNAVAILABLE' });
      await assert.rejects(f.service.refresh(), { code: 'AI_BALANCE_INVALID' });
      assert.equal(fs.existsSync(f.file), false);
      assert.deepEqual((await f.service.view()).inferred, []);
      fs.writeFileSync(f.file, '{"snapshots":[{"at":"bad"}]}');
      await assert.rejects(f.service.view(), { code: 'AI_BALANCE_STORAGE_INVALID' });
      assert.equal(fs.readFileSync(f.file, 'utf8'), '{"snapshots":[{"at":"bad"}]}');
    } finally { f.cleanup(); }
  } }
];
