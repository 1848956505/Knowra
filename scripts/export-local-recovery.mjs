import path from 'node:path';
import { parseArgs } from 'node:util';
import { exportLocalRecovery } from '../apps/desktop-runtime/src/recovery-export.mjs';

const { values } = parseArgs({ options: { 'data-dir': { type: 'string' }, 'output-dir': { type: 'string' } } });
if (!values['data-dir'] || !values['output-dir']) throw new Error('用法：node scripts/export-local-recovery.mjs --data-dir 本地资料目录 --output-dir 新导出目录；先关闭本地运行服务。');
console.log(JSON.stringify(await exportLocalRecovery(path.resolve(values['data-dir']), path.resolve(values['output-dir'])), null, 2));
