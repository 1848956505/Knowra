import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';
import { parseError } from './limits.mjs';

/** Node 24 权限模型不含网络 scope；这层防解析库意外发网，不宣称恶意代码沙箱。 */
export function disableParserNetwork() {
  const deny = () => { throw parseError('AI_ATTACHMENT_NETWORK_FORBIDDEN'); };
  net.connect = net.createConnection = net.Socket.prototype.connect = net.Server.prototype.listen = deny;
  tls.connect = tls.createServer = http.request = http.get = http.createServer = deny;
  https.request = https.get = https.createServer = http2.connect = http2.createServer = http2.createSecureServer = deny;
  dgram.createSocket = deny;
  for (const key of ['lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse']) {
    dns[key] = deny; dns.promises[key] = deny;
  }
  globalThis.fetch = deny; globalThis.WebSocket = class { constructor() { deny(); } };
  syncBuiltinESMExports();
}
