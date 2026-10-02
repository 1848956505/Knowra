import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { validateInstance, repositoryRoot } from '../../deploy/isolated-test/config.mjs';
import { startIsolatedInstance } from '../../deploy/isolated-test/runtime.mjs';
import { createSqliteDataStore } from '../../apps/desktop-runtime/src/sqlite-data-store.mjs';
import { createAppContext } from '../../apps/api/src/app.factory.js';
import { createSyncEngine } from '../../apps/desktop-runtime/src/sync-engine.mjs';
const run = promisify(execFile);

test('隔离配置拒绝生产数据库、连接覆盖、端口、目录及符号链接', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-isolation-config-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = { instanceId: 'qa', dataRoot: path.join(root, 'instance'), databaseUrl: 'postgresql://test@127.0.0.1/knowra_acceptance_qa' };
  assert.equal(validateInstance(input).ownerId, 'knowra_acceptance_qa');
  for (const override of [{ databaseUrl: 'postgresql://test@127.0.0.1/knowra_prod' },
    { databaseUrl: input.databaseUrl + '?schema=prod' }, { databaseUrl: input.databaseUrl + '?host=remote' },
    { dataRoot: '/opt/knowra/storage' }, { dataRoot: repositoryRoot }, { dataRoot: path.join(repositoryRoot, 'storage', 'test') },
    { dataRoot: '/' }, { instanceId: '../prod' }, { port: 3000 }]) {
    assert.throws(() => validateInstance({ ...input, ...override }));
  }
  fs.symlinkSync(root, path.join(root, 'linked'));
  assert.throws(() => validateInstance({ ...input, dataRoot: path.join(root, 'linked', 'instance') }));
});

test('真实独立数据库/目录、同步双端、附件及重启隔离；拒绝未登记旧库', {
  skip: !process.env.KNOWRA_SYNC_TEST_DATABASE_URL, timeout: 120000
}, async t => {
  const adminUrl = new URL(process.env.KNOWRA_SYNC_TEST_DATABASE_URL);
  assert.equal(process.env.KNOWRA_SYNC_TEST_ALLOW_WRITES, '1');
  assert(['postgres:', 'postgresql:'].includes(adminUrl.protocol));
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname));
  assert(/^\/knowra_[a-z0-9_]*test[a-z0-9_]*$/.test(adminUrl.pathname));
  assert(!adminUrl.searchParams.has('host'));
  adminUrl.search = '';
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } }, log: [] });
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-isolation-real-')));
  const databases = [], instances = [], devices = [], clients = [];
  t.after(async () => {
    for (const device of devices) { await device.engine.close(); device.store.close(); }
    for (const instance of instances) await instance.close();
    for (const client of clients) await client.$disconnect();
    try { for (const name of databases) await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`); }
    finally { await admin.$disconnect(); fs.rmSync(root, { recursive: true, force: true }); }
  });
  async function prepare(prefix) {
    const instanceId = prefix + randomUUID().replaceAll('-', '').slice(0, 12);
    const name = `knowra_acceptance_${instanceId}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); databases.push(name);
    const url = new URL(adminUrl); url.pathname = '/' + name;
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
      cwd: repositoryRoot, env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 60000
    });
    return { instanceId, dataRoot: path.join(root, instanceId), databaseUrl: url.toString(), port: 0,
      testEphemeralPort: true, publicOrigin: 'https://qa.example.test' };
  }
  const aConfig = await prepare('a'), bConfig = await prepare('b');
  const a = await startIsolatedInstance(aConfig); instances.push(a);
  const b = await startIsolatedInstance(bConfig); instances.push(b);
  const call = async (origin, route, method = 'GET', body, extra = {}) => {
    const response = await fetch(origin + route, { method, headers: { 'Content-Type': 'application/json', ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const page = await fetch(a.origin);
  assert.equal(page.headers.get('X-Knowra-Test-Instance'), aConfig.instanceId);
  assert((await page.text()).includes('测试环境 · 仅合成资料'));
  assert.equal((await call(a.origin, '/api/health')).body.data.testInstance, aConfig.instanceId);
  assert.equal((await call(a.origin, '/api/ai/model-settings', 'POST', { apiKey: 'synthetic-never-save' })).status, 503);
  await run(process.execPath, ['scripts/verify-isolated-instance.mjs', a.origin, aConfig.instanceId], { cwd: repositoryRoot, timeout: 10000 });
  assert.equal((await call(a.origin, '/api/knowledge/spaces/default', 'POST', {}, { Origin: 'https://untrusted.example.test' })).status, 403);
  const space = (await call(a.origin, '/api/knowledge/spaces/default', 'POST', {}, { Origin: aConfig.publicOrigin })).body.data;
  const noteResponse = await call(a.origin, '/api/knowledge/notes', 'POST', { spaceId: space.id, title: '合成隔离样本', rawMarkdown: '独立A正文' });
  assert.equal(noteResponse.status, 201);
  const note = noteResponse.body.data;
  assert.equal((await call(b.origin, `/api/knowledge/notes/${note.id}`)).status, 404);
  const attachment = await call(a.origin, '/api/storage/attachments', 'POST', { noteId: note.id, fileName: '合成.txt', contentBase64: Buffer.from('synthetic').toString('base64') });
  assert.equal(attachment.status, 201);
  assert.equal((await call(b.origin, '/api/storage/attachments')).body.data.length, 0);
  const statusA = (await call(a.origin, '/api/sync/status')).body.data;
  const statusB = (await call(b.origin, '/api/sync/status')).body.data;
  assert.notEqual(statusA.datasetEpoch, statusB.datasetEpoch);
  assert.notEqual(statusA.ownerId, statusB.ownerId);
  for (const id of ['device_a', 'device_b']) {
    const directory = path.join(root, id);
    const store = createSqliteDataStore(path.join(directory, 'local.sqlite'));
    const context = createAppContext({ dataStore: store, ownerId: a.config.ownerId, storageRootDir: directory, uploadsDir: path.join(directory, 'uploads') });
    const engine = createSyncEngine(store, { intervalMs: 3600000, noteService: context.modules.knowledge.noteService });
    const device = { engine, store, knowledge: context.modules.knowledge }; devices.push(device);
    await engine.configure({ serverUrl: a.origin });
    assert.equal(engine.status().error, null);
    assert.equal(device.knowledge.noteService.getNote(note.id).rawMarkdown, '独立A正文');
  }
  devices[0].knowledge.noteService.updateNote(note.id, { rawMarkdown: '合成设备离线后提交' });
  await devices[0].engine.sync(); await devices[1].engine.sync();
  assert.equal(devices[1].knowledge.noteService.getNote(note.id).rawMarkdown, '合成设备离线后提交');
  assert.equal((await call(a.origin, `/api/knowledge/notes/${note.id}`)).body.data.rawMarkdown, '合成设备离线后提交');
  await a.close();
  const restarted = await startIsolatedInstance(aConfig); instances.push(restarted);
  await run(process.execPath, ['scripts/verify-isolated-instance.mjs', restarted.origin, aConfig.instanceId, '--verify-existing'], { cwd: repositoryRoot, timeout: 10000 });
  assert.equal((await call(restarted.origin, `/api/knowledge/notes/${note.id}`)).body.data.rawMarkdown, '合成设备离线后提交');
  assert.equal((await call(restarted.origin, '/api/storage/attachments')).body.data.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(aConfig.dataRoot, 'instance.json'), 'utf8')).instanceId, aConfig.instanceId);
  await assert.rejects(startIsolatedInstance({ ...aConfig, dataRoot: path.join(root, 'wrong_root') }), /数据库绑定其他实例/);
  fs.symlinkSync(bConfig.dataRoot, path.join(aConfig.dataRoot, 'unexpected-link'));
  await assert.rejects(startIsolatedInstance(aConfig), /符号链接/);
  fs.unlinkSync(path.join(aConfig.dataRoot, 'unexpected-link'));
  await b.close();
  const raw = new PrismaClient({ datasources: { db: { url: bConfig.databaseUrl } }, log: [] }); clients.push(raw);
  await raw.$executeRawUnsafe('DROP TABLE knowra_acceptance_instance');
  await raw.user.create({ data: { id: 'synthetic_existing' } });
  fs.rmSync(bConfig.dataRoot, { recursive: true });
  await assert.rejects(startIsolatedInstance(bConfig), /已有数据/);
  assert.equal(await raw.user.count(), 2);
});
