import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'../../../../apps/web-v4/e2e',grep:/段落菜单复用/,outputDir:'./e2e-recheck-artifacts',workers:1,retries:0,use:{baseURL:process.env.V4_BASE_URL,trace:'retain-on-failure'},reporter:[['line'],['json',{outputFile:'./e2e-recheck-result.json'}]],projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}]});
