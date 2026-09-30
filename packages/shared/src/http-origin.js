const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const isWriteMethod = method => WRITE_METHODS.has(method);

/** 来源检查不是身份认证。无 Origin 的原生客户端保持兼容，显式跨站写入要求具体白名单。 */
export function writeOriginDecision(request, { allowedOrigins = [], trustProxy = false } = {}) {
  const origin = request.headers.origin;
  const crossSite = request.headers['sec-fetch-site'] === 'cross-site';
  if (origin === undefined) return { allowed: !crossSite, sameOrigin: false };
  if (typeof origin !== 'string') return { allowed: false, sameOrigin: false };
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return { allowed: false, sameOrigin: false };
    // '*' 只用于读取 CORS，不等于可信写入来源。
    if (allowedOrigins.includes(origin)) return { allowed: true, sameOrigin: false };
    const host = request.headers.host;
    if (typeof host !== 'string' || /[\s,\/@\\?#]/.test(host)) return { allowed: false, sameOrigin: false };
    let protocol = request.socket?.encrypted ? 'https' : 'http';
    const forwarded = request.headers['x-forwarded-proto'];
    if (trustProxy && LOOPBACK_ADDRESSES.has(request.socket?.remoteAddress) && forwarded !== undefined) {
      if (forwarded !== 'http' && forwarded !== 'https') return { allowed: false, sameOrigin: false };
      protocol = forwarded;
    }
    const sameOrigin = origin === new URL(`${protocol}://${host}`).origin;
    return { allowed: sameOrigin && !crossSite, sameOrigin };
  } catch { return { allowed: false, sameOrigin: false }; }
}
