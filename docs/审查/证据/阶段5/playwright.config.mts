import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'../../../../apps/web-v4/e2e',outputDir:'./e2e-artifacts',workers:2,retries:0,use:{baseURL:process.env.V4_BASE_URL,trace:'retain-on-failure'},reporter:[['line'],['json',{outputFile:'./e2e-result.json'}]],projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}]});
