import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const index = await readFile(resolve(dist, 'index.html'), 'utf8');
const scriptPath = index.match(/src="([^\"]+\.js)"/)?.[1];
const stylePath = index.match(/href="([^\"]+\.css)"/)?.[1];

if (!scriptPath || !stylePath) {
  throw new Error('Unable to locate built JavaScript or CSS assets.');
}

const [script, style] = await Promise.all([
  readFile(resolve(dist, scriptPath.replace(/^\//, '')), 'utf8'),
  readFile(resolve(dist, stylePath.replace(/^\//, '')), 'utf8'),
]);

const standalone = index
  .replace(/\s*<script[^>]+src="[^\"]+\.js"[^>]*><\/script>/, '')
  .replace(/\s*<link[^>]+href="[^\"]+\.css"[^>]*>/, '')
  .replace('</head>', `\n    <style>${style}</style>\n  </head>`)
  .replace('</body>', `\n    <script type="module">${script}</script>\n  </body>`);

const output = resolve(root, 'Knowra整合UI原型.html');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, standalone);
console.log(output);

