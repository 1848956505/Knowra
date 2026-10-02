import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);

export function validateInstance({ instanceId, dataRoot, databaseUrl, port = 43100 }) {
  if (!/^[a-z][a-z0-9_]{1,24}$/.test(instanceId ?? '')) throw new Error('测试实例ID须为2–25位小写字母、数字或下划线。');
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || [3000, 3001, 5432].includes(port)) throw new Error('测试端口必须独立，不能使用生产或数据库端口。');
  if (!path.isAbsolute(dataRoot ?? '')) throw new Error('测试数据根必须是绝对路径。');
  const root = path.resolve(dataRoot);
  let existing = root;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  if (fs.realpathSync(existing) !== existing) throw new Error('测试数据根及父目录不能经过符号链接。');
  if (root === path.parse(root).root || root === existing && !fs.statSync(root).isDirectory()
      || inside(root, repositoryRoot) || inside(root, '/opt/knowra') || inside(root, '/opt/knowra-backups')) throw new Error('测试数据根不能使用源码或生产资料目录。');
  let url;
  try { url = new URL(databaseUrl); } catch { throw new Error('需要独立测试数据库连接，不能打印或默认复用生产连接。'); }
  const name = `knowra_acceptance_${instanceId}`;
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]', 'postgres'].includes(url.hostname)
      || decodeURIComponent(url.pathname) !== `/${name}`
      || [...url.searchParams.keys()].some(key => !['connection_limit', 'pool_timeout'].includes(key))) throw new Error('数据库须为私有PostgreSQL及该实例的专用库，禁止schema/host等连接覆盖。');
  return { instanceId, dataRoot: root, databaseName: name, ownerId: name, port,
    databaseIdentity: `${url.hostname}:${url.port || '5432'}/${name}` };
}

/** 未登记的非空目录/数据库拒绝接管；持久标识绑定同一实例。 */
export async function claimInstance(client, config) {
  const markerFile = path.join(config.dataRoot, 'instance.json');
  const identity = { version: 1, instanceId: config.instanceId, ownerId: config.ownerId,
    databaseIdentity: config.databaseIdentity, storageRoot: config.dataRoot };
  let previous;
  if (fs.existsSync(markerFile)) {
    if (fs.lstatSync(markerFile).isSymbolicLink()) throw new Error('测试实例标识不能是符号链接。');
    previous = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  }
  else if (fs.existsSync(config.dataRoot) && fs.readdirSync(config.dataRoot).length) throw new Error('非空目录没有测试实例标识，拒绝接管。');
  const matches = value => value && Object.keys(value).length === Object.keys(identity).length
    && Object.entries(identity).every(([key, item]) => value[key] === item);
  if (previous && !matches(previous)) throw new Error('数据目录绑定其他测试实例，拒绝启动。');
  if (previous) {
    const walk = directory => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('测试数据目录内不能含符号链接。');
      if (entry.isDirectory()) walk(path.join(directory, entry.name));
    } };
    walk(config.dataRoot);
  }
  await client.$transaction(async db => {
    await db.$queryRawUnsafe('SELECT pg_advisory_xact_lock(1266775634, 77)::text');
    const [found] = await db.$queryRawUnsafe("SELECT to_regclass('public.knowra_acceptance_instance')::text AS name");
    if (found.name) {
      const rows = await db.$queryRawUnsafe('SELECT identity FROM knowra_acceptance_instance');
      if (rows.length !== 1 || !matches(rows[0].identity)) throw new Error('数据库绑定其他实例，拒绝启动。');
      if (!previous) throw new Error('已有数据库缺对应目录标识，拒绝自动重新绑定。');
    } else {
      if (previous) throw new Error('已有目录缺对应数据库标识，拒绝自动重新绑定。');
      const tables = await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'");
      if (!tables.some(row => row.tablename === 'Note')) throw new Error('独立数据库尚未应用Knowra迁移。');
      for (const { tablename } of tables) {
        const name = tablename.replaceAll('"', '""');
        const [row] = await db.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM "${name}" LIMIT 1) AS populated`);
        if (row.populated) throw new Error('未登记的数据库已有数据，拒绝接管。');
      }
      await db.$executeRawUnsafe('CREATE TABLE knowra_acceptance_instance (id INTEGER PRIMARY KEY CHECK(id = 1), identity JSONB NOT NULL)');
      await db.$executeRawUnsafe('INSERT INTO knowra_acceptance_instance VALUES (1, $1::jsonb)', JSON.stringify(identity));
      fs.mkdirSync(config.dataRoot, { recursive: true, mode: 0o700 });
      fs.writeFileSync(markerFile, JSON.stringify(identity), { flag: 'wx', mode: 0o600 });
    }
  });
  return identity;
}
