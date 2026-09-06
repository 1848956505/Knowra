const DEFAULT_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

export async function proxyApiRequest({ request, response, url, apiOrigin, limitBytes = DEFAULT_BODY_LIMIT_BYTES }) {
  const upstreamUrl = new URL(url.pathname + url.search, apiOrigin);
  const requestBody = await readRequestBody(request, limitBytes);
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

function readRequestBody(request, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;
    const fail = (error) => {
      if (finished) return;
      finished = true;
      chunks.length = 0;
      reject(error);
    };
    request.on('data', (chunk) => {
      if (finished) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > limitBytes) {
        fail(Object.assign(new Error('Request body is too large'), {
          statusCode: 413, code: 'PAYLOAD_TOO_LARGE'
        }));
        return;
      }
      chunks.push(buffer);
    });
    request.on('end', () => {
      if (finished) return;
      finished = true;
      resolve(size ? Buffer.concat(chunks, size) : undefined);
      chunks.length = 0;
    });
    request.on('error', fail);
    request.on('aborted', () => fail(new Error('Request body was interrupted')));
  });
}
