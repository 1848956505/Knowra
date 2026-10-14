/**
 * 在编辑器的真实菜单按钮处完成滚动/布局准备，然后只执行一次普通点击。
 * sticky 工具栏的 Playwright 自动滚动可能晚于点击派发 scroll；非模态菜单会按约定关闭。
 * 这里等待准备阶段稳定，不屏蔽产品的滚动关闭、动画或 actionability 检查。
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
export async function openEditorToolbarMenu(page, label) {
  const trigger = page.getByRole('toolbar', { name: '笔记格式工具栏' }).getByRole('button', { name: label, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.evaluate(element => new Promise((resolve, reject) => {
    let frame = 0;
    let stableFrames = 0;
    let previous = '';
    let finished = false;
    const ancestors = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) ancestors.push(parent);
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    const cleanup = () => {
      finished = true;
      view.cancelAnimationFrame(frame);
      view.clearTimeout(timeout);
      doc.removeEventListener('scroll', onScroll, true);
    };
    const onScroll = event => {
      if (event.target === doc || ancestors.includes(event.target)) stableFrames = 0;
    };
    const timeout = view.setTimeout(() => {
      cleanup();
      reject(new Error('编辑器菜单按钮滚动或布局在1500ms内未稳定'));
    }, 1500);
    const measure = () => {
      if (finished) return;
      if (!element.isConnected) {
        cleanup();
        reject(new Error('编辑器菜单按钮在准备期间被移除'));
        return;
      }
      const box = element.getBoundingClientRect();
      const current = JSON.stringify([box.x, box.y, box.width, box.height, ...ancestors.flatMap(parent => [parent.scrollTop, parent.scrollLeft])]);
      stableFrames = current === previous ? stableFrames + 1 : 0;
      previous = current;
      if (stableFrames >= 3) {
        cleanup();
        resolve();
      } else frame = view.requestAnimationFrame(measure);
    };
    doc.addEventListener('scroll', onScroll, true);
    frame = view.requestAnimationFrame(measure);
  }));
  await trigger.click();
}
