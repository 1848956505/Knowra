/**
 * 在编辑器的真实菜单按钮处完成滚动/布局准备，然后只执行一次真实指针点击。
 * sticky 工具栏的 Playwright 自动滚动可能晚于点击派发 scroll；非模态菜单会按约定关闭。
 * 这里显式检查可见、启用、稳定与命中；不屏蔽产品的滚动关闭或动画。
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
export async function openEditorToolbarMenu(page, label) {
  const trigger = page.getByRole('toolbar', { name: '笔记格式工具栏' }).getByRole('button', { name: label, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  const target = await trigger.evaluate(prepareTarget);
  // 最后重验同一坐标，再发一次真实点击；避免 locator.click 对 sticky 子按钮再次自动滚动。
  await trigger.evaluate(prepareTarget, target);
  if (target.touch) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
}

/** @param {HTMLElement} element @param {object | null} expected */
function prepareTarget(element, expected = null) {
  const validate = () => {
    if (!element.isConnected) throw new Error('编辑器菜单按钮在准备期间被移除');
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) throw new Error('编辑器菜单按钮不可见');
    if (element.matches(':disabled') || element.closest('[aria-disabled="true"]')) throw new Error('编辑器菜单按钮已禁用');
    const view = element.ownerDocument.defaultView;
    const box = element.getBoundingClientRect();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const viewport = view.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    if (box.width <= 0 || box.height <= 0 || box.x < left || box.y < top ||
        box.x + box.width > left + (viewport?.width ?? view.innerWidth) ||
        box.y + box.height > top + (viewport?.height ?? view.innerHeight)) throw new Error('编辑器菜单按钮未完整处于视口内');
    if (!element.contains(element.ownerDocument.elementFromPoint(x, y))) throw new Error('编辑器菜单按钮中心被遮挡');
    const target = { x, y, width: box.width, height: box.height, touch: view.navigator.maxTouchPoints > 0 };
    if (expected && JSON.stringify(target) !== JSON.stringify(expected)) throw new Error('编辑器菜单按钮在点击前改变位置');
    return target;
  };
  if (expected) return validate();
  return new Promise((resolve, reject) => {
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
        try { resolve(validate()); } catch (error) { reject(error); }
      } else frame = view.requestAnimationFrame(measure);
    };
    doc.addEventListener('scroll', onScroll, true);
    frame = view.requestAnimationFrame(measure);
  });
}
