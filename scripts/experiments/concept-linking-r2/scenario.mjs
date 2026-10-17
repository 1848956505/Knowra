// 第二轮 Concept 融合实验的公开合成数据。expected 只用于事后评分，绝不发送给模型。
//
// 相比第一轮：
// - 提示词不再点名任何具体概念；笔记不再用概念名做标题；
// - 概念目录 29 个，每篇只给“检索”返回的 8 个候选，R07 故意把正确概念藏起来；
// - 加入同名异义（数学的梯度 vs x.grad）和一篇含 4 条知识的笔记；
// - 同一设置重复运行 3 次。
//
// 2026-10-17 粒度规则（三条标准）补充 R10–R14：操作挂到所描述的对象、关系与比较不建概念、
// 概念名不照抄小标题、内容充分且与其他概念有关系的子主题可以新建。

export const CATALOG = Object.freeze([
  ['C_MATRIX', '矩阵', '线性代数中由行和列排成的二维数表，是对象而不是运算'],
  ['C_MATMUL', '矩阵乘法', '线性代数中两个矩阵之间的乘法运算，不是逐元素相乘'],
  ['C_ADD', '矩阵加法', '线性代数中同形状矩阵之间的加法运算'],
  ['C_HADAMARD', '逐元素乘法', '同形状数组在相同位置上相乘的运算，也称 Hadamard 积'],
  ['C_DOT', '点积', '两个等长向量之间得到一个标量的运算，也称内积'],
  ['C_TRANSPOSE', '转置', '矩阵的行列互换操作'],
  ['C_GRADIENT', '梯度', '数学：多元函数对各变量偏导数组成的向量'],
  ['C_DERIV', '导数', '数学：一元函数的瞬时变化率'],
  ['C_TENSOR', '张量', '深度学习框架中的多维数组'],
  ['C_BACKPROP', '反向传播', '神经网络中沿计算图反向计算梯度的算法'],
  ['C_SGD', '随机梯度下降', '用小批量样本估计梯度来更新参数的优化算法'],
  ['C_LR', '学习率', '优化算法中控制每一步更新幅度的超参数'],
  ['C_LOSS', '损失函数', '衡量模型预测与真实值差距的函数'],
  ['C_SOFTMAX', 'softmax', '把一组实数变换为概率分布的函数'],
  ['C_CONV', '卷积', '卷积神经网络中用卷积核在输入上滑动计算的运算'],
  ['C_POOL', '池化', '对局部区域取最大值或平均值以降低尺寸的操作'],
  ['C_ACT', '激活函数', '神经网络中给神经元输出引入非线性的函数'],
  ['C_DROPOUT', 'dropout', '训练时随机丢弃部分神经元的正则化方法'],
  ['C_BN', '批量归一化', '按小批量统计量对中间层输出做标准化的方法'],
  ['C_OVERFIT', '过拟合', '模型在训练集上表现好而在新数据上表现差的现象'],
  ['C_REG', '正则化', '通过约束模型复杂度来减轻过拟合的一类方法'],
  ['C_CE', '交叉熵', '衡量两个概率分布差异的量，常用作分类损失'],
  ['C_DET', '行列式', '方阵对应的一个标量'],
  ['C_RANK', '秩', '线性代数：矩阵中线性无关的行或列的最大数目'],
  ['C_NORM', '范数', '衡量向量或矩阵大小的量'],
  ['C_EIG', '特征值', '线性代数：满足 Av = λv 的标量 λ'],
  ['C_ATTN', '注意力机制', '按相关性对输入加权汇总的机制'],
  ['C_EMB', '嵌入', '把离散符号映射为稠密向量的表示方法'],
  ['C_RESID', '残差连接', '把输入直接加到某层输出上的结构'],
  ['C_PYTHON', 'Python', '一门通用编程语言'],
  ['C_PYTORCH', 'PyTorch', '一个深度学习框架及其函数库'],
  ['C_ML', '机器学习', '让计算机从数据中学习规律的一类方法'],
  ['C_DL', '深度学习', '使用多层神经网络学习数据表示的方法'],
  ['C_VECTOR', '向量', '线性代数中有序排列的一组数'],
  ['C_BROADCAST', '广播', '形状不同的数组按规则自动扩展后逐元素运算的机制']
].map(([id, name, sense]) => Object.freeze({ id, name, sense })));

export const INITIAL_ITEMS = Object.freeze([
  { id: 'K_PRE_1', conceptId: 'C_MATMUL', title: '矩阵乘法一般不满足交换律', kind: 'fact', statement: '一般情况下 AB 不等于 BA。' },
  { id: 'K_PRE_2', conceptId: 'C_GRADIENT', title: '梯度的定义', kind: 'definition', statement: '多元函数对各个变量的偏导数组成的向量叫梯度。' },
  { id: 'K_PRE_3', conceptId: 'C_HADAMARD', title: '逐元素乘法的定义', kind: 'definition', statement: '两个同形状数组在相同位置上的元素相乘。' }
].map(item => Object.freeze(item)));

/**
 * review 是挂靠之后整理建议的预期（只用于评分）：ideal 为理想建议，forbid 为有害的降级或合并，其余视为可接受。
 * candidates 模拟检索返回的前 8 个概念。expected 每项用 span 标识笔记中的一段原文：
 * accept 为可接受的概念 ID（'create' 表示应新建），forbid 为挂上去就算污染的概念，
 * reuseItem 表示应复用的已有条目。
 */
export const NOTES = Object.freeze([
  {
    id: 'R01', title: '形状怎么算',
    markdown: '## 形状怎么算\nA 是 2×3、B 是 3×4 时，AB 的结果是 2×4；如果把 B 换成 4×3，AB 就算不了。',
    candidates: ['C_MATMUL', 'C_MATRIX', 'C_HADAMARD', 'C_DOT', 'C_TRANSPOSE', 'C_RANK', 'C_DET', 'C_TENSOR'],
    expected: [{ span: 'A 是 2×3、B 是 3×4 时，AB 的结果是 2×4；如果把 B 换成 4×3，AB 就算不了。', accept: ['C_MATMUL'], forbid: ['C_MATRIX', 'C_HADAMARD', 'C_DOT', 'C_TENSOR'] }]
  },
  {
    id: 'R02', title: 'PyTorch 里的星号',
    markdown: '## PyTorch 里的星号\n两个形状都是 3×3 的张量 X、Y，X * Y 得到的是把同一位置的两个数相乘，不会像线代里那样拿行去乘列再求和。',
    candidates: ['C_MATMUL', 'C_HADAMARD', 'C_DOT', 'C_TENSOR', 'C_MATRIX', 'C_ADD', 'C_TRANSPOSE', 'C_NORM'],
    expected: [{ span: '两个形状都是 3×3 的张量 X、Y，X * Y 得到的是把同一位置的两个数相乘，不会像线代里那样拿行去乘列再求和。', accept: ['C_HADAMARD'], forbid: ['C_MATMUL', 'C_DOT', 'C_MATRIX'], allowItemReuse: ['K_PRE_3'] }]
  },
  {
    id: 'R03', title: '两个向量乘成一个数',
    markdown: '## 两个向量乘成一个数\n两个长度相同的向量，先把对应位置的数相乘，再把这些乘积全部加起来，结果是一个数。',
    candidates: ['C_DOT', 'C_HADAMARD', 'C_MATMUL', 'C_NORM', 'C_MATRIX', 'C_TENSOR', 'C_ADD', 'C_SOFTMAX'],
    expected: [{ span: '两个长度相同的向量，先把对应位置的数相乘，再把这些乘积全部加起来，结果是一个数。', accept: ['C_DOT'], forbid: ['C_HADAMARD', 'C_MATMUL', 'C_NORM'] }]
  },
  {
    id: 'R04', title: 'grad 属性',
    markdown: '## grad 属性\n调用 y.backward() 之后，结果存放在 x.grad 里；再算一次之前要先调用 x.grad.zero_()，不然新结果会累加到旧结果上。',
    candidates: ['C_GRADIENT', 'C_BACKPROP', 'C_DERIV', 'C_TENSOR', 'C_SGD', 'C_LR', 'C_LOSS', 'C_MATRIX'],
    review: { ideal: ['keep'], forbid: ['demote:C_GRADIENT', 'merge:C_GRADIENT', 'demote:C_DERIV', 'merge:C_DERIV', 'split'] },
    // x.grad 是框架里存放梯度值的属性，与数学上的梯度相关但不是同一概念。
    expected: [{ span: '调用 y.backward() 之后，结果存放在 x.grad 里；再算一次之前要先调用 x.grad.zero_()，不然新结果会累加到旧结果上。', accept: ['create', 'C_BACKPROP'], forbid: ['C_GRADIENT', 'C_DERIV'] }]
  },
  {
    id: 'R05', title: '偏导放在一起',
    markdown: '## 偏导放在一起\nf(x, y) = x² + y² 在点 (1, 2) 处对 x 的偏导是 2、对 y 的偏导是 4，合起来写成 (2, 4)。沿着这个方向，函数值增加得最快。',
    candidates: ['C_GRADIENT', 'C_DERIV', 'C_SGD', 'C_BACKPROP', 'C_NORM', 'C_DOT', 'C_LOSS', 'C_TENSOR'],
    expected: [
      { span: 'f(x, y) = x² + y² 在点 (1, 2) 处对 x 的偏导是 2、对 y 的偏导是 4，合起来写成 (2, 4)。', accept: ['C_GRADIENT'], forbid: ['C_SGD', 'C_DOT', 'C_NORM'] },
      { span: '沿着这个方向，函数值增加得最快。', accept: ['C_GRADIENT'], forbid: ['C_SGD', 'C_DERIV'] }
    ]
  },
  {
    id: 'R06', title: '转置与乘法',
    markdown: '## 转置与乘法\n1. 矩阵 A 的转置记作 Aᵀ，就是把它的行变成列。\n2. 两个矩阵乘积的转置满足 (AB)ᵀ = BᵀAᵀ，顺序要反过来。\n3. 两个形状相同的矩阵相加，就是对应位置相加。\n4. 在 PyTorch 里用 A.T 取矩阵的转置。',
    candidates: ['C_TRANSPOSE', 'C_MATMUL', 'C_ADD', 'C_HADAMARD', 'C_MATRIX', 'C_TENSOR', 'C_DET', 'C_RANK'],
    expected: [
      { span: '矩阵 A 的转置记作 Aᵀ，就是把它的行变成列。', accept: ['C_TRANSPOSE'], forbid: ['C_MATRIX', 'C_MATMUL'] },
      { span: '两个矩阵乘积的转置满足 (AB)ᵀ = BᵀAᵀ，顺序要反过来。', accept: ['C_TRANSPOSE', 'C_MATMUL'], forbid: ['C_MATRIX', 'C_HADAMARD'] },
      { span: '两个形状相同的矩阵相加，就是对应位置相加。', accept: ['C_ADD'], forbid: ['C_HADAMARD', 'C_MATMUL', 'C_TRANSPOSE'] },
      { span: '在 PyTorch 里用 A.T 取矩阵的转置。', accept: ['C_TRANSPOSE'], forbid: ['C_MATRIX', 'C_TENSOR'] }
    ]
  },
  {
    id: 'R07', title: '结果矩阵的每个元素',
    markdown: '## 结果矩阵的每个元素\n结果矩阵第 i 行第 j 列的元素，等于左边矩阵第 i 行和右边矩阵第 j 列做点积。',
    // 关键：正确的“矩阵乘法”被检索漏掉了。挂到点积、逐元素乘法或矩阵上都是污染；新建可以由用户事后合并。
    candidates: ['C_DOT', 'C_HADAMARD', 'C_MATRIX', 'C_TRANSPOSE', 'C_TENSOR', 'C_RANK', 'C_DET', 'C_ADD'],
    hidden: ['C_MATMUL'],
    review: { ideal: ['merge:C_MATMUL'], forbid: ['split', 'demote:C_DOT', 'merge:C_DOT', 'demote:C_HADAMARD', 'merge:C_HADAMARD', 'demote:C_MATRIX', 'merge:C_MATRIX'] },
    expected: [{ span: '结果矩阵第 i 行第 j 列的元素，等于左边矩阵第 i 行和右边矩阵第 j 列做点积。', accept: ['create'], forbid: ['C_DOT', 'C_HADAMARD', 'C_MATRIX', 'C_TRANSPOSE'] }]
  },
  {
    id: 'R08', title: '顺序不能换',
    markdown: '## 顺序不能换\n矩阵相乘时，把两个因子的先后顺序对调，一般会得到不同的结果。',
    candidates: ['C_MATMUL', 'C_MATRIX', 'C_HADAMARD', 'C_ADD', 'C_DOT', 'C_TRANSPOSE', 'C_DET', 'C_TENSOR'],
    expected: [{ span: '矩阵相乘时，把两个因子的先后顺序对调，一般会得到不同的结果。', accept: ['C_MATMUL'], forbid: ['C_MATRIX', 'C_HADAMARD', 'C_DOT'], reuseItem: 'K_PRE_1' }]
  },
  {
    id: 'R09', title: '输出变成概率',
    // 故意写错：softmax 的输出之和应为 1。陈述必须保留“等于 0”，并在 sourceIssue 中指出。
    markdown: '## 输出变成概率\nsoftmax 的输出各项之和等于 0，所以可以把它看成概率分布。',
    candidates: ['C_SOFTMAX', 'C_CE', 'C_LOSS', 'C_ACT', 'C_NORM', 'C_TENSOR', 'C_ATTN', 'C_EMB'],
    expected: [{ span: 'softmax 的输出各项之和等于 0，所以可以把它看成概率分布。', accept: ['C_SOFTMAX'], forbid: ['C_CE', 'C_LOSS', 'C_ACT'], mustKeep: '等于 0' }]
  },
  {
    id: 'R10', title: '查函数怎么用',
    // 只有一两行用法：应作为条目挂靠，不该单独成概念。dir/help 本身是 Python 内置函数，挂 Python 或 PyTorch 都可接受（第一次运行后修正）。
    markdown: '## 查函数怎么用\n在 Python 里想知道 torch 模块里有哪些函数，可以调用 dir(torch)；想看某个函数的具体用法，调用 help(torch.ones)。',
    candidates: ['C_PYTORCH', 'C_PYTHON', 'C_TENSOR', 'C_MATRIX', 'C_ACT', 'C_LOSS', 'C_EMB', 'C_NORM'],
    review: { ideal: ['demote:C_PYTORCH', 'demote:C_PYTHON'], forbid: ['demote:C_TENSOR', 'merge:C_TENSOR', 'merge:C_PYTORCH', 'merge:C_PYTHON'] },
    expected: [{ span: '在 Python 里想知道 torch 模块里有哪些函数，可以调用 dir(torch)；想看某个函数的具体用法，调用 help(torch.ones)。', accept: ['C_PYTORCH', 'C_PYTHON'], forbid: ['C_TENSOR', 'C_MATRIX'], createIsTypeError: true }]
  },
  {
    id: 'R11', title: '两者是什么关系',
    // 讲的是两个已有概念之间的关系：是一条知识，不是新概念。
    markdown: '## 两者是什么关系\n深度学习是机器学习的一个分支，它的特点是用多层神经网络从数据中自动学习表示。',
    candidates: ['C_DL', 'C_ML', 'C_ACT', 'C_BACKPROP', 'C_OVERFIT', 'C_REG', 'C_LOSS', 'C_EMB'],
    expected: [{ span: '深度学习是机器学习的一个分支，它的特点是用多层神经网络从数据中自动学习表示。', accept: ['C_DL', 'C_ML'], forbid: ['C_ACT', 'C_BACKPROP'], createIsTypeError: true }]
  },
  {
    id: 'R12', title: '同一个词两种意思',
    // 比较两个概念中同一个词的含义：是一条比较类知识，不是新概念。
    markdown: '## 同一个词两种意思\n说向量的维度，指的是它的长度，也就是元素个数；说张量的维度，指的是它有几个轴。两处的“维度”含义不同。',
    candidates: ['C_TENSOR', 'C_VECTOR', 'C_MATRIX', 'C_RANK', 'C_NORM', 'C_DOT', 'C_BROADCAST', 'C_EMB'],
    review: { ideal: ['demote:C_TENSOR', 'demote:C_VECTOR'], forbid: ['demote:C_RANK', 'merge:C_RANK', 'demote:C_NORM', 'merge:C_NORM', 'merge:C_TENSOR', 'merge:C_VECTOR', 'demote:C_MATRIX'] },
    expected: [{ span: '说向量的维度，指的是它的长度，也就是元素个数；说张量的维度，指的是它有几个轴。两处的“维度”含义不同。', accept: ['C_TENSOR', 'C_VECTOR'], forbid: ['C_RANK', 'C_NORM', 'C_MATRIX'], createIsTypeError: true }]
  },
  {
    id: 'R13', title: '节省内存',
    // 小标题是“节省内存”，讲的是原地运算。可以新建概念，但名称应是规范术语，不能照抄标题。
    markdown: '## 2.1.5 节省内存\n执行 Y = X + Y 会为结果新分配一块内存，Y 指向新地址。\n改写成 Y[:] = X + Y 或 X += Y，结果会直接写回原来的内存，不再分配新内存。',
    candidates: ['C_TENSOR', 'C_ADD', 'C_BROADCAST', 'C_MATRIX', 'C_PYTORCH', 'C_HADAMARD', 'C_NORM', 'C_TRANSPOSE'],
    review: { ideal: ['keep'], forbid: ['split', 'demote:C_ADD', 'merge:C_ADD', 'demote:C_BROADCAST', 'merge:C_BROADCAST', 'merge:C_TENSOR'] },
    expected: [
      { span: '执行 Y = X + Y 会为结果新分配一块内存，Y 指向新地址。', accept: ['create', 'C_TENSOR'], forbid: ['C_ADD', 'C_BROADCAST', 'C_HADAMARD'], badName: '节省|内存|\\d' },
      { span: '改写成 Y[:] = X + Y 或 X += Y，结果会直接写回原来的内存，不再分配新内存。', accept: ['create', 'C_TENSOR'], forbid: ['C_ADD', 'C_BROADCAST', 'C_HADAMARD'], badName: '节省|内存|\\d' }
    ]
  },
  {
    id: 'R14', title: '求和时保留轴',
    // 内容足够多（3 条命题）且与“广播”有关系：可以新建一个概念，但不应把每个参数拆成一个概念，也不应挂到广播上。
    markdown: '## 求和时保留轴\n调用 sum 时传入 keepdims=True，被求和的轴会保留下来，长度变为 1。\n这样结果的轴数和原张量相同，可以直接和原张量做广播，例如 A / A.sum(axis=1, keepdims=True) 让每行之和为 1。\n如果想沿某个轴算累积和，可以用 A.cumsum(axis=0)，它同样不会减少轴数。',
    candidates: ['C_TENSOR', 'C_BROADCAST', 'C_NORM', 'C_SOFTMAX', 'C_MATRIX', 'C_ADD', 'C_PYTORCH', 'C_VECTOR'],
    maxNewConcepts: 2,
    // 用户希望“非降维求和”成为一个概念：把 keepdims 与累积和合并为同一主题是理想建议。
    review: { ideal: ['merge:sibling'], forbid: ['demote:C_BROADCAST', 'merge:C_BROADCAST', 'demote:C_NORM', 'merge:C_NORM', 'demote:C_SOFTMAX', 'merge:C_TENSOR'] },
    expected: [
      { span: '调用 sum 时传入 keepdims=True，被求和的轴会保留下来，长度变为 1。', accept: ['create', 'C_TENSOR'], forbid: ['C_NORM', 'C_SOFTMAX', 'C_ADD'] },
      { span: '这样结果的轴数和原张量相同，可以直接和原张量做广播，例如 A / A.sum(axis=1, keepdims=True) 让每行之和为 1。', accept: ['create', 'C_TENSOR', 'C_BROADCAST'], forbid: ['C_NORM', 'C_SOFTMAX', 'C_ADD'] },
      { span: '如果想沿某个轴算累积和，可以用 A.cumsum(axis=0)，它同样不会减少轴数。', accept: ['create', 'C_TENSOR'], forbid: ['C_NORM', 'C_ADD'] }
    ]
  },
  {
    id: 'R15', title: '数据操作',
    // 拆分用例：“张量”和“广播”都被检索藏起来，模型多半新建一个粗概念并把广播的 3 条也放进去。
    // 整理建议理想的做法是把广播拆出去（或合并回被藏起来的已有概念）。
    markdown: '## 数据操作\n用 torch.arange(12) 可以创建一个包含 0 到 11 的行向量。\n用 x.reshape(3, 4) 可以把它变成 3 行 4 列，元素总数不变。\n用 x[1:3] 可以取出第 2 行和第 3 行。\n两个形状不同的张量相加时，会先沿长度为 1 的轴复制扩展，使形状一致，再按元素运算，这叫广播。\n能否广播，要从最后一个轴往前逐个比较：每个轴的长度要么相等，要么其中一个是 1。\n例如形状 (3, 1) 和 (1, 2) 的两个张量相加，结果的形状是 (3, 2)。',
    candidates: ['C_MATRIX', 'C_ADD', 'C_HADAMARD', 'C_VECTOR', 'C_PYTORCH', 'C_NORM', 'C_TRANSPOSE', 'C_DOT'],
    hidden: ['C_TENSOR', 'C_BROADCAST'],
    review: { ideal: ['split', 'merge:C_TENSOR', 'merge:C_BROADCAST'], forbid: ['demote:C_MATRIX', 'merge:C_MATRIX', 'demote:C_ADD', 'merge:C_ADD', 'demote:C_HADAMARD', 'merge:C_HADAMARD', 'demote:C_VECTOR', 'merge:C_VECTOR'] },
    expected: [
      { span: '用 torch.arange(12) 可以创建一个包含 0 到 11 的行向量。', accept: ['create', 'C_PYTORCH'], forbid: ['C_MATRIX', 'C_NORM', 'C_DOT'] },
      { span: '用 x.reshape(3, 4) 可以把它变成 3 行 4 列，元素总数不变。', accept: ['create', 'C_PYTORCH'], forbid: ['C_TRANSPOSE', 'C_NORM', 'C_DOT'] },
      { span: '用 x[1:3] 可以取出第 2 行和第 3 行。', accept: ['create', 'C_PYTORCH'], forbid: ['C_NORM', 'C_DOT', 'C_TRANSPOSE'] },
      { span: '两个形状不同的张量相加时，会先沿长度为 1 的轴复制扩展，使形状一致，再按元素运算，这叫广播。', accept: ['create'], forbid: ['C_ADD', 'C_HADAMARD', 'C_MATRIX'] },
      { span: '能否广播，要从最后一个轴往前逐个比较：每个轴的长度要么相等，要么其中一个是 1。', accept: ['create'], forbid: ['C_ADD', 'C_HADAMARD', 'C_MATRIX'] },
      { span: '例如形状 (3, 1) 和 (1, 2) 的两个张量相加，结果的形状是 (3, 2)。', accept: ['create'], forbid: ['C_ADD', 'C_HADAMARD', 'C_MATRIX'] }
    ]
  }
].map(note => Object.freeze(note)));

export const REPEATS = 3;
