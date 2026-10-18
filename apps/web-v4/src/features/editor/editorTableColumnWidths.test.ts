import { describe, expect, it } from 'vitest';
import { Schema } from '@milkdown/kit/prose/model';
import { normalizeRatios, resizeColumns, tableFingerprint, TABLE_MIN_COLUMN_PX } from './editorTableColumnWidths';

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe('表格列宽（本机视图状态）', () => {
  it('拖动边界只在相邻两列间转移宽度，总和不变', () => {
    const next = resizeColumns([0.25, 0.25, 0.5], 0, 100, 1000);
    expect(next[0]).toBeCloseTo(0.35);
    expect(next[1]).toBeCloseTo(0.15);
    expect(next[2]).toBe(0.5);
    expect(sum(next)).toBeCloseTo(1);
  });
  it('各列不小于最小宽度，最后一列边界与越界下标不处理', () => {
    const next = resizeColumns([0.5, 0.5], 0, 10_000, 1000);
    expect(next[1] * 1000).toBeCloseTo(TABLE_MIN_COLUMN_PX);
    expect(resizeColumns([0.5, 0.5], 1, 50, 1000)).toEqual([0.5, 0.5]);
    expect(resizeColumns([0.5, 0.5], -1, 50, 1000)).toEqual([0.5, 0.5]);
  });
  it('归一化后总和为 1 且满足最小宽度', () => {
    const ratios = normalizeRatios([1, 1, 200], 600);
    expect(sum(ratios)).toBeCloseTo(1);
    expect(Math.min(...ratios) * 600).toBeGreaterThanOrEqual(TABLE_MIN_COLUMN_PX - 0.001);
  });
  it('指纹由表头文字与列数决定', () => {
    const schema = new Schema({ nodes: {
      doc: { content: 'table' }, table: { content: 'row' }, row: { content: 'cell+' }, cell: { content: 'text*' }, text: {}
    } });
    const table = (...labels: string[]) => schema.node('table', null, [schema.node('row', null, labels.map(label => schema.node('cell', null, label ? schema.text(label) : undefined)))]);
    expect(tableFingerprint(table('名称', '数量'))).toBe(tableFingerprint(table('名称', '数量')));
    expect(tableFingerprint(table('名称', '数量'))).not.toBe(tableFingerprint(table('名称', '单价')));
    expect(tableFingerprint(table('名称'))).not.toBe(tableFingerprint(table('名称', '')));
  });
});
