import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
export default defineConfig({root,resolve:{alias:{'@study-accelerator/web-core':root+'packages/web-core/src/index.ts'}},test:{environment:'jsdom',include:['docs/审查/证据/阶段3/frontend-probes.test.ts']}});
