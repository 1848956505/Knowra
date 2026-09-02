import http from 'node:http';
import { proxyApiRequest } from './api-proxy.mjs';
import { serveV4Asset } from './static-assets.mjs';

export function createV4WebServer({ distRoot, getApiOrigin }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        await proxyApiRequest({ request, response, url, apiOrigin: getApiOrigin() });
        return;
      }
      if (['GET', 'HEAD'].includes(request.method) && serveV4Asset({ request, response, pathname: url.pathname, distRoot })) {
        return;
      }
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('Not Found');
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(error instanceof Error ? error.message : 'Internal Server Error');
    }
  });
}

export async function listenOnAvailablePort(server, startPort, maxAttempts = 20) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => { server.off('error', onError); reject(error); };
        server.once('error', onError);
        server.listen(port, '127.0.0.1', () => { server.off('error', onError); resolve(); });
      });
      return port;
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error(`Unable to find an available port starting from ${startPort}`);
}
