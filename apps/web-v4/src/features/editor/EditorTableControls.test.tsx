import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorTableControls } from './EditorTableControls';

const model = vi.hoisted(() => ({ command: vi.fn(), controls: { rows: 3, columns: 2, row: 1, canDeleteRow: true, canDeleteColumn: true } }));
vi.mock('@milkdown/kit/prose/tables', () => ({ selectedRect: () => ({ tableStart: 1 }) }));
vi.mock('./editorTableModel', () => ({
  getTableControlsState: () => model.controls,
  tableControlCommand: (action: string) => (...args: unknown[]) => model.command(action, ...args)
}));
function identity() { const value = { eq: (other: unknown) => other === value }; return value; }
function setup() {
  model.command.mockClear();
  Object.assign(model.controls, { rows: 3, columns: 2, row: 1, canDeleteRow: true, canDeleteColumn: true });
  const host = document.createElement('div');
  const editor = document.createElement('div');
  editor.tabIndex = 0;
  const table = document.createElement('table');
  editor.append(table); host.append(editor); document.body.append(host);
  table.getBoundingClientRect = () => ({ left: 100, top: 160, bottom: 260 } as DOMRect);
  const hostRef = createRef<HTMLDivElement>(); hostRef.current = host;
  const view = {
    dom: editor, editable: true, isDestroyed: false,
    state: { doc: identity(), selection: identity() },
    nodeDOM: () => table, dispatch: vi.fn(), focus: vi.fn(() => editor.focus())
  };
  let current: typeof view | null = view;
  render(<><EditorTableControls hostRef={hostRef} getView={() => current as unknown as EditorView} /><input aria-label="外部输入" /></>);
  return { view, editor, host, replaceView: () => { current = { ...view }; }, trigger: screen.getByRole('button', { name: '表格操作' }) };
}
afterEach(() => { cleanup(); document.body.replaceChildren(); });

describe('表格操作分组与快捷入口', () => {
  it('常驻仅两项插入和更多，完整十三项按四组呈现，删除单独置底', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    const toolbar = screen.getByRole('toolbar', { name: '表格操作工具栏' });
    expect(within(toolbar).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: '在当前表格行下方插入行' })).toHaveTextContent('下方插行');
    expect(screen.getByRole('button', { name: '在当前表格列右侧插入列' })).toHaveTextContent('右侧插列');
    await user.click(trigger);
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(13);
    expect(within(menu).getAllByRole('group')).toHaveLength(4);
    expect(within(menu).getAllByRole('separator')).toHaveLength(3);
    for (const name of ['插入行列', '选择范围', '列对齐', '删除']) expect(within(menu).getByText(name)).toBeVisible();
    expect(within(menu).getAllByRole('menuitem').slice(-3).every(item => item.hasAttribute('data-danger'))).toBe(true);
  });
  it.each([
    ['在当前表格行下方插入行', 'row-after'], ['在当前表格列右侧插入列', 'column-after']
  ])('快捷入口 %s 连续按压每次只执行一次并归焦正文', async (label, action) => {
    const user = userEvent.setup(); const { editor } = setup();
    for (let count = 1; count <= 2; count++) {
      await user.click(screen.getByRole('button', { name: label }));
      expect(model.command).toHaveBeenCalledTimes(count);
      expect(model.command.mock.calls.at(-1)?.[0]).toBe(action);
      await waitFor(() => expect(editor).toHaveFocus());
    }
  });
  it('快捷入口支持键盘和触摸执行', async () => {
    const user = userEvent.setup(); setup();
    const button = screen.getByRole('button', { name: '在当前表格行下方插入行' });
    button.focus(); await user.keyboard('{Enter}');
    expect(model.command).toHaveBeenCalledTimes(1);
    await user.pointer([{ keys: '[TouchA>]', target: button }, { keys: '[/TouchA]', target: button }]);
    expect(model.command).toHaveBeenCalledTimes(2);
  });
  it('菜单可键盘打开和 Escape 归焦，触摸重开仍能执行', async () => {
    const user = userEvent.setup(); const { trigger } = setup();
    trigger.focus(); await user.keyboard('{ArrowDown}');
    await screen.findByRole('menu'); await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.pointer([{ keys: '[TouchA>]', target: trigger }, { keys: '[/TouchA]', target: trigger }]);
    await user.click(screen.getByRole('menuitem', { name: '选择当前列' }));
    expect(model.command.mock.calls[0]?.[0]).toBe('select-column');
  });
  it.each(['document', 'selection', 'view', 'readonly', 'destroyed'])('菜单打开后 %s 改变时拒绝写入', async change => {
    const user = userEvent.setup(); const { trigger, view, replaceView } = setup();
    await user.click(trigger);
    if (change === 'document') view.state = { ...view.state, doc: identity() };
    if (change === 'selection') view.state = { ...view.state, selection: identity() };
    if (change === 'view') replaceView();
    if (change === 'readonly') view.editable = false;
    if (change === 'destroyed') view.isDestroyed = true;
    await user.click(screen.getByRole('menuitem', { name: '删除整个表格' }));
    expect(model.command).not.toHaveBeenCalled();
  });
  it('快捷按钮按下后选区变化时拒绝写入', async () => {
    const user = userEvent.setup(); const { view } = setup();
    const button = screen.getByRole('button', { name: '在当前表格行下方插入行' });
    await user.pointer({ keys: '[MouseLeft>]', target: button });
    view.state = { ...view.state, selection: identity() };
    await user.pointer({ keys: '[/MouseLeft]', target: button });
    expect(model.command).not.toHaveBeenCalled();
  });
  it('表头和最后数据行列的删除限制保留', async () => {
    const user = userEvent.setup(); const { trigger, host } = setup();
    Object.assign(model.controls, { row: 0, canDeleteRow: false, canDeleteColumn: false });
    fireEvent.keyUp(host); await user.click(trigger);
    for (const label of ['在上方插入行', '删除当前行', '删除当前列']) {
      const item = screen.getByRole('menuitem', { name: label });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      await user.click(item);
    }
    expect(model.command).not.toHaveBeenCalled();
  });
  it('阅读模式隐藏所有写入控件', () => {
    const { view, host } = setup(); view.editable = false; fireEvent.keyUp(host);
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
  it('命令后用户转到外部输入时不抢焦点', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.push(callback); return frames.length; });
    const user = userEvent.setup(); const { view } = setup();
    await user.click(screen.getByRole('button', { name: '在当前表格行下方插入行' }));
    const input = screen.getByRole('textbox', { name: '外部输入' }); input.focus();
    act(() => { frames.splice(0).forEach(callback => callback(0)); });
    expect(input).toHaveFocus(); expect(view.focus).not.toHaveBeenCalled();
  });
});
