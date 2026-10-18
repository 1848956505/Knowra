import { Fragment, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { EditorView } from '@milkdown/kit/prose/view';
import { selectedRect } from '@milkdown/kit/prose/tables';
import { Button, Menu, MenuHeader, MenuItem, MenuPopover, MenuSection, MenuSeparator, MenuTrigger, Tooltip, TooltipTrigger } from '../../components/ui';
import { getTableControlsState, tableControlCommand, type TableAction, type TableControlsState } from './editorTableModel';
import styles from './EditorTableControls.module.css';
import { TABLE_CONTEXT_EVENT } from './editorTableBehavior';

const groups: Array<{ label: string; danger?: boolean; items: Array<{ action: TableAction; label: string }> }> = [
  { label: '插入行列', items: [
    { action: 'row-before', label: '在上方插入行' }, { action: 'row-after', label: '在下方插入行' },
    { action: 'column-before', label: '在左侧插入列' }, { action: 'column-after', label: '在右侧插入列' }
  ] },
  { label: '选择范围', items: [
    { action: 'select-row', label: '选择当前行' }, { action: 'select-column', label: '选择当前列' }, { action: 'select-table', label: '选择整个表格' }
  ] },
  { label: '列对齐', items: [
    { action: 'align-left', label: '当前列左对齐' }, { action: 'align-center', label: '当前列居中' }, { action: 'align-right', label: '当前列右对齐' }
  ] },
  { label: '删除', danger: true, items: [
    { action: 'delete-row', label: '删除当前行' }, { action: 'delete-column', label: '删除当前列' }, { action: 'delete-table', label: '删除整个表格' }
  ] }
];
const shortcuts: Array<{ action: TableAction; label: string; description: string }> = [
  { action: 'row-after', label: '下方插入行', description: '在当前表格行下方插入行' },
  { action: 'column-after', label: '右侧插入列', description: '在当前表格列右侧插入列' }
];
type ActionContext = { view: EditorView; state: EditorView['state'] } | null;

export function EditorTableControls({ hostRef, getView }: { hostRef: RefObject<HTMLDivElement | null>; getView(): EditorView | null }) {
  const menuContext = useRef<ActionContext>(null);
  const shortcutContext = useRef<ActionContext>(null);
  const [controls, setControls] = useState<(TableControlsState & { x: number; y: number }) | null>(null);
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const view = getView();
      const state = view && !view.isDestroyed && view.editable ? getTableControlsState(view.state) : null;
      if (!view || !state) { setControls(null); return; }
      const { tableStart } = selectedRect(view.state);
      const table = view.nodeDOM(tableStart - 1);
      if (!(table instanceof Element)) { setControls(null); return; }
      const rect = table.getBoundingClientRect();
      const scrollRoot = view.dom.closest('[data-editor-scroll-root]');
      const stage = scrollRoot?.getBoundingClientRect();
      const formatToolbar = scrollRoot?.querySelector('[aria-label="笔记格式工具栏"]')?.getBoundingClientRect();
      if (rect.bottom < (stage?.top ?? 0) || rect.top > (stage?.bottom ?? window.innerHeight)) { setControls(null); return; }
      const top = Math.max(stage?.top ?? 0, formatToolbar?.bottom ?? 0) + 8;
      const size = toolbar?.getBoundingClientRect();
      const width = size?.width ?? 0;
      const height = size?.height ?? 0;
      const next = { ...state,
        x: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        y: Math.max(top, Math.min(rect.top - height - 8, window.innerHeight - height - 8))
      };
      setControls(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    // selectionchange 跟随鼠标、键盘和 CellSelection；菜单操作后也主动刷新。
    document.addEventListener('selectionchange', update);
    host.addEventListener(TABLE_CONTEXT_EVENT, update);
    host.addEventListener('keyup', update);
    host.addEventListener('pointerup', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    // 初次挂载、缩放和触屏尺寸切换都按真实控件尺寸定位，避免覆盖表头。
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (toolbar) observer?.observe(toolbar);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener('selectionchange', update);
      host.removeEventListener(TABLE_CONTEXT_EVENT, update);
      host.removeEventListener('keyup', update);
      host.removeEventListener('pointerup', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [hostRef, getView, toolbar]);
  const captureContext = (): ActionContext => {
    const view = getView();
    return view && !view.isDestroyed && view.editable ? { view, state: view.state } : null;
  };
  const run = (action: TableAction, context: ActionContext) => {
    const view = getView();
    if (!view || view.isDestroyed || !view.editable || context?.view !== view
      || !context.state.doc.eq(view.state.doc) || !context.state.selection.eq(view.state.selection)) return;
    tableControlCommand(action)(view.state, view.dispatch);
    // 菜单关闭先归焦触发器，再交还正文；期间若用户转到其它输入，不抢回焦点。
    const actionFocus = document.activeElement;
    requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (focused && focused !== actionFocus && focused !== document.body && !view.dom.contains(focused)
        && !focused.closest('[data-table-controls]')) return;
      if (getView() === view && !view.isDestroyed && view.editable) view.focus();
    });
    const next = getTableControlsState(view.state);
    setControls(previous => previous && next ? { ...next, x: previous.x, y: previous.y } : null);
  };
  if (!controls) return null;
  return <div ref={setToolbar} className={styles.toolbar} style={{ left: controls.x, top: controls.y }} data-pdf-exclude="true" data-table-controls="true" role="toolbar" aria-label="表格操作工具栏">
    <span className={styles.count}>{controls.rows} 行 · {controls.columns} 列</span>
    <div className={styles.shortcuts} role="group" aria-label="表格快捷插入">
      {shortcuts.map(({ action, label, description }) => <TooltipTrigger key={action}><Button size="compact" variant="ghost" aria-label={description}
        onPressStart={() => { shortcutContext.current = captureContext(); }}
        onPress={() => {
          const context = shortcutContext.current;
          shortcutContext.current = null;
          run(action, context);
        }}>{label}</Button><Tooltip>{description}</Tooltip></TooltipTrigger>)}
    </div>
    <MenuTrigger onOpenChange={open => {
      if (open) menuContext.current = captureContext();
    }}>
      <Button size="compact" variant="ghost" aria-label="表格操作">表格操作</Button>
      <MenuPopover placement="bottom start"><Menu ariaLabel="表格行列操作">
        {groups.map(({ label: groupLabel, danger, items }, index) => <Fragment key={groupLabel}>
          {index > 0 ? <MenuSeparator /> : null}
          <MenuSection>
            <MenuHeader>{groupLabel}</MenuHeader>
            {items.map(({ action, label }) => <MenuItem key={action} id={action}
              isDisabled={action === 'row-before' && controls.row === 0 || action === 'delete-row' && !controls.canDeleteRow || action === 'delete-column' && !controls.canDeleteColumn}
              isDanger={danger}
              onAction={() => {
                const context = menuContext.current;
                menuContext.current = null;
                run(action, context);
              }}>{label}</MenuItem>)}
          </MenuSection>
        </Fragment>)}
      </Menu></MenuPopover>
    </MenuTrigger>
  </div>;
}
