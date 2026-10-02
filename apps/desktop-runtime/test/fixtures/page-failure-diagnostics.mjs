/** 合成页面验收仅在失败时输出现场；不改变导航、请求、断言或等待时限。 */
export async function withPageFailureDiagnostics(page, run, inspectState) {
  const started = performance.now();
  const events = [];
  const clean = value => String(value).replace(/\/local-session\/[^\s/?#]+/g, '/local-session/[synthetic-session]');
  const record = (kind, value) => {
    events.push({ ms: Math.round(performance.now() - started), kind, ...value });
    if (events.length > 160) events.shift();
  };
  const handlers = {
    console: message => record('console', { type: message.type(), text: clean(message.text()).slice(0, 2000) }),
    pageerror: error => record('pageerror', { message: clean(error.message) }),
    request: request => record('request', { method: request.method(), url: clean(request.url()) }),
    requestfailed: request => record('requestfailed', { url: clean(request.url()), failure: request.failure() }),
    response: response => record('response', { status: response.status(), url: clean(response.url()) }),
    framenavigated: frame => { if (frame === page.mainFrame()) record('navigation', { url: clean(frame.url()) }); },
    domcontentloaded: () => record('domcontentloaded', { url: clean(page.url()) }),
    load: () => record('load', { url: clean(page.url()) })
  };
  for (const [name, handler] of Object.entries(handlers)) page.on(name, handler);
  try { return await run(); }
  catch (error) {
    let dom;
    try { dom = (await page.locator('body').innerText({ timeout: 1000 })).slice(0, 16000); }
    catch (captureError) { dom = `现场不可读：${captureError.message}`; }
    let state, timer;
    if (inspectState) {
      try {
        state = await Promise.race([Promise.resolve().then(inspectState), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('合成服务现场读取超过1000ms')), 1000);
        })]);
      } catch (captureError) { state = { captureError: captureError.message }; }
      finally { clearTimeout(timer); }
    }
    console.error('E2E failure diagnostics', JSON.stringify({ url: clean(page.url()), events, dom, state }));
    throw error;
  } finally {
    for (const [name, handler] of Object.entries(handlers)) page.off(name, handler);
  }
}
