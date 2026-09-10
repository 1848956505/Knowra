import path from 'node:path';
import { parseArgs } from 'node:util';
import { exportJsonBaseline } from './snapshot-migration.mjs';

const { values } = parseArgs({ options: {
  source: { type: 'string' }, 'storage-root': { type: 'string' }, output: { type: 'string' }
} });
if (!values.source || !values['storage-root'] || !values.output) {
  throw new Error('请指定 --source、--storage-root 和 --output；输出必须是新文件。');
}
console.log(JSON.stringify(exportJsonBaseline({ sourcePath: path.resolve(values.source), storageRootDir: path.resolve(values['storage-root']), outputPath: path.resolve(values.output) }), null, 2));
