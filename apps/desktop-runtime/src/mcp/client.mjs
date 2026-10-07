import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mcpError } from './mcp-error.mjs';
import { tokenVerifier } from './pairing-store.mjs';
import { serverProof } from './socket-server.mjs';

const ownedByMe = info => !process.getuid || info.uid === process.getuid();

/** 读配对文件：必须是当前用户的普通文件且不对他人开放，否则视为已泄露而拒绝使用。 */
export function readPairingFile(file) {
  let info;
  try { info = fs.lstatSync(file); } catch { throw mcpError('MCP_PAIRING_FILE_MISSING', '配对文件不存在，可能已撤销。', { status: 404 }); }
  if (!info.isFile() || info.isSymbolicLink() || !ownedByMe(info) || (info.mode & 0o077) !== 0) {
    throw mcpError('MCP_PAIRING_FILE_UNSAFE', '配对文件权限不安全，请撤销后重新创建。', { status: 403 });
  }
  const pairing = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (pairing?.version !== 1 || ![pairing.pairingId, pairing.token, pairing.socketPath].every(value => typeof value === 'string')) {
    throw mcpError('MCP_PAIRING_FILE_UNSAFE', '配对文件无效。', { status: 422 });
  }
  return pairing;
}

/** 发送令牌前检查 socket 路径：属主是当前用户、是 socket、所在目录不对他人开放。 */
export function assertTrustedSocket(socketPath) {
  let info, directory;
  try { info = fs.lstatSync(socketPath); directory = fs.lstatSync(path.dirname(socketPath)); }
  catch { throw mcpError('MCP_RUNTIME_UNAVAILABLE', '知境未运行，请先打开知境。', { status: 503 }); }
  if (!info.isSocket() || !ownedByMe(info) || (info.mode & 0o077) !== 0 || !directory.isDirectory()
    || directory.isSymbolicLink() || !ownedByMe(directory) || (directory.mode & 0o077) !== 0) {
    throw mcpError('MCP_RUNTIME_UNTRUSTED', '本机通道权限异常，已拒绝连接。', { status: 403 });
  }
}

function request(socketPath, route, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body ?? {});
    const req = http.request({ socketPath, path: route, method: 'POST', timeout: 20_000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch { reject(mcpError('MCP_RUNTIME_UNTRUSTED', '运行端返回了无法识别的内容。', { status: 502 })); }
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', error => reject(['ENOENT', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'].includes(error.code)
      ? mcpError('MCP_RUNTIME_UNAVAILABLE', '知境未运行，请先打开知境。', { status: 503 }) : error));
    req.end(payload);
  });
}

/**
 * 适配器侧的连接：先检查 socket，再让运行端以令牌哈希为密钥证明身份，验证通过后才发送令牌。
 * 每次调用都重新验证，避免连接中途被替换。
 */
export function connectMcpRuntime({ pairingFile }) {
  async function authorized(route, body) {
    const pairing = readPairingFile(pairingFile);
    assertTrustedSocket(pairing.socketPath);
    const nonce = randomBytes(24).toString('hex');
    const hello = await request(pairing.socketPath, '/mcp/v1/handshake', { body: { pairingId: pairing.pairingId, nonce } });
    // 对端自称配对记录不可用：只是拒绝服务，没有发送令牌，直接如实报告。
    if (hello.status === 503 && hello.body?.error?.code === 'MCP_STORE_UNAVAILABLE') throw mcpError('MCP_STORE_UNAVAILABLE', hello.body.error.message, { status: 503 });
    const proof = hello.body?.data?.proof;
    const expected = serverProof(tokenVerifier(pairing.token), pairing.pairingId, nonce);
    if (hello.status !== 200 || typeof proof !== 'string' || proof.length !== expected.length
      || !timingSafeEqual(Buffer.from(proof), Buffer.from(expected))) {
      throw mcpError('MCP_RUNTIME_UNTRUSTED', '无法确认对端是知境运行端，已拒绝发送配对令牌。', { status: 403 });
    }
    const result = await request(pairing.socketPath, route, { body, token: pairing.token });
    if (result.status !== 200) {
      throw mcpError(result.body?.error?.code ?? 'MCP_INTERNAL', result.body?.error?.message ?? '外部调用失败。', { status: result.status, retryAfterSeconds: result.body?.error?.retryAfterSeconds });
    }
    return result.body.data;
  }
  return {
    call: (tool, input = {}) => authorized('/mcp/v1/call', { tool, input }),
    async listTools() { return (await authorized('/mcp/v1/tools', {})).tools; }
  };
}
