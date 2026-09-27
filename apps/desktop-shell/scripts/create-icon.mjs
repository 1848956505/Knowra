import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const directory = fileURLToPath(new URL('../assets/', import.meta.url));
const sourceIcon = path.join(directory, 'Knowra-source.png');
fs.mkdirSync(directory, { recursive: true });
const iconset = path.join(directory, 'Knowra.iconset');
fs.rmSync(iconset, { recursive: true, force: true });
fs.mkdirSync(iconset, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  const imageUrl = `data:image/png;base64,${fs.readFileSync(sourceIcon).toString('base64')}`;
  await page.setContent(`<style>html,body{margin:0;background:transparent;width:1024px;height:1024px;overflow:hidden}.icon{position:absolute;inset:48px;border-radius:205px;overflow:hidden;background:linear-gradient(145deg,#F1F7FF,#D4E6FF)}img{position:absolute;left:-48px;top:-48px;width:1024px;height:1024px;transform:translate(13px,-17px)}</style><div class="icon"><img src="${imageUrl}" alt=""></div>`);
  await page.locator('img').evaluate((image) => image.decode());
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
