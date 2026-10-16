// 第三轮：公开合成数据。gold 仅用于离线核对，永不进入模型输入。
export const CONCEPTS = Object.freeze([
  { id: 'C_MATMUL', name: '矩阵乘法', sense: '线性代数中矩阵之间的乘法运算' },
  { id: 'C_MATRIX', name: '矩阵', sense: '由元素按行列排列的数学对象' },
  { id: 'C_ADD', name: '矩阵加法', sense: '相同形状矩阵对应元素相加的运算' },
  { id: 'C_AUTODIFF', name: '自动微分', sense: '按计算过程求导的技术' },
  { id: 'C_DOT', name: '向量点积', sense: '两个向量对应元素相乘后求和的运算' },
  { id: 'C_HADAMARD', name: '逐元素乘法', sense: '同形状数组的对应位置相乘' }
]);

export const SEEDED_ITEMS = Object.freeze([
  {
    id: 'K_DIM', title: '矩阵乘法的维度匹配',
    statement: '矩阵乘法要求左矩阵列数等于右矩阵行数。',
    kind: 'fact', conceptIds: ['C_MATMUL'], reviewStatus: 'confirmed'
  },
  {
    id: 'K_NONCOMM', title: '矩阵乘法一般不满足交换律',
    statement: '同阶方阵的乘积一般不满足交换律，通常 AB 不等于 BA。',
    kind: 'fact', conceptIds: ['C_MATMUL'], reviewStatus: 'confirmed'
  },
  {
    id: 'K_API', title: '正确开启 PyTorch 自动求导的调用',
    statement: 'PyTorch Tensor 的 x.requires_grad_(True) 可开启对 x 的梯度记录。',
    kind: 'application', conceptIds: ['C_AUTODIFF'], reviewStatus: 'confirmed'
  }
]);

export const CASES = Object.freeze([
  {
    id: 'V01', title: '同一规则重述，复用已确认条目',
    source: { kind: 'note', noteId: 'V01', markdown: '乘积 AB 要能计算，A 的列数必须恰好等于 B 的行数。' },
    gold: { actionPattern: ['reuse:K_DIM'], newConcept: false }
  },
  {
    id: 'V02', title: '混合笔记：正确性质 + 两条错误主张',
    source: { kind: 'note', noteId: 'V02', markdown: [
      '设 A 为 m×n、B 为 n×p，则 AB 的形状为 m×p。',
      '任意两个 n 阶方阵相乘都满足 AB=BA。',
      '在 PyTorch 中，调用 x.require_grad_(True) 就能开启梯度记录。'
    ].join('\n') },
    gold: { actionPattern: ['new:candidate', 'new:disputed:K_NONCOMM', 'new:disputed:K_API'], newConcept: false }
  },
  {
    id: 'V03', title: '无笔记来源的 AI 知识补充',
    source: { kind: 'ai', task: '请为矩阵乘法补充一个有价值的、关于乘积元素 (AB)_{ij} 如何计算的通用公式，并解释求和下标。没有提供任何笔记原文；不得伪造引文。' },
    gold: { actionPattern: ['new:candidate:ai'], newConcept: false }
  },
  {
    id: 'V04', title: '检索漏召回：已有概念仅出现在重复提示中',
    // 只给少量候选，真实已有 C_MATMUL 不在可直接挂靠的集合；
    // 提示可能重复，但禁止未经确认就自动合并到未召回的 ID。
    source: { kind: 'note', noteId: 'V04', markdown: '结果矩阵中第 i 行第 j 列的数，是左边第 i 行与右边第 j 列逐项相乘再求和的结果。' },
    visibleConceptIds: ['C_DOT', 'C_HADAMARD', 'C_MATRIX'],
    visibleItemIds: [],
    duplicateHints: ['C_MATMUL'],
    gold: { actionPattern: ['new:candidate'], newConcept: true, possibleDuplicateOf: 'C_MATMUL' }
  },
  {
    id: 'V05', title: '定义与 Concept 独立性',
    source: { kind: 'note', noteId: 'V05', markdown: '矩阵加法把相同形状的两个矩阵在对应位置的元素相加。' },
    gold: { actionPattern: ['new:candidate'], newConcept: false, conceptId: 'C_ADD', allowedKinds: ['definition', 'fact'] }
  }
]);
