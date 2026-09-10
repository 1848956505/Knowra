import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const staging = path.join(repo, 'dist/mac-staging');
const output = path.join(repo, 'dist/mac');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
for (const name of ['main.cjs', 'preload.cjs']) fs.copyFileSync(path.join(repo, 'apps/desktop-shell/src', name), path.join(staging, name));
await build({ entryPoints: [path.join(repo, 'apps/desktop-shell/src/runtime-entry.mjs')], outfile: path.join(staging, 'runtime.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24', external: ['@prisma/client'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } });
fs.cpSync(path.join(repo, 'apps/web-v4/dist'), path.join(staging, 'web'), { recursive: true });
const version = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'))).version;
fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify({ name: 'knowra-desktop', productName: '知境·Knowra', version, main: 'main.cjs', description: '知境·Knowra 个人离线知识工作台', author: 'Knowra', private: true }));
const apps = await packager({ electronZipDir: process.env.KNOWRA_ELECTRON_ZIP_DIR, dir: staging, out: output, name: '知境·Knowra', icon: path.join(repo, 'apps/desktop-shell/assets/Knowra.icns'), executableName: 'Knowra', appBundleId: 'com.knowra.personal', appVersion: version, buildVersion: `${version}.1`, platform: 'darwin', arch: 'arm64', electronVersion: JSON.parse(fs.readFileSync(path.join(repo, 'node_modules/electron/package.json'))).version, overwrite: true, asar: false, prune: false, darwinDarkModeSupport: true, extendInfo: { NSHumanReadableCopyright: 'Knowra 个人使用版' } });
for (const directory of apps) {
  const application = path.join(directory, '知境·Knowra.app');
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', application], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', application], { stdio: 'inherit' });
  const archive = path.join(output, '知境·Knowra-Mac-arm64.zip');
  fs.rmSync(archive, { force: true });
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', application, archive]);
  console.log(`应用已生成：${application}\n压缩包：${archive}`);
}
