// 沿用原生启动的20秒等待上限；本helper内导航与editor-ready共享一次20秒预算，launch计时独立。
// 正文断言仍由业务用例单独执行。
export const PACKAGED_STARTUP_TIMEOUT_MS = 20000;

export async function waitForPackagedNoteEditor(page, noteId, { timeoutMs = PACKAGED_STARTUP_TIMEOUT_MS, diagnostic = () => {} } = {}) {
  const expectedHash = `#/materials/notes/${noteId}`;
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  let phase = 'note-navigation';
  try {
    await page.waitForURL(url => url.hash === expectedHash, { timeout: remaining() });
    phase = 'editor-ready';
    await page.locator('[data-editor-ready="true"] .ProseMirror').waitFor({ state: 'visible', timeout: remaining() });
  } catch (error) {
    // 诊断额外最多等待1秒，不采集正文、附件内容或凭据。
    const ready = await page.locator('[data-editor-ready]').getAttribute('data-editor-ready', { timeout: 1000 }).catch(() => null);
    diagnostic(`编辑器就绪失败：${JSON.stringify({ phase, expectedHash, hash: new URL(page.url()).hash, ready, timeoutMs })}`);
    throw error;
  }
}
