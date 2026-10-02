import fs from 'node:fs';
export function readTestDatabaseUrl(env = process.env) {
  if (env.KNOWRA_TEST_DATABASE_URL) return env.KNOWRA_TEST_DATABASE_URL;
  const file = env.KNOWRA_TEST_DATABASE_PASSWORD_FILE;
  if (!file || fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw new Error('需要已授权配置的只读测试密码文件。');
  const password = fs.readFileSync(file, 'utf8').trim();
  if (!password || /[\r\n]/.test(password)) throw new Error('无效测试数据库密码文件。');
  const name = `knowra_acceptance_${env.KNOWRA_TEST_INSTANCE}`;
  const url = new URL(`postgresql://postgres:5432/${name}`);
  url.username = name; url.password = password; url.searchParams.set('connection_limit', '4');
  return url.toString();
}
