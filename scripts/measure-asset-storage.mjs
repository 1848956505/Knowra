import fs from 'node:fs';
import path from 'node:path';
import { measureJsonStorage, measureManagedFiles, measurePostgresStorage, measureSqliteStorage } from './asset-storage-metrics.mjs';

function parseArgs(args) {
  const options = {};
  for (const argument of args) {
    if (argument === '--help') return { help: true };
    const match = /^--(driver|source|storage-root|uploads|temp|exports|backups|output)=(.+)$/.exec(argument);
    if (!match) throw new Error(`未知参数：${argument}`);
    options[match[1]] = match[2];
  }
  options.driver ??= 'local-json';
  if (!['local-json', 'sqlite', 'postgres'].includes(options.driver)) throw new Error('driver 只支持 local-json、sqlite 或 postgres。');
  if (options.driver === 'sqlite' && !options.source) throw new Error('SQLite 统计必须指定 --source。');
  if (options.driver === 'postgres' && !process.env.DATABASE_URL) throw new Error('PostgreSQL 统计必须通过 DATABASE_URL 提供连接。');
  return options;
}

function locations(options) {
  const root = path.resolve(options['storage-root'] ?? (options.driver === 'sqlite' ? path.dirname(options.source) : process.cwd()));
  const server = options.driver !== 'sqlite';
  return {
    root,
    sourcePath: options.source ? path.resolve(options.source) : path.join(root, 'storage', 'data', 'knowledge-base.json'),
    uploadsDir: path.resolve(options.uploads ?? path.join(root, server ? 'storage/uploads' : 'uploads')),
    tempDir: path.resolve(options.temp ?? path.join(root, 'storage', 'temp')),
    exportsDir: path.resolve(options.exports ?? path.join(root, server ? 'storage/exports' : 'exports')),
    backupsDir: path.resolve(options.backups ?? path.join(root, server ? 'storage/backups' : 'backups'))
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('用法：npm run measure:assets -- --driver=local-json|sqlite|postgres [--source=文件] [--storage-root=目录] [--uploads=目录] [--temp=目录] [--exports=目录] [--backups=目录] [--output=报告.json]\nPostgreSQL 使用环境变量 DATABASE_URL；所有模式均只读，不输出正文、标题或对象 ID。\n');
    return;
  }
  const paths = locations(options);
  const files = measureManagedFiles(paths);
  const report = options.driver === 'sqlite'
    ? measureSqliteStorage({ sourcePath: paths.sourcePath, files })
    : options.driver === 'postgres'
      ? await measurePostgresStorage({ databaseUrl: process.env.DATABASE_URL, files })
      : measureJsonStorage({ sourcePath: paths.sourcePath, files });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) fs.writeFileSync(path.resolve(options.output), output, { flag: 'wx', mode: 0o600 });
  process.stdout.write(output);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
