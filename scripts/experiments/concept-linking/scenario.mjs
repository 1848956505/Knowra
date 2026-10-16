// 全部为本仓库公开的合成笔记；expected 字段仅供事后评估，绝不发送给模型。
export const INITIAL_CONCEPTS = Object.freeze([
  { id: 'C_MATRIX', name: '矩阵', sense: '数学中的二维元素阵列，是对象而不是某一种运算' },
  { id: 'C_ADD', name: '矩阵加法', sense: '相同形状矩阵对应元素相加的运算' },
  { id: 'C_HADAMARD', name: '逐元素乘法', sense: '对同形状数组的对应位置逐个相乘，不是矩阵乘法' }
]);

// 特意没有预设“矩阵乘法”：需要 AI 先提出概念，再把后续独立知识关联回来。
// 最后一步是第一步的同义重述，检验“复用现有知识条目”而不只是“复用概念名”。
export const SYNTHETIC_NOTES = Object.freeze([
  {
    id: 'N01', title: '维度匹配条件',
    markdown: '# 维度匹配条件\n矩阵乘法要求左矩阵的列数与右矩阵的行数相同。',
    expected: { concept: 'C_NEW_MATMUL', conceptAction: 'create', itemAction: 'new', kind: 'fact' }
  },
  {
    id: 'N02', title: '矩阵乘法的交换性',
    markdown: '# 矩阵乘法的交换性\n一般情况下，两个矩阵的乘积 AB 与 BA 不一定相等。',
    expected: { concept: 'C_NEW_MATMUL', conceptAction: 'reuse', itemAction: 'new', kind: 'fact' }
  },
  {
    id: 'N03', title: '矩阵乘法怎么计算',
    markdown: '# 矩阵乘法怎么计算\n计算矩阵乘积 C 的第 i 行第 j 列元素时，将 A 的第 i 行与 B 的第 j 列对应相乘并求和。',
    expected: { concept: 'C_NEW_MATMUL', conceptAction: 'reuse', itemAction: 'new', kind: 'procedure' }
  },
  {
    id: 'N04', title: 'PyTorch 的矩阵运算',
    markdown: '# PyTorch 的矩阵运算\nPyTorch 提供 torch.mm(A, B) 来计算两个二维矩阵的矩阵乘法。',
    expected: { concept: 'C_NEW_MATMUL', conceptAction: 'reuse', itemAction: 'new', kind: 'application' }
  },
  {
    id: 'N05', title: '矩阵加法',
    markdown: '# 矩阵加法\n矩阵加法把两个相同形状的矩阵在对应位置上的元素相加。',
    expected: { concept: 'C_ADD', conceptAction: 'reuse', itemAction: 'new', kind: 'fact' }
  },
  {
    id: 'N06', title: '逐元素乘法',
    markdown: '# 逐元素乘法\n逐元素乘法对同形状数组按对应位置相乘，不做矩阵乘法里的行列求和。',
    expected: { concept: 'C_HADAMARD', conceptAction: 'reuse', itemAction: 'new', kind: 'fact' }
  },
  {
    id: 'N07', title: '另一份笔记再次提到维度条件',
    markdown: '# 另一份笔记再次提到维度条件\n矩阵乘法的形状限制是左矩阵列数必须等于右矩阵行数。',
    expected: { concept: 'C_NEW_MATMUL', conceptAction: 'reuse', itemAction: 'reuse', kind: 'fact', sameItemAs: 'N01' }
  }
]);
