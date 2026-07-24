import fs from 'node:fs';
import path from 'node:path';

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8']
]);

export function canServeStaticPath(pathname) {
  return (
    pathname === '/src/client.js'
    || pathname === '/src/styles.css'
    || pathname.startsWith('/src/services/')
    || pathname.startsWith('/src/controllers/')
    || pathname.startsWith('/src/app/')
    || pathname.startsWith('/src/server/')
    || pathname.startsWith('/lib/')
    || pathname.startsWith('/styles/')
  );
}

export function serveStaticAsset({ pathname, rootDir, response }) {
  const relativePath = pathname.replace(/^\//, '');
  const filePath = path.join(rootDir, relativePath);

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end('Forbidden');
    return true;
  }

  if (!fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not Found');
    return true;
  }

  const content = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    'Content-Type': mimeTypes.get(ext) || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(content);
  return true;
}
