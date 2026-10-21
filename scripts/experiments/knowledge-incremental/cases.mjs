// 全部为 agent 编写的公开合成样本；预期不是用户真实笔记验收。
import { createState } from '../concept-linking-r2/core.mjs';

export function confirmedSnapshot() {
  const state = createState();
  for (const concept of state.concepts) Object.assign(concept, { reviewStatus: 'confirmed', revision: 1 });
  for (const item of state.items) Object.assign(item, {
    reviewStatus: 'confirmed', revision: 1,
    sources: [{ noteId: 'SYNTHETIC_ORIGINAL', quote: item.statement }]
  });
  return state;
}

export const CASES = [
  {
    id: 'I01', markdown: '矩阵乘法满足结合律：(AB)C=A(BC)。',
    oracleIds: ['C_MATMUL'],
    expected: { outcome: 'same-concept-new-item', conceptId: 'C_MATMUL' }
  },
  {
    id: 'I02', markdown: '矩阵乘法一般不满足交换律，通常 AB≠BA。',
    oracleIds: ['C_MATMUL'],
    expected: { outcome: 'same-item-new-source', conceptId: 'C_MATMUL', itemId: 'K_PRE_1' }
  },
  {
    id: 'I03', markdown: 'x.grad 保存 PyTorch 中张量 x 的梯度值；连续反传时该属性中的数值会累加。',
    oracleIds: ['C_GRADIENT', 'C_TENSOR', 'C_PYTORCH'],
    expected: { outcome: 'related-but-different', forbiddenConceptIds: ['C_GRADIENT'], acceptableExistingIds: ['C_PYTORCH'] }
  },
  {
    id: 'I04', markdown: '它和前面那个一样，按那个方法算就行。',
    oracleIds: ['C_MATMUL', 'C_HADAMARD'],
    expected: { outcome: 'insufficient-evidence-pending' }
  },
  {
    id: 'I05', markdown: 'NumPy 二维数组 A、B 都为 n×n，通常 A@B≠B@A。',
    oracleIds: ['C_MATMUL'],
    expected: { outcome: 'same-item-new-source', conceptId: 'C_MATMUL', itemId: 'K_PRE_1' }
  },
  {
    id: 'I06', markdown: '数学中的梯度指多元函数对各个变量的偏导所组成的向量。',
    oracleIds: ['C_GRADIENT'],
    expected: { outcome: 'same-item-new-source', conceptId: 'C_GRADIENT', itemId: 'K_PRE_2' }
  },
  {
    id: 'I07', markdown: '矩阵加法满足交换律：A+B=B+A。',
    oracleIds: ['C_ADD', 'C_MATMUL'],
    expected: { outcome: 'same-concept-new-item', conceptId: 'C_ADD' }
  },
  {
    id: 'I08', markdown: '两个同形状数组的同位置元素分别相乘，这种逐元素乘法也称 Hadamard 积。',
    oracleIds: ['C_HADAMARD', 'C_MATMUL'],
    expected: { outcome: 'same-item-new-source', conceptId: 'C_HADAMARD', itemId: 'K_PRE_3' }
  },
  {
    id: 'I09', markdown: '矩阵相乘时总有 AB=BA。',
    oracleIds: ['C_MATMUL'],
    expected: { outcome: 'conflicting-claim', conceptId: 'C_MATMUL', forbiddenItemId: 'K_PRE_1' }
  }
];
