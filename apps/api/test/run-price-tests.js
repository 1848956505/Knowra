import { reviewedPriceProfileTests } from './reviewed-price-profile.test.js';
import { aiAssistantHttpTests } from './ai-assistant-http.test.js';

const readinessCase = aiAssistantHttpTests.find(testCase => testCase.name ===
  '核价模型、过期价格与预算故障均阻止真实生成并返回具体能力状态');
if (!readinessCase) throw new Error('已注册的核价 HTTP 回归不存在');
const tests = [...reviewedPriceProfileTests, readinessCase];

let failed = 0;
for (const testCase of tests) {
  try {
    await testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
  }
}
console.log(`\n核价回归：${tests.length - failed}/${tests.length} 通过。`);
if (failed) process.exitCode = 1;
