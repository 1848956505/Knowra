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
