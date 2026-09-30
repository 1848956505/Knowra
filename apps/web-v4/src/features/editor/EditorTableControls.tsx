import { useEffect, useRef, useState, type RefObject } from 'react';
import type { EditorView } from '@milkdown/kit/prose/view';
import { selectedRect } from '@milkdown/kit/prose/tables';
import { Button, Menu, MenuItem, MenuPopover, MenuTrigger } from '../../components/ui';
import { getTableControlsState, tableControlCommand, type TableAction, type TableControlsState } from './editorTableModel';
import styles from './EditorTableControls.module.css';
import { TABLE_CONTEXT_EVENT } from './editorTableBehavior';

const items: Array<{ action: TableAction; label: string }> = [
  { action: 'row-before', label: '在上方插入行' }, { action: 'row-after', label: '在下方插入行' },
  { action: 'column-before', label: '在左侧插入列' }, { action: 'column-after', label: '在右侧插入列' },
  { action: 'select-row', label: '选择当前行' }, { action: 'select-column', label: '选择当前列' }, { action: 'select-table', label: '选择整个表格' },
  { action: 'align-left', label: '当前列左对齐' }, { action: 'align-center', label: '当前列居中' }, { action: 'align-right', label: '当前列右对齐' },
  { action: 'delete-row', label: '删除当前行' }, { action: 'delete-column', label: '删除当前列' }, { action: 'delete-table', label: '删除整个表格' }
];

export function EditorTableControls({ hostRef, getView }: { hostRef: RefObject<HTMLDivElement | null>; getView(): EditorView | null }) {
  const menuContext = useRef<{ view: EditorView; state: EditorView['state'] } | null>(null);
  const [controls, setControls] = useState<(TableControlsState & { x: number; y: number }) | null>(null);
  useEffect(() => {
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
      const stage = view.dom.closest('[data-editor-scroll-root]')?.getBoundingClientRect();
      if (rect.bottom < (stage?.top ?? 0) || rect.top > (stage?.bottom ?? window.innerHeight)) { setControls(null); return; }
      const next = { ...state, x: Math.max(8, Math.min(rect.left, window.innerWidth - 220)), y: Math.max((stage?.top ?? 0) + 8, Math.min(rect.top - 40, window.innerHeight - 44)) };
      setControls(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    // selectionchange 跟随鼠标、键盘和 CellSelection；菜单操作后也主动刷新。
    document.addEventListener('selectionchange', update);
    host.addEventListener(TABLE_CONTEXT_EVENT, update);
    host.addEventListener('keyup', update);
    host.addEventListener('pointerup', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    update();
    return () => {
      document.removeEventListener('selectionchange', update);
      host.removeEventListener(TABLE_CONTEXT_EVENT, update);
      host.removeEventListener('keyup', update);
      host.removeEventListener('pointerup', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [hostRef, getView]);
  if (!controls) return null;
  return <div className={styles.toolbar} style={{ left: controls.x, top: controls.y }} data-pdf-exclude="true" data-table-controls="true" role="toolbar" aria-label="表格操作工具栏">
    <span>{controls.rows} 行 · {controls.columns} 列</span>
    <MenuTrigger onOpenChange={open => {
      const view = getView();
      if (open) menuContext.current = view && !view.isDestroyed && view.editable ? { view, state: view.state } : null;
    }}>
      <Button size="compact" variant="ghost">表格操作</Button>
      <MenuPopover placement="bottom start"><Menu ariaLabel="表格行列操作">
        {items.map(({ action, label }, index) => <MenuItem key={action} id={action}
          isDisabled={action === 'row-before' && controls.row === 0 || action === 'delete-row' && !controls.canDeleteRow || action === 'delete-column' && !controls.canDeleteColumn}
          isDanger={index >= 10}
          onAction={() => {
            const view = getView();
            const context = menuContext.current;
            menuContext.current = null;
            if (!view || view.isDestroyed || !view.editable || context?.view !== view
              || !context.state.doc.eq(view.state.doc) || !context.state.selection.eq(view.state.selection)) return;
            tableControlCommand(action)(view.state, view.dispatch);
            // 菜单关闭会先还焦到触发按钮，随后再将键盘交还正文（撤销也在正文执行）。
            const actionFocus = document.activeElement;
            requestAnimationFrame(() => {
              const focused = document.activeElement;
              if (focused && focused !== actionFocus && focused !== document.body && !view.dom.contains(focused)
                && !focused.closest('[data-table-controls]')) return;
              if (getView() === view && !view.isDestroyed && view.editable) view.focus();
            });
            const next = getTableControlsState(view.state);
            setControls(next ? { ...next, x: controls.x, y: controls.y } : null);
          }}>{label}</MenuItem>)}
      </Menu></MenuPopover>
    </MenuTrigger>
  </div>;
}

