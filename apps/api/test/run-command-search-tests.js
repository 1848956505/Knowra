import { commandSearchHttpTests } from './command-search-http.test.js';
import { commandSearchPostgresTests } from './command-search-postgres.test.js';
import { searchServiceTests } from './search-service.test.js';
import { knowledgeHttpTests } from './knowledge-http.test.js';
import { batch3ConsistencyTests } from './batch3-consistency.test.js';

const tests = [...commandSearchHttpTests, ...commandSearchPostgresTests, ...searchServiceTests, ...knowledgeHttpTests, ...batch3ConsistencyTests];
if (!commandSearchPostgresTests.length) console.log('SKIP 真实 PostgreSQL 命令搜索：未提供获准写入的独立测试数据库，待 CI。');
let failed = 0;
for (const testCase of tests) {
  try { await testCase.run(); console.log(`PASS ${testCase.name}`); }
  catch (error) { failed += 1; console.error(`FAIL ${testCase.name}`); console.error(error); }
}
console.log(`${tests.length - failed}/${tests.length} test(s) passed.`);
if (failed) process.exitCode = 1;
