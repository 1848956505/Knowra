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

// Base64-encode the script to avoid any HTML parsing issues with patterns
// like </body>, </script>, <!-- appearing inside JS string literals.
// atob() returns a binary string; we use TextDecoder to properly decode
// the UTF-8 bytes back into a valid JavaScript string.
const scriptB64 = Buffer.from(script, 'utf8').toString('base64');

const safeStyle = style.replace(/<\/style>/gi, '<\\/style>');

const standalone = index
  .replace(/\s*<script[^>]+src="[^\"]+\.js"[^>]*><\/script>/, '')
  .replace(/\s*<link[^>]+href="[^\"]+\.css"[^>]*>/, '')
  .replace('</head>', `\n    <style>${safeStyle}</style>\n  </head>`)
  .replace(
    '</body>',
    `\n    <script>\n(function(){var d=document.createElement("script");d.type="module";var b=Uint8Array.from(atob("${scriptB64}"),function(c){return c.charCodeAt(0)});d.textContent=new TextDecoder().decode(b);document.head.appendChild(d);})();\n</script>\n  </body>`
  );

const output = resolve(root, 'Knowra整合UI.html');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, standalone);
console.log(output);
