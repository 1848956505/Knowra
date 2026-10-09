// 与主 runner 使用同一已注册用例列表；不要只导入测试文件而不调用 run。
import { modelSettingsTests } from './model-settings.test.js';

let failed = 0;
for (const testCase of modelSettingsTests) {
  try {
    await testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
  }
}
console.log(`\n模型设置回归：${modelSettingsTests.length - failed}/${modelSettingsTests.length} 通过。`);
if (failed) process.exitCode = 1;
