import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { IconButton, Menu, MenuHeader, MenuItem, MenuSection, MenuSeparator, PointMenu } from '../../components/ui';
import { getTableControlsState, moveTableColumn, moveTableRow, tableControlCommand, type TableAction } from './editorTableModel';
import { TABLE_CONTEXT_EVENT } from './editorTableBehavior';
import { findTableAtDom, normalizeRatios, resizeColumns, setTableColumnWidths, tableFingerprint } from './editorTableColumnWidths';
import styles from './EditorTableHandles.module.css';

type HandleKind = 'row' | 'column' | 'table';
interface Box { left: number; top: number; right: number; bottom: number }
interface Layout {
  table: Box;
  rows: Box[];
  columns: Box[];
  row: number;
  column: number;
  rowCount: number;
  columnCount: number;
  /** 手柄允许出现的垂直范围：工作区内且不被吸顶格式栏遮住。 */
  clip: { top: number; bottom: number };
}
interface MenuState { kind: HandleKind; point: { x: number; y: number } }
interface Drag { kind: 'row' | 'column'; from: number; target: number }

const DRAG_THRESHOLD = 4;
const box = (element: Element): Box => {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
};
const near = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** 只读 DOM 几何：行列边界来自真实渲染，手柄不占文档布局。 */
function readLayout(view: EditorView, hover: Element | null): Layout | null {
  const state = view.state;
  let cell: Element | null = hover && view.dom.contains(hover) ? hover.closest('td, th') : null;
  if (!cell) {
    if (!getTableControlsState(state)) return null;
    const { $from } = state.selection;
    const dom = view.domAtPos($from.pos).node;
    cell = (dom instanceof Element ? dom : dom.parentElement)?.closest('td, th') ?? null;
  }
  const table = cell?.closest('table');
  if (!cell || !table || !view.dom.contains(table)) return null;
  const rows = Array.from(table.rows);
  const first = rows[0];
  if (!first) return null;
  const row = (cell.parentElement as HTMLTableRowElement).rowIndex;
  const stage = view.dom.closest('[data-editor-scroll-root]')?.getBoundingClientRect();
  const stack = view.dom.closest('[data-editor-workspace]')?.querySelector('[data-editor-toolbar-stack]')?.getBoundingClientRect();
  const clip = { top: Math.max(stage?.top ?? 0, stack && stage && stack.top <= stage.top + 1 ? stack.bottom : 0), bottom: Math.min(stage?.bottom ?? window.innerHeight, window.innerHeight) };
  return { table: box(table), rows: rows.map(box), columns: Array.from(first.cells).map(box),
    row, column: (cell as HTMLTableCellElement).cellIndex, rowCount: rows.length, columnCount: first.cells.length, clip };
}

const rowItems: Array<{ action: TableAction; label: string }> = [
  { action: 'row-before', label: '在上方插入行' }, { action: 'row-after', label: '在下方插入行' }
];
const columnItems: Array<{ action: TableAction; label: string }> = [
  { action: 'column-before', label: '在左侧插入列' }, { action: 'column-after', label: '在右侧插入列' }
];
const alignItems: Array<{ action: TableAction; label: string }> = [
  { action: 'align-left', label: '左对齐' }, { action: 'align-center', label: '居中' }, { action: 'align-right', label: '右对齐' }
];

const Grip = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor"><circle cx="4" cy="3" r="1" /><circle cx="8" cy="3" r="1" /><circle cx="4" cy="6" r="1" /><circle cx="8" cy="6" r="1" /><circle cx="4" cy="9" r="1" /><circle cx="8" cy="9" r="1" /></svg>;
const Plus = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 2v8M2 6h8" /></svg>;

export function EditorTableHandles({ hostRef, getView }: { hostRef: RefObject<HTMLDivElement | null>; getView(): EditorView | null }) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const hover = useRef<Element | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const cancelDrag = useRef<(() => void) | null>(null);
  const suppressPress = useRef(false);
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let frame = 0;
    const update = () => {
      const view = getView();
      let next: Layout | null = null;
      if (view && !view.isDestroyed && view.editable) {
        next = readLayout(view, hover.current);
        const stage = view.dom.closest('[data-editor-scroll-root]')?.getBoundingClientRect();
        // 表格完全滚出可视工作区时不显示手柄。
        if (next && stage && (next.table.bottom < stage.top || next.table.top > stage.bottom)) next = null;
      }
      const same = JSON.stringify(layoutRef.current) === JSON.stringify(next);
      layoutRef.current = next;
      if (!same) setLayout(next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    refresh.current = update;
    const onPointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-table-handles]')) return;
      const cell = target && host.contains(target) ? target.closest('td, th') : null;
      if (cell === hover.current) return;
      hover.current = cell;
      schedule();
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('selectionchange', schedule);
    host.addEventListener(TABLE_CONTEXT_EVENT, schedule);
    host.addEventListener('keyup', schedule);
    host.addEventListener('pointerup', schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(host);
    update();
    return () => {
      cancelAnimationFrame(frame);
      cancelDrag.current?.();
      observer?.disconnect();
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('selectionchange', schedule);
      host.removeEventListener(TABLE_CONTEXT_EVENT, schedule);
      host.removeEventListener('keyup', schedule);
      host.removeEventListener('pointerup', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [hostRef, getView]);

  const liveView = () => {
    const view = getView();
    return view && !view.isDestroyed && view.editable ? view : null;
  };
  /** 把光标放进指定行列的单元格，让后续命令作用于该表格。 */
  const focusCell = (view: EditorView, row: number, column: number) => {
    const current = layoutRef.current;
    const table = current && view.dom.querySelectorAll('table');
    if (!current || !table) return false;
    const element = Array.from(table).find(item => {
      const rect = item.getBoundingClientRect();
      return Math.abs(rect.left - current.table.left) < 1 && Math.abs(rect.top - current.table.top) < 1;
    });
    const cell = element?.rows[row]?.cells[column];
    if (!cell) return false;
    const selection = TextSelection.near(view.state.doc.resolve(view.posAtDOM(cell, 0)), 1);
    view.dispatch(view.state.tr.setSelection(selection).setMeta('addToHistory', false));
    return true;
  };
  const restoreFocus = (view: EditorView) => requestAnimationFrame(() => { if (!view.isDestroyed && view.editable) view.focus(); refresh.current(); });

  const openMenu = (kind: HandleKind, anchor: Element) => {
    const view = liveView();
    const current = layoutRef.current;
    if (!view || !current) return;
    if (!focusCell(view, kind === 'row' ? current.row : 0, kind === 'column' ? current.column : 0)) return;
    if (kind !== 'table') tableControlCommand(kind === 'row' ? 'select-row' : 'select-column')(view.state, view.dispatch);
    else tableControlCommand('select-table')(view.state, view.dispatch);
    const rect = anchor.getBoundingClientRect();
    setMenu({ kind, point: { x: rect.left, y: rect.bottom + 4 } });
  };
  const runAction = (action: TableAction | 'move-up' | 'move-down' | 'move-left' | 'move-right') => {
    const view = liveView();
    const current = layoutRef.current;
    setMenu(null);
    if (!view || !current) return;
    const state = getTableControlsState(view.state);
    if (!state) return;
    if (action === 'move-up') moveTableRow(state.row, state.row - 1)(view.state, view.dispatch);
    else if (action === 'move-down') moveTableRow(state.row, state.row + 1)(view.state, view.dispatch);
    else if (action === 'move-left') moveTableColumn(state.column, state.column - 1)(view.state, view.dispatch);
    else if (action === 'move-right') moveTableColumn(state.column, state.column + 1)(view.state, view.dispatch);
    else tableControlCommand(action)(view.state, view.dispatch);
    restoreFocus(view);
  };
  const quickInsert = (action: 'row-after' | 'column-after') => {
    const view = liveView();
    const current = layoutRef.current;
    if (!view || !current) return;
    const ok = action === 'row-after' ? focusCell(view, current.rowCount - 1, 0) : focusCell(view, 0, current.columnCount - 1);
    if (ok) tableControlCommand(action)(view.state, view.dispatch);
    restoreFocus(view);
  };

  /** 指针按下后超过阈值进入拖拽；松开时按落点移动行/列，未超过阈值则视为点击。 */
  const startDrag = (kind: 'row' | 'column') => (event: PointerEvent) => {
    const current = layoutRef.current;
    const from = kind === 'row' ? current?.row : current?.column;
    if (event.button !== 0 || !current || from === undefined || (kind === 'row' && from === 0)) return;
    cancelDrag.current?.();
    const view = liveView();
    if (!view) return;
    const original = view.state;
    const startX = event.clientX; const startY = event.clientY;
    let active = false; let target = from;
    const boxes = kind === 'row' ? current.rows : current.columns;
    const move = (e: globalThis.PointerEvent) => {
      if (!active && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return;
      active = true;
      const pointer = kind === 'row' ? e.clientY : e.clientX;
      let index = boxes.findIndex(item => kind === 'row' ? pointer < item.bottom : pointer < item.right);
      if (index < 0) index = boxes.length - 1;
      target = near(index, kind === 'row' ? 1 : 0, boxes.length - 1);
      setDrag({ kind, from, target });
    };
    const end = (apply: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cancelDrag.current = null;
      setDrag(null);
      if (!active) return;
      suppressPress.current = true;
      setTimeout(() => { suppressPress.current = false; }, 0);
      const live = liveView();
      if (!apply || !live || target === from || !live.state.doc.eq(original.doc)) return;
      if (!focusCell(live, kind === 'row' ? from : 0, kind === 'column' ? from : 0)) return;
      (kind === 'row' ? moveTableRow(from, target) : moveTableColumn(from, target))(live.state, live.dispatch);
      restoreFocus(live);
    };
    const up = () => end(true);
    const cancel = () => end(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    cancelDrag.current = () => end(false);
  };

  const tableElement = (view: EditorView) => {
    const current = layoutRef.current;
    return current ? Array.from(view.dom.querySelectorAll('table')).find(item => {
      const rect = item.getBoundingClientRect();
      return Math.abs(rect.left - current.table.left) < 1 && Math.abs(rect.top - current.table.top) < 1;
    }) ?? null : null;
  };
  /** 列边界：拖动或方向键调整相邻两列宽度；双击恢复自动列宽。只改本机视图状态。 */
  const startResize = (index: number) => (event: PointerEvent) => {
    const current = layoutRef.current;
    const view = liveView();
    const element = view && tableElement(view);
    const found = view && element && findTableAtDom(view, element);
    if (event.button !== 0 || !current || !view || !found) return;
    event.preventDefault();
    cancelDrag.current?.();
    const fingerprint = tableFingerprint(found.node);
    const tablePx = current.table.right - current.table.left;
    const start = normalizeRatios(current.columns.map(item => item.right - item.left), tablePx);
    const startX = event.clientX;
    let latest = start;
    const move = (e: globalThis.PointerEvent) => {
      latest = resizeColumns(start, index, e.clientX - startX, tablePx);
      setTableColumnWidths(view, { fingerprint, ratios: latest, commit: false });
    };
    const end = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cancelDrag.current = null;
      if (view.isDestroyed) return;
      if (commit && latest !== start) setTableColumnWidths(view, { fingerprint, ratios: latest, commit: true });
      else if (!commit) setTableColumnWidths(view, { fingerprint, ratios: null, commit: false });
      refresh.current();
    };
    const up = () => end(true);
    const cancel = () => end(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    cancelDrag.current = () => end(false);
  };
  const resizeByKey = (index: number) => (event: KeyboardEvent) => {
    const step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
    const current = layoutRef.current;
    const view = liveView();
    const element = view && tableElement(view);
    const found = view && element && findTableAtDom(view, element);
    if (!step || !current || !view || !found) return;
    event.preventDefault();
    const tablePx = current.table.right - current.table.left;
    const ratios = resizeColumns(normalizeRatios(current.columns.map(item => item.right - item.left), tablePx), index, step, tablePx);
    setTableColumnWidths(view, { fingerprint: tableFingerprint(found.node), ratios, commit: true });
    refresh.current();
  };
  const resetWidths = () => {
    const view = liveView();
    const element = view && tableElement(view);
    const found = view && element && findTableAtDom(view, element);
    if (!view || !found) return;
    setTableColumnWidths(view, { fingerprint: tableFingerprint(found.node), ratios: null, commit: true });
    refresh.current();
  };

  if (!layout) return null;
  const { table } = layout;
  const rowBox = layout.rows[layout.row];
  const columnBox = layout.columns[layout.column];
  const size = 24;
  const inView = (top: number) => top >= layout.clip.top && top + size <= layout.clip.bottom;
  const place = (left: number, top: number) => ({ left: near(left, 4, window.innerWidth - size - 4), top: Math.max(4, top) });
  const line = drag && (() => {
    const boxes = drag.kind === 'row' ? layout.rows : layout.columns;
    const item = boxes[drag.target];
    const after = drag.target > drag.from;
    return drag.kind === 'row'
      ? { left: table.left, top: after ? item.bottom : item.top, width: table.right - table.left, height: 2 }
      : { left: after ? item.right : item.left, top: table.top, width: 2, height: table.bottom - table.top };
  })();

  return <div className={styles.layer} data-table-handles="true" data-pdf-exclude="true">
    {inView(table.top - size - 2) ? <div className={styles.handle} data-kind="table" style={place(table.left - size - 2, table.top - size - 2)}>
      <IconButton aria-label="表格整体操作" size={24} onPress={e => { if (!suppressPress.current) openMenu('table', e.target as Element); }}><Grip /></IconButton>
    </div> : null}
    {rowBox && inView((rowBox.top + rowBox.bottom) / 2 - size / 2) ? <div className={styles.handle} data-kind="row" style={place(table.left - size - 2, (rowBox.top + rowBox.bottom) / 2 - size / 2)} onPointerDownCapture={startDrag('row')}>
      <IconButton aria-label={`第 ${layout.row + 1} 行操作`} size={24} onPress={e => { if (!suppressPress.current) openMenu('row', e.target as Element); }}><Grip /></IconButton>
    </div> : null}
    {columnBox && inView(table.top - size - 2) ? <div className={styles.handle} data-kind="column" style={place((columnBox.left + columnBox.right) / 2 - size / 2, table.top - size - 2)} onPointerDownCapture={startDrag('column')}>
      <IconButton aria-label={`第 ${layout.column + 1} 列操作`} size={24} onPress={e => { if (!suppressPress.current) openMenu('column', e.target as Element); }}><Grip /></IconButton>
    </div> : null}
    {inView(table.bottom + 2) ? <div className={styles.handle} data-kind="add-row" style={place(table.left - size - 2, table.bottom + 2)}>
      <IconButton aria-label="在表格末尾添加行" size={24} onPress={() => quickInsert('row-after')}><Plus /></IconButton>
    </div> : null}
    {inView(Math.min(Math.max((table.top + table.bottom) / 2, layout.clip.top + size), layout.clip.bottom - size * 2) - size / 2) ? <div className={styles.handle} data-kind="add-column"
      style={place(table.right + 2, Math.min(Math.max((table.top + table.bottom) / 2, layout.clip.top + size), layout.clip.bottom - size * 2) - size / 2)}>
      <IconButton aria-label="在表格末尾添加列" size={24} onPress={() => quickInsert('column-after')}><Plus /></IconButton>
    </div> : null}
    {layout.columnCount > 1 ? layout.columns.slice(0, -1).map((item, index) => {
      const top = Math.max(table.top, layout.clip.top);
      const bottom = Math.min(table.bottom, layout.clip.bottom);
      return bottom - top > 8 ? <div key={index} className={styles.resizer} role="separator" aria-orientation="vertical" aria-label={`调整第 ${index + 1} 列宽度`} tabIndex={0}
        style={{ left: item.right - 3, top, height: bottom - top }}
        onPointerDown={startResize(index)} onDoubleClick={resetWidths} onKeyDown={resizeByKey(index)} /> : null;
    }) : null}
    {line ? <div className={styles.dropLine} style={line} aria-hidden="true" /> : null}
    <PointMenu point={menu?.point ?? null} onOpenChange={open => { if (!open) setMenu(null); }}>
      <Menu ariaLabel={menu?.kind === 'row' ? '行操作' : menu?.kind === 'column' ? '列操作' : '表格操作'} onClose={() => setMenu(null)}>
        {menu?.kind === 'row' ? <>
          <MenuSection>
            <MenuHeader>插入</MenuHeader>
            {rowItems.map(({ action, label }) => <MenuItem key={action} id={action} isDisabled={action === 'row-before' && layout.row === 0} onAction={() => runAction(action)}>{label}</MenuItem>)}
          </MenuSection>
          <MenuSeparator />
          <MenuSection>
            <MenuHeader>移动</MenuHeader>
            <MenuItem id="move-up" isDisabled={layout.row <= 1} onAction={() => runAction('move-up')}>上移一行</MenuItem>
            <MenuItem id="move-down" isDisabled={layout.row === 0 || layout.row >= layout.rowCount - 1} onAction={() => runAction('move-down')}>下移一行</MenuItem>
          </MenuSection>
          <MenuSeparator />
          <MenuItem id="delete-row" isDanger isDisabled={layout.row === 0 || layout.rowCount <= 2} onAction={() => runAction('delete-row')}>删除行</MenuItem>
        </> : null}
        {menu?.kind === 'column' ? <>
          <MenuSection>
            <MenuHeader>插入</MenuHeader>
            {columnItems.map(({ action, label }) => <MenuItem key={action} id={action} onAction={() => runAction(action)}>{label}</MenuItem>)}
          </MenuSection>
          <MenuSeparator />
          <MenuSection>
            <MenuHeader>移动</MenuHeader>
            <MenuItem id="move-left" isDisabled={layout.column === 0} onAction={() => runAction('move-left')}>左移一列</MenuItem>
            <MenuItem id="move-right" isDisabled={layout.column >= layout.columnCount - 1} onAction={() => runAction('move-right')}>右移一列</MenuItem>
          </MenuSection>
          <MenuSeparator />
          <MenuSection>
            <MenuHeader>对齐</MenuHeader>
            {alignItems.map(({ action, label }) => <MenuItem key={action} id={action} onAction={() => runAction(action)}>{label}</MenuItem>)}
          </MenuSection>
          <MenuSeparator />
          <MenuItem id="delete-column" isDanger isDisabled={layout.columnCount <= 1} onAction={() => runAction('delete-column')}>删除列</MenuItem>
        </> : null}
        {menu?.kind === 'table' ? <>
          <MenuItem id="select-table" onAction={() => runAction('select-table')}>选择整个表格</MenuItem>
          <MenuSeparator />
          <MenuItem id="delete-table" isDanger onAction={() => runAction('delete-table')}>删除整个表格</MenuItem>
        </> : null}
      </Menu>
    </PointMenu>
  </div>;
}
