const REPOSITORY = '1848956505/Knowra';
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
const API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const ARCHIVE = '知境·Knowra-Mac-arm64.zip';
const MAX_BYTES = 256 * 1024;

function versionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('发布版本格式无效。');
  return value.split('.').map(BigInt);
}
function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
function parseRelease(release, currentVersion) {
  if (!release || release.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string') throw new Error('没有可验证的稳定发布。');
  const version = release.tag_name.replace(/^v/, '');
  const comparison = compareVersions(version, currentVersion);
  const url = `${RELEASES_URL}/tag/${release.tag_name}`;
  if (release.html_url !== url) throw new Error('发布来源不符。');
  const assetNames = new Set((Array.isArray(release.assets) ? release.assets : [])
    .filter(asset => asset.state === 'uploaded' && Number.isSafeInteger(asset.size) && asset.size > 0)
    .map(asset => asset.name));
  return { version, comparison, url, notes: typeof release.body === 'string' ? release.body.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 6000) : '此版本未填写更新说明。',
    hasMacPackage: assetNames.has(ARCHIVE) && assetNames.has(`${ARCHIVE}.build-info.json`) };
}
async function fetchLatestRelease(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(API_URL, { headers: { Accept: 'application/vnd.github+json' }, redirect: 'error', signal: AbortSignal.timeout(12000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('更新服务暂时不可用，请稍后重试。');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('更新服务返回空响应。');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('更新信息超过大小限制。');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function createReleaseUpdates({ dialog, shell, getWindow, buildInfo, fetchImpl, isClosing = () => false }) {
  let pending = false;
  const active = () => { const window = getWindow(); return !isClosing() && !!window && !window.isDestroyed(); };
  return { async check() {
    if (pending || !active()) return;
    pending = true;
    try {
      const raw = await fetchLatestRelease(fetchImpl);
      if (!active()) return;
      const release = raw ? parseRelease(raw, buildInfo.version) : null;
      const current = `当前：${buildInfo.version} · ${buildInfo.commit || '未知提交'} · ${buildInfo.state}`;
      let message = '尚无可用的稳定发布';
      if (release) message = !release.hasMacPackage ? '此发布尚未提供完整 Mac 安装包' : release.comparison > 0 ? `发现新版本 ${release.version}` : release.comparison === 0 ? '发布版本号与当前相同' : '当前版本号高于稳定发布';
      const detail = [current, release ? `稳定发布：${release.version}\n来源：${release.url}` : `来源：${RELEASES_URL}`,
        release?.comparison === 0 ? '相同版本号不代表相同构建。请在发布页核对提交 SHA 与安装包清单；本次未确认二进制一致。' : '',
        release?.notes || '',
        '只有 GitHub 稳定 Release 中的安装包用于此入口；CI 候选产物不算正式更新。',
        '打开发布页不会下载、安装或退出应用。更新前请导出完整备份并正常退出，按发布说明安装。保留旧应用及备份用于恢复；旧版本不保证能读取新版本资料。',
        '校验和用于发现损坏，不是开发者身份签名。请核对 Developer ID 签名与 Apple 公证说明；当前个人构建只有临时签名，不应作为已公证公众安装包。不要关闭 Gatekeeper 或移除隔离标记。'
      ].filter(Boolean).join('\n\n');
      const answer = await dialog.showMessageBox(getWindow(), { type: 'info', title: '检查 Knowra 更新', message, detail,
        buttons: ['关闭', '打开发布页'], defaultId: 0, cancelId: 0, noLink: true });
      if (answer.response === 1 && active()) await shell.openExternal(release?.url || RELEASES_URL);
    } catch {
      if (!active()) return;
      try { await dialog.showMessageBox(getWindow(), { type: 'warning', title: '检查 Knowra 更新', message: '暂时无法检查更新',
        detail: '网络连接、GitHub 访问限制或发布信息不完整。当前应用和本机资料未改变，请稍后重试。', buttons: ['关闭'], cancelId: 0 }); } catch { /* 退出中的原生窗口可能同步抛错。 */ }
    } finally { pending = false; }
  } };
}
module.exports = { REPOSITORY, RELEASES_URL, API_URL, ARCHIVE, compareVersions, parseRelease, fetchLatestRelease, createReleaseUpdates };
