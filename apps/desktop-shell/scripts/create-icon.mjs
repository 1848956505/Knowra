import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const directory = fileURLToPath(new URL('../assets/', import.meta.url));
fs.mkdirSync(directory, { recursive: true });
const iconset = path.join(directory, 'Knowra.iconset');
fs.mkdirSync(iconset, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="64" y="64" width="896" height="896" rx="196" fill="#f8f7f3"/><rect x="346" y="346" width="474" height="474" fill="#2563eb"/><rect x="206" y="206" width="474" height="474" fill="#ffffff" stroke="#1a1a1a" stroke-width="34"/><text x="443" y="464" dominant-baseline="central" text-anchor="middle" font-family="PingFang SC, sans-serif" font-weight="900" font-size="292" fill="#1a1a1a">知</text></svg>`);
  await page.screenshot({ path: path.join(directory, 'Knowra.png'), omitBackground: true });
} finally { await browser.close(); }
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    const filename = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`;
    execFileSync('sips', ['-z', String(size * scale), String(size * scale), path.join(directory, 'Knowra.png'), '--out', path.join(iconset, filename)], { stdio: 'ignore' });
  }
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(directory, 'Knowra.icns')]);
fs.rmSync(iconset, { recursive: true });
