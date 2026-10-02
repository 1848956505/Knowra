import { createServer } from '../../src/server.js';

/** 真实回环 HTTP；宿主自行装配临时库/Mock，关闭时必须先停接入再等 worker。 */
export async function startExtractionHttpServer(app) {
  const server = createServer({ appContext: app, logger: { warn() {}, error() {} } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, server,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

export async function callExtractionHttp(origin, route, body, { header = '1', headers = {}, method } = {}) {
  const response = await fetch(`${origin}/api/ai${route}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Knowra-AI-Job': header }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: await response.json(), cacheControl: response.headers.get('cache-control') };
}
