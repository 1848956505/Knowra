// 研究样本：全部合成、公开。modelInput 只传 note/source 与目录，expected 仅留在评估端。
import { SCENARIOS as PREVIOUS } from '../knowledge-hardcases/scenarios.mjs';

const byId = id => PREVIOUS.find(x => x.id === id);
const take = (id, expected) => ({ ...byId(id), expected, baselineId: id });

export const CASES = Object.freeze([
  take('H02', { conceptIds: ['C_AUTOGRAD','C_CHAIN'], itemAction: 'reuse',
    existingItemId: 'K_CHAIN', reviewStatus: 'candidate', sourceMode: 'note', conflicts: [] }),
  take('H04', { conceptIds: ['C_MATMUL'], itemAction: 'reuse',
    existingItemId: 'K_NONCOMM', reviewStatus: 'candidate', sourceMode: 'note', conflicts: [] }),
  take('H03', { requiredConceptIds: ['C_MATMUL'], allowedConceptIds: ['C_MATMUL','C_MATRIX'],
    itemAction: 'new', reviewStatus: 'disputed', sourceMode: 'note',
    conflicts: ['K_NONCOMM'], needsOriginalClaim: 'AB=BA' }),
  take('H05', { requiredConceptIds: ['C_MATMUL'], allowedConceptIds: ['C_MATMUL','C_MATRIX'],
    itemAction: 'new', reviewStatus: 'candidate', sourceMode: 'ai', conflicts: [] }),
  take('H10', { requiredConceptIds: ['C_AUTOGRAD'], allowedConceptIds: ['C_AUTOGRAD','C_TENSOR','C_XGRAD'],
    itemAction: 'new', reviewStatus: 'disputed', sourceMode: 'note',
    conflicts: ['K_API_CORRECT'], needsOriginalClaim: 'x.require_grad_(True)', forbiddenStatement: 'x.requires_grad_(True)' }),
  {
    id: 'U01', title: '未见过的自动微分同义复用案例',
    source: { kind: 'note', noteId: 'U01',
      markdown: '面对层层嵌套的复合函数，自动微分沿计算路径运用链式法则求出导数。' },
    expected: { conceptIds: ['C_AUTOGRAD','C_CHAIN'], itemAction: 'reuse',
      existingItemId: 'K_CHAIN', reviewStatus: 'candidate', sourceMode: 'note', conflicts: [] }
  },
  {
    id: 'U02', title: '未见过的矩阵乘法同义复用案例',
    source: { kind: 'note', noteId: 'U02',
      markdown: '把同阶方阵 A 与 B 相乘，交换先后次序通常无法保证结果一样，也就是可能有 AB≠BA。' },
    expected: { conceptIds: ['C_MATMUL'], itemAction: 'reuse',
      existingItemId: 'K_NONCOMM', reviewStatus: 'candidate', sourceMode: 'note', conflicts: [] }
  }
]);
