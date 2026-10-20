function syncTransportError(failure) {
  const causes = [failure];
  const codes = new Set();
  const seen = new Set();
  for (let index = 0; index < causes.length; index++) {
    const current = causes[index];
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (typeof current.code === 'string') codes.add(current.code);
    if (current.cause) causes.push(current.cause);
    if (Array.isArray(current.errors)) causes.push(...current.errors);
  }
  let code = 'SYNC_NETWORK_UNAVAILABLE';
  let message = '无法连接云端，请检查网络、代理或服务地址后重试。';
  if (failure?.name === 'TimeoutError' || codes.has('ETIMEDOUT') || codes.has('UND_ERR_CONNECT_TIMEOUT')) {
    code = 'SYNC_NETWORK_TIMEOUT';
    message = '连接云端超时，请检查网络后重试。';
  } else if (codes.has('ENOTFOUND') || codes.has('EAI_AGAIN')) {
    code = 'SYNC_NETWORK_DNS';
    message = '无法解析云端服务地址，请检查网络、DNS 或服务地址后重试。';
  } else if ([...codes].some(value => value.startsWith('CERT_') || value.startsWith('ERR_TLS_CERT_') || ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(value))) {
    code = 'SYNC_NETWORK_TLS';
    message = '无法验证云端安全证书，请检查系统时间或云端证书。';
  } else if (codes.has('ECONNREFUSED')) {
    code = 'SYNC_CONNECTION_REFUSED';
    message = '云端服务拒绝连接，请检查服务是否可用后重试。';
  } else if (codes.has('ECONNRESET')) {
    code = 'SYNC_CONNECTION_INTERRUPTED';
    message = '云端连接中断，请检查网络后重试。';
  }
  const error = new Error(message);
  error.code = code;
  return error;
}

// 同步 HTTP 边界；连接与凭据仍由 engine 持有，每次请求按当前值读取。
export function createSyncTransport({ fetcher, getServerUrl, getAuthorization }) {
  function transportFailure(failure, upload = false, bootstrap = false) {
    const error = syncTransportError(failure);
    if (upload && error.code === 'SYNC_NETWORK_TIMEOUT') {
      error.code = 'SYNC_UPLOAD_TIMEOUT';
      error.message = '资料上传等待超时；本地修改和原请求已保留，重试会安全核对提交结果。';
    } else if (bootstrap && error.code === 'SYNC_NETWORK_TIMEOUT') {
      error.code = 'SYNC_BOOTSTRAP_TIMEOUT';
      error.message = '初始化云端资料超时，请稍后重试；本地资料已保留。';
    }
    return error;
  }
  async function fetchSync(url, options, upload = false, bootstrap = false) {
    try { return await fetcher(url, options); }
    catch (failure) { throw transportFailure(failure, upload, bootstrap); }
  }
  async function request(route, body, serverUrl = getServerUrl(), method = body === undefined ? 'GET' : 'POST') {
    const authorization = getAuthorization();
    const upload = ['batch', 'blobs', 'push'].includes(route);
    const bootstrap = route === 'bootstrap';
    // 连通性检查仍快速失败；上传及初始化快照包含云端处理和响应下载。
    const options = {
      method, redirect: 'error',
      headers: { ...(authorization ? { Authorization: authorization } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(upload || bootstrap ? 90000 : 15000)
    };
    const response = await fetchSync(`${serverUrl}${route.startsWith('/api/') ? route : `/api/sync/${route}`}`, options, upload, bootstrap);
    const payload = await response.json().catch(failure => {
      if (options.signal.aborted || failure?.name === 'TimeoutError') throw transportFailure(options.signal.reason ?? failure, upload, bootstrap);
      return {};
    });
    // 非对象 JSON 不是响应封装，但仍应保留 HTTP 状态对应的错误分类。
    const data = payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    if (!response.ok) {
      const authRequired = response.status === 401 || response.status === 403;
      const deviceNotEnabled = data.error?.code === 'SYNC_DEVICE_NOT_ENABLED';
      const failure = new Error(deviceNotEnabled ? data.error?.message ?? '此设备尚未获准同步。'
        : authRequired ? '云端登录凭据无效或已失效，请重新输入。'
        : data.error?.message ?? (response.status >= 500 ? `云端服务暂不可用（${response.status}），请稍后重试。` : `云端请求失败（${response.status}）。`));
      failure.code = deviceNotEnabled ? data.error.code : authRequired ? 'AUTH_REQUIRED'
        : data.error?.code ?? (response.status >= 500 ? 'CLOUD_SERVICE_UNAVAILABLE' : 'CLOUD_REQUEST_FAILED');
      failure.status = response.status;
      const retryAfter = response.headers.get('retry-after');
      failure.retryAfterMs = retryAfter ? Math.max(0, /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
      throw failure;
    }
    if (!data.data) { const failure = new Error('云端返回了无法识别的同步响应，请稍后重试。'); failure.code = 'SYNC_INVALID_RESPONSE'; throw failure; }
    return data.data;
  }
  return { request, fetchSync };
}
