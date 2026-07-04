# 极光 · Aurora UI Demo

> **当前状态**：设计 demo，待用户选定后才会重构主应用。

---

## 方向

**青主紫辅**：

- 主品牌色 **薄荷青** `#2DD4BF`（按钮、激活态、链接、强调条）
- 辅强调色 **极光紫** `#8B5CF6`（仅作渐变点缀、装饰高光）
- 两者组合形成标志性的 **极光渐变** `linear-gradient(135deg, #2DD4BF, #8B5CF6)`

视觉语言：**现代 SaaS · 玻璃拟态 · 1px 细线 · 轻投影 · 克制过渡**。

---

## 关键 token 速查

```css
/* 主品牌 */
--color-mint-400: #2DD4BF;   /* 主 */
--color-mint-500: #14B8A6;   /* 按钮 */
--color-mint-600: #0D9488;   /* hover */

/* 辅强调 */
--color-aurora-500: #8B5CF6; /* 辅 */

/* 渐变（标志） */
--gradient-aurora: linear-gradient(135deg, #2DD4BF 0%, #8B5CF6 100%);

/* 玻璃 */
--glass-blur: blur(20px) saturate(180%);
--glass-tint: rgba(255, 255, 255, 0.72);

/* 阴影（极轻） */
--shadow-flat: 0 1px 2px rgba(15, 23, 42, 0.04);
--shadow-glass: 0 8px 32px rgba(15, 23, 42, 0.08);
--shadow-glow: 0 0 0 4px rgba(45, 212, 191, 0.16);

/* 字体（全无衬线） */
--font-body: 'Inter', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
```

完整 token 定义见 `aurora-demo.css` 第 1-180 行。

---

## 视觉特色

| 维度 | 设计选择 |
|---|---|
| 字体 | **全无衬线**（告别衬线 display），Inter 中英混排 |
| 圆角 | 偏大，**12-16px 主用**（告别生硬直角） |
| 阴影 | 极轻、扩散，**无重投影** |
| 焦点环 | 薄荷青 16% 透明度的 4px 环 |
| 玻璃 | `backdrop-filter: blur(20px) saturate(180%)` + 白 72% 底 |
| 动效 | 仅淡入淡出 + translateY(2px)，**无弹跳** |
| 装饰 | 背景极淡极光径向渐变（青+紫），opacity 0.05 |
| Logo | 极光渐变填充 + 极轻 glow |

---

## Demo 内容

**`aurora-demo.html` 包含 1 个主界面快照 + 25 个独立区块**：

| # | 区块 | 说明 |
|---|---|---|
| MAIN | 主工作区 | 图标导轨 + 顶栏 + 三栏（库树/编辑器/aside）+ 状态栏 完整快照 |
| 01 | 色板/字体/圆角/阴影 | token 总览 |
| 02 | 按钮家族 | primary / aurora / secondary / ghost / danger / icon |
| 03 | 输入与表单 | 文本/搜索/textarea，4 种状态 |
| 04 | Pill / Chip / Tag | 标签、筛选、状态徽章 |
| 05 | 图标导轨 | 6 模块 + 3 状态 |
| 06 | 顶栏 + 搜索 | 搜索框 + 建议面板 |
| 07 | 文件夹树 | 5 状态 + 5 缩进 + 行内编辑 |
| 08 | 笔记标签页 | 6 状态 + 右键菜单 |
| 09 | 编辑器工具栏 | 4 状态 + 完整按钮组 |
| 10 | 富文本 | h1-h4 / 段落 / 列表 / 代码 / 引用 / 任务 / 表格 |
| 11 | Markdown 预览 | 渲染后 vs 源码对比 |
| 12 | aside tab 切换器 | 4 tab + 激活态 |
| 13 | 信息面板 | 元数据 + 标签 + 关联笔记 |
| 14 | 大纲面板 | h1-h3 + 3 状态 |
| 15 | 知识点面板 | 知识点卡片网格 |
| 16 | AI 面板 | 对话气泡 + 输入框 + 快捷动作 |
| 17 | 库右键菜单 | 文件夹操作 |
| 18 | 编辑器右键菜单 | 撤销/复制/格式等 |
| 19 | 标签右键菜单 | 关闭/复制路径等 |
| 20 | 查找替换面板 | 浮层玻璃面板 |
| 21 | 表格对话框 | 8x8 行列选择器 |
| 22 | 命令面板 | ⌘K 玻璃浮层 |
| 23 | 状态指示器 | 保存 4 态 + 状态栏操作 |
| 24 | 空状态 | 3 种空态 |
| 25 | Toast 通知 | 3 种类型 |

---

## 使用方法

直接双击打开 `aurora-demo.html`，或：

```bash
start "apps\web\styles\UI主题\极光\aurora-demo.html"
```

需要联网加载 Inter 字体（Google Fonts CDN）；离线时会 fallback 到系统字体。

---

## 文件清单

```
apps/web/styles/UI主题/极光/
├── aurora-demo.html   # 主入口（~1700 行）
├── aurora-demo.css    # 全部样式（~1300 行）
└── README.md          # 本文件
```

---

## 后续（不在本次任务内）

用户看完 demo 之后：

| 反馈 | 下一步 |
|---|---|
| 选定极光 | 按"分阶段"策略重构主应用：tokens.css → 核心组件 → 其他组件 |
| 微调 | 根据反馈调整 token / 组件细节，重做 demo |
| 不选 | 用户从其他方向中挑选，或重新构思 |

旧主题 demo（墨玉书斋/晨光纸笺/侘寂浮岛等）保留在原位，不删除。
