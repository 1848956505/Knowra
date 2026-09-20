/** 每个页面携带其加载时的资料集标识，恢复后旧窗口不能写入新资料。 */
export function runtimeSessionScript(datasetId, { legacyDraftsAllowed = true } = {}) {
  const configuration = JSON.stringify({ persistenceMode: 'desktop-local', datasetId, legacyDraftsAllowed }).replaceAll('<', '\\u003c');
  return `<script>globalThis.knowraRuntime = Object.freeze(${configuration});
(() => {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const datasetId = globalThis.knowraRuntime.datasetId;
  globalThis.fetch = (input, init) => {
    const target = new URL(input instanceof Request ? input.url : input, location.href);
    if (target.origin === location.origin && target.pathname.startsWith('/api/')) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set('X-Knowra-Dataset', datasetId);
      return nativeFetch(input, { ...init, headers });
    }
    return nativeFetch(input, init);
  };
})();</script>`;
}
