// 第二轮知识边界实验：全部公开合成资料，绝不读取用户笔记。
// expected 是人工制定的离线评分标签；modelInput 不向模型提供这一字段。
export const INITIAL_CONCEPTS = Object.freeze([
  { id: 'C_MATRIX', name: '矩阵', sense: '线性代数中的二维排列数学对象' },
  { id: 'C_VECTOR', name: '向量', sense: '线性代数中具有分量的数学对象' },
  { id: 'C_TENSOR', name: '张量', sense: '在 PyTorch 的语境中指多维数组对象' },
  { id: 'C_MATMUL', name: '矩阵乘法', sense: '线性代数中的行列乘积运算；不是逐元素乘法' },
  { id: 'C_AUTOGRAD', name: '自动微分', sense: '自动计算导数或梯度的计算方法' },
  { id: 'C_CHAIN', name: '链式法则', sense: '复合函数求导的法则' },
  { id: 'C_GRAD', name: '梯度', sense: '数学：多元函数偏导数组成的向量' },
  { id: 'C_XGRAD', name: 'x.grad', sense: 'PyTorch Tensor 上保存梯度数值的属性' },
  { id: 'C_MATRIX_RANK', name: '矩阵的秩', sense: '线性代数：矩阵的线性独立行/列数' },
  { id: 'C_TENSOR_RANK', name: '张量的阶数', sense: '深度学习多维数组中轴的个数' },
  { id: 'C_ADD', name: '矩阵加法', sense: '相同形状矩阵的对应元素相加运算' }
]);

export const INITIAL_ITEMS = Object.freeze([
  {
    id: 'K_NONCOMM', title: '矩阵乘法的非交换性',
    kind: 'fact', statement: '一般情况下，同阶矩阵乘法不满足交换律，AB 不一定等于 BA。',
    conceptIds: ['C_MATMUL'], reviewStatus: 'confirmed', sourceMode: 'curatedSynthetic'
  },
  {
    id: 'K_CHAIN', title: '自动微分与链式法则',
    kind: 'fact', statement: '自动微分可以用链式法则计算复合函数的导数。',
    conceptIds: ['C_AUTOGRAD', 'C_CHAIN'], reviewStatus: 'confirmed', sourceMode: 'curatedSynthetic'
  },
  {
    id: 'K_API_CORRECT', title: '开启梯度记录的 API',
    kind: 'application', statement: 'PyTorch Tensor 可以调用 x.requires_grad_(True) 开启梯度记录。',
    conceptIds: ['C_AUTOGRAD'], reviewStatus: 'confirmed', sourceMode: 'curatedSynthetic'
  }
]);

export const SCENARIOS = Object.freeze([
  {
    id: 'H01', title: '矩阵与向量共同参与的知识',
    source: { kind: 'note', noteId: 'H01', markdown: '当 A 是 2×3 矩阵、x 是三个分量的向量时，Ax 是一个二维向量。' },
    expected: { conceptIds: ['C_MATRIX', 'C_VECTOR', 'C_MATMUL'], itemAction: 'new', kindOneOf: ['fact','application'], status: 'candidate', conflicts: [], sourceMode: 'note' }
  },
  {
    id: 'H02', title: '一个跨概念命题已经存在',
    source: { kind: 'note', noteId: 'H02', markdown: '在求复合函数的导数时，自动微分可以使用链式法则。' },
    expected: { conceptIds: ['C_AUTOGRAD','C_CHAIN'], itemAction: 'reuse', reuseId: 'K_CHAIN', kindOneOf: ['fact','principle'], status: 'candidate', conflicts: [], sourceMode: 'note' }
  },
  {
    id: 'H03', title: '与已确认知识矛盾的笔记',
    source: { kind: 'note', noteId: 'H03', markdown: '矩阵乘法总满足交换律：对任意同阶方阵 A 和 B，都有 AB=BA。' },
    expected: { conceptIds: ['C_MATMUL'], allowedExtraConceptIds: ['C_MATRIX'], itemAction: 'new', kindOneOf: ['fact','principle'], status: 'disputed', conflicts: ['K_NONCOMM'], sourceMode: 'note' }
  },
  {
    id: 'H04', title: '已有非交换性事实的另一种表述',
    source: { kind: 'note', noteId: 'H04', markdown: '对一般同阶矩阵，不能保证 AB=BA；矩阵乘法通常不满足交换律。' },
    expected: { conceptIds: ['C_MATMUL'], allowedExtraConceptIds: ['C_MATRIX'], itemAction: 'reuse', reuseId: 'K_NONCOMM', kindOneOf: ['fact','principle'], status: 'candidate', conflicts: [], sourceMode: 'note' }
  },
  {
    id: 'H05', title: '没有笔记来源的 AI 知识补充',
    source: { kind: 'ai', task: '请提议一条关于矩阵乘积第 i 行第 j 列元素如何计算的通用公式，写明矩阵形状条件。不提供任何笔记来源。' },
    expected: { conceptIds: ['C_MATMUL'], allowedExtraConceptIds: ['C_MATRIX'], itemAction: 'new', kindOneOf: ['formula','procedure'], status: 'candidate', conflicts: [], sourceMode: 'ai' }
  },
  {
    id: 'H06', title: '矩阵的秩（数学语境）',
    source: { kind: 'note', noteId: 'H06', markdown: '在线性代数中，矩阵的秩等于线性无关的行向量或列向量的最大数量。' },
    expected: { conceptIds: ['C_MATRIX_RANK'], allowedExtraConceptIds: ['C_MATRIX'], itemAction: 'new', kindOneOf: ['definition','fact'], status: 'candidate', conflicts: [], sourceMode: 'note' }
  },
  {
    id: 'H07', title: '张量的阶数（PyTorch 语境）',
    source: { kind: 'note', noteId: 'H07', markdown: 'PyTorch 中形状为 (2,3,4) 的张量有三个轴，因此它是三阶张量。' },
    expected: { conceptIds: ['C_TENSOR_RANK'], allowedExtraConceptIds: ['C_TENSOR'], itemAction: 'new', kindOneOf: ['definition','fact'], status: 'candidate', conflicts: [], sourceMode: 'note' }
  },
  {
    id: 'H08', title: '矩阵加法：概念与定义可以并存',
    source: { kind: 'note', noteId: 'H08', markdown: '矩阵加法是把两个相同形状的矩阵对应位置的元素分别相加。' },
    expected: { conceptIds: ['C_ADD'], allowedExtraConceptIds: ['C_MATRIX'], itemAction: 'new', kindOneOf: ['definition','fact'], status: 'candidate', conflicts: [], sourceMode: 'note' }
  },
  {
    id: 'H09', title: '梯度与 x.grad 的对比',
    source: { kind: 'note', noteId: 'H09', markdown: '数学中的梯度是偏导数组成的向量，而 PyTorch 的 x.grad 是保存梯度计算结果的张量属性。' },
    expected: { conceptIds: ['C_GRAD','C_XGRAD'], allowedExtraConceptIds: ['C_AUTOGRAD'], itemAction: 'new', kindOneOf: ['comparison','fact'], status: 'candidate', conflicts: [], sourceMode: 'note' }
  },
  {
    id: 'H10', title: '包含错误 API 拼写的用户笔记',
    source: { kind: 'note', noteId: 'H10', markdown: '在 PyTorch 中，运行 x.require_grad_(True) 就能让框架记录梯度。' },
    expected: { conceptIds: ['C_AUTOGRAD'], allowedExtraConceptIds: ['C_XGRAD'], itemAction: 'new', kindOneOf: ['application','fact'], status: 'disputed', conflicts: ['K_API_CORRECT'], sourceMode: 'note' }
  }
]);
