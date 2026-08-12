# Novel 风格主页与编辑器 Demo

这是一个独立、可交互的视觉原型，参考 [Novel](https://github.com/steven-tey/novel) 的 Notion-style 编辑器结构和 Tailwind/Shadcn 视觉语言，并结合知境的中文知识工作台场景重新设计。

## 查看方式

直接打开 `index.html`，或在仓库根目录启动静态服务器：

```bash
python3 -m http.server 4173 -d "docs/前端重构/Novel"
```

然后访问 `http://127.0.0.1:4173/`。

> 页面通过 Tailwind Play CDN 加载样式，首次查看需要网络连接；它是视觉与交互 Demo，不接入正式数据层。

## 已实现的演示交互

- 主页与编辑器单页切换
- 最近页面、空间列表、快速新建页面
- 可折叠侧栏与移动端侧栏
- 深色模式
- `⌘/Ctrl + K` 全局搜索
- 可编辑标题与正文、本地自动保存状态
- 输入 `/` 或点击块旁 `+` 打开 Slash 命令面板
- 文本选区 Bubble Menu
- 收藏、任务状态和 AI 续写演示

## 设计边界

- 这是前端重构阶段的独立原型，不改动 `apps/web` 正式 SPA。
- 编辑能力使用浏览器原生 `contenteditable` 模拟；正式产品接入时应映射到 Milkdown/Tiptap 的 schema、command 和持久化协议。
- 图标为页面内联 SVG，不依赖额外图标包。
