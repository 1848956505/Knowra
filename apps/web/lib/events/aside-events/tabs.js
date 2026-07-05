import { closestFromEventTarget } from '../../dom/event-target.js';

// aside-events/tabs.js
// 侧栏顶部 tab 切换。1 个监听器（click）。
// 派发 [data-aside-tab]，仅当 dataset.asideTab 存在且目标 tab 与当前
// state.asideTab 不同时才切换并 renderSidebar。

export function bindAsideTabsEvents({ state, elements, deps }) {
  const { getCurrentNote, renderSidebar } = deps;

  elements.asideTabs?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event.target, '[data-aside-tab]');
    if (!button?.dataset.asideTab || state.asideTab === button.dataset.asideTab) {
      return;
    }
    state.asideTab = button.dataset.asideTab;
    renderSidebar(getCurrentNote());
  });
}
