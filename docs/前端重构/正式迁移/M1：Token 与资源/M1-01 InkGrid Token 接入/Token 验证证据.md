# M1-01 Token 验证证据

## 证据范围

本文件记录 M1-01 的静态测试和浏览器运行态证据。截图与本任务报告均位于当前工作区内。

## 静态 Token 证据

`apps/web/styles/components/knowra-theme-tokens.css` 已提供以下 canonical 分类：

- `--ink-font-*`：UI、阅读、展示和等宽字体。
- `--ink-bg`、`--ink-surface`、`--ink-text`、`--ink-text-secondary`、`--ink-border`、`--ink-accent`：基础语义色。
- `--ink-success-*`、`--ink-warning-*`、`--ink-danger-*`：状态语义色。
- `--ink-line-*`、`--ink-border-*`、`--ink-shadow-*`：线条、边框和黑色硬阴影。
- `--ink-space-*`、`--ink-type-*`、`--ink-radius-*`：间距、排版和圆角。
- `--ink-shell-nav-w:208px`、`--ink-catalog-w:232px`、`--ink-aux-sidebar-w:232px`、`--ink-inspector-wide-w:300px`：后续结构迁移可复用的语义尺寸。

现有正式变量仍保留兼容解析，例如：

- `--paper → var(--ink-bg)`
- `--blue → var(--ink-accent)`
- `--line → var(--ink-line)`
- `--shadow-editorial → var(--ink-shadow-3)`
- `--space-* → var(--ink-space-*)`
- `--type-* → var(--ink-type-*)`

## 自动化验证

| 检查 | 结果 |
| --- | --- |
| `node apps/web/test/inkgrid-token-shape.test.js` | 通过 |
| `npm run test:web` | 132 passed，0 failed |
| `npm test` | API 210、Web 132、脚本 10 全部通过 |
| `git diff --check` | 通过 |

## 浏览器运行态

验证条件：本地正式 Web 服务器，视口 `1280×720`。

首页 computed style 关键值：

- `--ink-bg` / `--paper`：`#F9F7F2`
- `--ink-accent` / `--blue`：`#2563EB`
- `--ink-shadow-3`：`4px 4px 0 #1A1A1A`
- `--shadow-editorial`：`4px 4px 0 #1A1A1A`
- Shell 当前网格：`260px 1020px`，保留现有复合 Shell 结构。

编辑器运行态关键值：

- 文档活动 Tab：左侧蓝线，computed `inset 2px 0 0 0 rgb(37, 99, 235)`。
- 辅助侧栏活动 Tab：下方黑线，computed `inset 0 -2px 0 0 rgb(26, 26, 26)`。
- 纸张背景：`#F9F7F2`。
- 页面可正常打开资料、渲染编辑器内容和右侧辅助侧栏。

截图文件均为 `1280×720 JPEG`，并直接保存在本任务的 `浏览器证据/` 子目录：

- [M1-01 首页运行态](<浏览器证据/M1-01-home-1280.jpg>)
- [M1-01 编辑器运行态](<浏览器证据/M1-01-editor-1280.jpg>)

![M1-01 首页运行态](<浏览器证据/M1-01-home-1280.jpg>)

![M1-01 编辑器运行态](<浏览器证据/M1-01-editor-1280.jpg>)

## 备注

验证过程中未观察到应用页面错误；浏览器宿主侧的外部遥测网络超时不属于项目页面运行错误，未计入项目验收判断。
