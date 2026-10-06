#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { runStdioAdapter } from './stdio-server.mjs';

// 唯一参数是配对文件路径：令牌不出现在命令行、环境变量或客户端配置里。stderr 只写不含令牌与正文的简短提示。
const { values } = parseArgs({ options: { 'pairing-file': { type: 'string' } }, strict: true });
if (!values['pairing-file']) {
  process.stderr.write('用法：adapter.mjs --pairing-file <配对文件路径>（在知境设置里创建配对后获得）\n');
  process.exit(2);
}
await runStdioAdapter({ pairingFile: path.resolve(values['pairing-file']) });
