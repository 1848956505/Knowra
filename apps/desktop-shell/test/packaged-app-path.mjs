import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const built = fileURLToPath(new URL('../../../dist/mac/知境·Knowra-darwin-arm64/知境·Knowra.app/Contents/MacOS/Knowra', import.meta.url));
export const executablePath = process.env.KNOWRA_DESKTOP_TEST_APP
  ? path.join(path.resolve(process.env.KNOWRA_DESKTOP_TEST_APP), 'Contents/MacOS/Knowra') : built;
if (!fs.existsSync(executablePath)) throw new Error('缺少隔离验收 APP；请先仅构建 desktop-shell，或通过 KNOWRA_DESKTOP_TEST_APP 指定测试副本。');
