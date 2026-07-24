import { readFile } from 'node:fs/promises';
const dist = './dist';
const index = await readFile(`${dist}/index.html`, 'utf8');
const scriptPath = index.match(/src="([^\"]+\.js)"/)?.[1];
const script = await readFile(`${dist}/${scriptPath.replace(/^\//, '')}`, 'utf8');

const step1 = index
  .replace(/\s*<script[^>]+src="[^\"]+\.js"[^>]*><\/script>/, '')
  .replace(/\s*<link[^>]+href="[^\"]+\.css"[^>]*>/, '')
  .replace('</head>', '\n    <style>REPLACE</style>\n  </head>');

const afterInject = step1.replace('</body>', `\n    <script type="module">${script}</script>\n  </body>`);

console.log('=== Final HTML at offset 4734 ===');
const buf = Buffer.from(afterInject, 'utf8');
const slice = buf.slice(4720, 4760);
console.log('  hex:', slice.toString('hex').match(/.{1,2}/g)?.join(' '));
console.log('  text:', JSON.stringify(slice.toString('utf8')));
