# Shadcn/ui 风格主页与编辑器 Demo

该目录包含两个独立 HTML 原型，以知境现有的资料、知识单元、训练与学习档案为内容骨架，使用 Shadcn/ui 的语义化主题变量和组件结构进行设计。

## 文件

- `index.html`：知识工作台主页
- `editor.html`：资料编辑器
- `styles.css`：Shadcn 风格语义变量与组件样式
- `app.js`：搜索、主题、侧栏、编辑器和 Slash Command 交互

## 查看

可以直接打开 `index.html`，也可以在仓库根目录运行：

```bash
python3 -m http.server 4174 -d "docs/前端重构/Shadcn"
```

访问 `http://127.0.0.1:4174/`。

## 组件映射

- Sidebar：工作区、工作台模块、资料目录与用户入口
- Command：全局搜索与快捷操作面板
- Card：统计概览、资料列表、学习进度与最近动态
- Badge：资料类型、状态与标签
- Tabs：最近资料过滤
- Button / Separator / Progress / Avatar：基础控件与信息层级
- Tiptap 风格编辑面：工具栏、正文块、Slash Command、资料属性和大纲

这是前端重构阶段的独立视觉与交互 Demo，不接入正式数据层，也不修改 `apps/web` 正式 SPA。
