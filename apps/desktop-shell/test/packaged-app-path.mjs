import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const built = fileURLToPath(new URL('../../../dist/mac/知境·Knowra-darwin-arm64/知境·Knowra.app/Contents/MacOS/Knowra', import.meta.url));
const installed = '/Applications/知境·Knowra.app/Contents/MacOS/Knowra';

export const executablePath = fs.existsSync(built) ? built : installed;
