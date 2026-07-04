# 晨光纸笺 UI 设计预览

> 这是阶段 0 与阶段 1 之间的"提前体验"页面,用于让你在提交任何代码前先**亲眼**看到晨光纸笺风格在真实场景下的效果。

## ⚠️ 完全隔离,不动现有代码

| 项 | 状态 |
| --- | --- |
| 主应用入口 `src/styles.css` | **未修改** |
| `apps/web/styles/tokens.css` | **未修改** |
| `apps/web/styles/components.css` | **未修改** |
| `shell-html.js` 21 个 id | **未修改** |
| 任何 controller / state / event binder | **未修改** |
| 后端任何文件 | **未修改** |

所有 demo 内容都在 `apps/web/styles/demo/` 目录下,**不会**被主应用加载(`src/styles.css` 只 import `tokens.css` 与 `components.css`)。

## 如何预览

**方式 1:双击文件**(最简单)

在文件管理器中双击 `morning-paper-demo.html`,系统会用默认浏览器打开。

**方式 2:命令行打开**

```bash
# Windows
start apps\web\styles\demo\morning-paper-demo.html

# 或直接拖到浏览器窗口
```

**方式 3:通过 dev server**(如果启用了)

`npm run dev:web` 启动后,访问 `http://localhost:<port>/styles/demo/morning-paper-demo.html` 即可。

## 包含什么

| 区块 | 内容 | 对应阶段 |
| --- | --- | --- |
| **A. 顶部标题区** | "晨光纸笺"主标题,衬线大字,纸面纹理背景 | 阶段 4 主视觉 |
| **B. 5 项视觉特色** | 5 张卡片:纸面纹理 / 书签式选中 / 衬线 H1 / 阅读节奏 / 墨水 focus | 阶段 4 |
| **C. 应用外壳模拟** | 1:1 复刻 shell-html.js 的 DOM 骨架(rail / topbar / 三栏 / statusbar) | 阶段 4 |
| **D. 组件库预览** | 6 个 UI 组件:按钮 5 档 / Pill / 输入框 / 空状态 / 表面 / 上下文菜单 | 阶段 3 |
| **E. 设计 Token 总览** | 色板 / 字阶 / 圆角 / 阴影全部 token 视觉化 | 阶段 1 |

## 关键设计语言

| 关键词 | 表现 |
| --- | --- |
| **暖白纸面** | 主背景 `#f6f1e7`,叠加古铜与墨蓝的双向径向渐变模拟纸纹 |
| **淡墨蓝强调** | 主色 `#2c4a6b` 替代原 `#3c68ff` 电光蓝 |
| **墨水深浅** | 4 档 ink-50/100/200/300 + ink-strong,文本层级靠明度切换 |
| **衬线/无衬线混排** | H1/H2/品牌/数字用 `Source Han Serif`/`Songti`,正文用无衬线 |
| **书签式选中** | 笔记/tab 选中时左侧 2px 古铜竖条,圆角 |
| **墨水焦点环** | 输入聚焦时 `--focus-ring`(墨蓝软晕),不再刺眼 |
| **阅读节奏** | 正文 `max-width: 72ch`,`line-height: 1.55`,行宽与留白达到平衡 |
| **克制温度** | 不用渐变光晕、不堆装饰,5 档按钮 / 3 档 elevation / 4 档过渡 |

## 反馈什么

请告诉我:
1. **整体方向**: 风格基调是否对路(暖白纸面 vs 冷蓝克制)
2. **视觉特色**: 5 项中哪些保留 / 调整 / 移除
3. **组件库**: 6 个 UI 组件的视觉是否够用
4. **不适感**: 任何"刺眼" / "过重" / "不够"的地方

## 后续

- 你的反馈通过后 → 阶段 1 正式执行(重写 `tokens.css` + 把硬编码回填)
- 反馈不通过 → 调整 demo,重新预览
- 这个 demo 文件**不会被 commit 到 git**(在阶段 0-4 完成后删除)
