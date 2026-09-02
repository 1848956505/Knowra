export async function proxyApiRequest({ request, response, url, apiOrigin }) {
  const upstreamUrl = new URL(url.pathname + url.search, apiOrigin);
  const requestBody = await readRequestBody(request);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: buildProxyHeaders(request.headers),
    body: shouldSendBody(request.method) ? requestBody : undefined
  });
  const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
  const headers = Object.fromEntries(upstreamResponse.headers.entries());
  response.writeHead(upstreamResponse.status, headers);
  response.end(responseBody);
}

function shouldSendBody(method) {
  return !['GET', 'HEAD'].includes(String(method || 'GET').toUpperCase());
}

function buildProxyHeaders(headers) {
  return Object.fromEntries(Object.entries(headers || {}).filter(([key, value]) => (
    Boolean(value) && !['host', 'connection', 'content-length'].includes(key.toLowerCase())
  )));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    request.on('error', reject);
  });
}
