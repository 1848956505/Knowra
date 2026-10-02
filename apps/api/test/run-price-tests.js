import { reviewedPriceProfileTests } from './reviewed-price-profile.test.js';

let failed = 0;
for (const testCase of reviewedPriceProfileTests) {
  try {
    await testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
  }
}
console.log(`\n核价回归：${reviewedPriceProfileTests.length - failed}/${reviewedPriceProfileTests.length} 通过。`);
if (failed) process.exitCode = 1;
