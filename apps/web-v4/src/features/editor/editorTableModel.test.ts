import { history, undo, redo } from '@milkdown/kit/prose/history';
import { describe, expect, it } from 'vitest';
import { Schema } from '@milkdown/kit/prose/model';
import { EditorState, TextSelection } from '@milkdown/kit/prose/state';
import { tableNodes, CellSelection } from '@milkdown/kit/prose/tables';
import { getTableControlsState, tableControlCommand } from './editorTableModel';

const nodes = tableNodes({ tableGroup: 'block', cellContent: 'paragraph', cellAttributes: { alignment: { default: 'left' } } });
const schema = new Schema({ nodes: {
  doc: { content: 'block+' }, paragraph: { group: 'block', content: 'text*' }, text: {},
  ...nodes,
  table: { ...nodes.table, content: 'table_header_row table_row+' },
  table_header_row: { ...nodes.table_row, content: 'table_header+' },
  table_row: { ...nodes.table_row, content: 'table_cell+' }
} });
function fixture() {
  const p = (text: string) => schema.node('paragraph', null, schema.text(text));
  const row = (header: boolean, values: string[]) => schema.node(header ? 'table_header_row' : 'table_row', null, values.map(value => schema.node(header ? 'table_header' : 'table_cell', null, p(value))));
  const table = schema.node('table', null, [row(true, ['名称', '数量']), row(false, ['苹果', '2']), row(false, ['梨', '3'])]);
  const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('之前')), table, schema.node('paragraph', null, schema.text('之后'))]);
  let pos = 0;
  doc.descendants((node, offset) => { if (node.isText && node.text === '苹果') pos = offset; });
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos), plugins: [history()] });
}
function apply(state: EditorState, action: Parameters<typeof tableControlCommand>[0]) {
  let next = state;
  expect(tableControlCommand(action)(state, tr => { next = state.apply(tr); })).toBe(true);
  next.doc.check();
  return next;
}
describe('Markdown 表格控制', () => {
  it('插入行列保留正文、表头和数据并继承列对齐', () => {
    let state = apply(fixture(), 'align-center');
    state = apply(state, 'row-before');
    state = apply(state, 'column-after');
    const table = state.doc.child(1);
    expect(table.childCount).toBe(4);
    expect(table.firstChild?.type.name).toBe('table_header_row');
    expect(table.firstChild?.childCount).toBe(3);
    expect(table.child(1).child(0).attrs.alignment).toBe('center');
    expect(state.doc.textContent).toContain('苹果');
    expect(state.doc.firstChild?.textContent).toBe('之前');
    expect(state.doc.lastChild?.textContent).toBe('之后');
  });
  it('列对齐写到表头及同列所有数据，保证 Markdown 序列化可保留', () => {
    const state = apply(fixture(), 'align-right');
    state.doc.child(1).forEach(row => {
      expect(row.child(0).attrs.alignment).toBe('right');
      expect(row.child(1).attrs.alignment).toBe('left');
    });
  });
  it('行列和整表选择保留 CellSelection', () => {
    for (const action of ['select-row', 'select-column', 'select-table'] as const) {
      const state = apply(fixture(), action);
      expect(state.selection).toBeInstanceOf(CellSelection);
      if (action === 'select-row') expect((state.selection as CellSelection).isRowSelection()).toBe(true);
      if (action === 'select-column') expect((state.selection as CellSelection).isColSelection()).toBe(true);
    }
  });
  it('不能删除表头、最后数据行或最后一列，整表删除有显式操作', () => {
    let state = apply(fixture(), 'delete-row');
    expect(getTableControlsState(state)?.canDeleteRow).toBe(false);
    expect(tableControlCommand('delete-row')(state)).toBe(false);
    state = apply(state, 'delete-column');
    expect(getTableControlsState(state)?.canDeleteColumn).toBe(false);
    expect(tableControlCommand('delete-column')(state)).toBe(false);
    state = apply(state, 'delete-table');
    expect(state.doc.childCount).toBe(2);
    expect(state.doc.textContent).toBe('之前之后');
  });
  it('表头上方不能插入数据行，非表格选区不执行任何操作', () => {
    let state = fixture();
    let headerPos = 0;
    state.doc.descendants((node, pos) => { if (node.isText && node.text === '名称') headerPos = pos; });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, headerPos)));
    expect(tableControlCommand('row-before')(state)).toBe(false);
    expect(tableControlCommand('delete-row')(state)).toBe(false);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));
    expect(getTableControlsState(state)).toBeNull();
    expect(tableControlCommand('delete-table')(state)).toBe(false);
  });
});

it('连续行列与对齐操作分别撤销重做，单元格选择不清空历史', () => {
  let state = fixture(); const snapshots = [state.doc];
  for (const action of ['row-after', 'column-after', 'align-center'] as const) { state = apply(state, action); snapshots.push(state.doc); }
  state = apply(state, 'select-row');
  for (let index = 2; index >= 0; index--) {
    expect(undo(state, tr => { state = state.apply(tr); })).toBe(true);
    expect(state.doc.eq(snapshots[index])).toBe(true);
  }
  for (let index = 1; index <= 3; index++) {
    expect(redo(state, tr => { state = state.apply(tr); })).toBe(true);
    expect(state.doc.eq(snapshots[index])).toBe(true);
  }
});
